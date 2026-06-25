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

          // Mapear y sustituir variables {nombre} y {fraccionamiento}
          const mensajeFormateado = await formatearMensaje(sb, step.mensaje || "", enrollment);
          const asuntoFormateado = step.asunto_email ? await formatearMensaje(sb, step.asunto_email, enrollment) : "";

          // Ejecutar según el canal
          switch (step.canal) {
            case "whatsapp":
              contenidoEnviado = mensajeFormateado;
              const waRes = await enviarWhatsAppTexto(enrollment.phone, mensajeFormateado);
              exito = waRes.ok;
              errorDetalle = waRes.error || "";
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
  // 1. Verificar mensajes entrantes de WhatsApp/Messenger desde enrolled_at
  const { data: nuevosMensajes, error } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .eq("telefono", enrollment.phone)
    .eq("direccion", "in")
    .gt("created_at", enrollment.enrolled_at);

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
