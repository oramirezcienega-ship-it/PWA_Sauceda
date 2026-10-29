import { supabaseServidor } from "@/lib/supabase/server";
import { armarInformacionLead, generarResumenLeadIA } from "@/lib/lead-telegram";
import { armarTextoLeadWhatsApp, type DatosLeadTelegram } from "@/lib/lead-telegram-formato";
import { enviarMensajeTextoEvolution } from "@/lib/evolution-api";
import { setConversacionPausada } from "@/lib/ia/control-pausa";
import { normalizarTelefono, variantesTelefono, formatearTelefonoLegible } from "@/lib/telefono";
import { revalidatePath } from "next/cache";

export interface ParametrosAsignacionSeguridad {
  telefono: string;
  expedienteId?: string | null;
  prospectoId?: string | null;
  motivo?: string;
  forzar?: boolean;
}

export interface ResultadoAsignacionSeguridad {
  ok: boolean;
  error?: string;
  envioId?: string;
  messageId?: string;
  omitidoPorDuplicado?: boolean;
}

const GERARDO_ID_OFICIAL = "63411a07-6403-43b8-9d84-d71909b59823";
const GERARDO_TEL_OFICIAL = "4771534121";

/**
 * Pasa automáticamente cualquier lead entrante de Seguridad (CCTV, cámaras, alarmas, videoporteros)
 * al asesor comercial Gerardo por WhatsApp usando la instancia secundaria de Evolution API.
 * 
 * Acciones que realiza de forma 100% automática:
 * 1. Verifica idempotencia (no duplica si ya se envió a Gerardo en las últimas 24 h salvo `forzar: true`).
 * 2. Obtiene datos del lead, genera resumen con IA de la necesidad y formatea la ficha idéntica al modal.
 * 3. Envía el mensaje a Gerardo por Evolution API a su WhatsApp (4771534121 / 5214771534121).
 * 4. Registra el mensaje saliente en `mensajes_whatsapp` para trazabilidad en la pestaña "Asesores".
 * 5. Pausa a Sofía de inmediato para ese teléfono para que Gerardo atienda directamente.
 * 6. Asigna el lead a Gerardo en `expedientes`, `prospectos` y en el último mensaje de la conversación.
 * 7. Registra el envío en `leads_envios_telegram` (canal: 'whatsapp') para que el CRM muestre el badge.
 * 8. Registra la actividad correspondiente en la bitácora (`actividades`).
 */
