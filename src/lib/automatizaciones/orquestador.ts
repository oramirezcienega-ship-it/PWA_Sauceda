import { supabaseServidor } from "@/lib/supabase/server";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { enviarCorreo } from "@/lib/email";
import { enviarMessengerTexto } from "@/lib/messenger";
import { enviarSMS } from "@/lib/twilio";
import { analizarConversacionConIA } from "@/app/actions/analisis-ia";
import { variantesTelefono } from "@/lib/telefono";

/**
 * Orquestador de Secuencias de Contacto Multicanal.
 * Corre cada 15 minutos en segundo plano (disparado por cron).
 */
export async function orquestador(): Promise<{
  procesados: number;
  accionesEjecutadas: number;
  errores: string[];
}> {
  const sb = supabaseServidor();
  let procesados = 0;
  let accionesEjecutadas = 0;
  const errores: string[] = [];

  try {
    // 0. Buscar e inscribir prospectos/expedientes inactivos en secuencias de reactivación (3 días)
    await buscarYEnrolarLeadsInactivos(sb);

    // 0b. Ejecutar retoques automáticos para reactivación a corto plazo (12-22 horas)
    try {
      const resRetoque = await retoqueAutomaticoLedsInactivos(sb);
      procesados += resRetoque.procesados;
      accionesEjecutadas += resRetoque.enviados;
      if (resRetoque.errores.length > 0) {
        errores.push(...resRetoque.errores.map((e) => `[Retoque] ${e}`));
      }
    } catch (retErr: any) {
      errores.push(`[Retoque] Error crítico: ${retErr.message}`);
    }

    // 1. Obtener enrollments activos
    const { data: enrollments, error: errEnrollments } = await sb
      .from("sequence_enrollments")
      .select(`
        *,
        sequence:automation_sequences(nombre, status, segmento)
      `)
      .eq("status", "activo");

    if (errEnrollments) {
      throw new Error(`Error leyendo enrollments: ${errEnrollments.message}`);
    }

    if (!enrollments || enrollments.length === 0) {
      return { procesados: 0, accionesEjecutadas: 0, errores: [] };
    }

    for (const enrollment of enrollments) {
      procesados++;
      
      try {
        // Regla: Si la secuencia principal fue pausada/archivada, omitir lead
        if (enrollment.sequence?.status !== "activa") {
          continue;
        }

        // 2. Verificar si el lead ya respondió -> Salida automática de la secuencia
        const respondio = await leadRespondio(sb, enrollment);
        if (respondio) {
          await salirDeSecuencia(sb, enrollment.id, "respondio", enrollment.step_actual);
          continue;
        }

        // 3. Obtener todos los pasos de esta secuencia
        const { data: steps, error: errSteps } = await sb
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", enrollment.sequence_id)
          .order("orden", { ascending: true });

        if (errSteps) {
          errores.push(`Error obteniendo pasos para sec ${enrollment.sequence_id}: ${errSteps.message}`);
          continue;
        }

        if (!steps || steps.length === 0) {
          // Secuencia sin pasos, completar
          await salirDeSecuencia(sb, enrollment.id, "completado", enrollment.step_actual);
          continue;
        }

        // El paso actual es (step_actual - 1)
        const pasoIdx = enrollment.step_actual - 1;

        if (pasoIdx >= steps.length) {
          // Completó todos los pasos
          await salirDeSecuencia(sb, enrollment.id, "completado", enrollment.step_actual);
          continue;
        }

        const step = steps[pasoIdx];

        // 4. Calcular horas transcurridas desde el último contacto o inscripción
        const fechaReferencia = enrollment.ultimo_contacto_at || enrollment.enrolled_at;
        const horasTranscurridas = calcularHorasTranscurridas(fechaReferencia);

        // ¿Es momento de ejecutar el paso?
        if (horasTranscurridas >= (step.delay_horas ?? 0)) {
          // REGLA DE NEGOCIO: No enviar mensajes entre 9:00 PM (21h) y 8:00 AM (8h) hora local de México (UTC-6)
          if (!esHorarioPermitido()) {
            continue; // Se pospone para la siguiente ejecución cron
          }

          // REGLA DE NEGOCIO: No enviar más de 1 mensaje por canal por día al mismo lead
          const yaEnviadoHoy = await canalEnviadoHoy(sb, enrollment.id, step.canal);
          if (yaEnviadoHoy) {
            continue; // Esperar al siguiente día
          }

          // Espera mínima de 3 segundos para envíos en lote (rate limiting)
          if (accionesEjecutadas > 0) {
            await new Promise((r) => setTimeout(r, 3000));
          }

          let exito = false;
          let errorDetalle = "";
          let contenidoEnviado = "";
          let waMessageId: string | undefined = undefined;

          // Verificar ventana de 24 horas del cliente para canal whatsapp
          let usarPlantillaReactivacion = false;
          let plantillaNombre = "";

          if (step.canal === "whatsapp") {
            const { normalizarTelefono } = await import("@/lib/telefono");
            const telNormalizado = normalizarTelefono(enrollment.phone);
            
            const { data: ultimoMsgCliente } = await sb
              .from("mensajes_whatsapp")
              .select("created_at")
              .eq("telefono", telNormalizado)
              .eq("direccion", "in")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const ventanaCerrada = !ultimoMsgCliente || (Date.now() - new Date(ultimoMsgCliente.created_at).getTime()) > 24 * 60 * 60 * 1000;
            
            if (ventanaCerrada) {
              // Obtener tipo de negocio del expediente
              let tipoNegocio = "";
              if (enrollment.expediente_id) {
                const { data: exp } = await sb
                  .from("expedientes")
                  .select("tipo_negocio")
                  .eq("id", enrollment.expediente_id)
                  .maybeSingle();
                tipoNegocio = exp?.tipo_negocio || "";
              }

              // Mapear tipo de negocio a plantilla de Meta
              let plantilla = "reactivacion_impermeabilizacio"; // Fallback por defecto
              const negocioNormalizado = (tipoNegocio || "").trim();

              if (negocioNormalizado === "construccion-impermeabilizacion") {
                plantilla = "reactivacion_impermeabilizacio";
              } else if (negocioNormalizado === "traspaso_compra") {
                plantilla = "reactivacion_compra_directa";
              } else if (negocioNormalizado === "promocion_venta") {
                plantilla = "reactivacion_promocion_venta";
              } else if (negocioNormalizado === "solo_tramite") {
                plantilla = "reactivacion_solo_tramite";
              }

              usarPlantillaReactivacion = true;
              plantillaNombre = plantilla;
            }
          }

          // Mapear y sustituir variables {nombre} y {fraccionamiento}
          const mensajeFormateado = await formatearMensaje(sb, step.mensaje || "", enrollment);
          const asuntoFormateado = step.asunto_email ? await formatearMensaje(sb, step.asunto_email, enrollment) : "";

          // Ejecutar según el canal
          switch (step.canal) {
            case "whatsapp":
              contenidoEnviado = mensajeFormateado;
              
              // Si la ventana de 24 horas está cerrada y el mensaje del paso no está configurado explícitamente como plantilla,
              // forzamos el envío inteligente usando la plantilla de marketing de Meta correspondiente
              if (usarPlantillaReactivacion && !mensajeFormateado.startsWith("[plantilla:")) {
                const primerNombre = (enrollment.nombre || "Cliente").split(" ")[0] || "Cliente";
                const { enviarWhatsAppPlantilla } = await import("@/lib/whatsapp");
                
                const waRes = await enviarWhatsAppPlantilla(
                  enrollment.phone,
                  plantillaNombre,
                  "es_MX",
                  [primerNombre]
                );
                exito = waRes.ok;
                errorDetalle = waRes.error || "";
                if (waRes.ok) waMessageId = waRes.messageId;

                // Registrar texto representativo de la plantilla en el historial del CRM
                let textoMensaje = `[Plantilla: ${plantillaNombre}] Hola ${primerNombre}`;
                if (plantillaNombre === "reactivacion_impermeabilizacio") {
                  textoMensaje = `[Plantilla: reactivacion_impermeabilizacio] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Construye. 🛠️ Notamos que estabas interesado en impermeabilizar tu azotea. ¿Te gustaría que agendemos una inspección técnica gratuita y sin compromiso esta semana para darte tu presupuesto exacto?`;
                } else if (plantillaNombre === "reactivacion_compra_directa") {
                  textoMensaje = `[Plantilla: reactivacion_compra_directa] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. 🏡 ¿Tienes alguna duda sobre cómo compramos tu casa al contado y liquidamos tu adeudo (de Infonavit, banco, etc.)? Si gustas, podemos agendar una llamada breve con un asesor.`;
                } else if (plantillaNombre === "reactivacion_promocion_venta") {
                  textoMensaje = `[Plantilla: reactivacion_promocion_venta] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. 📈 ¿Te gustaría que un asesor te platique cómo te ayudamos a vender tu propiedad en León al mejor precio y de forma segura?`;
                } else if (plantillaNombre === "reactivacion_solo_tramite") {
                  textoMensaje = `[Plantilla: reactivacion_solo_tramite] Hola ${primerNombre}, te saluda Sofía de SAUCEDA Bienes Raíces. ⚖️ ¿Pudiste revisar los requisitos para el trámite de tu crédito o propiedad? Si gustas, te apoyamos a resolver tus dudas.`;
                }
                contenidoEnviado = textoMensaje;
              } else if (mensajeFormateado.startsWith("[plantilla:")) {
                const match = mensajeFormateado.match(/\[plantilla:\s*([^\]\s,]+)(?:\s*,\s*([^\]\s]+))?\]/);
                const plantillaNombre = match ? match[1] : null;
                const idioma = match && match[2] ? match[2] : "es_MX";

                if (plantillaNombre) {
                  // Extraer parámetros después del cierre de corchete "[plantilla: ...]"
                  const textoRestante = mensajeFormateado.replace(/\[plantilla:[^\]]+\]/, "").trim();
                  const parametros = textoRestante ? textoRestante.split("|").map(p => p.trim()) : [enrollment.nombre];

                  const { enviarWhatsAppPlantilla } = await import("@/lib/whatsapp");
                  const waRes = await enviarWhatsAppPlantilla(
                    enrollment.phone,
                    plantillaNombre,
                    idioma,
                    parametros,
                    undefined  // Sin componente de botón URL
                  );
                  exito = waRes.ok;
                  errorDetalle = waRes.error || "";
                  if (waRes.ok) waMessageId = waRes.messageId;
                  contenidoEnviado = `[Plantilla: ${plantillaNombre}] ${parametros.join(" | ")}`;
                } else {
                  const waRes = await enviarWhatsAppTexto(enrollment.phone, mensajeFormateado);
                  exito = waRes.ok;
                  errorDetalle = waRes.error || "";
                  if (waRes.ok) waMessageId = waRes.messageId;
                }
              } else {
                const waRes = await enviarWhatsAppTexto(enrollment.phone, mensajeFormateado);
                exito = waRes.ok;
                errorDetalle = waRes.error || "";
                if (waRes.ok) waMessageId = waRes.messageId;
              }
              break;

            case "email":
              if (!enrollment.email || enrollment.email.includes("invalido")) {
                errorDetalle = "Email marcado como inválido o vacío.";
                exito = false;
              } else {
                contenidoEnviado = `Asunto: ${asuntoFormateado}\n\n${mensajeFormateado}`;
                try {
                  await enviarCorreo(enrollment.email, asuntoFormateado, mensajeFormateado);
                  exito = true;
                } catch (emailErr: any) {
                  exito = false;
                  errorDetalle = emailErr.message || "Error al enviar email.";
                  // Si el email rebota o da error de dirección inválida, marcar
                  if (errorDetalle.toLowerCase().includes("invalid") || errorDetalle.toLowerCase().includes("bounce")) {
                    await marcarEmailInvalido(sb, enrollment.id);
                  }
                }
              }
              break;

            case "sms":
              contenidoEnviado = mensajeFormateado;
              const smsRes = await enviarSMS(enrollment.phone, mensajeFormateado);
              exito = smsRes.ok;
              errorDetalle = smsRes.error || "";
              break;

            case "messenger":
              const canal = enrollment.canal_id || enrollment.phone || "";
              if (!canal || !canal.startsWith("messenger:")) {
                errorDetalle = "No es un lead de Messenger.";
                exito = false;
              } else {
                const psid = canal.replace("messenger:", "");
                contenidoEnviado = mensajeFormateado;
                const msgRes = await enviarMessengerTexto(psid, mensajeFormateado);
                exito = msgRes.ok;
                errorDetalle = msgRes.error || "";
              }
              break;

            case "llamada":
              // Las llamadas crean una tarea para el asesor y PAUSAN el avance automático.
              // El avance ocurre cuando el asesor registra el resultado.
              const tareaCreada = await crearTareaAsesor(sb, enrollment, step);
              if (tareaCreada) {
                accionesEjecutadas++;
                // Registrar la acción de asignación de llamada
                await registrarAccion(sb, {
                  enrollment_id: enrollment.id,
                  step_id: step.id,
                  canal: "llamada",
                  status: "llamada_agendada",
                  contenido_enviado: `Llamada asignada al asesor. Asunto: ${mensajeFormateado}`,
                });
                
                // Actualizar la fecha de último contacto para no duplicar tareas
                await sb
                  .from("sequence_enrollments")
                  .update({ ultimo_contacto_at: new Date().toISOString() })
                  .eq("id", enrollment.id);
              }
              // Romper el switch y NO avanzar automáticamente el step
              continue;
          }

          if (step.canal !== "llamada") {
            accionesEjecutadas++;

            // Registrar acción en secuencia
            await registrarAccion(sb, {
              enrollment_id: enrollment.id,
              step_id: step.id,
              canal: step.canal,
              status: exito ? "enviado" : "fallido",
              contenido_enviado: contenidoEnviado,
              error_detalle: errorDetalle,
            });

            if (exito) {
              // Si fue WhatsApp, registrar también en el historial de mensajes de la conversación
              if (step.canal === "whatsapp") {
                try {
                  const { data: idData } = await sb
                    .from("mensajes_whatsapp")
                    .select("expediente_id, prospecto_id")
                    .eq("telefono", enrollment.phone)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  await sb.from("mensajes_whatsapp").insert({
                    telefono: enrollment.phone,
                    texto: contenidoEnviado,
                    direccion: "out",
                    expediente_id: enrollment.expediente_id || idData?.expediente_id || null,
                    prospecto_id: enrollment.prospecto_id || idData?.prospecto_id || null,
                    estado: "enviado",
                    agente: "Sistema (Secuencia)",
                    wa_message_id: waMessageId || null,
                  });
                } catch (dbErr) {
                  console.error("Error al registrar mensaje de secuencia en mensajes_whatsapp:", dbErr);
                }
              }

              // Avanzar al siguiente paso
              await avanzarStep(sb, enrollment.id, enrollment.step_actual + 1);
            } else {
              // Si falla por rate limit 429 de WhatsApp, registramos el error
              // pero no avanzamos para poder reintentar en 10-15 minutos.
              if (errorDetalle.includes("429") || errorDetalle.toLowerCase().includes("rate limit")) {
                errores.push(`Rate limit 429 detectado para ${enrollment.phone}. Reintento programado.`);
              } else {
                // Otros errores persistentes: avanzamos el paso para no trabar la secuencia
                await avanzarStep(sb, enrollment.id, enrollment.step_actual + 1);
              }
            }
          }
        }
      } catch (innerErr: any) {
        errores.push(`Error procesando enrollment ${enrollment.id}: ${innerErr.message}`);
      }
    }
  } catch (err: any) {
    console.error("Error crítico en orquestador:", err);
    errores.push(`Error crítico: ${err.message}`);
  }

  return { procesados, accionesEjecutadas, errores };
}

