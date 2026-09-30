"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram } from "@/lib/telegram";
import { enviarDocumentoTelegram } from "@/lib/telegram-envios";
import { registrarActividad } from "@/lib/actividades";
import {
  armarPaqueteAutorizacion,
  listarDestinatariosAutorizacion,
  type DestinatarioAutorizacion,
  type RegistroAutorizacionCosto,
} from "@/lib/cotizacion-telegram";

export interface EstadoAutorizacionCostos {
  ok: boolean;
  error?: string;
  /** Resumen tal como lo verá el destinatario en Telegram (HTML ya escapado). */
  html?: string;
  destinatarios: DestinatarioAutorizacion[];
  registros: Record<string, RegistroAutorizacionCosto>;
  /** Enlaces para vincular a un proveedor/usuario con el bot: clave -> URL. */
  enlaces: Record<string, string>;
}

const vacio = { destinatarios: [], registros: {}, enlaces: {} };

async function usernameBot(botToken: string): Promise<string> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const d = await r.json();
    return d?.result?.username || "";
  } catch {
    return "";
  }
}

/** Vista previa del mensaje, destinatarios disponibles y respuestas ya recibidas. */
export async function obtenerEstadoAutorizacionCostosAction(cotizacionId: string): Promise<EstadoAutorizacionCostos> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const paquete = await armarPaqueteAutorizacion(sb, cotizacionId);
    if (!paquete.ok) return { ok: false, error: paquete.error, ...vacio };

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    const bot = botToken ? await usernameBot(botToken) : "";
    const destinatarios = await listarDestinatariosAutorizacion(sb);
    const enlaces: Record<string, string> = {};
    if (bot) {
      for (const d of destinatarios) {
        if (!d.telegramChatId) enlaces[d.clave] = `https://t.me/${bot}?start=${d.tipo === "proveedor" ? `prov_${d.id}` : d.id}`;
      }
    }
    const { data: cot } = await sb.from("cotizaciones").select("autorizacion_costos").eq("id", cotizacionId).maybeSingle();
    return {
      ok: true,
      html: paquete.caption,
      destinatarios,
      registros: (cot?.autorizacion_costos as Record<string, RegistroAutorizacionCosto>) || {},
      enlaces,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar el envío.", ...vacio };
  }
}

/** Envía por Telegram el PDF de la cotización y el resumen, con botones Autorizar / Rechazar. */
export async function enviarAutorizacionCostosAction(
  cotizacionId: string,
  claves: string[]
): Promise<{ ok: boolean; error?: string; enviados: { nombre: string; ok: boolean; error?: string }[] }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    if (claves.length === 0) return { ok: false, error: "Selecciona al menos un destinatario.", enviados: [] };

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado.", enviados: [] };

    const paquete = await armarPaqueteAutorizacion(sb, cotizacionId);
    if (!paquete.ok) return { ok: false, error: paquete.error, enviados: [] };

    const todos = await listarDestinatariosAutorizacion(sb);
    const elegidos = todos.filter((d) => claves.includes(d.clave));

    const { data: cot } = await sb.from("cotizaciones").select("autorizacion_costos, prospecto_id, expediente_id").eq("id", cotizacionId).maybeSingle();
    const registros: Record<string, RegistroAutorizacionCosto> = { ...((cot?.autorizacion_costos as any) || {}) };
    const enviados: { nombre: string; ok: boolean; error?: string }[] = [];

    for (const d of elegidos) {
      const ahora = new Date().toISOString();
      if (!d.telegramChatId) {
        registros[d.clave] = { nombre: d.nombre, tipo: d.tipo, ok: false, enviadoAt: ahora, error: "Sin Telegram vinculado", respuesta: null };
        enviados.push({ nombre: d.nombre, ok: false, error: "Sin Telegram vinculado" });
        continue;
      }
      const r = await enviarDocumentoTelegram({
        botToken,
        chatId: d.telegramChatId,
        contenido: paquete.pdf,
        nombreArchivo: paquete.nombreArchivo,
        caption: paquete.caption,
        inlineKeyboard: [[
          { text: "✅ Autorizar costo", callback_data: `k:${cotizacionId}:1` },
          { text: "❌ Rechazar", callback_data: `k:${cotizacionId}:0` },
        ]],
      });
      registros[d.clave] = {
        nombre: d.nombre, tipo: d.tipo, ok: r.ok, enviadoAt: ahora, messageId: r.messageId,
        error: r.ok ? undefined : r.error, respuesta: null, respondidoAt: null,
      };
      enviados.push({ nombre: d.nombre, ok: r.ok, error: r.error });
    }

    await sb.from("cotizaciones").update({ autorizacion_costos: registros }).eq("id", cotizacionId);

    const okNombres = enviados.filter((e) => e.ok).map((e) => e.nombre);
    if (okNombres.length > 0) {
      await registrarActividad(sb, {
        prospectoId: cot?.prospecto_id,
        expedienteId: cot?.expediente_id || undefined,
        tipo: "construccion",
        titulo: `Cotización ${cotizacionId} enviada por Telegram para autorizar costo`,
        detalle: `Enviada a: ${okNombres.join(", ")}.`,
      });
    }
    revalidatePath(`/construccion/${cotizacionId}`);

    const algunoOk = okNombres.length > 0;
    return {
      ok: algunoOk,
      error: algunoOk ? undefined : enviados.map((e) => `${e.nombre}: ${e.error}`).join(" · ") || "No se pudo enviar.",
      enviados,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al enviar por Telegram.", enviados: [] };
  }
}
