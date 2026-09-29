"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import type {
  PlantillaEspacio,
  CotizacionEspacio,
  CotizacionPartida,
  CotizacionConcepto,
  EsquemaPagoHito,
} from "@/lib/types";

// ============================================================
// 1. PLANTILLAS PARAMÉTRICAS DE ESPACIOS
// ============================================================

/** Listar Plantillas Paramétricas Maestras */
export async function listarPlantillasEspacios(): Promise<PlantillaEspacio[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("plantillas_espacios")
    .select(`
      *,
      plantillas_espacios_conceptos (
        *,
        productos_servicios (*)
      )
    `)
    .eq("activo", true)
    .order("orden", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    nombre: p.nombre,
    descripcion: p.descripcion || "",
    parametrosSchema: Array.isArray(p.parametros_schema) ? p.parametros_schema : [],
    orden: p.orden || 0,
    activo: p.activo !== false,
    createdAt: p.created_at,
    conceptos: (p.plantillas_espacios_conceptos ?? []).map((c: any) => ({
      id: c.id,
      plantillaId: c.plantilla_id,
      partidaNombre: c.partida_nombre,
      productoServicioId: c.producto_servicio_id,
      productoServicio: c.productos_servicios,
      formulaCantidad: c.formula_cantidad,
      gama: c.gama,
      condicion: c.condicion,
      orden: c.orden,
    })),
  }));
}

/** Generar Espacio Paramétrico y Conceptos desde una Plantilla */
export async function generarEspacioDesdePlantilla(params: {
  cotizacionId: string;
  slugPlantilla: string;
  nombreEspacio: string;
  largo: number;
  ancho: number;
  alto?: number;
  parametros?: Record<string, any>;
  gama?: "economica" | "media" | "premium";
}): Promise<{ espacioId: string; conceptosCreados: number }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const largo = Number(params.largo || 0);
  const ancho = Number(params.ancho || 0);
  const alto = Number(params.alto || 2.4);
  const m2Piso = Math.round(largo * ancho * 100) / 100;
  const m2Muros = Math.round(2 * (largo + ancho) * alto * 100) / 100;
  const perimetro = Math.round(2 * (largo + ancho) * 100) / 100;
  const gamaSeleccionada = params.gama || "media";
  const parametros = params.parametros || {};

  // 1. Obtener la plantilla
  const { data: plantilla, error: errP } = await sb
    .from("plantillas_espacios")
    .select(`
      *,
      plantillas_espacios_conceptos (
        *,
        productos_servicios (*)
      )
    `)
    .eq("slug", params.slugPlantilla)
    .single();

  if (errP || !plantilla) {
    throw new Error(`Plantilla no encontrada: ${params.slugPlantilla}`);
  }

  // 2. Crear registro de espacio
  const { data: espacio, error: errEsp } = await sb
    .from("cotizacion_espacios")
    .insert({
      cotizacion_id: params.cotizacionId,
      nombre: params.nombreEspacio.trim(),
      tipo_espacio: params.slugPlantilla,
      largo,
      ancho,
      alto,
      m2_piso: m2Piso,
      m2_muros: m2Muros,
      parametros,
      gama_seleccionada: gamaSeleccionada,
    })
    .select("id")
    .single();

  if (errEsp || !espacio) throw new Error(errEsp?.message || "Error al crear espacio");

  // 3. Crear partidas y conceptos
  const conceptosTemplate = plantilla.plantillas_espacios_conceptos || [];
  let conceptosCreados = 0;

  // Cache de partidas de esta cotización
  const { data: partidasExistentes } = await sb
    .from("cotizacion_partidas")
    .select("id, nombre")
    .eq("cotizacion_id", params.cotizacionId);

  const mapaPartidas = new Map<string, string>();
  for (const part of partidasExistentes ?? []) {
    mapaPartidas.set(part.nombre.toLowerCase().trim(), part.id);
  }

  for (const item of conceptosTemplate) {
    // Evaluar condición si existe (ej. parametros.mover_instalaciones === true)
    if (item.condicion) {
      try {
        const fn = new Function("parametros", `return !!(${item.condicion});`);
        const cumple = fn(parametros);
        if (!cumple) continue;
      } catch {
        // En caso de error de sintaxis, omitir
      }
    }

    // Filtrar por gama si la regla especifica una gama en particular
    if (item.gama !== "todas" && item.gama !== gamaSeleccionada) {
      continue;
    }

    const prod = item.productos_servicios;
    if (!prod) continue;

    // Obtener o crear partida
    const nomPartida = item.partida_nombre.trim();
    let partidaId = mapaPartidas.get(nomPartida.toLowerCase());

    if (!partidaId) {
      const { data: nuevaPartida, error: errPart } = await sb
        .from("cotizacion_partidas")
        .insert({
          cotizacion_id: params.cotizacionId,
          nombre: nomPartida,
          orden: mapaPartidas.size + 1,
        })
        .select("id")
        .single();

      if (!errPart && nuevaPartida) {
        partidaId = nuevaPartida.id;
        mapaPartidas.set(nomPartida.toLowerCase(), partidaId);
      }
    }

    // Evaluar fórmula de cantidad
    let cantidadCalculada = 1;
    try {
      const evalScope = {
        m2_piso: m2Piso,
        m2_muros: m2Muros,
        perimetro,
        largo,
        ancho,
        alto,
        parametros,
      };
      const fnFormula = new Function(
        "m2_piso", "m2_muros", "perimetro", "largo", "ancho", "alto", "parametros",
        `return ${item.formulaCantidad};`
      );
      cantidadCalculada = Number(
        fnFormula(m2Piso, m2Muros, perimetro, largo, ancho, alto, parametros)
      );
      if (isNaN(cantidadCalculada) || cantidadCalculada <= 0) cantidadCalculada = 1;
    } catch {
      cantidadCalculada = 1;
    }

    cantidadCalculada = Math.round(cantidadCalculada * 100) / 100;
    const precioUnit = Number(prod.precio_unitario || 0);
    const costoUnit = Number(prod.costo_unitario || 0);
    const importe = Math.round(cantidadCalculada * precioUnit * 100) / 100;

    await sb.from("cotizacion_conceptos").insert({
      cotizacion_id: params.cotizacionId,
      producto_servicio_id: prod.id,
      partida_id: partidaId || null,
      espacio_id: espacio.id,
      gama: gamaSeleccionada,
      descripcion: prod.nombre,
      cantidad: cantidadCalculada,
      unidad: prod.unidad || "m2",
      costo_unitario: costoUnit,
      precio_unitario: precioUnit,
      importe,
      orden: item.orden || 0,
    });

    conceptosCreados++;
  }

  // 4. Recalcular la cascada de la cotización
  await recalcularTotalesCotizacionApu(params.cotizacionId);

  return { espacioId: espacio.id, conceptosCreados };
}