export async function pasarLeadSeguridadAGerardoAutomatico(
  params: ParametrosAsignacionSeguridad
): Promise<ResultadoAsignacionSeguridad> {
  try {
    const sb = supabaseServidor();
    const telCliente = normalizarTelefono(params.telefono);
    if (!telCliente) {
      return { ok: false, error: "Teléfono de cliente inválido." };
    }

    // 1. Obtener perfil de Gerardo
    const { data: perfilGerardo } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp")
      .ilike("nombre", "%Gerardo%")
      .eq("activo", true)
      .maybeSingle();

    const asesorId = perfilGerardo?.id || GERARDO_ID_OFICIAL;
    const asesorNombre = perfilGerardo?.nombre || "Gerardo";
    const asesorTel = perfilGerardo?.telefono_whatsapp || perfilGerardo?.telefono || GERARDO_TEL_OFICIAL;

    // 2. Control de idempotencia: no enviar múltiples veces el mismo lead a Gerardo en 24h
    if (!params.forzar) {
      const variantes = variantesTelefono(telCliente);
      const { data: enviosPrevios } = await sb
        .from("leads_envios_telegram")
        .select("id, created_at")
        .eq("asesor_id", asesorId)
        .in("telefono", variantes)
        .order("created_at", { ascending: false })
        .limit(1);

      if (enviosPrevios && enviosPrevios.length > 0) {
        const horasTranscurridas =
          (Date.now() - new Date(enviosPrevios[0].created_at).getTime()) / (1000 * 60 * 60);
        if (horasTranscurridas < 24) {
          console.log(
            `[Asignación Seguridad Automática] Lead ${telCliente} ya fue enviado a Gerardo hace ${horasTranscurridas.toFixed(1)} horas. Omitiendo duplicado.`
          );
          return { ok: true, omitidoPorDuplicado: true, envioId: enviosPrevios[0].id };
        }
      }
    }

    // 3. Obtener información estructurada del lead
    const rLead = await armarInformacionLead(sb, telCliente, "Sistema (Automático Seguridad)");
    let datosLead: DatosLeadTelegram;
    let resumen = "";

    if (rLead.ok && rLead.info) {
      datosLead = rLead.info.datos;
      // Generar resumen con IA a partir de los mensajes
      try {
        if (rLead.info.transcripcion) {
          resumen = await generarResumenLeadIA(rLead.info.transcripcion, datosLead.clienteNombre);
        }
      } catch (errIA) {
        console.warn("[Asignación Seguridad Automática] No se pudo generar resumen con IA:", errIA);
      }
    } else {
      // Fallback si la conversación apenas tiene 0 mensajes o fallo de lectura
      const [{ data: exp }, { data: pros }] = await Promise.all([
        params.expedienteId
          ? sb.from("expedientes").select("*").eq("id", params.expedienteId).maybeSingle()
          : Promise.resolve({ data: null as any }),
        params.prospectoId
          ? sb.from("prospectos").select("*").eq("id", params.prospectoId).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);

      const clienteNombre =
        [pros?.nombre, pros?.primer_apellido].filter(Boolean).join(" ") ||
        exp?.cliente ||
        `Lead ${formatearTelefonoLegible(telCliente)}`;

      datosLead = {
        clienteNombre,
        telefonoLegible: formatearTelefonoLegible(telCliente),
        telefonoWa: telCliente,
        tipoNegocio: "Seguridad (CCTV / Alarmas / Videoporteros)",
        expedienteId: params.expedienteId || exp?.id || null,
        prospectoId: params.prospectoId || pros?.id || null,
        direccion: [exp?.direccion_propiedad || pros?.direccion || "", exp?.fraccionamiento || ""].filter(Boolean).join(", "),
        necesidad: exp?.situacion || pros?.notas || "Interés en sistemas de seguridad y videovigilancia",
        asignadoPor: "Sistema (Automático Seguridad)",
        fotosCliente: 0,
        totalMensajes: 1,
      };
    }

    if (!resumen) {
      resumen = "• Lead entrante con solicitud en el área de Seguridad (videovigilancia / alarmas / videoporteros).\n• Se transfiere de forma inmediata para contacto directo y cotización a la medida.";
    }

    // 4. Formatear el texto oficial de WhatsApp
    const notaEnvio = params.motivo || "Asignación automática inmediata: Lead de Seguridad.";
    const textoWhatsApp = armarTextoLeadWhatsApp(datosLead, resumen, notaEnvio);

    // 5. Enviar mensaje por Evolution API a Gerardo
    const resEvolution = await enviarMensajeTextoEvolution(asesorTel, textoWhatsApp);
    if (!resEvolution.ok) {
      console.error("[Asignación Seguridad Automática] Error enviando a Evolution API:", resEvolution.error);
    }

    // 6. Registrar en mensajes_whatsapp como mensaje saliente hacia Gerardo (para la pestaña "Asesores")
    const telGerardoNorm = normalizarTelefono(asesorTel);
    try {
      await sb.from("mensajes_whatsapp").insert({
        telefono: telGerardoNorm,
        direccion: "out",
        texto: textoWhatsApp,
        wa_message_id: resEvolution.messageId || null,
        estado: resEvolution.ok ? "enviado" : "error",
        agente: "Sistema (Pase Automático Seguridad)",
        expediente_id: datosLead.expedienteId || null,
        prospecto_id: datosLead.prospectoId || null,
      });
    } catch (errDbMsg) {
      console.warn("[Asignación Seguridad Automática] No se pudo guardar en mensajes_whatsapp de Gerardo:", errDbMsg);
    }

    // 7. Pausar a Sofía inmediatamente para que Gerardo atienda sin interferencia
    try {
      await setConversacionPausada(sb, telCliente, true, datosLead.expedienteId, datosLead.prospectoId);
      console.log(`[Asignación Seguridad Automática] Sofía pausada para el cliente ${telCliente}.`);
    } catch (errPausa) {
      console.error("[Asignación Seguridad Automática] Error al pausar a Sofía:", errPausa);
    }

    // 8. Asignar lead a Gerardo en expedientes y prospectos
    const expId = datosLead.expedienteId;
    const prosId = datosLead.prospectoId;

    if (expId) {
      await sb
        .from("expedientes")
        .update({
          asesor_id: asesorId,
          tipo_negocio: "seguridad",
          ultimo_movimiento: new Date().toISOString(),
        })
        .eq("id", expId);
    }

    if (prosId) {
      await sb
        .from("prospectos")
        .update({
          asesor_id: asesorId,
          tipo_negocio: "seguridad",
        })
        .eq("id", prosId);
    }

    // Actualizar el agente en el último mensaje de la conversación del cliente
    try {
      const { data: ultMsg } = await sb
        .from("mensajes_whatsapp")
        .select("id")
        .in("telefono", variantesTelefono(telCliente))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultMsg?.id) {
        await sb.from("mensajes_whatsapp").update({ agente: asesorNombre }).eq("id", ultMsg.id);
      }
    } catch {
      /* ignore */
    }

    // 9. Registrar el envío en leads_envios_telegram (canal: 'whatsapp') para el badge del CRM
    const envioId = crypto.randomUUID();
    let actividadId: string | null = null;

    // 10. Registrar actividad en la bitácora del CRM
    if (expId || prosId) {
      const detalleActividad = [
        `Asignado automáticamente por el Sistema a ${asesorNombre} vía Evolution API.`,
        `Ficha y resumen enviados a su WhatsApp (+52 ${asesorTel}).`,
        `Sofía quedó pausada para este cliente para atención humana directa.`,
        resumen ? `Resumen:\n${resumen}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      try {
        const { data: act } = await sb
          .from("actividades")
          .insert({
            expediente_id: expId,
            prospecto_id: prosId,
            tipo: "whatsapp_enviado",
            titulo: `🚀 Lead de Seguridad pasado automáticamente a ${asesorNombre} (Evolution API)`,
            detalle: detalleActividad,
          })
          .select("id")
          .maybeSingle();
        actividadId = act?.id || null;
      } catch (errAct) {
        console.warn("[Asignación Seguridad Automática] No se pudo guardar actividad:", errAct);
      }
    }

    try {
      await sb.from("leads_envios_telegram").insert({
        id: envioId,
        telefono: telCliente,
        prospecto_id: prosId,
        expediente_id: expId,
        cliente_nombre: datosLead.clienteNombre,
        asesor_id: asesorId,
        asesor_nombre: asesorNombre,
        enviado_por_id: null,
        enviado_por_nombre: "Sistema (Automático)",
        nota: notaEnvio,
        resumen: resumen,
        estado: "enviado",
        canal: "whatsapp",
        actividad_id: actividadId,
      });
    } catch (errIns) {
      console.warn("[Asignación Seguridad Automática] No se pudo registrar en leads_envios_telegram:", errIns);
    }

    if (expId) revalidatePath(`/expedientes/${expId}`);
    if (prosId) revalidatePath(`/prospectos/${prosId}`);
    revalidatePath("/conversaciones");

    return {
      ok: true,
      envioId,
      messageId: resEvolution.messageId,
    };
  } catch (err: any) {
    console.error("[Asignación Seguridad Automática] Error fatal:", err);
    return { ok: false, error: err?.message || "Error al procesar asignación automática." };
  }
}
