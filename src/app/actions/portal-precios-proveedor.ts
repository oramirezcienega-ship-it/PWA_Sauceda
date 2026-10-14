"use server";

/**
 * Link público de precios del proveedor: /precios-proveedor/[token] (sin login).
 *
 * - SIEMPRE validan `proveedores.token_precios` en el servidor antes de leer o escribir.
 * - El proveedor solo ve y edita SUS ofertas activas. Nunca ve nuestro precio de
 *   venta, el margen, si es preferido ni nuestras notas internas.
 * - Lo que guarda queda `pendiente_revision`: el costo del catálogo NO cambia hasta
 *   que lo revisamos en el CRM.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { esTokenCargaValido } from "@/lib/asesoria/aliados";
import { normalizarCostosVolumen } from "@/lib/costos-volumen";
import { costosCapacidadAJson, medidaTarifa, normalizarCostosCapacidad, type MedidaTarifa } from "@/lib/tarifas-capacidad";
import type { EstandarServicio, FotoOfertaProveedor } from "@/lib/types";
import { estandarDeServicio } from "@/lib/estandar-servicio";
import { capacidadesDeProducto, filtrarCostosACapacidades, sincronizarVariantes } from "@/lib/variantes-servicio";

type Sb = ReturnType<typeof supabaseServidor>;

const BUCKET_FOTOS = "expedientes-fotos";
const MAX_FOTOS = 12;
const MAX_TEXTO = 4000;
const MAX_MONTO = 100_000_000;

/** Oferta tal como la ve el proveedor (sin precio de venta ni datos internos). */
export interface OfertaPortalProveedor {
  id: string;
  productoNombre: string;
  productoUnidad: string;
  productoCategoria: string;
  productoDescripcion: string;
  /** Medida de los escalones: litros (tinacos, aljibes) o tubos (calentadores solares). */
  productoTarifaMedida: MedidaTarifa;
  costoUnitario: number;
  costosVolumen: { hasta: number; costo: number }[];
  tarifasCapacidad: { hastaLitros: number; costo: number }[];
  cantidadMinima: number;
  montoMinimo: number;
  descripcionProceso: string;
  garantiaAnios: number;
  garantiaCondiciones: string;
  tiempoEjecucion: string;
  anticipoPct: number;
  condicionesPago: string;
  zonasCobertura: string;
  fotos: FotoOfertaProveedor[];
  vigenciaPrecio: string | null;
  actualizadoPorProveedorAt: string | null;
  /** Estándar Sauceda del servicio; null si aún no lo definimos. */
  estandar: EstandarServicio | null;
  /** Capacidades que maneja Sauceda en el servicio (12 tubos, 1,100 L…); el proveedor solo les pone costo. */
  capacidades: number[];
  cumpleEstandar: boolean;
  excepcionesEstandar: string;
}

export type DatosOfertaPortal = Omit<
  OfertaPortalProveedor,
  | "id"
  | "productoNombre"
  | "productoUnidad"
  | "productoCategoria"
  | "productoDescripcion"
  | "productoTarifaMedida"
  | "actualizadoPorProveedorAt"
  | "estandar"
  | "capacidades"
>;

async function proveedorPorToken(sb: Sb, token: string): Promise<{ id: string; nombre: string } | null> {
  if (!esTokenCargaValido(token)) return null;
  const { data } = await sb.from("proveedores").select("id, nombre, activo").eq("token_precios", token).maybeSingle();
  if (!data || !data.activo) return null;
  return { id: data.id, nombre: data.nombre };
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXTO) : "");
const monto = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_MONTO ? Math.round(n * 100) / 100 : 0;
};