// ============================================================
// 2. CASCADA DE PRECIOS Y TOTALES DE COTIZACIÓN
// ============================================================

/** Recalcular Cascada Interna sin requireAdmin */
export async function recalcularTotalesCotizacionApuInterno(
  sb: any,
  cotizacionId: string
): Promise<{
  costoDirecto: number;
  indirectosMonto: number;
  imprevistosMonto: number;
  utilidadMonto: number;
  subtotal: number;
  ivaMonto: number;
  precioFinal: number;
}> {
  // 1. Obtener cotización para ver sus porcentajes configurados
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("indirectos_pct, imprevistos_pct, utilidad_pct, iva_pct, incluye_iva")
    .eq("id", cotizacionId)
    .single();

  if (errCot || !cot) throw new Error("Cotización no encontrada");

  const indirectosPct = Number(cot.indirectos_pct ?? 5.0);
  const imprevistosPct = Number(cot.imprevistos_pct ?? 5.0);
  const utilidadPct = Number(cot.utilidad_pct ?? 20.0);
  const ivaPct = Number(cot.iva_pct ?? 16.0);
  const incluyeIva = cot.incluye_iva === true;

  // 2. Sumar conceptos
  const { data: conceptos, error: errConc } = await sb
    .from("cotizacion_conceptos")
    .select("cantidad, costo_unitario, precio_unitario, partida_id")
    .eq("cotizacion_id", cotizacionId);

  if (errConc) throw new Error(errConc.message);

  let costoDirecto = 0;
  let sumaPrecioVentaConceptos = 0;

  // Mapa para subtotales de partidas
  const subtotalesPartidas = new Map<string, { costo: number; precio: number }>();

  for (const c of conceptos ?? []) {
    const cant = Number(c.cantidad || 0);
    const cUnit = Number(c.costo_unitario || 0);
    const pUnit = Number(c.precio_unitario || 0);

    const cTotal = Math.round(cant * cUnit * 100) / 100;
    const pTotal = Math.round(cant * pUnit * 100) / 100;

    costoDirecto += cTotal;
    sumaPrecioVentaConceptos += pTotal;

    if (c.partida_id) {
      const prev = subtotalesPartidas.get(c.partida_id) || { costo: 0, precio: 0 };
      prev.costo += cTotal;
      prev.precio += pTotal;
      subtotalesPartidas.set(c.partida_id, prev);
    }
  }

  // 3. Cascada de precios
  // Indirectos sobre costo directo
  const indirectosMonto = Math.round(costoDirecto * (indirectosPct / 100) * 100) / 100;
  // Imprevistos sobre costo directo
  const imprevistosMonto = Math.round(costoDirecto * (imprevistosPct / 100) * 100) / 100;
  // Costo total de obra = Directo + Indirectos + Imprevistos
  const costoTotalObra = costoDirecto + indirectosMonto + imprevistosMonto;
  // Utilidad sobre costo total de obra
  const utilidadMonto = Math.round(costoTotalObra * (utilidadPct / 100) * 100) / 100;
  
  // Subtotal cliente (o el mayor entre cascada y suma de precios de conceptos)
  const subtotalCalculado = costoTotalObra + utilidadMonto;
  const subtotal = Math.max(subtotalCalculado, sumaPrecioVentaConceptos);

  // IVA
  const ivaMonto = incluyeIva ? Math.round(subtotal * (ivaPct / 100) * 100) / 100 : 0;
  const precioFinal = Math.round((subtotal + ivaMonto) * 100) / 100;

  // 4. Actualizar subtotales en cotizacion_partidas
  for (const [partidaId, totales] of subtotalesPartidas.entries()) {
    await sb
      .from("cotizacion_partidas")
      .update({
        subtotal_costo_directo: Math.round(totales.costo * 100) / 100,
        subtotal_precio_cliente: Math.round(totales.precio * 100) / 100,
      })
      .eq("id", partidaId);
  }

  // 5. Actualizar cotizaciones
  await sb
    .from("cotizaciones")
    .update({
      modalidad: "obra_apu",
      costo_directo: costoDirecto,
      indirectos_monto: indirectosMonto,
      imprevistos_monto: imprevistosMonto,
      utilidad_monto: utilidadMonto,
      iva_monto: ivaMonto,
      costo_estimado: costoTotalObra,
      precio_final: precioFinal,
    })
    .eq("id", cotizacionId);

  return {
    costoDirecto,
    indirectosMonto,
    imprevistosMonto,
    utilidadMonto,
    subtotal,
    ivaMonto,
    precioFinal,
  };
}

