"use server";

import { preciosImpermeabilizacionDeCatalogo, type PreciosImpermeabilizacion } from "@/lib/ia/precios-imper";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizarCostosVolumen, type CostoVolumen } from "@/lib/costos-volumen";
import type { 
  ProductoServicio, 
  Insumo, 
  ConceptoApuComposicion, 
  InsumoHistorialPrecio,
  FotoProducto,
  VideoProducto,
  TarifaCapacidad
} from "@/lib/types";

// Mapeador de ProductoServicio
function aProductoServicio(fila: any): ProductoServicio {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion || "",
    unidad: fila.unidad || "m2",
    costoUnitario: Number(fila.costo_unitario || 0),
    precioUnitario: Number(fila.precio_unitario || 0),
    porcentajeComision: Number(
      fila.porcentaje_comision !== undefined && fila.porcentaje_comision !== null 
        ? fila.porcentaje_comision 
        : 5.0
    ),
    plantillaGarantia: fila.plantilla_garantia || "",
    tipo: fila.tipo || "servicio",
    centroCostoId: fila.centro_costo_id || null,
    centroCostoNombre: fila.business_units?.nombre || fila.centro_costo_nombre || null,
    codigoSubcuenta: fila.codigo_subcuenta || null,
    categoria: fila.categoria || "General",
    fotos: Array.isArray(fila.fotos) ? fila.fotos : [],
    videos: normalizarVideos(fila.videos),
    descripcionValor: fila.descripcion_valor || "",
    especificaciones: fila.especificaciones || "",
    gama: fila.gama || "estandar",
    activo: fila.activo !== false,
    aptoParaIa: fila.apto_para_ia !== false,
    fichaTecnicaUrl: fila.ficha_tecnica_url || null,
    fichaTecnicaNombre: fila.ficha_tecnica_nombre || null,
    tarifasCapacidad: normalizarTarifasCapacidad(fila.tarifas_capacidad),
    cantidadMinima: Number(fila.cantidad_minima || 0),
    costosVolumen: normalizarCostosVolumen(fila.costos_volumen),
    createdAt: fila.created_at,
  };
}

/** Normaliza el JSON de tarifas por capacidad (orden ascendente, sin escalones inválidos). */
function normalizarTarifasCapacidad(raw: any): TarifaCapacidad[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      hastaLitros: Math.round(Number(t?.hasta_litros ?? t?.hastaLitros)),
      precio: t?.precio === null || t?.precio === undefined || t?.precio === "" ? null : Number(t.precio),
      costo: t?.costo === null || t?.costo === undefined || t?.costo === "" ? null : Number(t.costo),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.hastaLitros) &&
        t.hastaLitros > 0 &&
        (t.precio === null || Number.isFinite(t.precio)) &&
        (t.costo === null || Number.isFinite(t.costo))
    )
    .sort((a, b) => a.hastaLitros - b.hastaLitros);
}

/** Lee el JSON de videos (snake_case en BD) descartando entradas sin URL válida. */
function normalizarVideos(raw: any): VideoProducto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v: any) => v && /^https?:\/\//i.test(v.url || ""))
    .map((v: any) => ({
      url: v.url,
      titulo: v.titulo || "",
      descripcion: v.descripcion || "",
      duracionSeg: v.duracion_seg ?? v.duracionSeg ?? null,
      pesoBytes: v.peso_bytes ?? v.pesoBytes ?? null,
    }));
}

function videosAJson(v?: VideoProducto[]) {
  return normalizarVideos(v).map((x) => ({
    url: x.url,
    titulo: x.titulo?.trim() || "",
    descripcion: x.descripcion?.trim() || "",
    duracion_seg: x.duracionSeg ?? null,
    peso_bytes: x.pesoBytes ?? null,
  }));
}

function tarifasAJson(t?: TarifaCapacidad[]) {
  return normalizarTarifasCapacidad(t).map((x) => ({ hasta_litros: x.hastaLitros, precio: x.precio, costo: x.costo }));
}

