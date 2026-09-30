"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { enviarFotosTelegram } from "@/lib/telegram-envios";
import {
  armarInformacionInspeccion,
  guardarEnviosTelegramCita,
  marcarCitaEnteradaTelegram,
  type EnvioTelegramAsesor,
} from "@/lib/inspeccion-telegram";

export interface PrevisualizacionInspeccionTelegram {
  ok: boolean;
  error?: string;
  /** Mensaje tal como lo recibirá el asesor (HTML permitido por Telegram, ya escapado). */
  html?: string;
  fotosUrls?: string[];
  fotosOmitidas?: number;
  destinatarios?: { id: string; nombre: string; tieneTelegram: boolean }[];
}

/** Vista previa de lo que se le enviará al asesor (sin enviar nada). */
export async function previsualizarInspeccionTelegramAction(
  citaId: string
): Promise<PrevisualizacionInspeccionTelegram> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const r = await armarInformacionInspeccion(sb, citaId);
    if (!r.ok || !r.info) return { ok: false, error: r.error };
    return {
      ok: true,
      html: r.info.html,
      fotosUrls: r.info.fotosUrls,
      fotosOmitidas: r.info.fotosOmitidas,
      destinatarios: r.info.destinatarios.map((d) => ({
        id: d.id,
        nombre: d.nombre,
        tieneTelegram: Boolean(d.telegramChatId),
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar la vista previa." };
  }
}

export interface ResultadoCompartirInspeccion {
  ok: boolean;
  error?: string;
  enviados: { nombre: string; ok: boolean; error?: string }[];
  /** Asesores asignados a los que no se les pudo escribir (sin Telegram vinculado). */
  sinTelegram: string[];
  fotosEnviadas: number;
}

/**
 * Comparte por Telegram con el/los asesor(es) asignados toda la información de
 * la inspección. El mensaje lleva un botón "Enterado" para confirmar lectura y
 * el resultado por asesor se guarda en la cita.
 */
export async function compartirInspeccionPorTelegramAction(citaId: string): Promise<ResultadoCompartirInspeccion> {
  const vacio = { enviados: [], sinTelegram: [], fotosEnviadas: 0 };
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "El bot de Telegram no está configurado.", ...vacio };

    const r = await armarInformacionInspeccion(sb, citaId);
    if (!r.ok || !r.info) return { ok: false, error: r.error, ...vacio };
    const { html, fotosUrls, destinatarios } = r.info;

    const enviados: { nombre: string; ok: boolean; error?: string }[] = [];
    const sinTelegram: string[] = [];
    const registro: Record<string, EnvioTelegramAsesor> = {};
    let fotosEnviadas = 0;

    for (const d of destinatarios) {
      const ahora = new Date().toISOString();
      if (!d.telegramChatId) {
        sinTelegram.push(d.nombre);
        registro[d.id] = { nombre: d.nombre, ok: false, enviadoAt: ahora, error: "Sin Telegram vinculado" };
        continue;
      }

      const res = await enviarMensajeTelegram({
        botToken,
        chatId: d.telegramChatId,
        texto: html,
        parseMode: "HTML",
        inlineKeyboard: [[{ text: "👀 Enterado (ya lo leí)", callback_data: `c:${citaId}` }]],
      });
      enviados.push({ nombre: d.nombre, ok: res.ok, error: res.ok ? undefined : res.error });
      registro[d.id] = {
        nombre: d.nombre,
        ok: res.ok,
        enviadoAt: ahora,
        messageId: res.messageId,
        error: res.ok ? undefined : res.error,
      };

      if (res.ok && fotosUrls.length > 0) {
        const f = await enviarFotosTelegram({ botToken, chatId: d.telegramChatId, urls: fotosUrls });
        fotosEnviadas += f.enviadas;
      }
    }

    await guardarEnviosTelegramCita(sb, citaId, registro);
    revalidatePath("/agenda");

    const algunoOk = enviados.some((e) => e.ok);
    return {
      ok: algunoOk,
      error: algunoOk
        ? undefined
        : sinTelegram.length > 0
        ? `No se pudo enviar: ${sinTelegram.join(", ")} no tiene Telegram vinculado.`
        : "No se pudo enviar el mensaje por Telegram.",
      enviados,
      sinTelegram,
      fotosEnviadas,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al compartir la inspección.", ...vacio };
  }
}

/** Marca a mano que el asesor ya leyó la información (p. ej. confirmó por llamada). */
export async function marcarInspeccionEnteradaManualAction(
  citaId: string,
  perfilId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    return await marcarCitaEnteradaTelegram(sb, citaId, perfilId, "manual");
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al marcar como enterado." };
  }
}
