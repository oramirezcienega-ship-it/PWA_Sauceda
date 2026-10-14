"use server";

import { estandarDeServicio } from "@/lib/estandar-servicio";
import { costoReferenciaOferta } from "@/lib/solicitudes-proveedor";
import { usuarioBotTelegram } from "@/lib/cotizaciones-especiales";
import { capacidadesDeProducto, filtrarCostosACapacidades, sincronizarVariantes } from "@/lib/variantes-servicio";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { generarTokenCarga } from "@/lib/asesoria/aliados";
import { normalizarCostosVolumen } from "@/lib/costos-volumen";
import {
  combinarCostosEnTarifas,
  costosCapacidadAJson,
  medidaTarifa,
  normalizarCostosCapacidad,
  type MedidaTarifa,
} from "@/lib/tarifas-capacidad";
import type {
  DatosOfertaProveedorProducto,
  FotoOfertaProveedor,
  HistorialOfertaProveedor,
  OfertaProveedorProducto,
  TarifaCapacidad,
} from "@/lib/types";

// Oferta de productos por proveedor (tabla proveedor_productos, migración 0146).
// El proveedor `preferido` de cada producto define su costo en productos_servicios.

const SELECT_OFERTA =
  "*, proveedores:proveedor_id ( nombre, activo ), productos_servicios:producto_id ( nombre, unidad, precio_unitario, categoria, tarifas_capacidad, tarifa_medida, estandar_proceso, estandar_incluye, estandar_garantia_anios, estandar_garantia, estandar_tiempo )";

function normalizarFotos(raw: unknown): FotoOfertaProveedor[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f: any) => f && typeof f.url === "string" && f.url)
    .map((f: any) => ({ url: f.url, titulo: typeof f.titulo === "string" ? f.titulo : "" }));
}

function aOferta(fila: any): OfertaProveedorProducto {
  return {
    id: fila.id,
    proveedorId: fila.proveedor_id,
    proveedorNombre: fila.proveedores?.nombre || "",
    proveedorActivo: fila.proveedores?.activo !== false,
    productoId: fila.producto_id,
    productoNombre: fila.productos_servicios?.nombre || "",
    productoUnidad: fila.productos_servicios?.unidad || "m2",
    productoPrecioUnitario: Number(fila.productos_servicios?.precio_unitario || 0),
    productoCategoria: fila.productos_servicios?.categoria || "General",
    productoTarifasCapacidad: tarifasProducto(fila.productos_servicios?.tarifas_capacidad),
    productoTarifaMedida: medidaTarifa(fila.productos_servicios?.tarifa_medida),
    costoUnitario: Number(fila.costo_unitario || 0),
    costosVolumen: normalizarCostosVolumen(fila.costos_volumen),
    tarifasCapacidad: normalizarCostosCapacidad(fila.tarifas_capacidad),
    cantidadMinima: Number(fila.cantidad_minima || 0),
    montoMinimo: Number(fila.monto_minimo || 0),
    descripcionProceso: fila.descripcion_proceso || "",
    garantiaAnios: Number(fila.garantia_anios || 0),
    garantiaCondiciones: fila.garantia_condiciones || "",
    tiempoEjecucion: fila.tiempo_ejecucion || "",
    anticipoPct: Number(fila.anticipo_pct || 0),
    condicionesPago: fila.condiciones_pago || "",
    zonasCobertura: fila.zonas_cobertura || "",
    fotos: normalizarFotos(fila.fotos),
    fichaTecnicaUrl: fila.ficha_tecnica_url || null,
    fichaTecnicaNombre: fila.ficha_tecnica_nombre || null,
    vigenciaPrecio: fila.vigencia_precio || null,
    preferido: fila.preferido === true,
    activo: fila.activo !== false,
    notas: fila.notas || "",
    pendienteRevision: fila.pendiente_revision === true,
    actualizadoPorProveedorAt: fila.actualizado_por_proveedor_at || null,
    updatedAt: fila.updated_at,
    cumpleEstandar: fila.cumple_estandar === true,
    excepcionesEstandar: fila.excepciones_estandar || "",
    productoEstandar: estandarDeServicio(fila.productos_servicios),
  };
}