function aOfertaPortal(f: any): OfertaPortalProveedor {
  return {
    id: f.id,
    productoNombre: f.productos_servicios?.nombre || "",
    productoUnidad: f.productos_servicios?.unidad || "m2",
    productoCategoria: f.productos_servicios?.categoria || "General",
    productoDescripcion: f.productos_servicios?.descripcion || "",
    productoTarifaMedida: medidaTarifa(f.productos_servicios?.tarifa_medida),
    costoUnitario: Number(f.costo_unitario || 0),
    costosVolumen: normalizarCostosVolumen(f.costos_volumen),
    tarifasCapacidad: normalizarCostosCapacidad(f.tarifas_capacidad),
    cantidadMinima: Number(f.cantidad_minima || 0),
    montoMinimo: Number(f.monto_minimo || 0),
    descripcionProceso: f.descripcion_proceso || "",
    garantiaAnios: Number(f.garantia_anios || 0),
    garantiaCondiciones: f.garantia_condiciones || "",
    tiempoEjecucion: f.tiempo_ejecucion || "",
    anticipoPct: Number(f.anticipo_pct || 0),
    condicionesPago: f.condiciones_pago || "",
    zonasCobertura: f.zonas_cobertura || "",
    fotos: Array.isArray(f.fotos)
      ? f.fotos.filter((x: any) => x && typeof x.url === "string").map((x: any) => ({ url: x.url, titulo: x.titulo || "" }))
      : [],
    vigenciaPrecio: f.vigencia_precio || null,
    actualizadoPorProveedorAt: f.actualizado_por_proveedor_at || null,
    estandar: estandarDeServicio(f.productos_servicios),
    capacidades: (Array.isArray(f.productos_servicios?.producto_variantes) ? f.productos_servicios.producto_variantes : [])
      .map((v: any) => Number(v.hasta))
      .filter((h: number) => Number.isFinite(h) && h > 0)
      .sort((a: number, b: number) => a - b),
    cumpleEstandar: f.cumple_estandar === true,
    excepcionesEstandar: f.excepciones_estandar || "",
  };
}

const SELECT_PORTAL =
  "id, costo_unitario, costos_volumen, tarifas_capacidad, cantidad_minima, monto_minimo, descripcion_proceso, garantia_anios, garantia_condiciones, tiempo_ejecucion, anticipo_pct, condiciones_pago, zonas_cobertura, fotos, vigencia_precio, actualizado_por_proveedor_at, cumple_estandar, excepciones_estandar, productos_servicios:producto_id ( nombre, unidad, categoria, descripcion, tarifa_medida, estandar_proceso, estandar_incluye, estandar_garantia_anios, estandar_garantia, estandar_tiempo, producto_variantes ( hasta ) )";

/** Datos que ve el proveedor al abrir su link. */
export async function obtenerPortalPrecios(
  token: string
): Promise<{ ok: boolean; mensaje?: string; proveedorNombre?: string; ofertas?: OfertaPortalProveedor[] }> {
  const sb = supabaseServidor();
  const proveedor = await proveedorPorToken(sb, token);
  if (!proveedor) return { ok: false, mensaje: "Este link no es válido o fue desactivado. Pide uno nuevo a SAUCEDA." };
  const { data, error } = await sb
    .from("proveedor_productos")
    .select(SELECT_PORTAL)
    .eq("proveedor_id", proveedor.id)
    .eq("activo", true);
  if (error) return { ok: false, mensaje: "No se pudo cargar la información. Intenta de nuevo." };
  const ofertas = (data || []).map(aOfertaPortal).sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es"));
  return { ok: true, proveedorNombre: proveedor.nombre, ofertas };
}

/** Lo mismo que ve el proveedor en su link, para descargar su ficha en PDF desde el CRM. */
export async function obtenerFichaProveedorAdmin(
  proveedorId: string
): Promise<{ ok: boolean; mensaje?: string; proveedorNombre?: string; ofertas?: OfertaPortalProveedor[] }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, mensaje: "No autorizado." };
  }
  const sb = supabaseServidor();
  const { data: p } = await sb.from("proveedores").select("nombre").eq("id", proveedorId).maybeSingle();
  if (!p) return { ok: false, mensaje: "El proveedor no existe." };
  const { data, error } = await sb
    .from("proveedor_productos")
    .select(SELECT_PORTAL)
    .eq("proveedor_id", proveedorId)
    .eq("activo", true);
  if (error) return { ok: false, mensaje: "No se pudo cargar la información." };
  const ofertas = (data || []).map(aOfertaPortal).sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es"));
  return { ok: true, proveedorNombre: p.nombre, ofertas };
}

