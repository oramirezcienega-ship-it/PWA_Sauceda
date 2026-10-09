import "server-only";

/**
 * Utilidades de servidor de la asesoría de compra (Storage, rondas).
 * No es un archivo "use server": nada de aquí queda expuesto como endpoint;
 * solo lo usan las server actions, que validan sesión o token antes.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import type { Inmueble } from "./inmuebles";

export const BUCKET_INMUEBLES = "inmuebles";

type Sb = ReturnType<typeof supabaseServidor>;

/** Firma las fotos guardadas como ruta del bucket privado; las URL completas pasan tal cual. */
export async function firmarFotos(sb: Sb, inmuebles: Inmueble[], soloPrimera = false): Promise<Inmueble[]> {
  const rutas = new Set<string>();
  for (const i of inmuebles) {
    for (const f of soloPrimera ? i.fotos.slice(0, 1) : i.fotos) {
      if (f && !/^https?:\/\//i.test(f)) rutas.add(f);
    }
  }
  const firmadas = new Map<string, string>();
  if (rutas.size > 0) {
    const { data } = await sb.storage.from(BUCKET_INMUEBLES).createSignedUrls(Array.from(rutas), 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
  }
  return inmuebles.map((i) => ({
    ...i,
    fotosUrl: (soloPrimera ? i.fotos.slice(0, 1) : i.fotos)
      .map((f) => (/^https?:\/\//i.test(f) ? f : firmadas.get(f) || ""))
      .filter(Boolean),
  }));
}

/** URL firmada de subida al bucket `inmuebles` (quien la llama ya validó sesión o token). */
export async function prepararSubidaFoto(nombre: string, carpeta: "internas" | "externas") {
  // La ruta no lleva el nombre original ni quién la subió: la URL firmada llega al cliente.
  const ext = ((nombre || "").match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] || "jpg").toLowerCase();
  const ruta = `${carpeta}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabaseServidor().storage.from(BUCKET_INMUEBLES).createSignedUploadUrl(ruta);
  if (error || !data) {
    console.error("[prepararSubidaFoto]", error);
    return { ok: false, error: "No se pudo preparar la subida de la foto." };
  }
  return { ok: true, ruta: data.path, token: data.token };
}

/** Ronda actual de la OT: la mayor registrada en propuestas o en búsquedas a aliados (o 1). */
export async function rondaActual(sb: Sb, ordenTrabajoId: string): Promise<number> {
  const [{ data: p }, { data: b }] = await Promise.all([
    sb.from("propuestas_inmuebles").select("ronda").eq("orden_trabajo_id", ordenTrabajoId).order("ronda", { ascending: false }).limit(1),
    sb.from("busquedas_aliados").select("ronda").eq("orden_trabajo_id", ordenTrabajoId).order("ronda", { ascending: false }).limit(1),
  ]);
  return Math.max(p?.[0]?.ronda ?? 1, b?.[0]?.ronda ?? 1);
}

/** Aviso al asesor del expediente por Telegram (o al grupo si no tiene vinculado). Best-effort. */
export async function notificarAsesorTelegram(
  sb: Sb,
  datos: { asesorId: string | null; texto: string; expedienteId: string },
): Promise<void> {
  try {
    const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("@/lib/telegram");
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return;
    let chatId: string | null = null;
    if (datos.asesorId) {
      const { data } = await sb.from("perfiles").select("telegram_chat_id").eq("id", datos.asesorId).maybeSingle();
      chatId = data?.telegram_chat_id || null;
    }
    chatId = chatId || chatIdGrupo || null;
    if (!chatId) return;
    const sitio = (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
    await enviarMensajeTelegram({
      botToken,
      chatId,
      parseMode: "HTML",
      texto: datos.texto,
      inlineKeyboard: [[{ text: "Abrir expediente", url: `${sitio}/expediente/${datos.expedienteId}` }]],
    });
  } catch (err) {
    console.warn("[notificarAsesorTelegram]", err);
  }
}