function aFilaOferta(d: DatosOfertaProveedorProducto) {
  return {
    proveedor_id: d.proveedorId,
    producto_id: d.productoId,
    costo_unitario: Number(d.costoUnitario || 0),
    costos_volumen: normalizarCostosVolumen(d.costosVolumen),
    tarifas_capacidad: costosCapacidadAJson(d.tarifasCapacidad || []),
    cantidad_minima: Number(d.cantidadMinima || 0),
    monto_minimo: Number(d.montoMinimo || 0),
    descripcion_proceso: (d.descripcionProceso || "").trim(),
    garantia_anios: Number(d.garantiaAnios || 0),
    garantia_condiciones: (d.garantiaCondiciones || "").trim(),
    tiempo_ejecucion: (d.tiempoEjecucion || "").trim(),
    anticipo_pct: Number(d.anticipoPct || 0),
    condiciones_pago: (d.condicionesPago || "").trim(),
    zonas_cobertura: (d.zonasCobertura || "").trim(),
    fotos: normalizarFotos(d.fotos),
    ficha_tecnica_url: d.fichaTecnicaUrl || null,
    ficha_tecnica_nombre: d.fichaTecnicaNombre || null,
    vigencia_precio: d.vigenciaPrecio || null,
    preferido: d.preferido === true,
    activo: d.activo !== false,
    notas: (d.notas || "").trim(),
    // Guardar desde el CRM cuenta como revisión de lo que capturó el proveedor.
    pendiente_revision: false,
  };
}

/** Tarifas del producto (JSON snake_case de BD) en su forma de la app. */
function tarifasProducto(raw: unknown): TarifaCapacidad[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      hastaLitros: Math.round(Number(t?.hasta_litros ?? t?.hastaLitros)),
      precio: t?.precio === null || t?.precio === undefined || t?.precio === "" ? null : Number(t.precio),
      costo: t?.costo === null || t?.costo === undefined || t?.costo === "" ? null : Number(t.costo),
    }))
    .filter((t) => Number.isFinite(t.hastaLitros) && t.hastaLitros > 0)
    .sort((a, b) => a.hastaLitros - b.hastaLitros);
}

/**
 * Copia costo, rangos de volumen, mínimo y costos por capacidad de la oferta preferida al
 * producto del catálogo. Si el proveedor cobra solo por capacidad (costo base 0), se
 * conserva el costo base que ya tenía el producto.
 */
async function sincronizarCostoProducto(sb: ReturnType<typeof supabaseServidor>, oferta: OfertaProveedorProducto) {
  const cambios: Record<string, unknown> = {
    costos_volumen: oferta.costosVolumen,
    cantidad_minima: oferta.cantidadMinima,
  };
  if (oferta.costoUnitario > 0 || oferta.tarifasCapacidad.length === 0) cambios.costo_unitario = oferta.costoUnitario;
  if (oferta.tarifasCapacidad.length > 0) {
    cambios.tarifas_capacidad = combinarCostosEnTarifas(oferta.productoTarifasCapacidad, oferta.tarifasCapacidad).map(
      (t) => ({ hasta_litros: t.hastaLitros, precio: t.precio, costo: t.costo })
    );
  }
  const { error } = await sb.from("productos_servicios").update(cambios).eq("id", oferta.productoId);
  if (error) console.warn("No se pudo sincronizar el costo del producto con el proveedor preferido:", error.message);
}

/** Texto corto con los escalones de capacidad cuyo costo cambió, para el historial. */
function resumenCambioCapacidad(antes: unknown, despues: unknown): string {
  const previo = new Map(normalizarCostosCapacidad(antes).map((t) => [t.hastaLitros, t.costo]));
  const nuevo = new Map(normalizarCostosCapacidad(despues).map((t) => [t.hastaLitros, t.costo]));
  const litros = Array.from(new Set(Array.from(previo.keys()).concat(Array.from(nuevo.keys())))).sort((a, b) => a - b);
  return litros
    .filter((l) => previo.get(l) !== nuevo.get(l))
    .map((l) => `hasta ${l.toLocaleString("es-MX")}: ${previo.has(l) ? `$${previo.get(l)}` : "—"} → ${nuevo.has(l) ? `$${nuevo.get(l)}` : "—"}`)
    .join(", ");
}

