"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { normalizarCostosVolumen } from "@/lib/costos-volumen";
import { combinarCostosEnTarifas, costosCapacidadAJson, normalizarCostosCapacidad } from "@/lib/tarifas-capacidad";
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
  "*, proveedores:proveedor_id ( nombre, activo ), productos_servicios:producto_id ( nombre, unidad, precio_unitario, categoria, tarifas_capacidad )";

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
    updatedAt: fila.updated_at,
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
    .map((l) => `${l.toLocaleString("es-MX")} L: ${previo.has(l) ? `$${previo.get(l)}` : "—"} → ${nuevo.has(l) ? `$${nuevo.get(l)}` : "—"}`)
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
  }>
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("productos_servicios")
    .select("id, nombre, unidad, precio_unitario, categoria, tarifas_capacidad")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error || !data) return [];
  return data.map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    unidad: p.unidad || "m2",
    precioUnitario: Number(p.precio_unitario || 0),
    categoria: p.categoria || "General",
    tarifasCapacidad: tarifasProducto(p.tarifas_capacidad),
  }));
}

/**
 * Crea (id null) o actualiza una oferta. Registra historial si cambia el costo y,
 * si queda como preferida, actualiza el costo del producto en el catálogo.
 */
export async function guardarOfertaProveedor(
  id: string | null,
  datos: DatosOfertaProveedorProducto,
  motivoCambio?: string
): Promise<{ ok: boolean; oferta?: OfertaProveedorProducto; error?: string }> {
  await requireAdmin();
  if (!datos.proveedorId || !datos.productoId) return { ok: false, error: "Selecciona proveedor y producto." };
  const sb = supabaseServidor();
  const fila = aFilaOferta(datos);

  try {
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
