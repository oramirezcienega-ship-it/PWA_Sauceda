"use server";

import {
  consultarEstadoEvolution,
  generarMensajeRescate,
  enviarMensajeTextoEvolution,
  type DatosRescateLead,
} from "@/lib/evolution-api";
import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { normalizarTelefono } from "@/lib/telefono";
import { revalidatePath } from "next/cache";

/**
 * Consulta el estado de la línea secundaria en Evolution API (Proxmox)
 */
export async function obtenerEstadoEvolutionAction() {
  return await consultarEstadoEvolution();
}

/**
 * Genera el texto de rescate con el enlace inteligente wa.me prellenado con [EXP-XXX]
 */
export async function generarMensajeRescateAction(datos: DatosRescateLead) {
  return generarMensajeRescate(datos);
}

/**
 * Envía el mensaje de rescate mediante la línea móvil secundaria conectada en Evolution API
 */
export async function enviarRescateMovilAction(params: {
  telefono: string;
  mensaje: string;
  expedienteId?: string;
  prospectoId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();
    const tel = normalizarTelefono(params.telefono);

    // 1. Enviar mediante la API de Evolution en Proxmox
    const resEnvio = await enviarMensajeTextoEvolution(tel, params.mensaje);
    if (!resEnvio.ok) {
      return resEnvio;
    }

    // 2. Registrar en mensajes_whatsapp como mensaje saliente de la línea de rescate
    try {
      await sb.from("mensajes_whatsapp").insert({
        telefono: tel,
        texto: `[Línea Móvil Secundaria - Rescate]\n${params.mensaje}`,
        direccion: "out",
        estado: "enviado",
        agente: "Línea Rescate",
        expediente_id: params.expedienteId || null,
        prospecto_id: params.prospectoId || null,
      });
    } catch (errDb) {
      console.warn("[Evolution API Action] No se pudo guardar en mensajes_whatsapp:", errDb);
    }

    // 3. Registrar actividad en la bitácora
    try {
      await registrarActividad(sb, {
        prospectoId: params.prospectoId,
        expedienteId: params.expedienteId,
        tipo: "whatsapp_enviado",
        titulo: "📲 Mensaje de rescate enviado por Línea Móvil (Evolution API)",
        detalle: `Se envió mensaje con enlace puente [${params.expedienteId || "EXP"}] a ${tel}.`,
      });
    } catch (errAct) {
      console.warn("[Evolution API Action] No se pudo registrar actividad:", errAct);
    }

    if (params.expedienteId) {
      revalidatePath(`/expedientes/${params.expedienteId}`);
    }
    revalidatePath("/conversaciones");

    return { ok: true, messageId: resEnvio.messageId };
  } catch (err: any) {
    console.error("[Evolution API Action] Error general:", err);
    return { ok: false, error: err.message || "Error al enviar mensaje de rescate." };
  }
}