/** Quita la marca de preferido a las demás ofertas del producto (solo puede haber una). */
async function quitarOtrosPreferidos(sb: ReturnType<typeof supabaseServidor>, productoId: string, exceptoId?: string) {
  let q = sb.from("proveedor_productos").update({ preferido: false }).eq("producto_id", productoId).eq("preferido", true);
  if (exceptoId) q = q.neq("id", exceptoId);
  await q;
}

/** Productos que ofrece un proveedor. */
export async function listarOfertasPorProveedor(proveedorId: string): Promise<OfertaProveedorProducto[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.from("proveedor_productos").select(SELECT_OFERTA).eq("proveedor_id", proveedorId);
  if (error) {
    console.warn("Aviso al consultar ofertas del proveedor:", error.message);
    return [];
  }
  return (data || []).map(aOferta).sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es"));
}

/** Proveedores que ofrecen un producto (comparativa). */
export async function listarOfertasPorProducto(productoId: string): Promise<OfertaProveedorProducto[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.from("proveedor_productos").select(SELECT_OFERTA).eq("producto_id", productoId);
  if (error) {
    console.warn("Aviso al consultar proveedores del producto:", error.message);
    return [];
  }
  return (data || [])
    .map(aOferta)
    .sort((a, b) => Number(b.preferido) - Number(a.preferido) || a.costoUnitario - b.costoUnitario);
}

/** Catálogo de productos activos para elegir qué ofrece un proveedor. */
export async function listarProductosParaOferta(): Promise<
  Array<{
    id: string;
    nombre: string;
    unidad: string;
    precioUnitario: number;
    categoria: string;
    tarifasCapacidad: TarifaCapacidad[];
    tarifaMedida: MedidaTarifa;
    tipoNegocio: string | null;
  }>
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("productos_servicios")
    .select("id, nombre, unidad, precio_unitario, categoria, tarifas_capacidad, tarifa_medida, tipo_negocio")
    .eq("activo", true)
    .eq("es_servicio_especial", false)
    .order("nombre", { ascending: true });
  if (error || !data) return [];
  return data.map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    unidad: p.unidad || "m2",
    precioUnitario: Number(p.precio_unitario || 0),
    categoria: p.categoria || "General",
    tarifasCapacidad: tarifasProducto(p.tarifas_capacidad),
    tarifaMedida: medidaTarifa(p.tarifa_medida),
    tipoNegocio: p.tipo_negocio || null,
  }));
}

/** Un proveedor que ofrece el servicio, con su costo para la cantidad/capacidad pedida. */
export interface OpcionProveedorServicio {
  ofertaId: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorActivo: boolean;
  /** Costo para SAUCEDA con esa cantidad o capacidad (null = no lo cotizó). */
  costo: number | null;
  preferido: boolean;
  tieneEstandar: boolean;
  cumpleEstandar: boolean;
  zonas: string;
  vigenciaVencida: boolean;
  pendienteRevision: boolean;
}

/**
 * Comparativa para asignar un trabajo: el precio de venta de SAUCEDA y el costo de cada
 * proveedor activo para ese servicio y cantidad/capacidad (por variante, volumen o unitario).
 */
