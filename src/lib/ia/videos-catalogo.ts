import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarWhatsAppDocumento, enviarWhatsAppTexto } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";

/**
 * Videos y fotos de trabajos realizados cargados en el catálogo (Productos y Servicios).
 * Se suben a un bucket público de Supabase, así que se envían por link oficial
 * sin necesidad de descargarlos ni recodificarlos en cada turno.
 */

const MAX_VIDEOS_POR_ENVIO = 3;
// Evita reenviar el mismo video si el modelo mantiene "videos_de" en turnos seguidos.
const VENTANA_REENVIO_MS = 10 * 60 * 1000;

export interface VideoCatalogo {
  url: string;
  titulo: string;
  descripcion: string;
}

export interface FotoCatalogo {
  url: string;
  titulo: string;
  descripcion: string;
  tipo?: string;
}

export interface ProductoConVideos {
  /** Clave corta que Sofía usa en "videos_de" (v1, v2…), estable por orden de nombre. */
  clave: string;
  id: string;
  nombre: string;
  videos: VideoCatalogo[];
}

export interface ProductoConEvidencias {
  clave: string;
  id: string;
  nombre: string;
  tipoNegocio?: string | null;
  videos: VideoCatalogo[];
  fotos: FotoCatalogo[];
}

/** Enlaces web oficiales en saucedamx.com para cada línea de negocio */
export const ENLACES_WEB_EVIDENCIAS: Record<string, { titulo: string; url: string; descripcion: string }> = {
  "construccion-piso-estampado": {
    titulo: "Catálogo de 24 Moldes y Galería de Concreto Estampado",
    url: "https://saucedamx.com/construye/concreto-estampado/catalogo-de-estampados",
    descripcion: "Catálogo interactivo con los 24 moldes, galería de trabajos reales y cotizador.",
  },
  "construccion-remodelacion": {
    titulo: "Galería de Remodelación y Acabados de Lujo",
    url: "https://saucedamx.com/construye/remodelacion",
    descripcion: "Proyectos integrales de cocinas, baños y acabados arquitectónicos.",
  },
  "construccion-impermeabilizacion": {
    titulo: "Sistemas de Impermeabilización y Garantías",
    url: "https://saucedamx.com/construye/mantenimiento",
    descripcion: "Evidencias de aplicación, fichas técnicas y garantías por escrito.",
  },
  "construccion-mantenimiento-tinacos": {
    titulo: "Mantenimiento y Lavado de Tinacos",
    url: "https://saucedamx.com/construye/mantenimiento",
    descripcion: "Servicio profesional de desinfección y mantenimiento preventivo.",
  },
  "construccion-mantenimiento-calentadores": {
    titulo: "Calentadores Solares y Mantenimiento",
    url: "https://saucedamx.com/construye/mantenimiento",
    descripcion: "Instalación y mantenimiento especializado de calentadores solares.",
  },
  "construccion-mantenimiento-cisternas": {
    titulo: "Lavado y Desinfección de Cisternas y Aljibes",
    url: "https://saucedamx.com/construye/mantenimiento",
    descripcion: "Servicio técnico de limpieza profunda y bombeo.",
  },
  "construccion-herreria": {
    titulo: "Catálogo de Herrería Residencial y Comercial",
    url: "https://saucedamx.com/construye/herreria",
    descripcion: "Portones, protecciones, barandales y estructuras metálicas.",
  },
  "seguridad": {
    titulo: "Sistemas de Seguridad, Cámaras y Mallas",
    url: "https://saucedamx.com/protege",
    descripcion: "CCTV, alarmas monitoreadas y cerco electrificado.",
  },
};

/**
 * Productos activos con evidencias completas (fotos o videos).
 * Usado por el panel de Conversaciones para permitir envío rápido y por paquete.
 */
