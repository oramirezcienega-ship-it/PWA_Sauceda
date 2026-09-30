"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { obtenerConfiguracionTelegram } from "@/lib/telegram";

export interface UsuarioVinculacionTelegram {
  id: string;
  nombre: string;
  rol: string;
  vinculado: boolean;
  /** Enlace personal: al abrirlo y pulsar "Iniciar", el usuario queda vinculado solo. */
  enlace: string | null;
}

export interface EstadoVinculacionTelegram {
  ok: boolean;
  error?: string;
  botUsername?: string;
  webhookActivo: boolean;
  webhookUrl?: string;
  webhookError?: string;
  usuarios: UsuarioVinculacionTelegram[];
}

const SITE_URL = () => process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://crm.saucedamx.com";

async function llamarTelegram(token: string, metodo: string, params?: Record<string, any>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
    cache: "no-store",
  });
  return (await res.json()) as any;
}

/** Estado del bot (usuario, webhook) y de la vinculación de cada usuario activo. */
export async function obtenerVinculacionTelegramAction(): Promise<EstadoVinculacionTelegram> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) {
      return {
        ok: false,
        error: "Primero guarda el token del bot (arriba) para poder vincular usuarios.",
        webhookActivo: false,
        usuarios: [],
      };
    }

    const me = await llamarTelegram(botToken, "getMe");
    if (!me?.ok) {
      return {
        ok: false,
        error: `Telegram rechazó el token del bot: ${me?.description || "token inválido"}.`,
        webhookActivo: false,
        usuarios: [],
      };
    }
    const botUsername: string = me.result?.username || "";

    const info = await llamarTelegram(botToken, "getWebhookInfo");
    const urlEsperada = `${SITE_URL()}/api/telegram/webhook`;
    const webhookUrl: string = info?.result?.url || "";

    const { data: perfiles } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, telegram_chat_id")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    return {
      ok: true,
      botUsername,
      webhookActivo: webhookUrl === urlEsperada,
      webhookUrl,
      webhookError: info?.result?.last_error_message || undefined,
      usuarios: (perfiles || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        rol: p.rol || "",
        vinculado: Boolean(p.telegram_chat_id),
        enlace: botUsername ? `https://t.me/${botUsername}?start=${p.id}` : null,
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al consultar Telegram.", webhookActivo: false, usuarios: [] };
  }
}

/** Registra en Telegram la dirección a la que el bot envía los mensajes y las pulsaciones de botones. */
export async function registrarWebhookTelegramAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return { ok: false, error: "Falta el token del bot." };

    const r = await llamarTelegram(botToken, "setWebhook", {
      url: `${SITE_URL()}/api/telegram/webhook`,
      allowed_updates: ["message", "callback_query"],
    });
    return r?.ok ? { ok: true } : { ok: false, error: r?.description || "Telegram no aceptó el webhook." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al registrar el webhook." };
  }
}

/** Quita la vinculación de Telegram de un usuario (por si cambió de teléfono o cuenta). */
export async function desvincularTelegramUsuarioAction(perfilId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const { error } = await sb
      .from("perfiles")
      .update({ telegram_chat_id: null, telegram_username: null })
      .eq("id", perfilId);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al desvincular." };
  }
}