export async function compararProveedoresServicio(
  productoId: string,
  cantidad: number | null
): Promise<{ precioVenta: number | null; opciones: OpcionProveedorServicio[] }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const cant = Number(cantidad || 0);

  const { data: prod } = await sb
    .from("productos_servicios")
    .select("precio_unitario, cantidad_minima, tarifas_capacidad")
    .eq("id", productoId)
    .maybeSingle();
  let precioVenta: number | null = null;
  if (prod) {
    const tarifas = tarifasProducto(prod.tarifas_capacidad).filter((t) => t.precio !== null);
    if (tarifas.length > 0) {
      if (cant > 0) precioVenta = (tarifas.find((t) => cant <= t.hastaLitros) ?? tarifas[tarifas.length - 1]).precio;
    } else if (Number(prod.precio_unitario) > 0) {
      const cobrada = cant > 0 ? Math.max(cant, Number(prod.cantidad_minima || 0)) : 1;
      precioVenta = Math.round(Number(prod.precio_unitario) * cobrada * 100) / 100;
    }
  }

  const { data } = await sb
    .from("proveedor_productos")
    .select(SELECT_OFERTA)
    .eq("producto_id", productoId)
    .eq("activo", true);
  const hoy = new Date().toISOString().slice(0, 10);
  const opciones = (data || []).map((f: any): OpcionProveedorServicio => {
    const o = aOferta(f);
    return {
      ofertaId: o.id,
      proveedorId: o.proveedorId,
      proveedorNombre: o.proveedorNombre,
      proveedorActivo: o.proveedorActivo,
      costo: costoReferenciaOferta(f, cant),
      preferido: o.preferido,
      tieneEstandar: o.productoEstandar !== null,
      cumpleEstandar: o.cumpleEstandar,
      zonas: o.zonasCobertura,
      vigenciaVencida: !!o.vigenciaPrecio && o.vigenciaPrecio < hoy,
      pendienteRevision: o.pendienteRevision,
    };
  });
  // Primero los que cotizan, del más barato al más caro; el preferido gana en empate.
  opciones.sort(
    (a, b) =>
      Number(a.costo === null) - Number(b.costo === null) ||
      (a.costo ?? 0) - (b.costo ?? 0) ||
      Number(b.preferido) - Number(a.preferido)
  );
  return { precioVenta, opciones };
}

/**
 * Actualiza los precios de venta del producto capturados desde la oferta: precio base y/o
 * precio por escalón de capacidad (se conserva el costo de cada escalón; los que no existen
 * se agregan sin costo).
 */
async function actualizarPreciosProducto(
  sb: ReturnType<typeof supabaseServidor>,
  productoId: string,
  precios: PreciosVentaProducto
) {
  const cambios: Record<string, unknown> = {};
  if (precios.precioUnitario !== undefined && Number.isFinite(precios.precioUnitario) && precios.precioUnitario >= 0) {
    cambios.precio_unitario = precios.precioUnitario;
  }
  const nuevos = (precios.tarifas || []).filter(
    (t) => Number.isFinite(t.hastaLitros) && t.hastaLitros > 0 && Number.isFinite(t.precio) && t.precio >= 0
  );
  if (nuevos.length > 0) {
    const { data } = await sb.from("productos_servicios").select("tarifas_capacidad").eq("id", productoId).maybeSingle();
    const porLitros = new Map(tarifasProducto(data?.tarifas_capacidad).map((t) => [t.hastaLitros, t]));
    for (const n of nuevos) {
      const actual = porLitros.get(n.hastaLitros);
      porLitros.set(n.hastaLitros, { hastaLitros: n.hastaLitros, precio: n.precio, costo: actual ? actual.costo : null });
    }
    cambios.tarifas_capacidad = Array.from(porLitros.values())
      .sort((a, b) => a.hastaLitros - b.hastaLitros)
      .map((t) => ({ hasta_litros: t.hastaLitros, precio: t.precio, costo: t.costo }));
  }
  if (Object.keys(cambios).length === 0) return;
  const { error } = await sb.from("productos_servicios").update(cambios).eq("id", productoId);
  if (error) throw new Error(`No se pudo actualizar el precio de venta del producto: ${error.message}`);
}

export interface PreciosVentaProducto {
  /** Nuevo precio de venta base del producto (undefined = sin cambio). */
  precioUnitario?: number;
  /** Precios de venta por capacidad a guardar en el producto. */
  tarifas?: { hastaLitros: number; precio: number }[];
}

/**
 * Crea (id null) o actualiza una oferta. Registra historial si cambia el costo y,
 * si queda como preferida, actualiza el costo del producto en el catálogo. Si se
 * capturaron precios de venta, se guardan en el producto (aplican con cualquier proveedor).
 */
