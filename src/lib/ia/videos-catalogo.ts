import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarWhatsAppDocumento } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";

/**
 * Videos de trabajos realizados cargados en el catálogo (Productos y Servicios).
 * Se suben ya optimizados para WhatsApp (MP4 H.264, ≤16 MB) a un bucket público,
 * así que Sofía los envía por link sin descargarlos ni recodificarlos.
 */

const MAX_VIDEOS_POR_ENVIO = 3;
// Evita reenviar el mismo video si el modelo mantiene "videos_de" en turnos seguidos.
const VENTANA_REENVIO_MS = 10 * 60 * 1000;

export interface VideoCatalogo {
  url: string;
  titulo: string;
  descripcion: string;
}

export interface ProductoConVideos {
  /** Clave corta que Sofía usa en "videos_de" (v1, v2…), estable por orden de nombre. */
  clave: string;
  id: string;
  nombre: string;
  videos: VideoCatalogo[];
}

/** Productos activos y aptos para IA que tienen al menos un video. */
export async function cargarProductosConVideos(sb: SupabaseClient): Promise<ProductoConVideos[]> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, videos, activo, apto_para_ia")
    .order("nombre", { ascending: true });

  const out: ProductoConVideos[] = [];
  for (const f of data || []) {
    if (f.activo === false || f.apto_para_ia === false) continue;
    const videos: VideoCatalogo[] = (Array.isArray(f.videos) ? f.videos : [])
      .filter((v: any) => v && /^https?:\/\//i.test(v.url || ""))
      .map((v: any) => ({ url: v.url, titulo: v.titulo || "", descripcion: v.descripcion || "" }));
    if (videos.length === 0) continue;
    out.push({ clave: `v${out.length + 1}`, id: f.id, nombre: f.nombre, videos });
  }
  return out;
}

/** Bloque del prompt con los videos disponibles (vacío si no hay ninguno). */
export function videosParaPrompt(productos: ProductoConVideos[]): string {
  return productos
    .map((p) => {
      const titulos = p.videos.map((v) => v.titulo).filter(Boolean).slice(0, 4).join("; ");
      return `  • ${p.clave} — ${p.nombre} (${p.videos.length} video${p.videos.length === 1 ? "" : "s"}${titulos ? `: ${titulos}` : ""})`;
    })
    .join("\n");
}

/** Palabra clave del nombre del producto que corresponde a cada tipo de negocio. */
const CLAVE_TIPO_NEGOCIO: Record<string, RegExp> = {
  "construccion-impermeabilizacion": /imperme/i,
  "construccion-mantenimiento-tinacos": /tinaco/i,
  "construccion-mantenimiento-cisternas": /cisterna|aljibe/i,
  "construccion-remodelacion": /remodel/i,
  "construccion-piso-estampado": /estampad|piso/i,
  "construccion-herreria": /herrer/i,
};

/** Elige los productos a partir de lo que pidió Sofía ("v2", varias claves, o "general"). */
function elegirProductos(productos: ProductoConVideos[], videosDe: string, tipoNegocio?: string | null): ProductoConVideos[] {
  const claves = videosDe.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const porClave = productos.filter((p) => claves.includes(p.clave) || claves.includes(p.id.toLowerCase()));
  if (porClave.length > 0) return porClave;

  // "general" o una clave desconocida: los del servicio que le interesa al cliente, si hay; si no, todos.
  const patron = tipoNegocio ? CLAVE_TIPO_NEGOCIO[tipoNegocio] : undefined;
  const delServicio = patron ? productos.filter((p) => patron.test(p.nombre)) : [];
  return delServicio.length > 0 ? delServicio : productos;
}

/**
 * Envía hasta 3 videos de trabajos realizados. Prioriza los que el cliente aún no ha
 * recibido; si ya los vio todos, repite los primeros (lo pidió explícitamente).
 */
export async function enviarVideosCatalogo(
  sb: SupabaseClient,
  ctx: {
    canal: string;
    telefono: string;
    expedienteId?: string | null;
    agente: string;
    videosDe: string;
    tipoNegocio?: string | null;
  }
): Promise<number> {
  try {
    const productos = elegirProductos(await cargarProductosConVideos(sb), ctx.videosDe, ctx.tipoNegocio);
    const candidatos = productos.flatMap((p) => p.videos.map((v) => ({ ...v, producto: p.nombre })));
    if (candidatos.length === 0) return 0;

    // Videos ya enviados a este cliente (y cuáles en los últimos minutos, que no se repiten).
    const enviadosAlgunaVez = new Set<string>();
    const enviadosRecientes = new Set<string>();
    if (ctx.expedienteId) {
      const { data } = await sb
        .from("mensajes_whatsapp")
        .select("texto, created_at")
        .eq("expediente_id", ctx.expedienteId)
        .eq("direccion", "out")
        .like("texto", "[video:http%");
      const limite = Date.now() - VENTANA_REENVIO_MS;
      for (const m of data || []) {
        const url = /^\[video:([^\]]+)\]/.exec(m.texto || "")?.[1];
        if (!url) continue;
        enviadosAlgunaVez.add(url);
        if (new Date(m.created_at).getTime() >= limite) enviadosRecientes.add(url);
      }
    }

    const disponibles = candidatos.filter((v) => !enviadosRecientes.has(v.url));
    const aEnviar = [
      ...disponibles.filter((v) => !enviadosAlgunaVez.has(v.url)),
      ...disponibles.filter((v) => enviadosAlgunaVez.has(v.url)),
    ].slice(0, MAX_VIDEOS_POR_ENVIO);

    let enviados = 0;
    for (const v of aEnviar) {
      const caption = [v.titulo || v.producto, v.descripcion].filter(Boolean).join(" · ");
      const nombre = `${(v.titulo || "video").replace(/[^\w áéíóúñÁÉÍÓÚÑ-]+/g, "_")}.mp4`;
      const r = await enviarWhatsAppDocumento(ctx.canal, v.url, nombre, caption, "video/mp4");
      await sb.from("mensajes_whatsapp").insert({
        telefono: ctx.telefono,
        texto: `[video:${v.url}] ${caption}`,
        direccion: "out",
        expediente_id: ctx.expedienteId ?? null,
        estado: r.ok ? "enviado" : `error:${r.error || "error"}`,
        wa_message_id: r.messageId ?? null,
        agente: ctx.agente,
      });
      if (r.ok) enviados++;
      else console.warn(`[Videos] No se pudo enviar ${v.url}: ${r.error}`);
    }

    if (enviados > 0 && ctx.expedienteId) {
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: "Sofía envió videos de trabajos realizados",
        detalle: `${enviados} video(s): ${aEnviar.map((v) => v.titulo || v.producto).join(", ")}.`,
      });
    }
    return enviados;
  } catch (err) {
    console.error("[Videos] Error al enviar videos del catálogo:", err);
    return 0;
  }
}