// Mapeador de Insumo
function aInsumo(fila: any): Insumo {
  return {
    id: fila.id,
    codigo: fila.codigo || null,
    nombre: fila.nombre,
    tipo: fila.tipo || "material",
    unidad: fila.unidad || "pza",
    costoProveedor: Number(fila.costo_proveedor || 0),
    precioInterno: Number(fila.precio_interno || 0),
    proveedorId: fila.proveedor_id || null,
    proveedorNombre: fila.proveedores?.nombre || fila.proveedor_nombre || null,
    oficio: fila.oficio || null,
    notas: fila.notas || null,
    activo: fila.activo !== false,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

// Generador de IDs secuenciales CAT-001, CAT-002... o PROD-001
function siguienteId(ids: string[], prefijo = "CAT"): string {
  const regex = new RegExp(`^${prefijo}-(\\d+)$`);
  const nums = ids
    .map((id) => {
      const match = id.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

// ============================================================
// 1. PRODUCTOS Y SERVICIOS
// ============================================================

/** Listar Productos y Servicios enriquecidos */
export async function listarProductosServicios(filtros?: {
  tipo?: string;
  centroCostoId?: string;
  categoria?: string;
  soloActivos?: boolean;
}): Promise<ProductoServicio[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  let query = sb
    .from("productos_servicios")
    .select("*, business_units ( id, nombre )")
    .order("created_at", { ascending: false });

  if (filtros?.tipo && filtros.tipo !== "todos") {
    query = query.eq("tipo", filtros.tipo);
  }
  if (filtros?.centroCostoId && filtros.centroCostoId !== "todos") {
    query = query.eq("centro_costo_id", filtros.centroCostoId);
  }
  if (filtros?.categoria && filtros.categoria !== "todas") {
    query = query.eq("categoria", filtros.categoria);
  }
  if (filtros?.soloActivos) {
    query = query.eq("activo", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(aProductoServicio);
}

/** Obtener Detalle de Producto con su Receta APU */
export async function obtenerProductoDetalleConApu(id: string): Promise<ProductoServicio | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("productos_servicios")
    .select("*, business_units ( id, nombre )")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const prod = aProductoServicio(data);

  // Cargar ingredientes APU
  const { data: composicion, error: errApu } = await sb
    .from("conceptos_apu_composicion")
    .select("*, insumos (*)")
    .eq("concepto_id", id)
    .order("created_at", { ascending: true });

  if (!errApu && composicion) {
    prod.composicionApu = composicion.map((item: any) => ({
      id: item.id,
      conceptoId: item.concepto_id,
      insumoId: item.insumo_id,
      insumo: item.insumos ? aInsumo(item.insumos) : undefined,
      cantidad: Number(item.cantidad || 0),
      desperdicioPct: Number(item.desperdicio_pct || 0),
      rendimiento: Number(item.rendimiento || 1),
      costoUnitarioInsumo: Number(item.costo_unitario_insumo || 0),
      importeCosto: Number(item.importe_costo || 0),
      notas: item.notas || null,
      createdAt: item.created_at,
    }));
  }

  return prod;
}

/** Crear Producto o Servicio */
export async function crearProductoServicio(datos: {
  nombre: string;
  descripcion?: string;
  unidad?: string;
  costoUnitario?: number;
  precioUnitario?: number;
  porcentajeComision?: number;
  plantillaGarantia?: string;
  tipo?: 'servicio' | 'producto' | 'concepto_obra' | 'insumo';
  centroCostoId?: string | null;
  codigoSubcuenta?: string | null;
  categoria?: string;
  fotos?: FotoProducto[];
  videos?: VideoProducto[];
  descripcionValor?: string;
  especificaciones?: string;
  gama?: 'economica' | 'media' | 'premium' | 'estandar';
  activo?: boolean;
  aptoParaIa?: boolean;
  fichaTecnicaUrl?: string | null;
  fichaTecnicaNombre?: string | null;
  tarifasCapacidad?: TarifaCapacidad[];
  cantidadMinima?: number;
  costosVolumen?: CostoVolumen[];
}): Promise<ProductoServicio> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existentes, error: errLista } = await sb
    .from("productos_servicios")
    .select("id");
  if (errLista) throw new Error(errLista.message);

  const prefijo = datos.tipo === "concepto_obra" ? "OBRA" : "CAT";
  const id = siguienteId((existentes ?? []).map((r) => r.id as string), prefijo);

  const { data, error } = await sb
    .from("productos_servicios")
    .insert({
      id,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || "",
      unidad: datos.unidad || "m2",
      costo_unitario: Number(datos.costoUnitario || 0),
      precio_unitario: Number(datos.precioUnitario || 0),
      porcentaje_comision: Number(datos.porcentajeComision ?? 5.0),
      plantilla_garantia: datos.plantillaGarantia || "",
      tipo: datos.tipo || "servicio",
      centro_costo_id: datos.centroCostoId || null,
      codigo_subcuenta: datos.codigoSubcuenta || null,
      categoria: datos.categoria?.trim() || "General",
      fotos: Array.isArray(datos.fotos) ? datos.fotos : [],
      videos: videosAJson(datos.videos),
      descripcion_valor: datos.descripcionValor?.trim() || "",
      especificaciones: datos.especificaciones?.trim() || "",
      gama: datos.gama || "estandar",
      activo: datos.activo !== false,
      apto_para_ia: datos.aptoParaIa !== false,
      ficha_tecnica_url: datos.fichaTecnicaUrl || null,
      ficha_tecnica_nombre: datos.fichaTecnicaUrl ? datos.fichaTecnicaNombre || null : null,
      tarifas_capacidad: tarifasAJson(datos.tarifasCapacidad),
      cantidad_minima: Math.max(0, Number(datos.cantidadMinima || 0)),
      costos_volumen: normalizarCostosVolumen(datos.costosVolumen),
    })
    .select("*, business_units ( id, nombre )")
    .single();

  if (error) throw new Error(error.message);
  return aProductoServicio(data);
}

/** Editar Producto o Servicio */
export async function editarProductoServicio(
  id: string,
  datos: {
    nombre: string;
    descripcion?: string;
    unidad?: string;
    costoUnitario?: number;
    precioUnitario?: number;
    porcentajeComision?: number;
    plantillaGarantia?: string;
    tipo?: 'servicio' | 'producto' | 'concepto_obra' | 'insumo';
    centroCostoId?: string | null;
    codigoSubcuenta?: string | null;
    categoria?: string;
    fotos?: FotoProducto[];
    videos?: VideoProducto[];
    descripcionValor?: string;
    especificaciones?: string;
    gama?: 'economica' | 'media' | 'premium' | 'estandar';
    activo?: boolean;
    aptoParaIa?: boolean;
    fichaTecnicaUrl?: string | null;
    fichaTecnicaNombre?: string | null;
    tarifasCapacidad?: TarifaCapacidad[];
    cantidadMinima?: number;
    costosVolumen?: CostoVolumen[];
  }
): Promise<ProductoServicio> {
  await requireAdmin();
  const sb = supabaseServidor();

  const updatePayload: any = {
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion?.trim() || "",
    unidad: datos.unidad || "m2",
    costo_unitario: Number(datos.costoUnitario || 0),
    precio_unitario: Number(datos.precioUnitario || 0),
    porcentaje_comision: Number(datos.porcentajeComision ?? 5.0),
    plantilla_garantia: datos.plantillaGarantia || "",
    tipo: datos.tipo || "servicio",
    centro_costo_id: datos.centroCostoId || null,
    categoria: datos.categoria?.trim() || "General",
    fotos: Array.isArray(datos.fotos) ? datos.fotos : [],
    descripcion_valor: datos.descripcionValor?.trim() || "",
    especificaciones: datos.especificaciones?.trim() || "",
    gama: datos.gama || "estandar",
    activo: datos.activo !== false,
    apto_para_ia: datos.aptoParaIa !== false,
  };
  // Los videos sólo se tocan si vienen en la petición (otros flujos de edición no los envían)
  if (datos.videos !== undefined) {
    updatePayload.videos = videosAJson(datos.videos);
  }
  if (datos.costosVolumen !== undefined) {
    updatePayload.costos_volumen = normalizarCostosVolumen(datos.costosVolumen);
  }
  if (datos.cantidadMinima !== undefined) {
    updatePayload.cantidad_minima = Math.max(0, Number(datos.cantidadMinima || 0));
  }
  if (datos.tarifasCapacidad !== undefined) {
    updatePayload.tarifas_capacidad = tarifasAJson(datos.tarifasCapacidad);
  }
  if (datos.codigoSubcuenta !== undefined) {
    updatePayload.codigo_subcuenta = datos.codigoSubcuenta || null;
  }
  // La ficha sólo se toca si viene en la petición (otros flujos de edición no la envían)
  if (datos.fichaTecnicaUrl !== undefined) {
    updatePayload.ficha_tecnica_url = datos.fichaTecnicaUrl || null;
    updatePayload.ficha_tecnica_nombre = datos.fichaTecnicaUrl ? datos.fichaTecnicaNombre || null : null;
  }

  const { data, error } = await sb
    .from("productos_servicios")
    .update(updatePayload)
    .eq("id", id)
    .select("*, business_units ( id, nombre )")
    .single();

  if (error) throw new Error(error.message);
  return aProductoServicio(data);
}

/** Eliminar Producto o Servicio */
export async function eliminarProductoServicio(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("productos_servicios")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

// ============================================================
// 2. RECETAS APU (ANÁLISIS DE PRECIOS UNITARIOS)
// ============================================================

/** Guardar Composición APU y Recalcular Costo del Concepto */
export async function guardarComposicionApu(
  conceptoId: string,
  items: Array<{
    insumoId: string;
    cantidad: number;
    desperdicioPct: number;
    rendimiento: number;
    costoUnitarioInsumo: number;
    importeCosto: number;
    notas?: string;
  }>
): Promise<{ ok: boolean; costoCalculado: number }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Borrar composición anterior
  const { error: errDel } = await sb
    .from("conceptos_apu_composicion")
    .delete()
    .eq("concepto_id", conceptoId);
  if (errDel) throw new Error(errDel.message);

  let costoTotalCalculado = 0;

  if (items.length > 0) {
    const filasParaInsertar = items.map((it) => {
      // Cálculo estándar de importe APU
      const factorDesperdicio = 1 + (Number(it.desperdicioPct || 0) / 100);
      const rendimiento = Number(it.rendimiento || 1) <= 0 ? 1 : Number(it.rendimiento || 1);
      // Para mano de obra: cantidad / rendimiento * costo
      // Para materiales: cantidad * factorDesperdicio * costo
      const imp = Number(it.importeCosto) || 
        ((Number(it.cantidad) / rendimiento) * factorDesperdicio * Number(it.costoUnitarioInsumo));

      costoTotalCalculado += imp;

      return {
        concepto_id: conceptoId,
        insumo_id: it.insumoId,
        cantidad: Number(it.cantidad || 1),
        desperdicio_pct: Number(it.desperdicioPct || 0),
        rendimiento: rendimiento,
        costo_unitario_insumo: Number(it.costoUnitarioInsumo || 0),
        importe_costo: Math.round(imp * 100) / 100,
        notas: it.notas || null,
      };
    });

    const { error: errIns } = await sb
      .from("conceptos_apu_composicion")
      .insert(filasParaInsertar);

    if (errIns) throw new Error(errIns.message);
  }

  // Actualizar costo_unitario en el concepto
  const costoRedondeado = Math.round(costoTotalCalculado * 100) / 100;
  await sb
    .from("productos_servicios")
    .update({ costo_unitario: costoRedondeado })
    .eq("id", conceptoId);

  return { ok: true, costoCalculado: costoRedondeado };
}

// ============================================================
// 3. CATÁLOGO DE INSUMOS BASE
// ============================================================

/** Listar Insumos */
export async function listarInsumos(filtros?: {
  tipo?: string;
  oficio?: string;
  soloActivos?: boolean;
}): Promise<Insumo[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  let query = sb
    .from("insumos")
    .select("*, proveedores ( id, nombre )")
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });

  if (filtros?.tipo && filtros.tipo !== "todos") {
    query = query.eq("tipo", filtros.tipo);
  }
  if (filtros?.oficio && filtros.oficio !== "todos") {
    query = query.eq("oficio", filtros.oficio);
  }
  if (filtros?.soloActivos) {
    query = query.eq("activo", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(aInsumo);
}

/** Crear Insumo */
export async function crearInsumo(datos: {
  codigo?: string;
  nombre: string;
  tipo: 'material' | 'mano_obra' | 'herramienta_equipo' | 'flete' | 'subcontrato';
  unidad: string;
  costoProveedor: number;
  precioInterno: number;
  proveedorId?: string | null;
  oficio?: string | null;
  notas?: string | null;
}): Promise<Insumo> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("insumos")
    .insert({
      codigo: datos.codigo?.trim() || null,
      nombre: datos.nombre.trim(),
      tipo: datos.tipo,
      unidad: datos.unidad || "pza",
      costo_proveedor: Number(datos.costoProveedor || 0),
      precio_interno: Number(datos.precioInterno || 0),
      proveedor_id: datos.proveedorId || null,
      oficio: datos.oficio || null,
      notas: datos.notas?.trim() || null,
      activo: true,
    })
    .select("*, proveedores ( id, nombre )")
    .single();

  if (error) throw new Error(error.message);
  return aInsumo(data);
}

/** Editar Insumo (registrando historial si cambió el precio) */
export async function editarInsumo(
  id: string,
  datos: {
    codigo?: string;
    nombre: string;
    tipo: 'material' | 'mano_obra' | 'herramienta_equipo' | 'flete' | 'subcontrato';
    unidad: string;
    costoProveedor: number;
    precioInterno: number;
    proveedorId?: string | null;
    oficio?: string | null;
    notas?: string | null;
    activo?: boolean;
    motivoCambio?: string;
  }
): Promise<Insumo> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Obtener valor actual para historial
  const { data: actual } = await sb
    .from("insumos")
    .select("costo_proveedor, precio_interno")
    .eq("id", id)
    .single();

  const nuevoCosto = Number(datos.costoProveedor || 0);
  const nuevoInterno = Number(datos.precioInterno || 0);

  // Si cambió alguno de los precios, guardar en historial
  if (
    actual && 
    (Number(actual.costo_proveedor) !== nuevoCosto || Number(actual.precio_interno) !== nuevoInterno)
  ) {
    await sb.from("insumos_historial_precios").insert({
      insumo_id: id,
      costo_anterior: Number(actual.costo_proveedor),
      costo_nuevo: nuevoCosto,
      precio_interno_anterior: Number(actual.precio_interno),
      precio_interno_nuevo: nuevoInterno,
      motivo: datos.motivoCambio || "Ajuste de precio en catálogo",
    });
  }

  const { data, error } = await sb
    .from("insumos")
    .update({
      codigo: datos.codigo?.trim() || null,
      nombre: datos.nombre.trim(),
      tipo: datos.tipo,
      unidad: datos.unidad || "pza",
      costo_proveedor: nuevoCosto,
      precio_interno: nuevoInterno,
      proveedor_id: datos.proveedorId || null,
      oficio: datos.oficio || null,
      notas: datos.notas?.trim() || null,
      activo: datos.activo !== false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, proveedores ( id, nombre )")
    .single();

  if (error) throw new Error(error.message);
  return aInsumo(data);
}

/** Eliminar Insumo */
export async function eliminarInsumo(id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("insumos")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Historial de Precios de un Insumo */
export async function obtenerHistorialPreciosInsumo(insumoId: string): Promise<InsumoHistorialPrecio[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("insumos_historial_precios")
    .select("*")
    .eq("insumo_id", insumoId)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((h: any) => ({
    id: h.id,
    insumoId: h.insumo_id,
    costoAnterior: Number(h.costo_anterior || 0),
    costoNuevo: Number(h.costo_nuevo || 0),
    precioInternoAnterior: Number(h.precio_interno_anterior || 0),
    precioInternoNuevo: Number(h.precio_interno_nuevo || 0),
    fecha: h.fecha,
    usuarioId: h.usuario_id || null,
    motivo: h.motivo || null,
  }));
}

// ============================================================
// 4. CENTROS DE COSTO Y METADATA
// ============================================================

/** Listar Centros de Costo disponibles desde Finanzas */
/** Subcuentas de marketing (especialidades) para clasificar productos. */
export async function obtenerSubcuentasMarketing(): Promise<
  Array<{ codigo: string; nombre: string; businessUnitId: string | null }>
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("marketing_subcuentas")
    .select("codigo, nombre, business_unit_id")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) return [];
  return (data ?? []).map((s: any) => ({ codigo: s.codigo, nombre: s.nombre, businessUnitId: s.business_unit_id }));
}

export async function obtenerCentrosCosto(): Promise<Array<{ id: string; nombre: string; descripcion: string }>> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("business_units")
    .select("id, nombre, descripcion")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Precios de Impermeabilización para calculadora rápida de Conversaciones */
export async function obtenerPreciosImpermeabilizacionCatalogo(): Promise<PreciosImpermeabilizacion> {
  await requireAdmin();
  return preciosImpermeabilizacionDeCatalogo(supabaseServidor());
}

// ============================================================
// 5. REPORTE DE VENTAS POR PRODUCTO Y CENTRO DE COSTOS
// ============================================================

export interface MetricaVentaProducto {
  productoId: string;
  productoNombre: string;
  tipo: string;
  centroCosto: string;
  categoria: string;
  unidadesDesplazadas: number;
  ingresosTotales: number;
  costoTotal: number;
  utilidadBruta: number;
  margenPct: number;
  cotizacionesCount: number;
}

export async function obtenerReporteVentasProductos(filtro?: {
  fechaDesde?: string;
  fechaHasta?: string;
  centroCostoId?: string;
}): Promise<{
  metricas: MetricaVentaProducto[];
  resumen: {
    totalUnidades: number;
    totalIngresos: number;
    totalCosto: number;
    totalUtilidad: number;
    margenPromedioPct: number;
  };
}> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Obtener conceptos de cotizaciones aprobadas o aceptadas que tienen producto_servicio_id
  let query = sb
    .from("cotizacion_conceptos")
    .select(`
      id,
      cantidad,
      precio_unitario,
      costo_unitario,
      importe,
      producto_servicio_id,
      cotizaciones!inner (
        id,
        estatus,
        created_at
      ),
      productos_servicios (
        id,
        nombre,
        tipo,
        categoria,
        centro_costo_id,
        business_units (
          nombre
        )
      )
    `)
    .not("producto_servicio_id", "is", null)
    .in("cotizaciones.estatus", ["aprobada", "aceptada", "instalacion"]);

  if (filtro?.fechaDesde) {
    query = query.gte("cotizaciones.created_at", filtro.fechaDesde);
  }
  if (filtro?.fechaHasta) {
    query = query.lte("cotizaciones.created_at", filtro.fechaHasta);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const mapa = new Map<string, MetricaVentaProducto>();

  let totalUnidades = 0;
  let totalIngresos = 0;
  let totalCosto = 0;

  for (const fila of data ?? []) {
    const prod = fila.productos_servicios;
    if (!prod) continue;

    if (filtro?.centroCostoId && filtro.centroCostoId !== "todos") {
      if (prod.centro_costo_id !== filtro.centroCostoId) continue;
    }

    const prodId = prod.id;
    const cant = Number(fila.cantidad || 0);
    const imp = Number(fila.importe || 0);
    const cUnit = Number(fila.costo_unitario || 0);
    const costo = cUnit * cant;

    totalUnidades += cant;
    totalIngresos += imp;
    totalCosto += costo;

    const actual = mapa.get(prodId) || {
      productoId: prodId,
      productoNombre: prod.nombre,
      tipo: prod.tipo || "servicio",
      centroCosto: prod.business_units?.nombre || "Sin Centro Asignado",
      categoria: prod.categoria || "General",
      unidadesDesplazadas: 0,
      ingresosTotales: 0,
      costoTotal: 0,
      utilidadBruta: 0,
      margenPct: 0,
      cotizacionesCount: 0,
    };

    actual.unidadesDesplazadas += cant;
    actual.ingresosTotales += imp;
    actual.costoTotal += costo;
    actual.utilidadBruta = actual.ingresosTotales - actual.costoTotal;
    actual.margenPct = actual.ingresosTotales > 0 
      ? Math.round((actual.utilidadBruta / actual.ingresosTotales) * 1000) / 10 
      : 0;
    actual.cotizacionesCount += 1;

    mapa.set(prodId, actual);
  }

  const metricas = Array.from(mapa.values()).sort(
    (a, b) => b.ingresosTotales - a.ingresosTotales
  );
  const totalUtilidad = totalIngresos - totalCosto;
  const margenPromedioPct = totalIngresos > 0 
    ? Math.round((totalUtilidad / totalIngresos) * 1000) / 10 
    : 0;

  return {
    metricas,
    resumen: {
      totalUnidades,
      totalIngresos,
      totalCosto,
      totalUtilidad,
      margenPromedioPct,
    },
  };
}

// ============================================================
// 6. SUBIDA DE FOTOS DE PRODUCTO Y EJEMPLOS DE APLICACIÓN
// ============================================================

export async function subirImagenProducto(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const archivo = formData.get("archivo") as File | null;
  if (!archivo) {
    return { ok: false, error: "No se proporcionó ningún archivo." };
  }

  const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const path = `catalogo/${timestamp}-${randomStr}.${ext}`;

  const buffer = Buffer.from(await archivo.arrayBuffer());

  // Intentar subir a expedientes-fotos (bucket público existente)
  const { data: uploadData, error: uploadError } = await sb.storage
    .from("expedientes-fotos")
    .upload(path, buffer, {
      contentType: archivo.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError || !uploadData) {
    return { ok: false, error: uploadError?.message || "Error al subir la imagen." };
  }

  const { data: urlData } = sb.storage.from("expedientes-fotos").getPublicUrl(uploadData.path);
  return { ok: true, url: urlData.publicUrl };
}

/** Sube el PDF de la ficha técnica de un producto (bucket público del catálogo). */
export async function subirFichaTecnicaProducto(
  formData: FormData
): Promise<{ ok: boolean; url?: string; nombre?: string; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const archivo = formData.get("archivo") as File | null;
  if (!archivo || archivo.size === 0) return { ok: false, error: "No se proporcionó ningún archivo." };
  if (archivo.type !== "application/pdf" && !/\.pdf$/i.test(archivo.name)) {
    return { ok: false, error: "La ficha técnica debe ser un archivo PDF." };
  }
  if (archivo.size > 15 * 1024 * 1024) return { ok: false, error: "El PDF supera el límite de 15 MB." };

  const limpio = archivo.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `catalogo/fichas/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${limpio}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { data, error } = await sb.storage
    .from("expedientes-fotos")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error || !data) return { ok: false, error: error?.message || "Error al subir el PDF." };

  const { data: urlData } = sb.storage.from("expedientes-fotos").getPublicUrl(data.path);
  return { ok: true, url: urlData.publicUrl, nombre: archivo.name };
}

/**
 * Prepara la subida de un video de producto: devuelve una URL firmada para que el
 * navegador lo suba directo a Storage (las funciones de Netlify cortan a ~6 MB).
 * El navegador ya lo convirtió a MP4 H.264 ≤16 MB, listo para enviarse por WhatsApp.
 */
export async function prepararSubidaVideoProducto(
  nombre: string
): Promise<{ ok: boolean; ruta?: string; token?: string; url?: string; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const limpio = (nombre || "video.mp4").normalize("NFD").replace(/[^\w.-]+/g, "_").replace(/\.[^.]+$/, "").slice(-60);
  const ruta = `catalogo/videos/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${limpio}.mp4`;
  const { data, error } = await sb.storage.from("expedientes-fotos").createSignedUploadUrl(ruta);
  if (error || !data) return { ok: false, error: error?.message || "No se pudo preparar la subida del video." };
  const { data: urlData } = sb.storage.from("expedientes-fotos").getPublicUrl(data.path);
  return { ok: true, ruta: data.path, token: data.token, url: urlData.publicUrl };
}