export async function cargarProductosConEvidencias(
  sb: SupabaseClient,
  { soloIA = false }: { soloIA?: boolean } = {}
): Promise<ProductoConEvidencias[]> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, videos, fotos, tipo_negocio, activo, apto_para_ia")
    .order("nombre", { ascending: true });

  const out: ProductoConEvidencias[] = [];
  for (const f of data || []) {
    if (f.activo === false || (soloIA && f.apto_para_ia === false)) continue;
    const videos: VideoCatalogo[] = (Array.isArray(f.videos) ? f.videos : [])
      .filter((v: any) => v && /^https?:\/\//i.test(v.url || ""))
      .map((v: any) => ({ url: v.url, titulo: v.titulo || "", descripcion: v.descripcion || "" }));

    const fotos: FotoCatalogo[] = (Array.isArray(f.fotos) ? f.fotos : [])
      .filter((ft: any) => ft && /^https?:\/\//i.test(ft.url || ""))
      .map((ft: any) => ({
        url: ft.url,
        titulo: ft.titulo || "",
        descripcion: ft.descripcion || "",
        tipo: ft.tipo || "aplicacion",
      }));

    if (videos.length === 0 && fotos.length === 0) continue;
    out.push({
      clave: `e${out.length + 1}`,
      id: f.id,
      nombre: f.nombre,
      tipoNegocio: f.tipo_negocio || null,
      videos,
      fotos,
    });
  }
  return out;
}

/**
 * Productos activos que tienen al menos un video. Por defecto sólo los aptos para IA
 * (lo que Sofía puede ofrecer); el asesor en Conversaciones ve todos con `soloIA: false`.
 */
export async function cargarProductosConVideos(
  sb: SupabaseClient,
  { soloIA = true }: { soloIA?: boolean } = {}
): Promise<ProductoConVideos[]> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, videos, activo, apto_para_ia")
    .order("nombre", { ascending: true });

  const out: ProductoConVideos[] = [];
  for (const f of data || []) {
    if (f.activo === false || (soloIA && f.apto_para_ia === false)) continue;
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
export const CLAVE_TIPO_NEGOCIO: Record<string, RegExp> = {
  "construccion-impermeabilizacion": /imperme/i,
  "construccion-mantenimiento-tinacos": /tinaco/i,
  "construccion-mantenimiento-calentadores": /calentador|solar/i,
  "construccion-mantenimiento-cisternas": /cisterna|aljibe/i,
  "construccion-remodelacion": /remodel/i,
  "construccion-piso-estampado": /estampad|piso/i,
  "construccion-herreria": /herrer/i,
  "seguridad": /seguridad|c[aá]mara|cctv|alarma|malla|cerco/i,
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

/** Envía una foto del catálogo por link público y la registra en el hilo. */
export async function enviarUnaFotoCatalogo(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; prospectoId?: string | null; agente: string },
  f: FotoCatalogo & { producto: string }
): Promise<{ ok: boolean; error?: string }> {
  const caption = [f.titulo || f.producto, f.descripcion].filter(Boolean).join(" · ");
  const nombre = `${(f.titulo || "foto").replace(/[^\w áéíóúñÁÉÍÓÚÑ-]+/g, "_")}.jpg`;
  const r = await enviarWhatsAppDocumento(ctx.canal, f.url, nombre, caption, "image/jpeg");
  await sb.from("mensajes_whatsapp").insert({
    telefono: ctx.telefono,
    texto: `[image:${f.url}] ${caption}`,
    direccion: "out",
    expediente_id: ctx.expedienteId ?? null,
    ...(ctx.prospectoId ? { prospecto_id: ctx.prospectoId } : {}),
    estado: r.ok ? "enviado" : `error:${r.error || "error"}`,
    wa_message_id: r.messageId ?? null,
    agente: ctx.agente,
  });
  return { ok: r.ok, error: r.error };
}

/** Envía un video del catálogo por link y lo registra en el hilo (también si falla). */
export async function enviarUnVideoCatalogo(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; prospectoId?: string | null; agente: string },
  v: VideoCatalogo & { producto: string }
): Promise<{ ok: boolean; error?: string }> {
  const caption = [v.titulo || v.producto, v.descripcion].filter(Boolean).join(" · ");
  const nombre = `${(v.titulo || "video").replace(/[^\w áéíóúñÁÉÍÓÚÑ-]+/g, "_")}.mp4`;
  const r = await enviarWhatsAppDocumento(ctx.canal, v.url, nombre, caption, "video/mp4");
  await sb.from("mensajes_whatsapp").insert({
    telefono: ctx.telefono,
    texto: `[video:${v.url}] ${caption}`,
    direccion: "out",
    expediente_id: ctx.expedienteId ?? null,
    ...(ctx.prospectoId ? { prospecto_id: ctx.prospectoId } : {}),
    estado: r.ok ? "enviado" : `error:${r.error || "error"}`,
    wa_message_id: r.messageId ?? null,
    agente: ctx.agente,
  });
  return { ok: r.ok, error: r.error };
}

/**
 * Envía un paquete completo de evidencias del servicio cotizado:
 * 1. Fotos de trabajos reales del catálogo.
 * 2. Videos de demostración del servicio.
 * 3. Mensaje de cierre con el enlace web oficial en saucedamx.com.
 */
export async function enviarPaqueteEvidencias(
  sb: SupabaseClient,
  ctx: { canal: string; telefono: string; expedienteId?: string | null; prospectoId?: string | null; agente: string },
  params: {
    productoId?: string;
    tipoNegocio?: string | null;
    incluirFotos?: boolean;
    incluirVideos?: boolean;
    incluirLinkWeb?: boolean;
  }
): Promise<{ ok: boolean; fotosEnviadas: number; videosEnviados: number; linkEnviado: boolean; error?: string }> {
  const productos = await cargarProductosConEvidencias(sb, { soloIA: false });
  let producto = params.productoId ? productos.find((p) => p.id === params.productoId) : null;

  if (!producto && params.tipoNegocio) {
    const patron = CLAVE_TIPO_NEGOCIO[params.tipoNegocio];
    producto = productos.find((p) => p.tipoNegocio === params.tipoNegocio || (patron && patron.test(p.nombre)));
  }

  if (!producto && productos.length > 0) {
    producto = productos[0];
  }

  if (!producto) {
    return { ok: false, fotosEnviadas: 0, videosEnviados: 0, linkEnviado: false, error: "No se encontraron evidencias para este servicio." };
  }

  let fotosEnviadas = 0;
  let videosEnviados = 0;

  // 1. Enviar fotos
  if (params.incluirFotos !== false && producto.fotos.length > 0) {
    for (const f of producto.fotos) {
      const r = await enviarUnaFotoCatalogo(sb, ctx, { ...f, producto: producto.nombre });
      if (r.ok) fotosEnviadas++;
      await new Promise((res) => setTimeout(res, 1200));
    }
  }

  // 2. Enviar videos
  if (params.incluirVideos !== false && producto.videos.length > 0) {
    for (const v of producto.videos) {
      const r = await enviarUnVideoCatalogo(sb, ctx, { ...v, producto: producto.nombre });
      if (r.ok) videosEnviados++;
      await new Promise((res) => setTimeout(res, 1200));
    }
  }

  // 3. Enviar mensaje con el link web oficial de Sauceda
  let linkEnviado = false;
  if (params.incluirLinkWeb !== false) {
    const enlace = params.tipoNegocio ? ENLACES_WEB_EVIDENCIAS[params.tipoNegocio] : null;
    const urlWeb = enlace ? enlace.url : "https://saucedamx.com";
    const textoMensaje = `🌐 Conoce más sobre este servicio y fotos adicionales en nuestro catálogo en línea:\n👉 ${urlWeb}`;

    const rTxt = await enviarWhatsAppTexto(ctx.canal, textoMensaje);
    if (rTxt.ok) {
      linkEnviado = true;
      await sb.from("mensajes_whatsapp").insert({
        telefono: ctx.telefono,
        texto: textoMensaje,
        direccion: "out",
        expediente_id: ctx.expedienteId ?? null,
        ...(ctx.prospectoId ? { prospecto_id: ctx.prospectoId } : {}),
        estado: "enviado",
        wa_message_id: rTxt.messageId ?? null,
        agente: ctx.agente,
      });
    }
  }

  if (ctx.expedienteId && (fotosEnviadas > 0 || videosEnviados > 0 || linkEnviado)) {
    await registrarActividad(sb, {
      expedienteId: ctx.expedienteId,
      tipo: "mensaje",
      titulo: "Evidencias y catálogo web enviados por WhatsApp",
      detalle: `Se enviaron ${fotosEnviadas} foto(s), ${videosEnviados} video(s)${linkEnviado ? " y enlace al catálogo web oficial" : ""} de ${producto.nombre}.`,
    });
  }

  return { ok: true, fotosEnviadas, videosEnviados, linkEnviado };
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
      const r = await enviarUnVideoCatalogo(sb, ctx, v);
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
