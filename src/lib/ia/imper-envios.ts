import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarWhatsAppDocumento, subirMediaMeta } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";
import { generarImagenComparativaImper } from "@/lib/ia/imagen-comparativa-imper";
import { paquetesConPreciosVigentes } from "@/lib/ia/precios-imper";
import { cargarProductosImper, ETIQUETA_PAQUETE, type PaqueteImper, type ProductoImper } from "@/lib/ia/catalogo-imper";

/**
 * Envíos multimedia de Sofía en el flujo de impermeabilización:
 *  1. Comparativa de precios (Acrílico / Estándar / Premium) cuando el cliente da sus metros con claridad.
 *  2. Imágenes de referencia del paquete que el cliente elige.
 * Todo es best-effort: si algo falla, la conversación de texto no se ve afectada.
 */

export { ETIQUETA_PAQUETE, type PaqueteImper };

const METROS_MIN = 5;
const METROS_MAX = 5000;
const MAX_IMAGENES_POR_PAQUETE = 5;
const ORDEN_TIPO: Record<string, number> = { producto: 0, aplicacion: 1, antes_despues: 2 };

export function esPaqueteImper(v: unknown): v is PaqueteImper {
  return v === "acrilico" || v === "estandar" || v === "premium";
}

/** Metros válidos y claros (número finito dentro de un rango razonable para una azotea). */
export function metrosClaros(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= METROS_MIN && n <= METROS_MAX ? n : null;
}

/** Fotos del producto del catálogo (técnica primero, luego obra aplicada), listas para enviar. */
function fotosParaEnviar(prod: ProductoImper | undefined) {
  if (!prod || !prod.aptoParaIa) return [];
  return [...prod.fotos]
    .sort((a, b) => (ORDEN_TIPO[a.tipo || "producto"] ?? 9) - (ORDEN_TIPO[b.tipo || "producto"] ?? 9))
    .slice(0, MAX_IMAGENES_POR_PAQUETE);
}

/** ¿Algún producto de impermeabilización tiene fotos cargadas y habilitadas para Sofía? */
export function hayFotosEnCatalogo(productos: Partial<Record<PaqueteImper, ProductoImper>>): boolean {
  return (["acrilico", "estandar", "premium"] as const).some((p) => fotosParaEnviar(productos[p]).length > 0);
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

/** Envía las fotos del producto elegido (cargadas en el catálogo), una sola vez por expediente y paquete. */
export async function enviarMediosPaqueteImper(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; paquete: PaqueteImper }
): Promise<number> {
  try {
    const etiqueta = ETIQUETA_PAQUETE[ctx.paquete];
    const marca = `Referencia ${etiqueta}`;
    const fotos = fotosParaEnviar((await cargarProductosImper(sb))[ctx.paquete]);
    if (fotos.length === 0 || (await yaEnviado(sb, ctx.expedienteId, marca))) return 0;

    let enviadas = 0;
    for (const f of fotos) {
      const res = await fetch(f.url);
      if (!res.ok) {
        console.warn(`[Imper] No se pudo descargar la foto ${f.url} (${res.status}).`);
        continue;
      }
      const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!mime.startsWith("image/")) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const pie = [f.titulo, f.descripcion].filter(Boolean).join(" · ");
      const ext = mime.includes("png") ? "png" : "jpg";
      if (await enviarYRegistrar(sb, ctx, buffer, mime, `${ctx.paquete}-${enviadas + 1}.${ext}`, `${marca}${pie ? ` — ${pie}` : ""}`)) enviadas++;
    }
    if (enviadas > 0 && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `Sofía envió fotos del producto: ${etiqueta}`,
        detalle: `${enviadas} foto(s) del catálogo enviadas al elegir el paquete.`,
      });
    }
    return enviadas;
  } catch (err) {
    console.error("[Imper] Error al enviar fotos del producto:", err);
    return 0;
  }
}

/** Envía el PDF de la ficha técnica del producto (sólo cuando el cliente la pidió). */
export async function enviarFichaTecnicaImper(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; agente: string; paquete: PaqueteImper }
): Promise<boolean> {
  try {
    const prod = (await cargarProductosImper(sb))[ctx.paquete];
    if (!prod || !prod.aptoParaIa || !prod.fichaTecnicaUrl) return false;

    // Evita reenviar el mismo PDF en turnos consecutivos si el modelo mantiene la marca
    const marca = `Ficha técnica ${ETIQUETA_PAQUETE[ctx.paquete]}`;
    if (ctx.expedienteId) {
      const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recientes } = await sb
        .from("mensajes_whatsapp")
        .select("id")
        .eq("expediente_id", ctx.expedienteId)
        .eq("direccion", "out")
        .gte("created_at", desde)
        .ilike("texto", `%${marca}%`)
        .limit(1);
      if (recientes && recientes.length > 0) return false;
    }

    const res = await fetch(prod.fichaTecnicaUrl);
    if (!res.ok) {
      console.warn(`[Imper] No se pudo descargar la ficha técnica (${res.status}).`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const nombre = (prod.fichaTecnicaNombre || `Ficha-tecnica-${ctx.paquete}.pdf`).replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]+/g, "_");
    const caption = marca;

    const up = await subirMediaMeta(buffer, "application/pdf", nombre, "document");
    if (!up.mediaId) {
      console.warn("[Imper] No se pudo subir la ficha a Meta:", up.error);
      return false;
    }
    const r = await enviarWhatsAppDocumento(ctx.canal, up.mediaId, nombre, caption, "application/pdf");
    await sb.from("mensajes_whatsapp").insert({
      telefono: ctx.telefono,
      texto: `[document:${up.mediaId}] ${nombre} — "${caption}"`,
      direccion: "out",
      expediente_id: ctx.expedienteId ?? null,
      estado: r.ok ? "enviado" : `error:${r.error || "error"}`,
      wa_message_id: r.messageId ?? null,
      agente: ctx.agente,
    });
    if (r.ok && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `Sofía envió la ficha técnica: ${ETIQUETA_PAQUETE[ctx.paquete]}`,
        detalle: `El cliente solicitó la ficha técnica (${nombre}).`,
      });
    }
    return r.ok;
  } catch (err) {
    console.error("[Imper] Error al enviar la ficha técnica:", err);
    return false;
  }
}
