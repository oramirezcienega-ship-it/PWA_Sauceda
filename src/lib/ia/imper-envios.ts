import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarWhatsAppDocumento, subirMediaMeta } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";
import { generarImagenComparativaImper } from "@/lib/ia/imagen-comparativa-imper";
import { paquetesConPreciosVigentes } from "@/lib/ia/precios-imper";

/**
 * Envíos multimedia de Sofía en el flujo de impermeabilización:
 *  1. Comparativa de precios (Acrílico / Estándar / Premium) cuando el cliente da sus metros con claridad.
 *  2. Imágenes de referencia del paquete que el cliente elige.
 * Todo es best-effort: si algo falla, la conversación de texto no se ve afectada.
 */

export type PaqueteImper = "acrilico" | "estandar" | "premium";

export const ETIQUETA_PAQUETE: Record<PaqueteImper, string> = {
  acrilico: "Acrílico",
  estandar: "Estándar 3.5",
  premium: "Premium 4.0 Poliéster",
};

const METROS_MIN = 5;
const METROS_MAX = 5000;
const MAX_IMAGENES_POR_PAQUETE = 5;

const siteUrl = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");

export function esPaqueteImper(v: unknown): v is PaqueteImper {
  return v === "acrilico" || v === "estandar" || v === "premium";
}

/** Metros válidos y claros (número finito dentro de un rango razonable para una azotea). */
export function metrosClaros(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= METROS_MIN && n <= METROS_MAX ? n : null;
}

type Medio = { archivo: string; texto?: string };
let cacheManifiesto: { at: number; data: Partial<Record<PaqueteImper, Medio[]>> } | null = null;

/** Lista de imágenes de referencia por paquete (public/images/impermeabilizacion/medios.json). */
async function leerManifiesto(): Promise<Partial<Record<PaqueteImper, Medio[]>>> {
  if (cacheManifiesto && Date.now() - cacheManifiesto.at < 60_000) return cacheManifiesto.data;
  try {
    const r = await fetch(`${siteUrl()}/images/impermeabilizacion/medios.json`, { cache: "no-store" });
    const data = r.ok ? await r.json() : {};
    cacheManifiesto = { at: Date.now(), data };
    return data;
  } catch {
    return {};
  }
}

export async function hayMediosImper(paquete: PaqueteImper): Promise<boolean> {
  const m = await leerManifiesto();
  return (m[paquete] || []).length > 0;
}

async function yaEnviado(sb: SupabaseClient, expedienteId: string | null | undefined, marca: string): Promise<boolean> {
  if (!expedienteId) return false;
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .eq("expediente_id", expedienteId)
    .eq("direccion", "out")
    .ilike("texto", `%${marca}%`)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function enviarYRegistrar(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string },
  buffer: Buffer,
  mime: string,
  nombre: string,
  caption: string
): Promise<boolean> {
  const up = await subirMediaMeta(buffer, mime, nombre, "image");
  if (!up.mediaId) {
    console.warn("[Imper] No se pudo subir la imagen a Meta:", up.error);
    return false;
  }
  const r = await enviarWhatsAppDocumento(ctx.canal, up.mediaId, nombre, caption, mime);
  await sb.from("mensajes_whatsapp").insert({
    telefono: ctx.telefono,
    texto: `[image:${up.mediaId}] ${caption}`,
    direccion: "out",
    expediente_id: ctx.expedienteId ?? null,
    estado: r.ok ? "enviado" : `error:${r.error || "error"}`,
    wa_message_id: r.messageId ?? null,
    agente: ctx.agente,
  });
  return r.ok;
}

/** Envía la imagen comparativa para `metros` m² (una sola vez por expediente y cantidad de metros). */
export async function enviarComparativaImper(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; metros: number }
): Promise<boolean> {
  try {
    const marca = `Comparativa de impermeabilización para ${ctx.metros} m²`;
    if (await yaEnviado(sb, ctx.expedienteId, marca)) return false;

    const paquetes = await paquetesConPreciosVigentes(sb);
    const png = await generarImagenComparativaImper(paquetes, ctx.metros);
    const ok = await enviarYRegistrar(sb, ctx, png, "image/png", `Comparativa-${ctx.metros}m2.png`, `${marca}. Precios más IVA.`);
    if (ok && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: "Sofía envió la comparativa de precios de impermeabilización",
        detalle: `${ctx.metros} m² · Acrílico, Estándar y Premium.`,
      });
    }
    return ok;
  } catch (err) {
    console.error("[Imper] Error al enviar la comparativa:", err);
    return false;
  }
}

/** Envía las imágenes de referencia del paquete elegido (una sola vez por expediente y paquete). */
export async function enviarMediosPaqueteImper(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; paquete: PaqueteImper }
): Promise<number> {
  try {
    const etiqueta = ETIQUETA_PAQUETE[ctx.paquete];
    const marca = `Referencia ${etiqueta}`;
    const medios = ((await leerManifiesto())[ctx.paquete] || []).slice(0, MAX_IMAGENES_POR_PAQUETE);
    if (medios.length === 0 || (await yaEnviado(sb, ctx.expedienteId, marca))) return 0;

    let enviadas = 0;
    for (const m of medios) {
      const res = await fetch(`${siteUrl()}/images/impermeabilizacion/${encodeURIComponent(m.archivo)}`);
      if (!res.ok) {
        console.warn(`[Imper] No se encontró la imagen ${m.archivo} (${res.status}).`);
        continue;
      }
      const mime = res.headers.get("content-type")?.split(";")[0] || (/\.png$/i.test(m.archivo) ? "image/png" : "image/jpeg");
      const buffer = Buffer.from(await res.arrayBuffer());
      const caption = `${marca}${m.texto ? ` — ${m.texto}` : ""}`;
      if (await enviarYRegistrar(sb, ctx, buffer, mime, m.archivo, caption)) enviadas++;
    }
    if (enviadas > 0 && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `Sofía envió imágenes de referencia: ${etiqueta}`,
        detalle: `${enviadas} imagen(es) enviadas al elegir el paquete.`,
      });
    }
    return enviadas;
  } catch (err) {
    console.error("[Imper] Error al enviar imágenes de referencia:", err);
    return 0;
  }
}