/** URL firmada para que el proveedor suba una foto a su carpeta del catálogo. */
export async function prepararSubidaFotoPortal(
  token: string,
  nombre: string
): Promise<{ ok: boolean; ruta?: string; token?: string; url?: string; error?: string }> {
  const sb = supabaseServidor();
  const proveedor = await proveedorPorToken(sb, token);
  if (!proveedor) return { ok: false, error: "Link no válido." };
  const ext = ((nombre || "").match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] || "jpg").toLowerCase();
  const ruta = `catalogo/proveedores/${proveedor.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await sb.storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { ok: false, error: "No se pudo preparar la subida de la foto." };
  const { data: pub } = sb.storage.from(BUCKET_FOTOS).getPublicUrl(data.path);
  return { ok: true, ruta: data.path, token: data.token, url: pub.publicUrl };
}

/** Guarda lo que capturó el proveedor en su oferta y la deja pendiente de revisión. */
export async function guardarOfertaPortal(
  token: string,
  ofertaId: string,
  datos: DatosOfertaPortal
): Promise<{ ok: boolean; oferta?: OfertaPortalProveedor; mensaje?: string }> {
  const sb = supabaseServidor();
  const proveedor = await proveedorPorToken(sb, token);
  if (!proveedor) return { ok: false, mensaje: "Link no válido." };
  if (!/^[0-9a-f-]{36}$/i.test(ofertaId)) return { ok: false, mensaje: "Producto no válido." };

  const { data: actual } = await sb
    .from("proveedor_productos")
    .select("id, producto_id, costo_unitario, costos_volumen, tarifas_capacidad, fotos, cumple_estandar, productos_servicios:producto_id ( nombre )")
    .eq("id", ofertaId)
    .eq("proveedor_id", proveedor.id)
    .eq("activo", true)
    .maybeSingle();
  if (!actual) return { ok: false, mensaje: "Este producto ya no está disponible en tu lista." };

  // Fotos: solo las que ya tenía la oferta o las subidas a la carpeta de este proveedor.
  const { data: pub } = sb.storage.from(BUCKET_FOTOS).getPublicUrl(`catalogo/proveedores/${proveedor.id}/`);
  const prefijoPropio = pub.publicUrl;
  const previas = new Set((Array.isArray(actual.fotos) ? actual.fotos : []).map((f: any) => f?.url));
  const fotos = (Array.isArray(datos.fotos) ? datos.fotos : [])
    .filter((f) => f && typeof f.url === "string" && (previas.has(f.url) || f.url.startsWith(prefijoPropio)))
    .slice(0, MAX_FOTOS)
    .map((f) => ({ url: f.url, titulo: texto(f.titulo).slice(0, 200) }));

  const vigencia = typeof datos.vigenciaPrecio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datos.vigenciaPrecio)
    ? datos.vigenciaPrecio
    : null;

  const fila = {
    costo_unitario: monto(datos.costoUnitario),
    costos_volumen: normalizarCostosVolumen(datos.costosVolumen).map((r) => ({ hasta: monto(r.hasta), costo: monto(r.costo) })),
    // Solo capacidades que define el catálogo: el proveedor no puede inventar escalones.
    tarifas_capacidad: costosCapacidadAJson(
      filtrarCostosACapacidades(datos.tarifasCapacidad, await capacidadesDeProducto(sb, (actual as any).producto_id)).map(
        (t) => ({ hastaLitros: t.hastaLitros, costo: monto(t.costo) })
      )
    ),
    cantidad_minima: monto(datos.cantidadMinima),
    monto_minimo: monto(datos.montoMinimo),
    descripcion_proceso: texto(datos.descripcionProceso),
    garantia_anios: Math.min(monto(datos.garantiaAnios), 100),
    garantia_condiciones: texto(datos.garantiaCondiciones),
    tiempo_ejecucion: texto(datos.tiempoEjecucion).slice(0, 300),
    anticipo_pct: Math.min(monto(datos.anticipoPct), 100),
    condiciones_pago: texto(datos.condicionesPago),
    zonas_cobertura: texto(datos.zonasCobertura),
    fotos,
    vigencia_precio: vigencia,
    cumple_estandar: datos.cumpleEstandar === true,
    excepciones_estandar: texto(datos.excepcionesEstandar),
    ...(datos.cumpleEstandar === true && !(actual as any).cumple_estandar
      ? { cumple_estandar_at: new Date().toISOString() }
      : {}),
    pendiente_revision: true,
    actualizado_por_proveedor_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("proveedor_productos")
    .update(fila)
    .eq("id", ofertaId)
    .eq("proveedor_id", proveedor.id)
    .select(SELECT_PORTAL)
    .single();
  if (error || !data) return { ok: false, mensaje: "No se pudo guardar. Intenta de nuevo." };

  try {
    await sincronizarVariantes(sb, (actual as any).producto_id);
  } catch (err) {
    console.warn("[portal-precios] No se pudieron sincronizar las variantes:", err);
  }

  const productoNombre = (actual as any).productos_servicios?.nombre || "producto";
  const costoCambio =
    Number(actual.costo_unitario || 0) !== fila.costo_unitario ||
    JSON.stringify(normalizarCostosVolumen(actual.costos_volumen)) !== JSON.stringify(fila.costos_volumen) ||
    JSON.stringify(costosCapacidadAJson(normalizarCostosCapacidad(actual.tarifas_capacidad))) !==
      JSON.stringify(fila.tarifas_capacidad);
  if (costoCambio) {
    await sb.from("proveedor_productos_historial").insert({
      oferta_id: ofertaId,
      costo_anterior: Number(actual.costo_unitario || 0),
      costo_nuevo: fila.costo_unitario,
      costos_volumen_anterior: normalizarCostosVolumen(actual.costos_volumen),
      costos_volumen_nuevo: fila.costos_volumen,
      motivo: "Actualizado por el proveedor desde su link",
    });
  }

  await notificarActualizacion(sb, proveedor, productoNombre, costoCambio);
  return { ok: true, oferta: aOfertaPortal(data) };
}

/** Quita los caracteres que rompen el Markdown de Telegram. */
const sinMarkdown = (t: string) => t.replace(/[_*`\[\]]/g, "");

