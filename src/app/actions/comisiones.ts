"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import type {
  Comision,
  ComisionPago,
  ComisionPagoDetalle,
  EstatusComision,
  MetodoPagoComision,
  ReglaComision,
  ResumenEstadoCuentaAsesor,
  TipoReglaComision,
} from "@/lib/types";

/**
 * Server Actions para el Módulo de Comisiones de Asesores
 */

// ============================================================
// 1. REGLAS Y PARAMETRIZACIÓN DE COMISIONES
// ============================================================

export async function listarReglasComision(): Promise<ReglaComision[]> {
  try {
    await requireAdmin();
  } catch (authErr: any) {
    console.warn("Aviso de sesión en listarReglasComision:", authErr?.message);
  }
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("comisiones_reglas")
    .select(`
      id,
      tipo,
      clave,
      etiqueta,
      porcentaje,
      asesor_id,
      activo,
      notas,
      created_at,
      updated_at,
      perfiles:asesor_id(nombre)
    `)
    .order("tipo", { ascending: true })
    .order("clave", { ascending: true });

  if (error) {
    console.error("Error al listar reglas de comisiones:", error.message);
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tipo: row.tipo as TipoReglaComision,
    clave: row.clave,
    etiqueta: row.etiqueta,
    porcentaje: Number(row.porcentaje || 0),
    asesorId: row.asesor_id,
    asesorNombre: row.perfiles?.nombre || null,
    activo: Boolean(row.activo),
    notas: row.notas || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function guardarReglaComision(datos: {
  id?: string;
  tipo: TipoReglaComision;
  clave: string;
  etiqueta: string;
  porcentaje: number;
  asesorId?: string | null;
  activo?: boolean;
  notas?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const payload = {
      tipo: datos.tipo,
      clave: datos.clave.trim().toLowerCase(),
      etiqueta: datos.etiqueta.trim(),
      porcentaje: Math.max(0, Math.min(100, Number(datos.porcentaje || 0))),
      asesor_id: datos.tipo === "asesor" ? datos.asesorId || null : null,
      activo: datos.activo !== undefined ? Boolean(datos.activo) : true,
      notas: datos.notas?.trim() || "",
      updated_at: new Date().toISOString(),
    };

    if (datos.id) {
      const { error } = await sb
        .from("comisiones_reglas")
        .update(payload)
        .eq("id", datos.id);
      if (error) throw new Error(error.message);
      revalidatePath("/comisiones");
      return { ok: true, id: datos.id };
    } else {
      const { data: nueva, error } = await sb
        .from("comisiones_reglas")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      revalidatePath("/comisiones");
      return { ok: true, id: nueva.id };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al guardar regla." };
  }
}

export async function eliminarReglaComision(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // Prohibir eliminar la regla global base
    const { data: regla } = await sb
      .from("comisiones_reglas")
      .select("tipo, clave")
      .eq("id", id)
      .maybeSingle();

    if (regla?.tipo === "global" && regla?.clave === "general") {
      return { ok: false, error: "La regla base general del sistema no puede ser eliminada." };
    }

    const { error } = await sb.from("comisiones_reglas").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al eliminar regla." };
  }
}

// ============================================================
// 2. CÁLCULO Y RESOLUCIÓN DE REGLAS DE COMISIÓN
// ============================================================

export async function resolverPorcentajeComision(params: {
  asesorId?: string | null;
  servicioTipo?: string | null;
}): Promise<{ porcentaje: number; reglaOrigen: string }> {
  const sb = supabaseServidor();

  // 1. Regla específica del asesor
  if (params.asesorId) {
    const { data: reglaAsesor } = await sb
      .from("comisiones_reglas")
      .select("porcentaje, etiqueta")
      .eq("tipo", "asesor")
      .eq("asesor_id", params.asesorId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (reglaAsesor) {
      return {
        porcentaje: Number(reglaAsesor.porcentaje),
        reglaOrigen: `Regla individual de asesor: ${reglaAsesor.etiqueta}`,
      };
    }
  }

  // 2. Regla por tipo de servicio
  if (params.servicioTipo) {
    const claveServicio = params.servicioTipo.trim().toLowerCase();
    const { data: reglaServicio } = await sb
      .from("comisiones_reglas")
      .select("porcentaje, etiqueta")
      .eq("tipo", "servicio")
      .eq("clave", claveServicio)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (reglaServicio) {
      return {
        porcentaje: Number(reglaServicio.porcentaje),
        reglaOrigen: `Regla de servicio: ${reglaServicio.etiqueta}`,
      };
    }
  }

  // 3. Regla global por defecto
  const { data: reglaGlobal } = await sb
    .from("comisiones_reglas")
    .select("porcentaje, etiqueta")
    .eq("tipo", "global")
    .eq("clave", "general")
    .eq("activo", true)
    .limit(1)
    .maybeSingle();

  if (reglaGlobal) {
    return {
      porcentaje: Number(reglaGlobal.porcentaje),
      reglaOrigen: `Regla global base: ${reglaGlobal.etiqueta}`,
    };
  }

  return { porcentaje: 5.0, reglaOrigen: "Regla por defecto de contingencia (5.0%)" };
}

// ============================================================
// 3. LISTADO DE COMISIONES Y ESTADO DE CUENTA
// ============================================================

export async function listarComisiones(filtros?: {
  asesorId?: string;
  estatus?: EstatusComision | "todas";
  fechaDesde?: string;
  fechaHasta?: string;
  busqueda?: string;
}): Promise<Comision[]> {
  try {
    try {
      await requireAdmin();
    } catch (authErr: any) {
      console.warn("Aviso de sesión en listarComisiones:", authErr?.message);
    }
    const sb = supabaseServidor();

    // 1. Limpieza preventiva: Las comisiones deben ser SOLO sobre remisiones o facturas, nunca sobre recibos
    try {
      await sb.from("comisiones").delete().is("remision_factura_id", null);
    } catch (eDel) {
      console.warn("Aviso al depurar comisiones huérfanas de recibos:", eDel);
    }

    // 2. Consultar comisiones directamente (100% plano, sin ningún join en PostgREST)
    let query = sb
      .from("comisiones")
      .select("*")
      .not("remision_factura_id", "is", null)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros?.asesorId && filtros.asesorId !== "todos") {
      query = query.eq("asesor_id", filtros.asesorId);
    }

    if (filtros?.estatus && filtros.estatus !== "todas") {
      query = query.eq("estatus", filtros.estatus);
    }

    if (filtros?.fechaDesde) {
      query = query.gte("fecha", filtros.fechaDesde);
    }

    if (filtros?.fechaHasta) {
      query = query.lte("fecha", filtros.fechaHasta);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("Error al consultar comisiones:", error.message);
      throw new Error("ERROR_QUERY_COMISIONES: " + error.message);
    }

    if (!rows || rows.length === 0) {
      console.warn("Aviso: comisiones devolvio 0 filas en query");
      return [];
    }

    // 2. Extraer IDs vinculados para enriquecer en paralelo sin joins problemáticos
    const asesorIds = Array.from(new Set(rows.map((r: any) => r.asesor_id).filter(Boolean)));
    const remisionIds = Array.from(new Set(rows.map((r: any) => r.remision_factura_id).filter(Boolean)));
    const reciboIds = Array.from(new Set(rows.map((r: any) => r.recibo_pago_id).filter(Boolean)));
    const cotizacionIds = Array.from(new Set(rows.map((r: any) => r.cotizacion_id).filter(Boolean)));
    const ordenTrabajoIds = Array.from(new Set(rows.map((r: any) => r.orden_trabajo_id).filter(Boolean)));

    const [resPerfiles, resRemisiones, resRecibos, resCotizaciones, resOrdenes] = await Promise.all([
      asesorIds.length > 0
        ? sb.from("perfiles").select("id, nombre, telefono").in("id", asesorIds)
        : Promise.resolve({ data: [] }),
      remisionIds.length > 0
        ? sb.from("remisiones_facturas").select("id, folio, tipo, fecha, monto_subtotal, monto_total").in("id", remisionIds)
        : Promise.resolve({ data: [] }),
      reciboIds.length > 0
        ? sb.from("recibos_pago").select("id, folio, concepto, monto, fecha_pago, cliente_nombre").in("id", reciboIds)
        : Promise.resolve({ data: [] }),
      cotizacionIds.length > 0
        ? sb.from("cotizaciones").select("id, token, servicio_tipo, prospecto_id").in("id", cotizacionIds)
        : Promise.resolve({ data: [] }),
      ordenTrabajoIds.length > 0
        ? sb.from("ordenes_trabajo").select("id, folio, titulo").in("id", ordenTrabajoIds)
        : Promise.resolve({ data: [] }),
    ]);

    const mapPerf = new Map<string, any>((resPerfiles.data || []).map((p: any) => [p.id, p]));
    const mapRem = new Map<string, any>((resRemisiones.data || []).map((r: any) => [r.id, r]));
    const mapRec = new Map<string, any>((resRecibos.data || []).map((r: any) => [r.id, r]));
    const mapCot = new Map<string, any>((resCotizaciones.data || []).map((r: any) => [r.id, r]));
    const mapOt = new Map<string, any>((resOrdenes.data || []).map((r: any) => [r.id, r]));

    // Extraer prospectoIds de las cotizaciones
    const prospectoIds = Array.from(
      new Set(
        Array.from(mapCot.values())
          .map((c: any) => c.prospecto_id)
          .filter(Boolean)
      )
    );

    let mapPros = new Map<string, string>();
    if (prospectoIds.length > 0) {
      try {
        const { data: pros } = await sb
          .from("prospectos")
          .select("id, nombre, primer_apellido, segundo_apellido")
          .in("id", prospectoIds);
        for (const p of pros || []) {
          const nom = [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
          if (nom) mapPros.set(p.id, nom);
        }
      } catch {
        // Ignorar fallo de resolución secundaria
      }
    }

    // 3. Mapeo final enriquecido
    const lista: Comision[] = rows.map((row: any) => {
      const perf = row.asesor_id ? mapPerf.get(row.asesor_id) : null;
      const rem = row.remision_factura_id ? mapRem.get(row.remision_factura_id) : null;
      const rec = row.recibo_pago_id ? mapRec.get(row.recibo_pago_id) : null;
      const cot = row.cotizacion_id ? mapCot.get(row.cotizacion_id) : null;
      const ot = row.orden_trabajo_id ? mapOt.get(row.orden_trabajo_id) : null;

      let nombreCliente = "";
      if (cot?.prospecto_id && mapPros.has(cot.prospecto_id)) {
        nombreCliente = mapPros.get(cot.prospecto_id)!;
      }
      if (!nombreCliente && rec?.cliente_nombre) {
        nombreCliente = rec.cliente_nombre;
      }
      if (!nombreCliente && row.detalles_calculo?.clienteNombre) {
        nombreCliente = row.detalles_calculo.clienteNombre;
      }
      if (!nombreCliente) {
        nombreCliente = "Cliente Sauceda";
      }

      const folioCalculado =
        rem?.folio ||
        rec?.folio ||
        ot?.folio ||
        row.detalles_calculo?.folio ||
        "S/F";
      const tipoCalculado =
        rem?.tipo || (row.recibo_pago_id ? "recibo" : "remision");
      const fechaCalculada = rem?.fecha || rec?.fecha_pago || row.fecha;

      return {
        id: row.id,
        remisionFacturaId: row.remision_factura_id,
        reciboPagoId: row.recibo_pago_id,
        remisionFolio: folioCalculado,
        remisionTipo: tipoCalculado,
        remisionFecha: fechaCalculada,
        asesorId: row.asesor_id,
        asesorNombre: perf?.nombre || "Sin Asesor",
        asesorTelefono: perf?.telefono || null,
        cotizacionId: row.cotizacion_id,
        cotizacionToken: cot?.token || null,
        expedienteId: row.expediente_id,
        ordenTrabajoId: row.orden_trabajo_id,
        ordenTrabajoFolio: ot?.folio || null,
        clienteNombre: nombreCliente,
        clienteEmpresa: null,
        servicioTipo: cot?.servicio_tipo || null,
        fecha: row.fecha,
        montoVenta: Number(row.monto_venta || 0),
        costoProveedor: Number(row.costo_proveedor || 0),
        comisionBancaria: Number(row.comision_bancaria || 0),
        baseComisionable: Number(row.base_comisionable || row.monto_venta || 0),
        porcentajeComision: Number(row.porcentaje_comision || 0),
        montoComision: Number(row.monto_comision || 0),
        montoPagado: Number(row.monto_pagado || 0),
        saldoPendiente: Number(row.saldo_pendiente || 0),
        estatus: row.estatus as EstatusComision,
        esAjusteManual: Boolean(row.es_ajuste_manual),
        motivoAjuste: row.motivo_ajuste || "",
        detallesCalculo: row.detalles_calculo || {},
        notas: row.notas || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    // Filtro de búsqueda rápida en memoria por texto si se especifica
    if (filtros?.busqueda && filtros.busqueda.trim()) {
      const q = filtros.busqueda.trim().toLowerCase();
      return lista.filter(
        (c) =>
          c.remisionFolio?.toLowerCase().includes(q) ||
          c.clienteNombre.toLowerCase().includes(q) ||
          c.asesorNombre.toLowerCase().includes(q) ||
          (c.clienteEmpresa && c.clienteEmpresa.toLowerCase().includes(q)) ||
          (c.servicioTipo && c.servicioTipo.toLowerCase().includes(q))
      );
    }

    return lista;
  } catch (err: any) {
    console.error("Error definitivo en listarComisiones:", err);
    throw new Error("ERROR_LISTAR_COMISIONES: " + (err?.message || String(err)));
  }
}

export async function obtenerResumenEstadoCuenta(filtros?: {
  asesorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}): Promise<{
  general: {
    totalVentas: number;
    totalComisiones: number;
    totalPagado: number;
    saldoPendiente: number;
    comisionesCount: number;
    pendientesCount: number;
  };
  porAsesor: ResumenEstadoCuentaAsesor[];
}> {
  try {
    const comisiones = await listarComisiones({
      asesorId: filtros?.asesorId,
      fechaDesde: filtros?.fechaDesde,
      fechaHasta: filtros?.fechaHasta,
    });

    const general = comisiones.reduce(
      (acc, c) => {
        if (c.estatus !== "cancelada") {
          acc.totalVentas += c.montoVenta;
          acc.totalComisiones += c.montoComision;
          acc.totalPagado += c.montoPagado;
          acc.saldoPendiente += c.saldoPendiente;
          acc.comisionesCount += 1;
          if (c.saldoPendiente > 0) acc.pendientesCount += 1;
        }
        return acc;
      },
      {
        totalVentas: 0,
        totalComisiones: 0,
        totalPagado: 0,
        saldoPendiente: 0,
        comisionesCount: 0,
        pendientesCount: 0,
      }
    );

    // Agrupar por Asesor
    const asesorMap = new Map<string, ResumenEstadoCuentaAsesor>();
    for (const c of comisiones) {
      if (c.estatus === "cancelada") continue;
      let entry = asesorMap.get(c.asesorId);
      if (!entry) {
        entry = {
          asesorId: c.asesorId,
          asesorNombre: c.asesorNombre,
          asesorTelefono: c.asesorTelefono,
          totalVentas: 0,
          totalComisiones: 0,
          totalPagado: 0,
          saldoPendiente: 0,
          comisionesCount: 0,
          pendientesCount: 0,
        };
        asesorMap.set(c.asesorId, entry);
      }
      entry.totalVentas += c.montoVenta;
      entry.totalComisiones += c.montoComision;
      entry.totalPagado += c.montoPagado;
      entry.saldoPendiente += c.saldoPendiente;
      entry.comisionesCount += 1;
      if (c.saldoPendiente > 0) entry.pendientesCount += 1;
    }

    const porAsesor = Array.from(asesorMap.values()).sort(
      (a, b) => b.saldoPendiente - a.saldoPendiente
    );

    return { general, porAsesor };
  } catch (err: any) {
    console.error("Error en obtenerResumenEstadoCuenta:", err);
    return {
      general: {
        totalVentas: 0,
        totalComisiones: 0,
        totalPagado: 0,
        saldoPendiente: 0,
        comisionesCount: 0,
        pendientesCount: 0,
      },
      porAsesor: [],
    };
  }
}

// ============================================================
// 4. AJUSTE MANUAL DE COMISIONES (CASOS PARTICULARES)
// ============================================================

export async function ajustarComisionManual(datos: {
  comisionId: string;
  porcentajeComision: number;
  montoComision: number;
  motivoAjuste: string;
  notas?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: comisionActual, error: errBusq } = await sb
      .from("comisiones")
      .select("id, monto_pagado, estatus")
      .eq("id", datos.comisionId)
      .single();

    if (errBusq || !comisionActual) {
      return { ok: false, error: "Comisión no encontrada." };
    }

    const nuevoMonto = Math.max(0, Number(datos.montoComision || 0));
    const montoPagado = Number(comisionActual.monto_pagado || 0);
    const nuevoSaldo = Math.max(0, nuevoMonto - montoPagado);

    let nuevoEstatus = comisionActual.estatus;
    if (nuevoEstatus !== "cancelada") {
      if (montoPagado >= nuevoMonto) nuevoEstatus = "pagada";
      else if (montoPagado > 0) nuevoEstatus = "parcial";
      else nuevoEstatus = "pendiente";
    }

    const { error: errUpd } = await sb
      .from("comisiones")
      .update({
        porcentaje_comision: Number(datos.porcentajeComision || 0),
        monto_comision: nuevoMonto,
        saldo_pendiente: nuevoSaldo,
        estatus: nuevoEstatus,
        es_ajuste_manual: true,
        motivo_ajuste: datos.motivoAjuste.trim(),
        notas: datos.notas !== undefined ? datos.notas.trim() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", datos.comisionId);

    if (errUpd) throw new Error(errUpd.message);

    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al ajustar la comisión." };
  }
}

// ============================================================
// 5. REGISTRO Y APLICACIÓN DE PAGOS / LIQUIDACIONES
// ============================================================

export async function registrarPagoComisiones(datos: {
  asesorId: string;
  fechaPago?: string;
  monto: number;
  metodoPago: MetodoPagoComision;
  referencia?: string;
  notas?: string;
  // Opcional: lista de aplicaciones específicas. Si no viene, se distribuye en las comisiones más antiguas.
  aplicaciones?: { comisionId: string; monto: number }[];
}): Promise<{ ok: boolean; pagoId?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const montoTotal = Number(datos.monto || 0);
    if (montoTotal <= 0) {
      return { ok: false, error: "El monto del pago debe ser mayor a cero." };
    }

    // 1. Determinar cómo se distribuye el pago entre las comisiones pendientes
    let aplicacionesFinales: { comisionId: string; monto: number }[] = [];

    if (datos.aplicaciones && datos.aplicaciones.length > 0) {
      aplicacionesFinales = datos.aplicaciones.filter((a) => a.monto > 0);
    } else {
      // Distribución automática por antigüedad
      const { data: pendientes, error: errPend } = await sb
        .from("comisiones")
        .select("id, saldo_pendiente, monto_comision, monto_pagado")
        .eq("asesor_id", datos.asesorId)
        .in("estatus", ["pendiente", "parcial"])
        .gt("saldo_pendiente", 0)
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true });

      if (errPend) throw new Error(errPend.message);

      let remanente = montoTotal;
      for (const com of pendientes || []) {
        if (remanente <= 0) break;
        const saldo = Number(com.saldo_pendiente || 0);
        const aPagar = Math.min(saldo, remanente);
        aplicacionesFinales.push({ comisionId: com.id, monto: aPagar });
        remanente -= aPagar;
      }
    }

    if (aplicacionesFinales.length === 0) {
      return {
        ok: false,
        error: "No hay comisiones pendientes seleccionadas o disponibles para aplicar este pago.",
      };
    }

    // 2. Insertar cabecera de pago
    const { data: pago, error: errPago } = await sb
      .from("comisiones_pagos")
      .insert({
        asesor_id: datos.asesorId,
        fecha_pago: datos.fechaPago || new Date().toISOString().split("T")[0],
        monto: montoTotal,
        metodo_pago: datos.metodoPago,
        referencia: datos.referencia?.trim() || "",
        notas: datos.notas?.trim() || "",
      })
      .select("id")
      .single();

    if (errPago) throw new Error(errPago.message);

    // 3. Insertar detalles de aplicación
    const detallesInsert = aplicacionesFinales.map((a) => ({
      pago_id: pago.id,
      comision_id: a.comisionId,
      monto_aplicado: a.monto,
    }));

    const { error: errDet } = await sb
      .from("comisiones_pagos_detalle")
      .insert(detallesInsert);

    if (errDet) throw new Error(errDet.message);

    revalidatePath("/comisiones");
    return { ok: true, pagoId: pago.id };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al registrar el pago." };
  }
}

export async function listarPagosComisiones(asesorId?: string): Promise<ComisionPago[]> {
  try {
    try {
      await requireAdmin();
    } catch (authErr: any) {
      console.warn("Aviso de sesión en listarPagosComisiones:", authErr?.message);
    }
    const sb = supabaseServidor();

    let query = sb
      .from("comisiones_pagos")
      .select("*")
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false });

    if (asesorId && asesorId !== "todos") {
      query = query.eq("asesor_id", asesorId);
    }

    const { data: pagosRows, error: errPagos } = await query;
    if (errPagos) {
      console.warn("Aviso al listar pagos de comisiones:", errPagos.message);
      return [];
    }

    if (!pagosRows || pagosRows.length === 0) {
      return [];
    }

    const pagoIds = pagosRows.map((p: any) => p.id);
    const asesorIds = Array.from(new Set(pagosRows.map((p: any) => p.asesor_id).filter(Boolean)));

    const [resPerfiles, resDetalles] = await Promise.all([
      asesorIds.length > 0
        ? sb.from("perfiles").select("id, nombre").in("id", asesorIds)
        : Promise.resolve({ data: [] }),
      pagoIds.length > 0
        ? sb.from("comisiones_pagos_detalle").select("id, pago_id, comision_id, monto_aplicado, created_at").in("pago_id", pagoIds)
        : Promise.resolve({ data: [] }),
    ]);

    const mapPerfiles = new Map<string, any>((resPerfiles.data || []).map((p: any) => [p.id, p]));
    const detallesPorPago = new Map<string, any[]>();
    for (const d of resDetalles.data || []) {
      const list = detallesPorPago.get(d.pago_id) || [];
      list.push(d);
      detallesPorPago.set(d.pago_id, list);
    }

    return pagosRows.map((row: any) => {
      const perf = row.asesor_id ? mapPerfiles.get(row.asesor_id) : null;
      const dets = detallesPorPago.get(row.id) || [];
      return {
        id: row.id,
        asesorId: row.asesor_id,
        asesorNombre: perf?.nombre || "Asesor Desconocido",
        fechaPago: row.fecha_pago,
        monto: Number(row.monto || 0),
        metodoPago: row.metodo_pago as MetodoPagoComision,
        referencia: row.referencia || "",
        comprobanteUrl: row.comprobante_url || "",
        notas: row.notas || "",
        detalles: dets.map((d: any) => ({
          id: d.id,
          pagoId: d.pago_id,
          comisionId: d.comision_id,
          remisionFolio: "S/F",
          montoAplicado: Number(d.monto_aplicado || 0),
          createdAt: d.created_at,
        })),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  } catch (err: any) {
    console.error("Error definitivo en listarPagosComisiones:", err);
    return [];
  }
}

// ============================================================
// 6. SINCRONIZACIÓN AUTOMÁTICA DE REMISIONES/FACTURAS
// ============================================================

export async function sincronizarComisionParaRemision(
  remisionId: string
): Promise<{ ok: boolean; comisionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener datos de la remisión (consulta plana, sin joins de PostgREST)
    const { data: rem, error: errRem } = await sb
      .from("remisiones_facturas")
      .select("id, folio, tipo, fecha, monto_subtotal, monto_total, costo_financiero, cotizacion_id, expediente_id, orden_trabajo_id")
      .eq("id", remisionId)
      .single();

    if (errRem || !rem) {
      return { ok: false, error: "Remisión no encontrada." };
    }

    // 1.1 Resolver datos relacionados por separado (evita fallos de joins embebidos en PostgREST)
    let servicioTipoRem: string | null = null;
    let asesorId: string | null = null;
    let costoProveedorRem = 0;

    if (rem.cotizacion_id) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("servicio_tipo, prospecto_id")
        .eq("id", rem.cotizacion_id)
        .maybeSingle();
      servicioTipoRem = cot?.servicio_tipo || null;
      if (cot?.prospecto_id) {
        const { data: pros } = await sb
          .from("prospectos")
          .select("asesor_id")
          .eq("id", cot.prospecto_id)
          .maybeSingle();
        asesorId = pros?.asesor_id || null;
      }
    }

    if (!asesorId && rem.expediente_id) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("asesor_id")
        .eq("id", rem.expediente_id)
        .maybeSingle();
      asesorId = exp?.asesor_id || null;
    }

    if (rem.orden_trabajo_id) {
      const { data: ot } = await sb
        .from("ordenes_trabajo")
        .select("asesor_responsable_id, asesor_ejecutor_id, costo_proveedor")
        .eq("id", rem.orden_trabajo_id)
        .maybeSingle();
      costoProveedorRem = Number(ot?.costo_proveedor || 0);
      if (!asesorId) {
        asesorId = ot?.asesor_responsable_id || ot?.asesor_ejecutor_id || null;
      }
    }

    if (!asesorId) {
      // Si no hay asesor asignado explícito, buscar el primer asesor activo
      const { data: defaultAsesor } = await sb
        .from("perfiles")
        .select("id")
        .eq("rol", "asesor")
        .eq("activo", true)
        .order("nombre", { ascending: true })
        .limit(1)
        .maybeSingle();

      asesorId = defaultAsesor?.id || null;
    }

    if (!asesorId) {
      return { ok: false, error: "No se encontró ningún asesor activo para comisionar la venta." };
    }

    // 3. Verificar si ya existe comisión registrada
    const { data: comisionExistente } = await sb
      .from("comisiones")
      .select("id, es_ajuste_manual, monto_comision, monto_pagado")
      .eq("remision_factura_id", remisionId)
      .maybeSingle();

    const montoVenta = Number(rem.monto_total || rem.monto_subtotal || 0);
    const comisionBancariaRem = Number(rem.costo_financiero || 0);
    const baseComisionableRem = Math.max(0, montoVenta - costoProveedorRem - comisionBancariaRem);
    const servicioTipo = servicioTipoRem;

    if (comisionExistente) {
      // Si ya existe y fue ajustada manualmente, no sobreescribir el monto ajustado
      if (comisionExistente.es_ajuste_manual) {
        return { ok: true, comisionId: comisionExistente.id };
      }

      // Si no es manual, sincronizar con la venta actualizada
      const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({
        asesorId,
        servicioTipo,
      });

      const nuevoMontoComision = Math.round(baseComisionableRem * (porcentaje / 100) * 100) / 100;
      const pagado = Number(comisionExistente.monto_pagado || 0);

      await sb
        .from("comisiones")
        .update({
          asesor_id: asesorId,
          monto_venta: montoVenta,
          costo_proveedor: costoProveedorRem,
          comision_bancaria: comisionBancariaRem,
          base_comisionable: baseComisionableRem,
          porcentaje_comision: porcentaje,
          monto_comision: nuevoMontoComision,
          saldo_pendiente: Math.max(0, nuevoMontoComision - pagado),
          estatus:
            pagado >= nuevoMontoComision
              ? "pagada"
              : pagado > 0
              ? "parcial"
              : "pendiente",
          detalles_calculo: { reglaOrigen, fechaCalculo: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", comisionExistente.id);

      return { ok: true, comisionId: comisionExistente.id };
    }

    // 4. Crear nueva comisión
    const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({
      asesorId,
      servicioTipo,
    });

    const montoComision = Math.round(baseComisionableRem * (porcentaje / 100) * 100) / 100;

    const { data: nuevaCom, error: errIns } = await sb
      .from("comisiones")
      .insert({
        remision_factura_id: rem.id,
        asesor_id: asesorId,
        cotizacion_id: rem.cotizacion_id,
        expediente_id: rem.expediente_id,
        orden_trabajo_id: rem.orden_trabajo_id,
        fecha: rem.fecha || new Date().toISOString().split("T")[0],
        monto_venta: montoVenta,
        costo_proveedor: costoProveedorRem,
        comision_bancaria: comisionBancariaRem,
        base_comisionable: baseComisionableRem,
        porcentaje_comision: porcentaje,
        monto_comision: montoComision,
        monto_pagado: 0.0,
        saldo_pendiente: montoComision,
        estatus: "pendiente",
        es_ajuste_manual: false,
        detalles_calculo: { reglaOrigen, fechaCalculo: new Date().toISOString() },
      })
      .select("id")
      .single();

    if (errIns) throw new Error(errIns.message);

    return { ok: true, comisionId: nuevaCom.id };
  } catch (err: any) {
    console.error("Error al sincronizar comisión de remisión:", err.message);
    return { ok: false, error: err.message };
  }
}

export async function sincronizarComisionParaRecibo(
  reciboId: string
): Promise<{ ok: boolean; comisionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener datos del recibo (consulta plana, sin joins de PostgREST)
    const { data: rec, error: errRec } = await sb
      .from("recibos_pago")
      .select("id, folio, monto, concepto, fecha_pago, cotizacion_id, expediente_id, orden_trabajo_id, cliente_nombre")
      .eq("id", reciboId)
      .single();

    if (errRec || !rec) {
      return { ok: false, error: "Recibo de pago no encontrado." };
    }

    // 1.1 Resolver datos relacionados por separado (evita fallos de joins embebidos en PostgREST)
    let servicioTipoRec: string | null = null;
    let asesorId: string | null = null;
    let costoProveedorRec = 0;

    if (rec.orden_trabajo_id) {
      const { data: ot } = await sb
        .from("ordenes_trabajo")
        .select("asesor_responsable_id, asesor_ejecutor_id, prospecto_id, costo_proveedor")
        .eq("id", rec.orden_trabajo_id)
        .maybeSingle();
      costoProveedorRec = Number(ot?.costo_proveedor || 0);
      asesorId = ot?.asesor_ejecutor_id || ot?.asesor_responsable_id || null;
      if (!asesorId && ot?.prospecto_id) {
        const { data: prosOt } = await sb
          .from("prospectos")
          .select("asesor_id")
          .eq("id", ot.prospecto_id)
          .maybeSingle();
        asesorId = prosOt?.asesor_id || null;
      }
    }

    if (rec.cotizacion_id) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("servicio_tipo, prospecto_id")
        .eq("id", rec.cotizacion_id)
        .maybeSingle();
      servicioTipoRec = cot?.servicio_tipo || null;
      if (!asesorId && cot?.prospecto_id) {
        const { data: pros } = await sb
          .from("prospectos")
          .select("asesor_id")
          .eq("id", cot.prospecto_id)
          .maybeSingle();
        asesorId = pros?.asesor_id || null;
      }
    }

    if (!asesorId && rec.expediente_id) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("asesor_id")
        .eq("id", rec.expediente_id)
        .maybeSingle();
      asesorId = exp?.asesor_id || null;
    }

    if (!asesorId) {
      const { data: defaultAsesor } = await sb
        .from("perfiles")
        .select("id")
        .eq("rol", "asesor")
        .eq("activo", true)
        .order("nombre", { ascending: true })
        .limit(1)
        .maybeSingle();

      asesorId = defaultAsesor?.id || null;
    }

    if (!asesorId) {
      return { ok: false, error: "No se encontró ningún asesor activo para comisionar la venta." };
    }

    // 3. Verificar si ya existe comisión registrada para este recibo
    const { data: comisionExistente } = await sb
      .from("comisiones")
      .select("id, es_ajuste_manual, monto_comision, monto_pagado")
      .eq("recibo_pago_id", reciboId)
      .maybeSingle();

    const montoVenta = Number(rec.monto || 0);
    const baseComisionableRec = Math.max(0, montoVenta - costoProveedorRec);
    const servicioTipo = servicioTipoRec;

    if (comisionExistente) {
      if (comisionExistente.es_ajuste_manual) {
        return { ok: true, comisionId: comisionExistente.id };
      }

      const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({
        asesorId,
        servicioTipo,
      });

      const nuevoMontoComision = Math.round(baseComisionableRec * (porcentaje / 100) * 100) / 100;
      const pagado = Number(comisionExistente.monto_pagado || 0);

      await sb
        .from("comisiones")
        .update({
          asesor_id: asesorId,
          monto_venta: montoVenta,
          costo_proveedor: costoProveedorRec,
          comision_bancaria: 0,
          base_comisionable: baseComisionableRec,
          porcentaje_comision: porcentaje,
          monto_comision: nuevoMontoComision,
          saldo_pendiente: Math.max(0, nuevoMontoComision - pagado),
          estatus:
            pagado >= nuevoMontoComision
              ? "pagada"
              : pagado > 0
              ? "parcial"
              : "pendiente",
          detalles_calculo: {
            reglaOrigen,
            origen: "recibo_pago",
            folio: rec.folio,
            fechaCalculo: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", comisionExistente.id);

      revalidatePath("/comisiones");
      return { ok: true, comisionId: comisionExistente.id };
    }

    // 4. Crear nueva comisión
    const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({
      asesorId,
      servicioTipo,
    });

    const montoComision = Math.round(baseComisionableRec * (porcentaje / 100) * 100) / 100;

    const { data: nuevaCom, error: errIns } = await sb
      .from("comisiones")
      .insert({
        recibo_pago_id: rec.id,
        asesor_id: asesorId,
        cotizacion_id: rec.cotizacion_id,
        expediente_id: rec.expediente_id,
        orden_trabajo_id: rec.orden_trabajo_id,
        fecha: rec.fecha_pago || new Date().toISOString().split("T")[0],
        monto_venta: montoVenta,
        costo_proveedor: costoProveedorRec,
        comision_bancaria: 0,
        base_comisionable: baseComisionableRec,
        porcentaje_comision: porcentaje,
        monto_comision: montoComision,
        monto_pagado: 0.0,
        saldo_pendiente: montoComision,
        estatus: "pendiente",
        es_ajuste_manual: false,
        detalles_calculo: {
          reglaOrigen,
          origen: "recibo_pago",
          folio: rec.folio,
          fechaCalculo: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (errIns) throw new Error(errIns.message);

    revalidatePath("/comisiones");
    return { ok: true, comisionId: nuevaCom.id };
  } catch (err: any) {
    console.error("Error al sincronizar comisión de recibo:", err.message);
    return { ok: false, error: err.message };
  }
}

export async function sincronizarTodasLasRemisionesPendientes(): Promise<{
  ok: boolean;
  creadas: number;
  actualizadas: number;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Invocar función SQL global si existe
    try {
      await sb.rpc("fn_sincronizar_comisiones_todas");
    } catch (e: any) {
      console.warn("RPC fn_sincronizar_comisiones_todas:", e?.message);
    }

    let procesadas = 0;

    // 1. Limpiar comisiones de recibos si existieran
    try {
      await sb.from("comisiones").delete().is("remision_factura_id", null);
    } catch {}

    // 2. Procesar remisiones_facturas (ÚNICO origen oficial de comisiones para evitar duplicados)
    const { data: remisiones } = await sb
      .from("remisiones_facturas")
      .select("id");

    for (const r of remisiones || []) {
      const res = await sincronizarComisionParaRemision(r.id);
      if (res.ok) procesadas++;
    }

    revalidatePath("/comisiones");
    return { ok: true, creadas: procesadas, actualizadas: 0 };
  } catch (err: any) {
    return { ok: false, creadas: 0, actualizadas: 0, error: err.message };
  }
}