export async function guardarOfertaProveedor(
  id: string | null,
  datos: DatosOfertaProveedorProducto,
  motivoCambio?: string,
  preciosProducto?: PreciosVentaProducto
): Promise<{ ok: boolean; oferta?: OfertaProveedorProducto; error?: string }> {
  await requireAdmin();
  if (!datos.proveedorId || !datos.productoId) return { ok: false, error: "Selecciona proveedor y producto." };
  const sb = supabaseServidor();
  const fila = aFilaOferta(datos);

  try {
    if (preciosProducto) await actualizarPreciosProducto(sb, fila.producto_id, preciosProducto);
    // Las capacidades nuevas que capture SAUCEDA desde aquí entran al catálogo (sin precio de venta
    // si no lo capturó); el costo solo se guarda para capacidades que existen en el catálogo.
    const capOferta = normalizarCostosCapacidad(fila.tarifas_capacidad).map((c) => c.hastaLitros);
    if (capOferta.length > 0) {
      const { data: prodTarifas } = await sb
        .from("productos_servicios")
        .select("tarifas_capacidad")
        .eq("id", fila.producto_id)
        .maybeSingle();
      const actuales = tarifasProducto(prodTarifas?.tarifas_capacidad);
      const faltan = capOferta.filter((h) => !actuales.some((t) => t.hastaLitros === h));
      if (faltan.length > 0) {
        await sb
          .from("productos_servicios")
          .update({
            tarifas_capacidad: [...actuales, ...faltan.map((h) => ({ hastaLitros: h, precio: null, costo: null }))]
              .sort((x, y) => x.hastaLitros - y.hastaLitros)
              .map((t) => ({ hasta_litros: t.hastaLitros, precio: t.precio, costo: t.costo })),
          })
          .eq("id", fila.producto_id);
      }
    }
    await sincronizarVariantes(sb, fila.producto_id);
    fila.tarifas_capacidad = costosCapacidadAJson(
      filtrarCostosACapacidades(fila.tarifas_capacidad, await capacidadesDeProducto(sb, fila.producto_id))
    );
    if (fila.preferido) await quitarOtrosPreferidos(sb, fila.producto_id, id || undefined);

    let guardada: any;
    if (id) {
      const { data: actual } = await sb
        .from("proveedor_productos")
        .select("costo_unitario, costos_volumen, tarifas_capacidad")
        .eq("id", id)
        .maybeSingle();

      const { data, error } = await sb.from("proveedor_productos").update(fila).eq("id", id).select(SELECT_OFERTA).single();
      if (error) return { ok: false, error: error.message };
      guardada = data;

      const volumenAnterior = normalizarCostosVolumen(actual?.costos_volumen);
      if (
        actual &&
        (Number(actual.costo_unitario) !== fila.costo_unitario ||
          JSON.stringify(volumenAnterior) !== JSON.stringify(fila.costos_volumen) ||
          JSON.stringify(costosCapacidadAJson(normalizarCostosCapacidad(actual.tarifas_capacidad))) !==
            JSON.stringify(fila.tarifas_capacidad))
      ) {
        await sb.from("proveedor_productos_historial").insert({
          oferta_id: id,
          costo_anterior: Number(actual.costo_unitario || 0),
          costo_nuevo: fila.costo_unitario,
          costos_volumen_anterior: volumenAnterior,
          costos_volumen_nuevo: fila.costos_volumen,
          motivo: [motivoCambio?.trim(), resumenCambioCapacidad(actual.tarifas_capacidad, fila.tarifas_capacidad)]
            .filter(Boolean)
            .join(" · ") || null,
        });
      }
    } else {
      const { data, error } = await sb.from("proveedor_productos").insert(fila).select(SELECT_OFERTA).single();
      if (error) {
        if (error.code === "23505") return { ok: false, error: "Este proveedor ya tiene registrado ese producto." };
        return { ok: false, error: error.message };
      }
      guardada = data;
    }

    const oferta = aOferta(guardada);
    if (oferta.preferido) await sincronizarCostoProducto(sb, oferta);
    await sincronizarVariantes(sb, oferta.productoId);
    return { ok: true, oferta };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo guardar la oferta." };
  }
}