/** Aviso al grupo de Telegram de que el proveedor actualizó su oferta. Best-effort. */
async function notificarActualizacion(
  sb: Sb,
  proveedor: { id: string; nombre: string },
  productoNombre: string,
  costoCambio: boolean
) {
  try {
    const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("@/lib/telegram");
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (!botToken || !chatIdGrupo) return;
    const siteUrl = (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
    await enviarMensajeTelegram({
      botToken,
      chatId: chatIdGrupo,
      texto:
        `🏷️ El proveedor *${sinMarkdown(proveedor.nombre)}* actualizó *${sinMarkdown(productoNombre)}*` +
        (costoCambio ? " (cambió su costo)" : "") +
        ".\nRevísalo en el CRM antes de usarlo en cotizaciones.",
      parseMode: "Markdown",
      inlineKeyboard: [[{ text: "Revisar en el CRM", url: `${siteUrl}/proveedores/${proveedor.id}` }]],
    });
  } catch (err) {
    console.warn("[portal-precios] No se pudo notificar por Telegram:", err);
  }
}

// ============================================================================
// Solicitudes de servicio (migración 0151): el proveedor ve y responde las que
// le enviamos. Sin datos del cliente: producto, descripción, cantidad, zona,
// fotos, fechas posibles y su costo de referencia.
// ============================================================================

export interface SolicitudPortal {
  envioId: string;
  folio: string;
  productoNombre: string;
  descripcion: string;
  cantidad: number | null;
  unidad: string;
  zona: string;
  fotos: { url: string; titulo: string }[];
  fechasSugeridas: string;
  urgente: boolean;
  costoReferencia: number | null;
  fechaLimite: string | null;
  estado: "enviada" | "vista" | "aceptada" | "rechazada" | "requiere_visita" | "vencida" | "cancelada";
  fechasPropuestas: string[];
  comentario: string;
  /** Tras aceptar: la fecha que eligió el cliente (cuando SAUCEDA la confirma). */
  fechaAcordada: string | null;
}

const SELECT_SOLICITUD_PORTAL =
  "id, estado, costo_referencia, fecha_limite, fechas_propuestas, comentario, solicitudes_proveedor:solicitud_id ( id, folio, estado, descripcion, cantidad, unidad, zona, fotos, fechas_sugeridas, modo, fecha_acordada, productos_servicios:producto_id ( nombre ) )";

function aSolicitudPortal(e: any): SolicitudPortal {
  const s = e.solicitudes_proveedor || {};
  return {
    envioId: e.id,
    folio: s.folio || "",
    productoNombre: s.productos_servicios?.nombre || "Servicio",
    descripcion: s.descripcion || "",
    cantidad: s.cantidad === null || s.cantidad === undefined ? null : Number(s.cantidad),
    unidad: s.unidad || "",
    zona: s.zona || "",
    fotos: Array.isArray(s.fotos) ? s.fotos.filter((f: any) => f?.url).map((f: any) => ({ url: f.url, titulo: f.titulo || "" })) : [],
    fechasSugeridas: s.fechas_sugeridas || "",
    urgente: s.modo === "urgente",
    costoReferencia: e.costo_referencia === null ? null : Number(e.costo_referencia),
    fechaLimite: e.fecha_limite || null,
    estado: e.estado,
    fechasPropuestas: Array.isArray(e.fechas_propuestas) ? e.fechas_propuestas.map(String) : [],
    comentario: e.comentario || "",
    fechaAcordada: s.estado === "confirmada" ? s.fecha_acordada || null : null,
  };
}

/** Solicitudes del proveedor: las pendientes de responder y las de los últimos 30 días. Marca como vistas las nuevas. */
export async function obtenerSolicitudesPortal(token: string): Promise<{ ok: boolean; solicitudes?: SolicitudPortal[] }> {
  const sb = supabaseServidor();
  const proveedor = await proveedorPorToken(sb, token);
  if (!proveedor) return { ok: false };

  // Pone al día sus solicitudes abiertas (vencimientos) antes de mostrarlas.
  const { avanzarSolicitud } = await import("@/lib/solicitudes-proveedor");
  const { data: activas } = await sb
    .from("solicitudes_proveedor_envios")
    .select("solicitud_id")
    .eq("proveedor_id", proveedor.id)
    .in("estado", ["enviada", "vista"]);
  for (const a of activas || []) await avanzarSolicitud(sb, a.solicitud_id);

  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await sb
    .from("solicitudes_proveedor_envios")
    .select(SELECT_SOLICITUD_PORTAL)
    .eq("proveedor_id", proveedor.id)
    .neq("estado", "en_espera")
    .gte("updated_at", hace30)
    .order("created_at", { ascending: false })
    .limit(30);

  const nuevas = (data || []).filter((e: any) => e.estado === "enviada").map((e: any) => e.id as string);
  if (nuevas.length) {
    await sb
      .from("solicitudes_proveedor_envios")
      .update({ estado: "vista", vista_at: new Date().toISOString() })
      .in("id", nuevas)
      .eq("estado", "enviada");
  }
  return {
    ok: true,
    solicitudes: (data || []).map((e: any) => aSolicitudPortal(nuevas.includes(e.id) ? { ...e, estado: "vista" } : e)),
  };
}

/**
 * Respuesta del proveedor: aceptada (con 1–3 fechas), rechazada o requiere_visita.
 * La primera aceptación gana: la solicitud queda asignada y se retira a los demás.
 */
export async function responderSolicitudPortal(
  token: string,
  envioId: string,
  respuesta: { tipo: "aceptada" | "rechazada" | "requiere_visita"; fechas?: string[]; comentario?: string }
): Promise<{ ok: boolean; solicitud?: SolicitudPortal; mensaje?: string }> {
  const sb = supabaseServidor();
  const proveedor = await proveedorPorToken(sb, token);
  if (!proveedor) return { ok: false, mensaje: "Link no válido." };
  if (!/^[0-9a-f-]{36}$/i.test(envioId)) return { ok: false, mensaje: "Solicitud no válida." };

  const { registrarRespuestaSolicitud } = await import("@/lib/solicitudes-proveedor");

  const { data: envio } = await sb
    .from("solicitudes_proveedor_envios")
    .select("id, solicitud_id, estado, costo_referencia")
    .eq("id", envioId)
    .eq("proveedor_id", proveedor.id)
    .maybeSingle();
  if (!envio) return { ok: false, mensaje: "Esta solicitud no es tuya o ya no existe." };

  const r = await registrarRespuestaSolicitud(sb, envioId, proveedor, {
    tipo: respuesta.tipo,
    fechas: (respuesta.fechas || []).slice(0, 3),
    comentario: respuesta.comentario,
  });
  if (!r.ok) return { ok: false, mensaje: r.mensaje };

  const { data: final } = await sb.from("solicitudes_proveedor_envios").select(SELECT_SOLICITUD_PORTAL).eq("id", envioId).maybeSingle();
  return { ok: true, solicitud: final ? aSolicitudPortal(final) : undefined };
}