/**
 * Verifica si el lead ya respondió por cualquier canal.
 */
async function leadRespondio(
  sb: ReturnType<typeof supabaseServidor>,
  enrollment: any,
): Promise<boolean> {
  // Para evitar falsos positivos con el primer mensaje del cliente que gatilló la creación
  // del prospecto (el cual se guarda en base de datos milisegundos después del enrolamiento),
  // exigimos una holgura de al menos 10 segundos desde la fecha de enrolamiento.
  const fechaFiltro = new Date(new Date(enrollment.enrolled_at).getTime() + 10000).toISOString();

  // 1. Verificar mensajes entrantes de WhatsApp/Messenger desde la fecha filtro
  const { data: nuevosMensajes, error } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .eq("telefono", enrollment.phone)
    .eq("direccion", "in")
    .gt("created_at", fechaFiltro);

  if (!error && nuevosMensajes && nuevosMensajes.length > 0) {
    return true;
  }

  // 2. Si tiene expediente, verificar si cambió de etapa a "cerrado" o "perdido"
  if (enrollment.expediente_id) {
    const { data: exp } = await sb
      .from("expedientes")
      .select("etapa")
      .eq("id", enrollment.expediente_id)
      .maybeSingle();

    if (exp && (exp.etapa === "cerrado" || exp.etapa === "perdido" || exp.etapa === "contactado")) {
      return true;
    }
  }

  return false;
}