/** Marca una oferta como la preferida del producto y copia su costo al catálogo. */
export async function marcarOfertaPreferida(ofertaId: string): Promise<{ ok: boolean; oferta?: OfertaProveedorProducto; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: actual, error: errActual } = await sb
    .from("proveedor_productos")
    .select("producto_id")
    .eq("id", ofertaId)
    .maybeSingle();
  if (errActual || !actual) return { ok: false, error: "No se encontró la oferta." };

  await quitarOtrosPreferidos(sb, actual.producto_id, ofertaId);
  const { data, error } = await sb
    .from("proveedor_productos")
    .update({ preferido: true })
    .eq("id", ofertaId)
    .select(SELECT_OFERTA)
    .single();
  if (error) return { ok: false, error: error.message };

  const oferta = aOferta(data);
  await sincronizarCostoProducto(sb, oferta);
  return { ok: true, oferta };
}

/** Elimina la oferta (no toca el costo del producto). */
export async function eliminarOfertaProveedor(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("proveedor_productos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Historial de cambios de costo de una oferta, del más reciente al más antiguo. */
export async function obtenerHistorialOferta(ofertaId: string): Promise<HistorialOfertaProveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("proveedor_productos_historial")
    .select("id, costo_anterior, costo_nuevo, fecha, motivo")
    .eq("oferta_id", ofertaId)
    .order("fecha", { ascending: false });
  if (error || !data) return [];
  return data.map((h: any) => ({
    id: h.id,
    costoAnterior: Number(h.costo_anterior || 0),
    costoNuevo: Number(h.costo_nuevo || 0),
    fecha: h.fecha,
    motivo: h.motivo || null,
  }));
}

/** Marca como revisada la actualización del proveedor; si es la preferida, copia su costo al catálogo. */
export async function marcarOfertaRevisada(ofertaId: string): Promise<{ ok: boolean; oferta?: OfertaProveedorProducto; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("proveedor_productos")
    .update({ pendiente_revision: false })
    .eq("id", ofertaId)
    .select(SELECT_OFERTA)
    .single();
  if (error) return { ok: false, error: error.message };
  const oferta = aOferta(data);
  if (oferta.preferido) await sincronizarCostoProducto(sb, oferta);
  return { ok: true, oferta };
}

// ============================================================================
// Link público de precios del proveedor (/precios-proveedor/[token])
// ============================================================================

const SITE_URL = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
const linkPrecios = (token: string) => `${SITE_URL()}/precios-proveedor/${token}`;

/** Link permanente para que el proveedor actualice sus precios (lo crea si no existe; `regenerar` invalida el anterior). */
export async function obtenerLinkPreciosProveedor(
  proveedorId: string,
  regenerar = false
): Promise<{ ok: boolean; link?: string; telefono?: string; telegramLigado?: boolean; enlaceTelegram?: string | null; error?: string }> {
  try {
    if (regenerar) await requireAdministrador();
    else await requireAdmin();
    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("proveedores")
      .select("token_precios, telefono, telegram_chat_id")
      .eq("id", proveedorId)
      .maybeSingle();
    if (!p) return { ok: false, error: "El proveedor no existe." };
    let token = p.token_precios as string | null;
    if (!token || regenerar) {
      token = generarTokenCarga(crypto.getRandomValues(new Uint8Array(32)));
      const { error } = await sb.from("proveedores").update({ token_precios: token }).eq("id", proveedorId);
      if (error) return { ok: false, error: error.message };
    }
    const bot = p.telegram_chat_id ? null : await usuarioBotTelegram(sb);
    return {
      ok: true,
      link: linkPrecios(token),
      telefono: p.telefono || "",
      telegramLigado: !!p.telegram_chat_id,
      enlaceTelegram: bot ? `https://t.me/${bot}?start=prov_${proveedorId}` : null,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo obtener el link." };
  }
}