/** Recalcular Cascada de Costos y Precios de Presupuesto APU (Admin) */
export async function recalcularTotalesCotizacionApu(cotizacionId: string): Promise<{
  costoDirecto: number;
  indirectosMonto: number;
  imprevistosMonto: number;
  utilidadMonto: number;
  subtotal: number;
  ivaMonto: number;
  precioFinal: number;
}> {
  await requireAdmin();
  const sb = supabaseServidor();
  return recalcularTotalesCotizacionApuInterno(sb, cotizacionId);
}

// ============================================================
// 3. CONSULTA COMPLETA DE PRESUPUESTO APU
// ============================================================

export interface PresupuestoApuCompleto {
  cotizacion: any;
  partidas: CotizacionPartida[];
  espacios: CotizacionEspacio[];
  conceptos: CotizacionConcepto[];
  esquemaPagos: EsquemaPagoHito[];
  cascada: {
    costoDirecto: number;
    indirectosPct: number;
    indirectosMonto: number;
    imprevistosPct: number;
    imprevistosMonto: number;
    utilidadPct: number;
    utilidadMonto: number;
    subtotal: number;
    ivaPct: number;
    ivaMonto: number;
    incluyeIva: boolean;
    precioFinal: number;
  };
}

/** Obtener Presupuesto APU con Partidas, Espacios y Cascada */
export async function obtenerPresupuestoApuCompleto(
  cotizacionId: string
): Promise<PresupuestoApuCompleto | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Cotización
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos (*),
      expedientes (*)
    `)
    .eq("id", cotizacionId)
    .maybeSingle();

  if (errCot || !cot) return null;

  // 2. Partidas
  const { data: partidas } = await sb
    .from("cotizacion_partidas")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("orden", { ascending: true });

  // 3. Espacios
  const { data: espacios } = await sb
    .from("cotizacion_espacios")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("orden", { ascending: true });

  // 4. Conceptos detallados
  const { data: conceptos } = await sb
    .from("cotizacion_conceptos")
    .select("*, productos_servicios (*)")
    .eq("cotizacion_id", cotizacionId)
    .order("orden", { ascending: true });

  const cDirecto = Number(cot.costo_directo || 0);
  const indPct = Number(cot.indirectos_pct ?? 5.0);
  const indMonto = Number(cot.indirectos_monto || 0);
  const impPct = Number(cot.imprevistos_pct ?? 5.0);
  const impMonto = Number(cot.imprevistos_monto || 0);
  const utPct = Number(cot.utilidad_pct ?? 20.0);
  const utMonto = Number(cot.utilidad_monto || 0);
  const ivaPct = Number(cot.iva_pct ?? 16.0);
  const ivaMonto = Number(cot.iva_monto || 0);
  const incluyeIva = cot.incluye_iva === true;
  const precioFinal = Number(cot.precio_final || 0);
  const subtotal = precioFinal - ivaMonto;

  const esquemaPagos: EsquemaPagoHito[] = Array.isArray(cot.esquema_pagos) && cot.esquema_pagos.length > 0
    ? cot.esquema_pagos
    : [
        { etapa: "Anticipo", porcentaje: 50, monto: Math.round(precioFinal * 0.5), condicion: "Firma de contrato de obra" },
        { etapa: "Avance de Albañilería e Instalaciones", porcentaje: 35, monto: Math.round(precioFinal * 0.35), condicion: "Al concluir instalaciones y nivelación" },
        { etapa: "Finiquito y Entrega", porcentaje: 15, monto: Math.round(precioFinal * 0.15), condicion: "Recepción de obra y entrega de garantía" },
      ];

  return {
    cotizacion: cot,
    partidas: (partidas ?? []).map((p: any) => ({
      id: p.id,
      cotizacionId: p.cotizacion_id,
      nombre: p.nombre,
      orden: p.orden,
      subtotalCostoDirecto: Number(p.subtotal_costo_directo || 0),
      subtotalPrecioCliente: Number(p.subtotal_precio_cliente || 0),
      createdAt: p.created_at,
    })),
    espacios: (espacios ?? []).map((e: any) => ({
      id: e.id,
      cotizacionId: e.cotizacion_id,
      nombre: e.nombre,
      tipoEspacio: e.tipo_espacio,
      largo: Number(e.largo || 0),
      ancho: Number(e.ancho || 0),
      alto: Number(e.alto || 2.4),
      m2Piso: Number(e.m2_piso || 0),
      m2Muros: Number(e.m2_muros || 0),
      parametros: e.parametros || {},
      gamaSeleccionada: e.gama_seleccionada || "media",
      fotos: Array.isArray(e.fotos) ? e.fotos : [],
      notas: e.notas || null,
      orden: e.orden || 0,
      createdAt: e.created_at,
    })),
    conceptos: (conceptos ?? []).map((c: any) => ({
      id: c.id,
      cotizacionId: c.cotizacion_id,
      productoServicioId: c.producto_servicio_id,
      partidaId: c.partida_id,
      espacioId: c.espacio_id,
      gama: c.gama || "media",
      orden: c.orden || 0,
      apuDetallado: c.apu_detallado || [],
      descripcion: c.descripcion,
      cantidad: Number(c.cantidad || 0),
      unidad: c.unidad,
      costoUnitario: Number(c.costo_unitario || 0),
      precioUnitario: Number(c.precio_unitario || 0),
      descuento: Number(c.descuento || 0),
      importe: Number(c.importe || 0),
      createdAt: c.created_at,
    })),
    esquemaPagos,
    cascada: {
      costoDirecto: cDirecto,
      indirectosPct: indPct,
      indirectosMonto: indMonto,
      imprevistosPct: impPct,
      imprevistosMonto: impMonto,
      utilidadPct: utPct,
      utilidadMonto: utMonto,
      subtotal,
      ivaPct,
      ivaMonto,
      incluyeIva,
      precioFinal,
    },
  };
}

// ============================================================
// 4. EDICIÓN DE PARTIDAS, ESPACIOS Y CONCEPTOS
// ============================================================

/** Crear Partida Manual */
export async function crearPartidaPresupuesto(
  cotizacionId: string,
  nombre: string
): Promise<CotizacionPartida> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: countData } = await sb
    .from("cotizacion_partidas")
    .select("id")
    .eq("cotizacion_id", cotizacionId);

  const orden = (countData?.length || 0) + 1;

  const { data, error } = await sb
    .from("cotizacion_partidas")
    .insert({
      cotizacion_id: cotizacionId,
      nombre: nombre.trim(),
      orden,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    cotizacionId: data.cotizacion_id,
    nombre: data.nombre,
    orden: data.orden,
    subtotalCostoDirecto: Number(data.subtotal_costo_directo || 0),
    subtotalPrecioCliente: Number(data.subtotal_precio_cliente || 0),
    createdAt: data.created_at,
  };
}

/** Agregar Concepto de Obra al Presupuesto */
export async function agregarConceptoPresupuesto(datos: {
  cotizacionId: string;
  productoServicioId?: string | null;
  partidaId?: string | null;
  espacioId?: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  gama?: string;
}): Promise<CotizacionConcepto> {
  await requireAdmin();
  const sb = supabaseServidor();

  const cant = Number(datos.cantidad || 1);
  const pUnit = Number(datos.precioUnitario || 0);
  const cUnit = Number(datos.costoUnitario || 0);
  const importe = Math.round(cant * pUnit * 100) / 100;

  const { data, error } = await sb
    .from("cotizacion_conceptos")
    .insert({
      cotizacion_id: datos.cotizacionId,
      producto_servicio_id: datos.productoServicioId || null,
      partida_id: datos.partidaId || null,
      espacio_id: datos.espacioId || null,
      descripcion: datos.descripcion.trim(),
      cantidad: cant,
      unidad: datos.unidad || "m2",
      costo_unitario: cUnit,
      precio_unitario: pUnit,
      importe,
      gama: datos.gama || "media",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Recalcular cascada
  await recalcularTotalesCotizacionApu(datos.cotizacionId);

  return {
    id: data.id,
    cotizacionId: data.cotizacion_id,
    productoServicioId: data.producto_servicio_id,
    partidaId: data.partida_id,
    espacioId: data.espacio_id,
    descripcion: data.descripcion,
    cantidad: Number(data.cantidad),
    unidad: data.unidad,
    costoUnitario: Number(data.costo_unitario),
    precioUnitario: Number(data.precio_unitario),
    importe: Number(data.importe),
    gama: data.gama,
    createdAt: data.created_at,
  };
}

/** Actualizar Concepto (Inline tipo hoja de cálculo) */
export async function actualizarConceptoPresupuesto(
  conceptoId: string,
  datos: {
    descripcion?: string;
    cantidad?: number;
    unidad?: string;
    costoUnitario?: number;
    precioUnitario?: number;
    partidaId?: string | null;
    espacioId?: string | null;
  }
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Obtener concepto actual
  const { data: actual, error: errAct } = await sb
    .from("cotizacion_conceptos")
    .select("cotizacion_id, cantidad, precio_unitario")
    .eq("id", conceptoId)
    .single();

  if (errAct || !actual) throw new Error("Concepto no encontrado");

  const cant = datos.cantidad !== undefined ? Number(datos.cantidad) : Number(actual.cantidad);
  const pUnit = datos.precioUnitario !== undefined ? Number(datos.precioUnitario) : Number(actual.precio_unitario);
  const importe = Math.round(cant * pUnit * 100) / 100;

  const payload: any = {
    cantidad: cant,
    precio_unitario: pUnit,
    importe,
  };
  if (datos.descripcion !== undefined) payload.descripcion = datos.descripcion.trim();
  if (datos.unidad !== undefined) payload.unidad = datos.unidad.trim();
  if (datos.costoUnitario !== undefined) payload.costo_unitario = Number(datos.costoUnitario);
  if (datos.partidaId !== undefined) payload.partida_id = datos.partidaId;
  if (datos.espacioId !== undefined) payload.espacio_id = datos.espacioId;

  const { error } = await sb
    .from("cotizacion_conceptos")
    .update(payload)
    .eq("id", conceptoId);

  if (error) throw new Error(error.message);

  // Recalcular cascada
  await recalcularTotalesCotizacionApu(actual.cotizacion_id);
}

/** Eliminar Concepto */
export async function eliminarConceptoPresupuesto(conceptoId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: act } = await sb
    .from("cotizacion_conceptos")
    .select("cotizacion_id")
    .eq("id", conceptoId)
    .single();

  const { error } = await sb
    .from("cotizacion_conceptos")
    .delete()
    .eq("id", conceptoId);

  if (error) throw new Error(error.message);

  if (act?.cotizacion_id) {
    await recalcularTotalesCotizacionApu(act.cotizacion_id);
  }
}

async function regenerarConceptosEspacioPorGama(
  sb: any,
  cotizacionId: string,
  espacio: any,
  nuevaGama: "economica" | "media" | "premium"
): Promise<void> {
  if (espacio.tipo_espacio) {
    const { data: plantilla } = await sb
      .from("plantillas_espacios")
      .select(`
        *,
        plantillas_espacios_conceptos (
          *,
          productos_servicios (*)
        )
      `)
      .eq("slug", espacio.tipo_espacio)
      .maybeSingle();

    if (plantilla && plantilla.plantillas_espacios_conceptos?.length > 0) {
      // 1. Eliminar conceptos previos asociados a este espacio
      await sb
        .from("cotizacion_conceptos")
        .delete()
        .eq("espacio_id", espacio.id);

      // 2. Obtener mapa de partidas existentes
      const { data: partidasExistentes } = await sb
        .from("cotizacion_partidas")
        .select("id, nombre")
        .eq("cotizacion_id", cotizacionId);

      const mapaPartidas = new Map<string, string>();
      for (const part of partidasExistentes ?? []) {
        mapaPartidas.set(part.nombre.toLowerCase().trim(), part.id);
      }

      const largo = Number(espacio.largo || 0);
      const ancho = Number(espacio.ancho || 0);
      const alto = Number(espacio.alto || 2.4);
      const m2Piso = Number(espacio.m2_piso || (largo * ancho));
      const m2Muros = Number(espacio.m2_muros || (2 * (largo + ancho) * alto));
      const perimetro = Math.round(2 * (largo + ancho) * 100) / 100;
      const parametros = espacio.parametros || {};

      for (const item of plantilla.plantillas_espacios_conceptos) {
        if (item.condicion) {
          try {
            const fn = new Function("parametros", `return !!(${item.condicion});`);
            if (!fn(parametros)) continue;
          } catch {
            // ignorar
          }
        }

        if (item.gama !== "todas" && item.gama !== nuevaGama) {
          continue;
        }

        const prod = item.productos_servicios;
        if (!prod) continue;

        const nomPartida = item.partida_nombre.trim();
        let partidaId = mapaPartidas.get(nomPartida.toLowerCase());

        if (!partidaId) {
          const { data: nuevaPartida } = await sb
            .from("cotizacion_partidas")
            .insert({
              cotizacion_id: cotizacionId,
              nombre: nomPartida,
              orden: mapaPartidas.size + 1,
            })
            .select("id")
            .single();

          if (nuevaPartida) {
            partidaId = nuevaPartida.id;
            mapaPartidas.set(nomPartida.toLowerCase(), partidaId);
          }
        }

        let cantidadCalculada = 1;
        try {
          const evalScope = {
            m2_piso: m2Piso,
            m2_muros: m2Muros,
            perimetro,
            largo,
            ancho,
            alto,
            parametros,
          };
          const fnFormula = new Function(
            "m2_piso", "m2_muros", "perimetro", "largo", "ancho", "alto", "parametros",
            `return ${item.formulaCantidad};`
          );
          cantidadCalculada = Number(
            fnFormula(m2Piso, m2Muros, perimetro, largo, ancho, alto, parametros)
          );
          if (isNaN(cantidadCalculada) || cantidadCalculada <= 0) cantidadCalculada = 1;
        } catch {
          cantidadCalculada = 1;
        }

        cantidadCalculada = Math.round(cantidadCalculada * 100) / 100;
        const precioUnit = Number(prod.precio_unitario || 0);
        const costoUnit = Number(prod.costo_unitario || 0);
        const importe = Math.round(cantidadCalculada * precioUnit * 100) / 100;

        await sb.from("cotizacion_conceptos").insert({
          cotizacion_id: cotizacionId,
          producto_servicio_id: prod.id,
          partida_id: partidaId || null,
          espacio_id: espacio.id,
          gama: nuevaGama,
          descripcion: prod.nombre,
          cantidad: cantidadCalculada,
          unidad: prod.unidad || "m2",
          costo_unitario: costoUnit,
          precio_unitario: precioUnit,
          importe,
          orden: item.orden || 0,
        });
      }

      await sb
        .from("cotizacion_espacios")
        .update({ gama_seleccionada: nuevaGama })
        .eq("id", espacio.id);

      return;
    }
  }

  // Fallback si no tiene plantilla vinculada
  await sb
    .from("cotizacion_espacios")
    .update({ gama_seleccionada: nuevaGama })
    .eq("id", espacio.id);

  await sb
    .from("cotizacion_conceptos")
    .update({ gama: nuevaGama })
    .eq("espacio_id", espacio.id);
}

/** Cambiar Gama en Espacio y recalcular acabados (Admin) */
export async function cambiarGamaEspacio(
  espacioId: string,
  nuevaGama: "economica" | "media" | "premium"
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: espacio, error: errEsp } = await sb
    .from("cotizacion_espacios")
    .select("*")
    .eq("id", espacioId)
    .single();

  if (errEsp || !espacio) throw new Error("Error al cambiar gama del espacio");

  await regenerarConceptosEspacioPorGama(sb, espacio.cotizacion_id, espacio, nuevaGama);
  await recalcularTotalesCotizacionApuInterno(sb, espacio.cotizacion_id);
}

/** Cambiar Gama en Espacio (Cliente con Token) */
export async function cambiarGamaEspacioCliente(
  token: string,
  espacioId: string,
  nuevaGama: "economica" | "media" | "premium"
): Promise<{ ok: boolean; nuevaGama: string; precioFinal: number }> {
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("id, estatus")
    .eq("token", token)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Propuesta no válida");

  if (cot.estatus === "aceptada") {
    throw new Error("La propuesta ya ha sido autorizada y no se puede modificar.");
  }

  const { data: espacio, error: errEsp } = await sb
    .from("cotizacion_espacios")
    .select("*")
    .eq("id", espacioId)
    .eq("cotizacion_id", cot.id)
    .maybeSingle();

  if (errEsp || !espacio) throw new Error("Espacio no encontrado");

  await regenerarConceptosEspacioPorGama(sb, cot.id, espacio, nuevaGama);
  const totales = await recalcularTotalesCotizacionApuInterno(sb, cot.id);

  return { ok: true, nuevaGama, precioFinal: totales.precioFinal };
}

/** Actualizar Parámetros de la Cascada y Esquema de Pagos */
export async function guardarConfiguracionPresupuesto(
  cotizacionId: string,
  datos: {
    indirectosPct?: number;
    imprevistosPct?: number;
    utilidadPct?: number;
    ivaPct?: number;
    incluyeIva?: boolean;
    alcances?: string;
    exclusiones?: string;
    esquemaPagos?: EsquemaPagoHito[];
  }
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const payload: any = {};
  if (datos.indirectosPct !== undefined) payload.indirectos_pct = Number(datos.indirectosPct);
  if (datos.imprevistosPct !== undefined) payload.imprevistos_pct = Number(datos.imprevistosPct);
  if (datos.utilidadPct !== undefined) payload.utilidad_pct = Number(datos.utilidadPct);
  if (datos.ivaPct !== undefined) payload.iva_pct = Number(datos.ivaPct);
  if (datos.incluyeIva !== undefined) payload.incluye_iva = datos.incluyeIva;
  if (datos.alcances !== undefined) payload.alcances = datos.alcances.trim();
  if (datos.exclusiones !== undefined) payload.exclusiones = datos.exclusiones.trim();
  if (datos.esquemaPagos !== undefined) payload.esquema_pagos = datos.esquemaPagos;

  const { error } = await sb
    .from("cotizaciones")
    .update(payload)
    .eq("id", cotizacionId);

  if (error) throw new Error(error.message);

  await recalcularTotalesCotizacionApu(cotizacionId);
}

// ============================================================
// 5. EXPLOSIÓN DE INSUMOS (CONVERSIÓN A OBRA / OT)
// ============================================================

export interface ItemExplosionInsumo {
  insumoId: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  cantidadTotal: number;
  costoUnitario: number;
  importeTotal: number;
  oficio?: string | null;
  partidasDondeSeUsa: string[];
}

/** Generar Explosión de Insumos del Presupuesto */
export async function obtenerExplosionInsumos(
  cotizacionId: string
): Promise<{
  materiales: ItemExplosionInsumo[];
  manoDeObra: ItemExplosionInsumo[];
  herramientas: ItemExplosionInsumo[];
  subcontratos: ItemExplosionInsumo[];
  costoDirectoTotal: number;
}> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Obtener conceptos de la cotización que tengan producto_servicio_id
  const { data: conceptos, error } = await sb
    .from("cotizacion_conceptos")
    .select(`
      id,
      cantidad,
      descripcion,
      partida_id,
      cotizacion_partidas ( nombre ),
      producto_servicio_id,
      productos_servicios (
        id,
        nombre,
        conceptos_apu_composicion (
          id,
          cantidad,
          desperdicio_pct,
          rendimiento,
          costo_unitario_insumo,
          insumos (
            id,
            codigo,
            nombre,
            tipo,
            unidad,
            oficio,
            costo_proveedor
          )
        )
      )
    `)
    .eq("cotizacion_id", cotizacionId);

  if (error) throw new Error(error.message);

  const mapa = new Map<string, ItemExplosionInsumo>();
  let costoDirectoTotal = 0;

  for (const c of conceptos ?? []) {
    const cantConcepto = Number(c.cantidad || 0);
    const partidaNombre = c.cotizacion_partidas?.nombre || "General";
    const compApu = c.productos_servicios?.conceptos_apu_composicion || [];

    for (const item of compApu) {
      const ins = item.insumos;
      if (!ins) continue;

      const factorDesp = 1 + (Number(item.desperdicio_pct || 0) / 100);
      const rendimiento = Number(item.rendimiento || 1) <= 0 ? 1 : Number(item.rendimiento || 1);
      
      // Cantidad de insumo para toda la obra:
      const cantInsumoTotal = Math.round(((cantConcepto * Number(item.cantidad || 1)) / rendimiento) * factorDesp * 100) / 100;
      const cUnit = Number(item.costo_unitario_insumo || ins.costo_proveedor || 0);
      const imp = Math.round(cantInsumoTotal * cUnit * 100) / 100;

      costoDirectoTotal += imp;

      const actual = mapa.get(ins.id) || {
        insumoId: ins.id,
        codigo: ins.codigo || "S/C",
        nombre: ins.nombre,
        tipo: ins.tipo,
        unidad: ins.unidad,
        cantidadTotal: 0,
        costoUnitario: cUnit,
        importeTotal: 0,
        oficio: ins.oficio,
        partidasDondeSeUsa: [],
      };

      actual.cantidadTotal += cantInsumoTotal;
      actual.importeTotal += imp;
      if (!actual.partidasDondeSeUsa.includes(partidaNombre)) {
        actual.partidasDondeSeUsa.push(partidaNombre);
      }

      mapa.set(ins.id, actual);
    }
  }

  const todos = Array.from(mapa.values());

  return {
    materiales: todos.filter((i) => i.tipo === "material"),
    manoDeObra: todos.filter((i) => i.tipo === "mano_obra"),
    herramientas: todos.filter((i) => i.tipo === "herramienta_equipo" || i.tipo === "flete"),
    subcontratos: todos.filter((i) => i.tipo === "subcontrato"),
    costoDirectoTotal: Math.round(costoDirectoTotal * 100) / 100,
  };
}