/**
 * Saca a un lead de la secuencia actual.
 */
export async function salirDeSecuencia(
  sb: ReturnType<typeof supabaseServidor>,
  enrollmentId: string,
  razon: "respondio" | "califico" | "manual" | "completado" | "no_localizado",
  stepActual: number,
): Promise<void> {
  const status = razon === "completado" ? "completado" : "salido";
  
  const { data: enrollment } = await sb
    .from("sequence_enrollments")
    .update({
      status,
      salio_en_step: stepActual,
      razon_salida: razon,
      ultimo_contacto_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .select("phone, expediente_id")
    .single();

  // Si salió por respuesta, actualizar la última acción enviada y gatillar análisis de IA en segundo plano
  if (razon === "respondio") {
    try {
      const { data: ultimaAccion } = await sb
        .from("sequence_actions")
        .select("id")
        .eq("enrollment_id", enrollmentId)
        .order("enviado_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultimaAccion) {
        await sb
          .from("sequence_actions")
          .update({
            status: "respondido",
            respondido_at: new Date().toISOString(),
          })
          .eq("id", ultimaAccion.id);
      }
    } catch (err) {
      console.error("Error al actualizar última acción con respuesta:", err);
    }

    if (enrollment?.phone) {
      // Ejecutar análisis asíncrono
      void analizarConversacionConIA(enrollment.phone).catch((err) =>
        console.error(`Error en análisis IA post-secuencia para ${enrollment.phone}:`, err)
      );
    }
  }
}

/**
 * Avanza al siguiente paso de la secuencia.
 */
async function avanzarStep(
  sb: ReturnType<typeof supabaseServidor>,
  enrollmentId: string,
  siguientePaso: number,
): Promise<void> {
  await sb
    .from("sequence_enrollments")
    .update({
      step_actual: siguientePaso,
      ultimo_contacto_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);
}

/**
 * Comprueba si ya se envió un mensaje por ese canal hoy al mismo lead.
 */
async function canalEnviadoHoy(
  sb: ReturnType<typeof supabaseServidor>,
  enrollmentId: string,
  canal: string,
): Promise<boolean> {
  if (canal === "llamada") return false; // Las llamadas sí se pueden reagendar o repetir

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const { data, error } = await sb
    .from("sequence_actions")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("canal", canal)
    .eq("status", "enviado")
    .gt("enviado_at", inicioDia.toISOString());

  return !error && data && data.length > 0;
}

/**
 * Crea una tarea de llamada para el asesor.
 */
async function crearTareaAsesor(
  sb: ReturnType<typeof supabaseServidor>,
  enrollment: any,
  step: any,
): Promise<boolean> {
  // Verificar si ya existe una tarea pendiente para esta llamada y este lead
  const { data: existente } = await sb
    .from("asesor_tasks")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("status", "pendiente")
    .maybeSingle();

  if (existente) {
    return false; // Ya tiene una tarea pendiente, no duplicar
  }

  const { error } = await sb.from("asesor_tasks").insert({
    enrollment_id: enrollment.id,
    asesor_id: step.asignar_a || null,
    tipo: "llamada",
    status: "pendiente",
    agendada_para: new Date().toISOString(),
    notas: `Llamada automática programada. Secuencia: ${step.mensaje || "Seguimiento"}.`,
  });

  return !error;
}

/**
 * Registra una acción ejecutada en el historial.
 */
async function registrarAccion(
  sb: ReturnType<typeof supabaseServidor>,
  accion: {
    enrollment_id: string;
    step_id: string;
    canal: string;
    status: string;
    contenido_enviado: string;
    error_detalle?: string;
  },
): Promise<void> {
  await sb.from("sequence_actions").insert({
    enrollment_id: accion.enrollment_id,
    step_id: accion.step_id,
    canal: accion.canal,
    status: accion.status,
    contenido_enviado: accion.contenido_enviado,
    error_detalle: accion.error_detalle || null,
    enviado_at: new Date().toISOString(),
  });
}

/**
 * Marca el correo del lead como inválido para saltar pasos de email en el futuro.
 */
async function marcarEmailInvalido(
  sb: ReturnType<typeof supabaseServidor>,
  enrollmentId: string,
): Promise<void> {
  const { data } = await sb
    .from("sequence_enrollments")
    .select("email")
    .eq("id", enrollmentId)
    .single();

  if (data?.email) {
    await sb
      .from("sequence_enrollments")
      .update({ email: `${data.email} (invalido)` })
      .eq("id", enrollmentId);
  }
}

/**
 * Comprueba si la hora actual local de México (UTC-6) está dentro del rango permitido (8:00 AM a 9:00 PM).
 */
function esHorarioPermitido(): boolean {
  const ahora = new Date();
  // Obtener hora en México (UTC-6).
  // Nota: getUTCHours() - 6 se normaliza al rango 0-23
  const horaMexico = (ahora.getUTCHours() - 6 + 24) % 24;
  return horaMexico >= 8 && horaMexico < 21;
}

/**
 * Calcula las horas transcurridas desde una fecha ISO hasta ahora.
 */
function calcularHorasTranscurridas(fechaIso: string): number {
  if (!fechaIso) return 0;
  const difMs = Date.now() - new Date(fechaIso).getTime();
  return difMs / (1000 * 60 * 60);
}

/**
 * Mapea variables como {nombre} y {fraccionamiento} en los mensajes.
 */
async function formatearMensaje(
  sb: ReturnType<typeof supabaseServidor>,
  texto: string,
  enrollment: any,
): Promise<string> {
  let msg = texto;
  // Reemplazar {nombre}
  msg = msg.replace(/{nombre}/gi, enrollment.nombre || "Cliente");

  // Reemplazar {fraccionamiento} si hay expediente
  if (msg.includes("{fraccionamiento}") && enrollment.expediente_id) {
    const { data: exp } = await sb
      .from("expedientes")
      .select("fraccionamiento")
      .eq("id", enrollment.expediente_id)
      .maybeSingle();
    const frac = exp?.fraccionamiento || "su zona de interés";
    msg = msg.replace(/{fraccionamiento}/gi, frac);
  } else {
    msg = msg.replace(/{fraccionamiento}/gi, "su zona de interés");
  }

  return msg;
}

/**
 * Busca secuencias activas que correspondan al segmento y enrola al nuevo lead en ellas.
 */
export async function enrolarLeadEnSecuenciasActivas(
  sb: ReturnType<typeof supabaseServidor>,
  datos: {
    nombre: string;
    phone: string;
    email?: string;
    prospectoId: string;
    expedienteId?: string;
  }
): Promise<void> {
  try {
    // 1. Obtener todas las secuencias activas
    const { data: secuencias } = await sb
      .from("automation_sequences")
      .select("id, segmento")
      .eq("status", "activa");

    if (!secuencias || secuencias.length === 0) return;

    for (const sec of secuencias) {
      // Validar segmento (todos, o si el lead entra en el segmento)
      const matchesSegment = sec.segmento === "todos" || sec.segmento === "sin_contactar";
      if (!matchesSegment) continue;

      // 2. Verificar si ya está enrolado activamente en esta secuencia
      const { data: existente } = await sb
        .from("sequence_enrollments")
        .select("id")
        .eq("sequence_id", sec.id)
        .eq("phone", datos.phone)
        .eq("status", "activo")
        .maybeSingle();

      if (existente) continue;

      // 3. Enrolar
      await sb.from("sequence_enrollments").insert({
        sequence_id: sec.id,
        phone: datos.phone,
        nombre: datos.nombre,
        email: datos.email || null,
        prospecto_id: datos.prospectoId,
        expediente_id: datos.expedienteId || null,
        status: "activo",
        step_actual: 1,
        enrolled_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Error al enrolar lead automáticamente en secuencias activas:", err);
  }
}

/**
 * Rutina para encontrar prospectos/expedientes inactivos en 'nuevo-lead' o 'contactado'
 * por más de 3 días y enrolarlos automáticamente en una secuencia de reactivación.
 */
async function buscarYEnrolarLeadsInactivos(
  sb: ReturnType<typeof supabaseServidor>
): Promise<void> {
  try {
    // 1. Obtener todas las secuencias de reactivación activas para evaluar segmentación
    const { data: todasLasSecuencias } = await sb
      .from("automation_sequences")
      .select("id, nombre, segmento")
      .eq("status", "activa");

    const secuenciasActivas = todasLasSecuencias || [];
    if (secuenciasActivas.length === 0) {
      return; // No hay ninguna secuencia configurada y activa
    }

    // 2. Definir fecha límite (3 días de inactividad)
    const limiteInactividad = new Date();
    limiteInactividad.setDate(limiteInactividad.getDate() - 3);
    const limiteISO = limiteInactividad.toISOString();

    // 3. Buscar expedientes inactivos con su tipo_negocio (excluir leads del conmutador/sistema)
    const { data: expedientes } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, telefono, prospecto_id, tipo_negocio, ultimo_movimiento")
      .in("etapa", ["nuevo-lead", "contactado"])
      .lt("ultimo_movimiento", limiteISO)
      .not("cliente", "ilike", "%Conmutador%")   // Excluir leads del conmutador IA
      .not("cliente", "ilike", "%Test%")          // Excluir leads de prueba
      .not("cliente", "ilike", "%Prueba%");       // Excluir leads de prueba en español

    if (!expedientes || expedientes.length === 0) return;

    // 4. Filtrar los que ya están en alguna secuencia activa y enrolar
    for (const exp of expedientes) {
      if (!exp.telefono) continue;

      // Excluir números no mexicanos (deben empezar con 52 al normalizarse, o ser de 10 dígitos)
      const telLimpio = exp.telefono.replace(/\D/g, "");
      const esMexicano = telLimpio.length === 10 ||
        (telLimpio.startsWith("52") && telLimpio.length >= 12 && telLimpio.length <= 13);
      if (!esMexicano) continue; // Saltar números de EE.UU. u otros países

      // Verificar si ya está enrolado activamente en CUALQUIER secuencia
      const { data: enrolado } = await sb
        .from("sequence_enrollments")
        .select("id")
        .eq("phone", exp.telefono)
        .eq("status", "activo")
        .maybeSingle();

      if (enrolado) continue; // Ya está en una secuencia activa, ignorar

      // DETERMINAR LA MEJOR SECUENCIA PARA ESTE LEAD SEGÚN SU TIPO DE NEGOCIO:
      // A. Buscar secuencia específica cuyo segmento coincida con el tipo_negocio del expediente
      let secuenciaElegida = secuenciasActivas.find(
        (s) => s.segmento === exp.tipo_negocio && exp.tipo_negocio
      );

      // B. Fallback 1: Buscar secuencia con segmento 'sin_respuesta' o 'todos'
      if (!secuenciaElegida) {
        secuenciaElegida = secuenciasActivas.find(
          (s) => s.segmento === "sin_respuesta" || s.segmento === "todos"
        );
      }

      // C. Fallback 2: Buscar secuencia cuyo nombre contenga la palabra 'reactiva'
      if (!secuenciaElegida) {
        secuenciaElegida = secuenciasActivas.find(
          (s) => (s.nombre || "").toLowerCase().includes("reactiva")
        );
      }

      // Si definitivamente no encontramos ninguna secuencia apta, saltamos el lead
      if (!secuenciaElegida) continue;

      const nombreCompleto = [exp.cliente, exp.primer_apellido, exp.segundo_apellido]
        .filter(Boolean)
        .join(" ");

      await sb.from("sequence_enrollments").insert({
        sequence_id: secuenciaElegida.id,
        phone: exp.telefono,
        nombre: nombreCompleto || "Cliente",
        prospecto_id: exp.prospecto_id || null,
        expediente_id: exp.id,
        status: "activo",
        step_actual: 1,
        enrolled_at: new Date().toISOString(),
      });

      // Registrar una actividad de sistema en el expediente
      await sb.from("actividades").insert({
        expediente_id: exp.id,
        prospecto_id: exp.prospecto_id || null,
        tipo: "sistema",
        titulo: "Enrolamiento por inactividad",
        detalle: `Enrolado automáticamente en la secuencia '${secuenciaElegida.nombre}' tras 3 días sin actividad (Tipo: ${exp.tipo_negocio || "sin especificar"}).`,
      });
    }
  } catch (err) {
    console.error("Error en buscarYEnrolarLeadsInactivos:", err);
  }
}

/**
 * Busca leads inactivos (entre 12 y 22 horas) y les envía un retoque de WhatsApp generado por IA
 * para reactivar la conversación antes de que expire la ventana de 24 horas.
 */
export async function retoqueAutomaticoLedsInactivos(
  sb: ReturnType<typeof supabaseServidor>
): Promise<{ procesados: number; enviados: number; errores: string[] }> {
  let procesados = 0;
  let enviados = 0;
  const errores: string[] = [];

  try {
    // 0. Si no es horario permitido comercialmente, salir de inmediato
    if (!esHorarioPermitido()) {
      return { procesados: 0, enviados: 0, errores: [] };
    }

    // 1. Obtener expedientes activos (no en etapa terminal y no marcados como no_viable)
    const { data: expedientes, error: errExps } = await sb
      .from("expedientes")
      .select("id, cliente, telefono, tipo_negocio, etapa, no_viable, prospecto_id")
      .not("telefono", "is", null);

    if (errExps) {
      throw new Error(`Error leyendo expedientes para retoque: ${errExps.message}`);
    }

    const expsActivos = (expedientes || []).filter(
      (e) =>
        e.etapa !== "cerrado" &&
        e.etapa !== "perdido" &&
        e.etapa !== "venta" &&
        !e.no_viable
    );

    if (expsActivos.length === 0) {
      return { procesados: 0, enviados: 0, errores: [] };
    }

    // Cargar dinámicamente el generador de retoques para evitar dependencias circulares
    const { generarMensajeRetoque } = await import("@/lib/ia/agente");
    const { registrarActividad } = await import("@/lib/actividades");

    for (const exp of expsActivos) {
      procesados++;
      const telefono = exp.telefono;
      if (!telefono) continue;

      try {
        // Excluir números no válidos de WhatsApp (deben tener un formato válido)
        const telLimpio = telefono.replace(/\D/g, "");
        const esMexicano = telLimpio.length === 10 ||
          (telLimpio.startsWith("52") && telLimpio.length >= 12 && telLimpio.length <= 13);
        if (!esMexicano) continue;

        // 2. Obtener los últimos mensajes de este expediente para evaluar inactividad
        const { data: mensajes, error: errMsgs } = await sb
          .from("mensajes_whatsapp")
          .select("direccion, created_at, agente, texto")
          .eq("expediente_id", exp.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (errMsgs || !mensajes || mensajes.length === 0) continue;

        const ultimoMsg = mensajes[0];

        // Regla de Ventana de 24 horas de Meta:
        // Buscamos el último mensaje recibido del cliente (direccion = 'in').
        // Si han pasado más de 24 horas desde su último mensaje (o nunca ha enviado uno),
        // WhatsApp no permite el envío de textos libres (daría error 470).
        const ultimoMsgCliente = mensajes.find((m) => m.direccion === "in");
        if (!ultimoMsgCliente) continue;

        const diffClienteMs = Date.now() - new Date(ultimoMsgCliente.created_at).getTime();
        const diffClienteHoras = diffClienteMs / (1000 * 60 * 60);
        if (diffClienteHoras > 24) {
          // Fuera de la ventana de 24 horas, ignoramos retoque libre de IA
          continue;
        }

        // Regla: El último mensaje debe ser saliente (enviado por la IA o el sistema, no un humano)
        const esSalienteAutomatizado =
          ultimoMsg.direccion === "out" &&
          (ultimoMsg.agente === "IA" ||
            ultimoMsg.agente === "Sistema (Secuencia)" ||
            ultimoMsg.agente === "Sistema" ||
            !ultimoMsg.agente);

        if (!esSalienteAutomatizado) continue;

        // Regla: Antigüedad entre 12 y 22 horas del último mensaje saliente automatizado
        const diffMs = Date.now() - new Date(ultimoMsg.created_at).getTime();
        const diffHoras = diffMs / (1000 * 60 * 60);

        if (diffHoras < 12 || diffHoras > 22) continue;

        // Regla: No duplicar el retoque en este ciclo de silencio.
        // Si ya hay un mensaje de retoque (agente = 'IA (Retoque)') enviado en el bloque de salida actual
        // (es decir, después de cualquier mensaje del cliente), lo ignoramos.
        // Como el último mensaje es saliente y cumple las condiciones, verificamos si ya existe algún
        // mensaje con agente 'IA (Retoque)' en el historial de mensajes de este bloque saliente.
        let yaRetocado = false;
        for (const msg of mensajes) {
          if (msg.direccion === "in") {
            // Llegamos al último mensaje entrante del cliente, paramos la búsqueda
            break;
          }
          if (msg.direccion === "out" && msg.agente === "IA (Retoque)") {
            yaRetocado = true;
            break;
          }
        }

        if (yaRetocado) continue;

        // 3. Generar mensaje de retoque personalizado usando IA
        const textoRetoque = await generarMensajeRetoque(sb, telefono, exp.id);
        if (!textoRetoque || textoRetoque.trim().length === 0) continue;

        // 4. Enviar el retoque por WhatsApp
        const waRes = await enviarWhatsAppTexto(telefono, textoRetoque);

        if (waRes.ok) {
          enviados++;
          
          // Registrar mensaje saliente de retoque
          await sb.from("mensajes_whatsapp").insert({
            telefono: telefono,
            texto: textoRetoque,
            direccion: "out",
            expediente_id: exp.id,
            prospecto_id: exp.prospecto_id || null,
            estado: "enviado",
            agente: "IA (Retoque)",
            wa_message_id: waRes.messageId || null,
          });

          // Registrar la actividad en el expediente
          await registrarActividad(sb, {
            expedienteId: exp.id,
            tipo: "sistema",
            titulo: "Retoque automático enviado (IA)",
            detalle: textoRetoque,
          });

          console.log(`[Retoque Automático] WhatsApp de seguimiento enviado con éxito a ${telefono}: "${textoRetoque}"`);
        } else {
          errores.push(`Error enviando retoque a ${telefono}: ${waRes.error || "Error de envío"}`);
        }

        // Rate limit entre envíos
        if (enviados > 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }

      } catch (leadErr: any) {
        errores.push(`Error procesando lead ${exp.id} para retoque: ${leadErr.message}`);
      }
    }
  } catch (err: any) {
    console.error("Error crítico en retoqueAutomaticoLedsInactivos:", err);
    errores.push(`Error crítico en retoque: ${err.message}`);
  }

  return { procesados, enviados, errores };
}

