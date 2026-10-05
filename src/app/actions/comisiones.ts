"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import type {
  Comision,
  ComisionAnticipo,
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
      monto_fijo,
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
    montoFijo: Number(row.monto_fijo || 0),
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
  porcentaje?: number;
  montoFijo?: number;
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
      monto_fijo: Math.max(0, Number(datos.montoFijo || 0)),
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

/**
 * Guarda o actualiza de manera directa la tarifa fija de comisión para inspecciones técnicas.
 */
export async function guardarTarifaInspeccionGeneral(
  montoFijo: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const montoValido = Math.max(0, Number(montoFijo || 0));

    // Buscar si ya existe la regla general de inspección
    const { data: existente } = await sb
      .from("comisiones_reglas")
      .select("id")
      .eq("tipo", "inspeccion")
      .eq("clave", "general")
      .maybeSingle();

    if (existente) {
      const { error: errUpd } = await sb
        .from("comisiones_reglas")
        .update({
          monto_fijo: montoValido,
          activo: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id);

      if (errUpd) throw new Error(errUpd.message);
    } else {
      const { error: errIns } = await sb
        .from("comisiones_reglas")
        .insert({
          tipo: "inspeccion",
          clave: "general",
          etiqueta: "Comisión Fija por Inspección Técnica",
          monto_fijo: montoValido,
          porcentaje: 0.0,
          activo: true,
          notas: "Tarifa fija asignada al asesor técnico por cada inspección técnica ejecutada",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (errIns) throw new Error(errIns.message);
    }

    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    console.error("Error al guardar tarifa de inspección:", err);
    return { ok: false, error: err.message || "Error al guardar tarifa." };
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

/** Usuarios activos y si generan comisiones (ventas e inspecciones). */
export async function listarConfigAsesoresComisiones(): Promise<
  { id: string; nombre: string; rol: string; generaComisiones: boolean }[]
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, rol, genera_comisiones")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((p: any) => ({
    id: p.id,
    nombre: p.nombre || "Sin nombre",
    rol: p.rol || "",
    generaComisiones: Boolean(p.genera_comisiones),
  }));
}

export async function actualizarGeneraComisiones(
  perfilId: string,
  generaComisiones: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { error } = await sb
      .from("perfiles")
      .update({ genera_comisiones: generaComisiones })
      .eq("id", perfilId);
    if (error) throw new Error(error.message);
    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "No se pudo actualizar el asesor." };
  }
}

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

/**
 * Resuelve la tarifa fija asignada para una comisión por inspección técnica ejecutada.
 * Busca primero si existe una regla por asesor y luego la regla general de inspección.
 */
export async function resolverComisionInspeccion(params: {
  asesorId?: string | null;
}): Promise<{ montoFijo: number; reglaOrigen: string }> {
  const sb = supabaseServidor();

  // 1. Regla específica del asesor para inspecciones
  if (params.asesorId) {
    const { data: reglaAsesor } = await sb
      .from("comisiones_reglas")
      .select("monto_fijo, etiqueta")
      .eq("tipo", "inspeccion")
      .eq("asesor_id", params.asesorId)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (reglaAsesor && Number(reglaAsesor.monto_fijo) > 0) {
      return {
        montoFijo: Number(reglaAsesor.monto_fijo),
        reglaOrigen: `Regla individual de asesor: ${reglaAsesor.etiqueta}`,
      };
    }
  }

  // 2. Regla general para inspecciones técnicas
  const { data: reglaGeneral } = await sb
    .from("comisiones_reglas")
    .select("monto_fijo, etiqueta")
    .eq("tipo", "inspeccion")
    .eq("clave", "general")
    .eq("activo", true)
    .limit(1)
    .maybeSingle();

  if (reglaGeneral && Number(reglaGeneral.monto_fijo) > 0) {
    return {
      montoFijo: Number(reglaGeneral.monto_fijo),
      reglaOrigen: `Regla general de inspección: ${reglaGeneral.etiqueta}`,
    };
  }

  // Fallback por defecto si aún no estuviera configurada
  return { montoFijo: 150.0, reglaOrigen: "Tarifa estándar por defecto ($150.00 MXN)" };
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

    // 1. Limpieza preventiva: Las comisiones deben ser SOLO sobre remisiones/facturas o inspecciones, nunca sobre recibos huérfanos
    try {
      await sb
        .from("comisiones")
        .delete()
        .is("remision_factura_id", null)
        .is("cita_id", null)
        .not("recibo_pago_id", "is", null);
    } catch (eDel) {
      console.warn("Aviso al depurar comisiones huérfanas de recibos:", eDel);
    }

    // 1c. Reasignación: toda comisión de inspección debe seguir al asesor actual
    // de su cita, sin importar el estado de la cita ni el límite de la
    // auto-sincronización anterior. Solo se mueven las que no tienen pagos
    // ni ajuste manual.
    try {
      const { data: comsInsp } = await sb
        .from("comisiones")
        .select("id, cita_id, asesor_id")
        .not("cita_id", "is", null)
        .eq("tipo_comision", "inspeccion")
        .eq("es_ajuste_manual", false)
        .eq("monto_pagado", 0)
        .neq("estatus", "cancelada");

      const citaIds = Array.from(new Set((comsInsp || []).map((c: any) => c.cita_id)));
      if (citaIds.length > 0) {
        const { data: citasRe } = await sb
          .from("agenda_citas")
          .select("id, perfil_id, asignados_ids")
          .in("id", citaIds);
        const mapCitas = new Map<string, any>((citasRe || []).map((c: any) => [c.id, c]));
        const comisionables = await idsAsesoresComisionables(sb);

        for (const com of comsInsp || []) {
          const cita = mapCitas.get(com.cita_id);
          if (!cita) continue;
          const asignados: string[] = Array.isArray(cita.asignados_ids) ? cita.asignados_ids : [];
          // Si el asesor de la comisión sigue asignado a la cita, no se toca.
          if (com.asesor_id && (com.asesor_id === cita.perfil_id || asignados.includes(com.asesor_id))) continue;
          const nuevoAsesor = cita.perfil_id || asignados[0];
          if (!nuevoAsesor || nuevoAsesor === com.asesor_id) continue;

          // El nuevo responsable no genera comisiones: la comisión se quita.
          if (comisionables && !comisionables.has(nuevoAsesor)) {
            await quitarComisionesNoComisionables(sb, "cita_id", com.cita_id);
            continue;
          }

          const { error: errRe } = await sb
            .from("comisiones")
            .update({ asesor_id: nuevoAsesor, updated_at: new Date().toISOString() })
            .eq("id", com.id);
          if (errRe) console.warn("Aviso al reasignar comisión de inspección:", errRe.message);
        }
      }
    } catch (eReasig) {
      console.warn("Aviso al reconciliar asesores de comisiones de inspección:", eReasig);
    }

    // 2. Consultar comisiones directamente (100% plano, sin ningún join en PostgREST)
    let query = sb
      .from("comisiones")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros?.asesorId && filtros.asesorId !== "todos") {
      query = query.eq("asesor_id", filtros.asesorId);
    }

    if (filtros?.estatus && filtros.estatus !== "todas") {
      query = query.eq("estatus", filtros.estatus);
    } else {
      // Las canceladas se ocultan salvo que se filtren explícitamente
      query = query.neq("estatus", "cancelada");
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
    const citaIds = Array.from(new Set(rows.map((r: any) => r.cita_id).filter(Boolean)));

    const [resPerfiles, resRemisiones, resRecibos, resCotizaciones, resOrdenes, resCitas] = await Promise.all([
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
      citaIds.length > 0
        ? sb.from("agenda_citas").select("id, fecha, hora_inicio, tipo_cita, cliente_nombre, fraccionamiento, expediente_id, prospecto_id, notas").in("id", citaIds)
        : Promise.resolve({ data: [] }),
    ]);

    const mapPerf = new Map<string, any>((resPerfiles.data || []).map((p: any) => [p.id, p]));
    const mapRem = new Map<string, any>((resRemisiones.data || []).map((r: any) => [r.id, r]));
    const mapRec = new Map<string, any>((resRecibos.data || []).map((r: any) => [r.id, r]));
    const mapCot = new Map<string, any>((resCotizaciones.data || []).map((r: any) => [r.id, r]));
    const mapOt = new Map<string, any>((resOrdenes.data || []).map((r: any) => [r.id, r]));
    const mapCita = new Map<string, any>((resCitas.data || []).map((c: any) => [c.id, c]));

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
      const cita = row.cita_id ? mapCita.get(row.cita_id) : null;
      const esInspeccion = row.tipo_comision === "inspeccion" || Boolean(row.cita_id);

      let nombreCliente = "";
      if (cot?.prospecto_id && mapPros.has(cot.prospecto_id)) {
        nombreCliente = mapPros.get(cot.prospecto_id)!;
      }
      if (!nombreCliente && cita?.cliente_nombre) {
        nombreCliente = cita.cliente_nombre;
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

      const folioCalculado = esInspeccion
        ? row.detalles_calculo?.folioInspeccion || `INSP-${String(row.cita_id || row.id).slice(0, 6).toUpperCase()}`
        : rem?.folio || rec?.folio || ot?.folio || row.detalles_calculo?.folio || "S/F";
      const tipoCalculado = esInspeccion ? "inspeccion" : (rem?.tipo || (row.recibo_pago_id ? "recibo" : "remision"));
      const fechaCalculada = rem?.fecha || cita?.fecha || rec?.fecha_pago || row.fecha;

      return {
        id: row.id,
        tipoComision: esInspeccion ? "inspeccion" : "venta",
        citaId: row.cita_id || null,
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
        expedienteId: row.expediente_id || cita?.expediente_id || null,
        ordenTrabajoId: row.orden_trabajo_id,
        ordenTrabajoFolio: ot?.folio || null,
        clienteNombre: nombreCliente,
        clienteEmpresa: null,
        servicioTipo: esInspeccion ? "Inspección Técnica" : (cot?.servicio_tipo || null),
        fecha: row.fecha,
        montoVenta: Number(row.monto_venta || 0),
        costoProveedor: Number(row.costo_proveedor || 0),
        comisionBancaria: Number(row.comision_bancaria || 0),
        baseComisionable: Number(row.base_comisionable || (esInspeccion ? row.monto_comision : row.monto_venta) || 0),
        porcentajeComision: Number(row.porcentaje_comision || (esInspeccion ? 100 : 0)),
        montoComision: Number(row.monto_comision || 0),
        montoPagado: Number(row.monto_pagado || 0),
        saldoPendiente: Number(row.saldo_pendiente || 0),
        estatus: row.estatus as EstatusComision,
        esAjusteManual: Boolean(row.es_ajuste_manual),
        montoNeteadoAnticipo: Number(row.monto_neteado_anticipo || 0),
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
    anticiposPendientes: number;
    saldoNeto: number;
  };
  porAsesor: ResumenEstadoCuentaAsesor[];
}> {
  try {
    const [comisiones, anticipos] = await Promise.all([
      listarComisiones({
        asesorId: filtros?.asesorId,
        fechaDesde: filtros?.fechaDesde,
        fechaHasta: filtros?.fechaHasta,
      }),
      listarAnticiposComision({ asesorId: filtros?.asesorId, soloActivos: true }),
    ]);

    const anticiposPorAsesor = new Map<string, number>();
    for (const a of anticipos) {
      anticiposPorAsesor.set(a.asesorId, (anticiposPorAsesor.get(a.asesorId) || 0) + a.saldoRestante);
    }
    const anticiposPendientesTotal = anticipos.reduce((acc, a) => acc + a.saldoRestante, 0);

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
          anticiposPendientes: 0,
          saldoNeto: 0,
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

    // Incluir asesores que solo tienen anticipo activo (sin comisiones pendientes)
    for (const a of anticipos) {
      if (!asesorMap.has(a.asesorId)) {
        asesorMap.set(a.asesorId, {
          asesorId: a.asesorId,
          asesorNombre: a.asesorNombre,
          asesorTelefono: null,
          totalVentas: 0,
          totalComisiones: 0,
          totalPagado: 0,
          saldoPendiente: 0,
          comisionesCount: 0,
          pendientesCount: 0,
          anticiposPendientes: 0,
          saldoNeto: 0,
        });
      }
    }

    for (const entry of Array.from(asesorMap.values())) {
      entry.anticiposPendientes = anticiposPorAsesor.get(entry.asesorId) || 0;
      entry.saldoNeto = Math.round((entry.saldoPendiente - entry.anticiposPendientes) * 100) / 100;
    }

    const porAsesor = Array.from(asesorMap.values()).sort(
      (a, b) => b.saldoNeto - a.saldoNeto
    );

    return {
      general: {
        ...general,
        anticiposPendientes: anticiposPendientesTotal,
        saldoNeto: Math.round((general.saldoPendiente - anticiposPendientesTotal) * 100) / 100,
      },
      porAsesor,
    };
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
        anticiposPendientes: 0,
        saldoNeto: 0,
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

/**
 * Cancela una comisión (p. ej. inspección reasignada o duplicada). Queda con
 * estatus "cancelada", saldo 0 y marcada como ajuste manual para que las
 * sincronizaciones automáticas no la regeneren ni la reasignen.
 * No permite cancelar comisiones con pagos aplicados.
 */
export async function cancelarComision(datos: {
  comisionId: string;
  motivo: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: com, error: errBusq } = await sb
      .from("comisiones")
      .select("id, monto_pagado")
      .eq("id", datos.comisionId)
      .single();
    if (errBusq || !com) return { ok: false, error: "Comisión no encontrada." };
    if (Number(com.monto_pagado || 0) > 0) {
      return { ok: false, error: "La comisión ya tiene pagos aplicados; no se puede cancelar." };
    }

    const { error: errUpd } = await sb
      .from("comisiones")
      .update({
        estatus: "cancelada",
        saldo_pendiente: 0,
        es_ajuste_manual: true,
        motivo_ajuste: `Cancelada: ${(datos.motivo || "").trim() || "sin motivo"}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", datos.comisionId);
    if (errUpd) throw new Error(errUpd.message);

    await quitarMovimientosDeComisiones(sb, [datos.comisionId]);

    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al cancelar la comisión." };
  }
}

/**
 * Marca las citas de inspección cuya comisión fue eliminada para que la
 * auto-sincronización no la vuelva a crear.
 */
async function marcarCitasComisionDescartada(
  sb: ReturnType<typeof supabaseServidor>,
  citaIds: (string | null | undefined)[]
) {
  const ids = Array.from(new Set(citaIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return;
  const { error } = await sb
    .from("agenda_citas")
    .update({ comision_descartada: true })
    .in("id", ids);
  if (error) console.warn("Aviso al marcar citas con comisión descartada:", error.message);
}

/**
 * Quita de Finanzas los movimientos ligados a comisiones eliminadas o
 * canceladas, para que no queden egresos de nómina huérfanos.
 */
async function quitarMovimientosDeComisiones(
  sb: ReturnType<typeof supabaseServidor>,
  comisionIds: string[]
) {
  if (comisionIds.length === 0) return;
  const { error } = await sb
    .from("transactions")
    .delete()
    .eq("origen_modulo", "comision")
    .in("origen_id", comisionIds);
  if (error) console.warn("Aviso al quitar movimientos de comisiones en Finanzas:", error.message);
  revalidatePath("/finanzas");
}

export async function eliminarComision(datos: {
  comisionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: com, error: errBusq } = await sb
      .from("comisiones")
      .select("id, monto_pagado, cita_id")
      .eq("id", datos.comisionId)
      .single();

    if (errBusq || !com) return { ok: false, error: "Comisión no encontrada." };
    if (Number(com.monto_pagado || 0) > 0) {
      return {
        ok: false,
        error: "La comisión tiene pagos aplicados; no puede eliminarse mientras tenga registros de pago asociados.",
      };
    }

    const { error: errDel } = await sb
      .from("comisiones")
      .delete()
      .eq("id", datos.comisionId);

    if (errDel) throw new Error(errDel.message);

    await quitarMovimientosDeComisiones(sb, [datos.comisionId]);

    await marcarCitasComisionDescartada(sb, [com.cita_id]);

    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al eliminar la comisión." };
  }
}

/**
 * Eliminación masiva de comisiones que no tengan pagos aplicados.
 */
export async function eliminarComisionesMasivas(datos: {
  comisionIds: string[];
}): Promise<{
  ok: boolean;
  eliminadas?: number;
  omitidasConPagos?: number;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    if (!datos.comisionIds || datos.comisionIds.length === 0) {
      return { ok: false, error: "No se seleccionaron comisiones para eliminar." };
    }

    const { data: comisiones, error: errBusq } = await sb
      .from("comisiones")
      .select("id, monto_pagado, cita_id")
      .in("id", datos.comisionIds);

    if (errBusq) throw new Error(errBusq.message);

    const conPagos = (comisiones || []).filter((c: any) => Number(c.monto_pagado || 0) > 0);
    const paraEliminar = (comisiones || []).filter((c: any) => Number(c.monto_pagado || 0) <= 0);

    if (paraEliminar.length === 0) {
      return {
        ok: false,
        error: "Todas las comisiones seleccionadas tienen pagos aplicados y no pueden eliminarse.",
      };
    }

    const idsParaEliminar = paraEliminar.map((c: any) => c.id);

    const { error: errDel } = await sb
      .from("comisiones")
      .delete()
      .in("id", idsParaEliminar);

    if (errDel) throw new Error(errDel.message);

    await quitarMovimientosDeComisiones(sb, idsParaEliminar);

    await marcarCitasComisionDescartada(
      sb,
      paraEliminar.map((c: any) => c.cita_id)
    );

    revalidatePath("/comisiones");
    return {
      ok: true,
      eliminadas: idsParaEliminar.length,
      omitidasConPagos: conPagos.length,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al eliminar comisiones masivas." };
  }
}

/**
 * Cancelación masiva de comisiones (dejan de contar en balances y se marcan como manuales).
 */
export async function cancelarComisionesMasivas(datos: {
  comisionIds: string[];
  motivo: string;
}): Promise<{
  ok: boolean;
  canceladas?: number;
  omitidasConPagos?: number;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    if (!datos.comisionIds || datos.comisionIds.length === 0) {
      return { ok: false, error: "No se seleccionaron comisiones para cancelar." };
    }

    const { data: comisiones, error: errBusq } = await sb
      .from("comisiones")
      .select("id, monto_pagado")
      .in("id", datos.comisionIds);

    if (errBusq) throw new Error(errBusq.message);

    const conPagos = (comisiones || []).filter((c: any) => Number(c.monto_pagado || 0) > 0);
    const paraCancelar = (comisiones || []).filter((c: any) => Number(c.monto_pagado || 0) <= 0);

    if (paraCancelar.length === 0) {
      return {
        ok: false,
        error: "Todas las comisiones seleccionadas tienen pagos aplicados y no pueden cancelarse.",
      };
    }

    const idsParaCancelar = paraCancelar.map((c: any) => c.id);

    const { error: errUpd } = await sb
      .from("comisiones")
      .update({
        estatus: "cancelada",
        saldo_pendiente: 0,
        es_ajuste_manual: true,
        motivo_ajuste: `Cancelación masiva: ${(datos.motivo || "").trim() || "sin motivo especificado"}`,
        updated_at: new Date().toISOString(),
      })
      .in("id", idsParaCancelar);

    if (errUpd) throw new Error(errUpd.message);

    await quitarMovimientosDeComisiones(sb, idsParaCancelar);

    revalidatePath("/comisiones");
    return {
      ok: true,
      canceladas: idsParaCancelar.length,
      omitidasConPagos: conPagos.length,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al cancelar comisiones masivas." };
  }
}

/**
 * Edición masiva de comisiones seleccionadas (reasignación de asesor, tarifas fijas, %, estatus, notas).
 */
export async function editarComisionesMasivas(datos: {
  comisionIds: string[];
  cambios: {
    asesorId?: string;
    estatus?: EstatusComision;
    montoComision?: number;
    porcentajeComision?: number;
    motivoAjuste?: string;
    notas?: string;
  };
}): Promise<{
  ok: boolean;
  actualizadas?: number;
  omitidasPorConflicto?: number;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    if (!datos.comisionIds || datos.comisionIds.length === 0) {
      return { ok: false, error: "No se seleccionaron comisiones para editar." };
    }

    const { data: comisiones, error: errBusq } = await sb
      .from("comisiones")
      .select("id, tipo_comision, asesor_id, cita_id, remision_factura_id, monto_venta, base_comisionable, monto_pagado, estatus, porcentaje_comision, monto_comision")
      .in("id", datos.comisionIds);

    if (errBusq) throw new Error(errBusq.message);
    if (!comisiones || comisiones.length === 0) {
      return { ok: false, error: "No se encontraron comisiones para editar." };
    }

    let actualizadas = 0;
    let omitidasPorConflicto = 0;

    for (const c of comisiones) {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
        es_ajuste_manual: true,
      };

      if (datos.cambios.motivoAjuste) {
        updateData.motivo_ajuste = datos.cambios.motivoAjuste.trim();
      }
      if (datos.cambios.notas !== undefined && datos.cambios.notas !== null) {
        updateData.notas = datos.cambios.notas.trim();
      }

      // Reasignación de asesor
      if (datos.cambios.asesorId && datos.cambios.asesorId !== c.asesor_id) {
        // Validar conflicto de clave única por cita o remisión
        if (c.cita_id) {
          const { data: existente } = await sb
            .from("comisiones")
            .select("id")
            .eq("cita_id", c.cita_id)
            .eq("asesor_id", datos.cambios.asesorId)
            .neq("id", c.id)
            .maybeSingle();

          if (existente) {
            omitidasPorConflicto++;
            continue;
          }
        }
        if (c.remision_factura_id) {
          const { data: existente } = await sb
            .from("comisiones")
            .select("id")
            .eq("remision_factura_id", c.remision_factura_id)
            .eq("asesor_id", datos.cambios.asesorId)
            .neq("id", c.id)
            .maybeSingle();

          if (existente) {
            omitidasPorConflicto++;
            continue;
          }
        }
        updateData.asesor_id = datos.cambios.asesorId;
      }

      // Monto o Porcentaje
      const montoPagado = Number(c.monto_pagado || 0);
      let nuevoMonto = Number(c.monto_comision || 0);

      if (datos.cambios.montoComision !== undefined && datos.cambios.montoComision !== null) {
        nuevoMonto = Math.max(0, Number(datos.cambios.montoComision));
        updateData.monto_comision = nuevoMonto;
      } else if (datos.cambios.porcentajeComision !== undefined && datos.cambios.porcentajeComision !== null) {
        const nuevoPct = Math.max(0, Math.min(100, Number(datos.cambios.porcentajeComision)));
        updateData.porcentaje_comision = nuevoPct;
        if (c.tipo_comision !== "inspeccion") {
          const base = Number(c.base_comisionable || 0);
          nuevoMonto = Math.round((base * (nuevoPct / 100)) * 100) / 100;
          updateData.monto_comision = nuevoMonto;
        }
      }

      const nuevoSaldo = Math.max(0, nuevoMonto - montoPagado);
      updateData.saldo_pendiente = nuevoSaldo;

      // Estatus
      if (datos.cambios.estatus) {
        updateData.estatus = datos.cambios.estatus;
        if (datos.cambios.estatus === "cancelada") {
          updateData.saldo_pendiente = 0;
        }
      } else {
        // Auto-determinar estatus según montos si no se forzó uno específico
        if (c.estatus !== "cancelada") {
          if (montoPagado >= nuevoMonto && nuevoMonto > 0) {
            updateData.estatus = "pagada";
          } else if (montoPagado > 0) {
            updateData.estatus = "parcial";
          } else {
            updateData.estatus = "pendiente";
          }
        }
      }

      const { error: errUpd } = await sb
        .from("comisiones")
        .update(updateData)
        .eq("id", c.id);

      if (errUpd) {
        console.error("Error al actualizar comision en lote:", c.id, errUpd.message);
      } else {
        actualizadas++;
      }
    }

    revalidatePath("/comisiones");
    return { ok: true, actualizadas, omitidasPorConflicto };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al editar comisiones masivas." };
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
    let remanente = montoTotal;

    if (datos.aplicaciones && datos.aplicaciones.length > 0) {
      aplicacionesFinales = datos.aplicaciones.filter((a) => a.monto > 0);
      remanente = montoTotal - aplicacionesFinales.reduce((acc, a) => acc + a.monto, 0);
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

      for (const com of pendientes || []) {
        if (remanente <= 0) break;
        const saldo = Number(com.saldo_pendiente || 0);
        const aPagar = Math.min(saldo, remanente);
        aplicacionesFinales.push({ comisionId: com.id, monto: aPagar });
        remanente -= aPagar;
      }
    }

    remanente = Math.max(0, Math.round(remanente * 100) / 100);

    if (aplicacionesFinales.length === 0 && remanente <= 0) {
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

    // 3. Insertar detalles de aplicación (si hay comisiones cubiertas)
    if (aplicacionesFinales.length > 0) {
      const detallesInsert = aplicacionesFinales.map((a) => ({
        pago_id: pago.id,
        comision_id: a.comisionId,
        monto_aplicado: a.monto,
      }));

      const { error: errDet } = await sb
        .from("comisiones_pagos_detalle")
        .insert(detallesInsert);

      if (errDet) throw new Error(errDet.message);
    }

    // 4. Si el pago excede el saldo pendiente (préstamo/anticipo solicitado por
    // el asesor), el excedente queda como anticipo a favor de SAUCEDA, pendiente
    // de descontarse automáticamente de las próximas comisiones que se generen
    // para este asesor.
    if (remanente > 0) {
      const { error: errAnt } = await sb.from("comisiones_anticipos").insert({
        asesor_id: datos.asesorId,
        pago_id: pago.id,
        fecha: datos.fechaPago || new Date().toISOString().split("T")[0],
        monto: remanente,
        saldo_restante: remanente,
        motivo:
          datos.notas?.trim() ||
          `Anticipo/préstamo generado por dispersión que excedió el saldo pendiente.`,
        estatus: "activo",
      });

      if (errAnt) throw new Error(errAnt.message);
    }

    // 5. Marcar como pagadas en Finanzas las comisiones de remisión liquidadas
    if (aplicacionesFinales.length > 0) {
      const { data: comsPagadas } = await sb
        .from("comisiones")
        .select("remision_factura_id")
        .in("id", aplicacionesFinales.map((a) => a.comisionId))
        .not("remision_factura_id", "is", null);
      const remIds = Array.from(new Set((comsPagadas || []).map((c: any) => c.remision_factura_id)));
      for (const remId of remIds) {
        await reflejarRemisionEnFinanzas(remId as string);
      }
    }

    revalidatePath("/comisiones");
    revalidatePath("/finanzas");
    return { ok: true, pagoId: pago.id };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al registrar el pago." };
  }
}

/**
 * Compensa los anticipos/préstamos activos de un asesor contra sus comisiones
 * ya pendientes (de la más antigua a la más nueva) hasta agotar el anticipo o
 * los saldos. No genera un pago: las comisiones quedan con
 * monto_neteado_anticipo para distinguirlas de pagos en efectivo.
 */
export async function aplicarAnticiposAComisionesPendientes(
  asesorId: string
): Promise<{ ok: boolean; aplicado?: number; comisionesAfectadas?: number; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: anticipos, error: errAnt } = await sb
      .from("comisiones_anticipos")
      .select("id, saldo_restante")
      .eq("asesor_id", asesorId)
      .eq("estatus", "activo")
      .gt("saldo_restante", 0)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });
    if (errAnt) throw new Error(errAnt.message);
    if (!anticipos || anticipos.length === 0) {
      return { ok: false, error: "Este asesor no tiene anticipos a favor de SAUCEDA pendientes." };
    }

    const { data: pendientes, error: errPend } = await sb
      .from("comisiones")
      .select("id, monto_comision, monto_pagado, saldo_pendiente, monto_neteado_anticipo, anticipo_aplicado_id")
      .eq("asesor_id", asesorId)
      .in("estatus", ["pendiente", "parcial"])
      .gt("saldo_pendiente", 0)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });
    if (errPend) throw new Error(errPend.message);
    if (!pendientes || pendientes.length === 0) {
      return { ok: false, error: "Este asesor no tiene comisiones pendientes a las que aplicar el anticipo." };
    }

    const redondear = (n: number) => Math.round(n * 100) / 100;
    let idxAnt = 0;
    const saldosAnt = anticipos.map((a: any) => Number(a.saldo_restante || 0));
    let totalAplicado = 0;
    let afectadas = 0;

    for (const com of pendientes) {
      let saldoCom = Number(com.saldo_pendiente || 0);
      let aplicadoCom = 0;
      let primerAnticipoId: string | null = com.anticipo_aplicado_id || null;

      while (saldoCom > 0 && idxAnt < anticipos.length) {
        const aplicar = Math.min(saldosAnt[idxAnt], saldoCom);
        if (aplicar > 0) {
          if (!primerAnticipoId) primerAnticipoId = anticipos[idxAnt].id;
          saldosAnt[idxAnt] = redondear(saldosAnt[idxAnt] - aplicar);
          saldoCom = redondear(saldoCom - aplicar);
          aplicadoCom = redondear(aplicadoCom + aplicar);
        }
        if (saldosAnt[idxAnt] <= 0) idxAnt++;
      }

      if (aplicadoCom > 0) {
        const nuevoPagado = redondear(Number(com.monto_pagado || 0) + aplicadoCom);
        const { error: errUpd } = await sb
          .from("comisiones")
          .update({
            monto_pagado: nuevoPagado,
            saldo_pendiente: saldoCom,
            estatus: saldoCom <= 0 ? "pagada" : "parcial",
            anticipo_aplicado_id: primerAnticipoId,
            monto_neteado_anticipo: redondear(Number(com.monto_neteado_anticipo || 0) + aplicadoCom),
            updated_at: new Date().toISOString(),
          })
          .eq("id", com.id);
        if (errUpd) throw new Error(errUpd.message);
        totalAplicado = redondear(totalAplicado + aplicadoCom);
        afectadas++;
      }
      if (idxAnt >= anticipos.length) break;
    }

    // Persistir el saldo restante de cada anticipo tocado
    for (let i = 0; i < anticipos.length; i++) {
      const original = Number(anticipos[i].saldo_restante || 0);
      if (saldosAnt[i] === original) continue;
      const { error: errA } = await sb
        .from("comisiones_anticipos")
        .update({
          saldo_restante: saldosAnt[i],
          estatus: saldosAnt[i] <= 0 ? "liquidado" : "activo",
          updated_at: new Date().toISOString(),
        })
        .eq("id", anticipos[i].id);
      if (errA) throw new Error(errA.message);
    }

    revalidatePath("/comisiones");
    return { ok: true, aplicado: totalAplicado, comisionesAfectadas: afectadas };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error al aplicar el anticipo." };
  }
}

/** Lista los anticipos/préstamos de asesores (activos por defecto). */
export async function listarAnticiposComision(filtros?: {
  asesorId?: string;
  soloActivos?: boolean;
}): Promise<ComisionAnticipo[]> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    let query = sb
      .from("comisiones_anticipos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros?.asesorId) query = query.eq("asesor_id", filtros.asesorId);
    if (filtros?.soloActivos !== false) query = query.eq("estatus", "activo");

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const asesorIds = Array.from(new Set((data || []).map((a: any) => a.asesor_id).filter(Boolean)));
    const { data: perfiles } =
      asesorIds.length > 0
        ? await sb.from("perfiles").select("id, nombre").in("id", asesorIds)
        : { data: [] as any[] };
    const mapPerf = new Map<string, string>((perfiles || []).map((p: any) => [p.id, p.nombre]));

    return (data || []).map((a: any) => ({
      id: a.id,
      asesorId: a.asesor_id,
      asesorNombre: mapPerf.get(a.asesor_id) || "Asesor",
      pagoId: a.pago_id,
      fecha: a.fecha,
      monto: Number(a.monto || 0),
      saldoRestante: Number(a.saldo_restante || 0),
      motivo: a.motivo || "",
      estatus: a.estatus,
      createdAt: a.created_at,
    }));
  } catch (err: any) {
    console.error("Error al listar anticipos de comisión:", err.message);
    return [];
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

/** Refleja en Finanzas los importes definitivos de la remisión (no interrumpe si falla). */
/**
 * IDs de los usuarios que generan comisiones (perfiles.genera_comisiones).
 * Devuelve null si la columna aún no existe, para no bloquear comisiones.
 */
async function idsAsesoresComisionables(
  sb: ReturnType<typeof supabaseServidor>
): Promise<Set<string> | null> {
  const { data, error } = await sb.from("perfiles").select("id").eq("genera_comisiones", true);
  if (error) return null;
  return new Set((data || []).map((r: any) => r.id));
}

/**
 * Una inspección cuenta como realizada solo cuando la cita se marcó como
 * completada. Las pendientes, confirmadas o en coordinación aún no se realizan.
 */
function inspeccionRealizada(cita: { estado?: string | null }): boolean {
  const est = (cita.estado || "").toLowerCase();
  return est === "completada" || est === "realizada" || est === "finalizada";
}

async function asesorGeneraComisiones(
  sb: ReturnType<typeof supabaseServidor>,
  asesorId: string
): Promise<boolean> {
  const ids = await idsAsesoresComisionables(sb);
  return !ids || ids.has(asesorId);
}

/**
 * El responsable del documento no genera comisiones: se quitan las comisiones
 * automáticas de ese documento que aún no tienen pagos ni ajuste manual.
 */
async function quitarComisionesNoComisionables(
  sb: ReturnType<typeof supabaseServidor>,
  campo: "remision_factura_id" | "recibo_pago_id" | "cita_id",
  valor: string
) {
  const { data: borradas, error } = await sb
    .from("comisiones")
    .delete()
    .eq(campo, valor)
    .eq("es_ajuste_manual", false)
    .eq("monto_pagado", 0)
    .select("id");
  if (error) console.warn("Aviso al quitar comisiones de asesor no comisionable:", error.message);
  await quitarMovimientosDeComisiones(sb, (borradas || []).map((c: any) => c.id));
}

async function reflejarRemisionEnFinanzas(remisionId: string): Promise<void> {
  try {
    const { sincronizarFinanzasRemision } = await import("@/app/actions/contabilidad-remisiones");
    await sincronizarFinanzasRemision(remisionId);
  } catch (errFin) {
    console.error("Error al reflejar la remisión en Finanzas:", errFin);
  }
}

export async function sincronizarComisionParaRemision(
  remisionId: string
): Promise<{ ok: boolean; comisionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener datos de la remisión (consulta plana, sin joins de PostgREST)
    const { data: rem, error: errRem } = await sb
      .from("remisiones_facturas")
      .select("id, folio, tipo, fecha, monto_subtotal, monto_total, costo_financiero, costo_proveedor, cotizacion_id, expediente_id, orden_trabajo_id")
      .eq("id", remisionId)
      .single();

    if (errRem || !rem) {
      return { ok: false, error: "Remisión no encontrada." };
    }

    // 1.1 Resolver datos relacionados por separado (evita fallos de joins embebidos en PostgREST)
    let servicioTipoRem: string | null = null;
    let asesorId: string | null = null;
    let otCostoProveedor = 0;

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
      if (!asesorId) {
        asesorId = ot?.asesor_responsable_id || ot?.asesor_ejecutor_id || null;
      }
      if (ot?.costo_proveedor) {
        otCostoProveedor = Number(ot.costo_proveedor);
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

    if (!(await asesorGeneraComisiones(sb, asesorId))) {
      await quitarComisionesNoComisionables(sb, "remision_factura_id", remisionId);
      await reflejarRemisionEnFinanzas(remisionId);
      return { ok: true };
    }

    // 3. Verificar si ya existe comisión registrada
    const { data: comisionExistente } = await sb
      .from("comisiones")
      .select("id, es_ajuste_manual, monto_comision, monto_pagado, porcentaje_comision, estatus, detalles_calculo")
      .eq("remision_factura_id", remisionId)
      .maybeSingle();

    const montoVenta = Number(rem.monto_total || rem.monto_subtotal || 0);
    const comisionBancariaRem = Number(rem.costo_financiero || 0);
    const costoProveedorRem = Number(rem.costo_proveedor || otCostoProveedor || 0);

    // BASE GRAVABLE / COMISIONABLE = Venta Total - Costo Financiero (Pasarela) - Costo Ejecución (Proveedor)
    const baseComisionableRem = Math.max(0, montoVenta - costoProveedorRem - comisionBancariaRem);
    const servicioTipo = servicioTipoRem;

    if (comisionExistente) {
      // Si fue ajustada manualmente, no se toca el % ni el monto de comisión
      // que se fijó a mano, pero sí se mantienen al día los datos objetivos
      // (venta, costo de proveedor, comisión bancaria y base gravable), que
      // vienen de la orden/remisión y no dependen del ajuste manual.
      if (comisionExistente.es_ajuste_manual) {
        // Un ajuste por porcentaje personalizado sigue a la base gravable:
        // si cambian las deducciones, se recalcula el monto con ese %.
        const ajustePorPorcentaje = comisionExistente.detalles_calculo?.ajusteModo === "porcentaje";
        const actualizacion: Record<string, any> = {
          monto_venta: montoVenta,
          costo_proveedor: costoProveedorRem,
          comision_bancaria: comisionBancariaRem,
          base_comisionable: baseComisionableRem,
          updated_at: new Date().toISOString(),
        };

        if (ajustePorPorcentaje) {
          const pct = Number(comisionExistente.porcentaje_comision || 0);
          const monto = Math.round(baseComisionableRem * (pct / 100) * 100) / 100;
          const pagado = Number(comisionExistente.monto_pagado || 0);
          actualizacion.monto_comision = monto;
          actualizacion.saldo_pendiente = Math.max(0, monto - pagado);
          if (comisionExistente.estatus !== "cancelada") {
            actualizacion.estatus = pagado >= monto ? "pagada" : pagado > 0 ? "parcial" : "pendiente";
          }
        }

        await sb.from("comisiones").update(actualizacion).eq("id", comisionExistente.id);
        await reflejarRemisionEnFinanzas(remisionId);

        return { ok: true, comisionId: comisionExistente.id };
      }

      // Si no es manual, sincronizar con la base gravable actualizada
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
          detalles_calculo: {
            reglaOrigen,
            montoTotalDocumento: montoVenta,
            costoFinanciero: comisionBancariaRem,
            costoProveedor: costoProveedorRem,
            baseGravable: baseComisionableRem,
            fechaCalculo: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", comisionExistente.id);
      await reflejarRemisionEnFinanzas(remisionId);

      return { ok: true, comisionId: comisionExistente.id };
    }

    // 4. Crear nueva comisión calculada sobre la base gravable
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
        detalles_calculo: {
          reglaOrigen,
          montoTotalDocumento: montoVenta,
          costoFinanciero: comisionBancariaRem,
          costoProveedor: costoProveedorRem,
          baseGravable: baseComisionableRem,
          fechaCalculo: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (errIns) throw new Error(errIns.message);

    // Si el asesor tiene anticipos/préstamos activos, descontar automáticamente
    // de esta comisión recién generada antes de que quede disponible para pago.
    await netearAnticiposContraComision(sb, asesorId, nuevaCom.id, montoComision);

    // La comisión devengada se refleja en Finanzas (opex_nomina) junto con
    // el resto de importes definitivos de la remisión.
    await reflejarRemisionEnFinanzas(remisionId);

    return { ok: true, comisionId: nuevaCom.id };
  } catch (err: any) {
    console.error("Error al sincronizar comisión de remisión:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Descuenta anticipos/préstamos activos de un asesor contra una comisión
 * recién generada (por orden de fecha, el más antiguo primero), hasta agotar
 * el anticipo o el monto de la comisión. Actualiza tanto los anticipos
 * (saldo_restante, estatus) como la comisión (monto_pagado, saldo_pendiente,
 * estatus, anticipo_aplicado_id, monto_neteado_anticipo).
 */
async function netearAnticiposContraComision(
  sb: ReturnType<typeof supabaseServidor>,
  asesorId: string,
  comisionId: string,
  montoComision: number
): Promise<void> {
  if (montoComision <= 0) return;

  const { data: anticipos } = await sb
    .from("comisiones_anticipos")
    .select("id, saldo_restante")
    .eq("asesor_id", asesorId)
    .eq("estatus", "activo")
    .gt("saldo_restante", 0)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (!anticipos || anticipos.length === 0) return;

  let disponible = montoComision;
  let totalNeteado = 0;
  let primerAnticipoId: string | null = null;

  for (const ant of anticipos) {
    if (disponible <= 0) break;
    const saldoAnt = Number(ant.saldo_restante || 0);
    const aplicar = Math.min(saldoAnt, disponible);
    if (aplicar <= 0) continue;

    if (!primerAnticipoId) primerAnticipoId = ant.id;
    totalNeteado += aplicar;
    disponible -= aplicar;

    const nuevoSaldoAnt = Math.round((saldoAnt - aplicar) * 100) / 100;
    await sb
      .from("comisiones_anticipos")
      .update({
        saldo_restante: nuevoSaldoAnt,
        estatus: nuevoSaldoAnt <= 0 ? "liquidado" : "activo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ant.id);
  }

  if (totalNeteado <= 0) return;

  const nuevoSaldoPendiente = Math.max(0, Math.round((montoComision - totalNeteado) * 100) / 100);
  await sb
    .from("comisiones")
    .update({
      monto_pagado: totalNeteado,
      saldo_pendiente: nuevoSaldoPendiente,
      estatus: nuevoSaldoPendiente <= 0 ? "pagada" : "parcial",
      anticipo_aplicado_id: primerAnticipoId,
      monto_neteado_anticipo: totalNeteado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", comisionId);
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

    if (!(await asesorGeneraComisiones(sb, asesorId))) {
      await quitarComisionesNoComisionables(sb, "recibo_pago_id", rec.id);
      return { ok: true };
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

    // Reflejar automáticamente la comisión devengada en Finanzas (costo directo de la venta).
    try {
      const { registrarMovimientoAutomaticoCRM } = await import("@/app/actions/finanzas");
      const { data: asesor } = await sb.from("perfiles").select("nombre").eq("id", asesorId).maybeSingle();
      await registrarMovimientoAutomaticoCRM({
        tipo: "egreso",
        lineaPnl: "costo_comisiones_venta",
        monto: montoComision,
        concepto: `Comisión ${asesor?.nombre || "Asesor"} - ${rec.folio}`,
        fecha: rec.fecha_pago || new Date().toISOString().split("T")[0],
        estado: "pendiente",
        contraparte: asesor?.nombre || "Asesor",
        crmDealId: rec.expediente_id || null,
      });
    } catch (errFin) {
      console.error("Error al registrar movimiento financiero de comisión (recibo):", errFin);
    }

    revalidatePath("/comisiones");
    return { ok: true, comisionId: nuevaCom.id };
  } catch (err: any) {
    console.error("Error al sincronizar comisión de recibo:", err.message);
    return { ok: false, error: err.message };
  }
}

// ============================================================
// 7. SINCRONIZACIÓN DE COMISIONES POR INSPECCIÓN TÉCNICA
// ============================================================

export async function sincronizarComisionParaInspeccion(
  citaId: string,
  opciones?: {
    montoFijoCustom?: number;
    notas?: string;
    citaData?: any;
    /** Regenera la comisión aunque el admin la haya eliminado antes. */
    forzar?: boolean;
  }
): Promise<{ ok: boolean; comisionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener la cita de inspección (usar citaData si ya fue provista o consultar con select("*"))
    let cita = opciones?.citaData || null;

    if (!cita) {
      const { data: c, error: errCita } = await sb
        .from("agenda_citas")
        .select("*")
        .eq("id", citaId)
        .maybeSingle();

      if (errCita) {
        console.error("Error al consultar cita en agenda_citas:", errCita);
        return { ok: false, error: errCita.message || "Error al consultar cita de inspección." };
      }
      if (!c) {
        return { ok: false, error: `Cita de inspección (${citaId}) no encontrada en agenda_citas.` };
      }
      cita = c;
    }

    const esTipoInspeccion = 
      cita.tipo_cita === "inspeccion" || 
      cita.tipo_cita === "visita" || 
      (cita.notas || "").toLowerCase().includes("inspecci");

    if (!esTipoInspeccion) {
      return { ok: false, error: "La cita no es de tipo inspección técnica." };
    }

    // El admin eliminó la comisión de esta cita: no regenerarla automáticamente.
    if (cita.comision_descartada && !opciones?.forzar) {
      return { ok: true };
    }

    // Solo comisionan las inspecciones ya realizadas. Una cita pendiente,
    // confirmada o todavía en coordinación no genera comisión ni se marca
    // como completada desde aquí.
    if (!inspeccionRealizada(cita)) {
      return { ok: true };
    }

    // 2. Resolver el asesor responsable de la inspección
    let asesorId: string | null = cita.perfil_id || null;

    if (!asesorId && Array.isArray(cita.asignados_ids) && cita.asignados_ids.length > 0) {
      asesorId = cita.asignados_ids[0];
    }

    if (!asesorId && cita.expediente_id) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("asesor_id")
        .eq("id", cita.expediente_id)
        .maybeSingle();
      asesorId = exp?.asesor_id || null;
    }

    if (!asesorId && cita.prospecto_id) {
      const { data: pros } = await sb
        .from("prospectos")
        .select("asesor_id")
        .eq("id", cita.prospecto_id)
        .maybeSingle();
      asesorId = pros?.asesor_id || null;
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
      return { ok: false, error: "No se encontró ningún asesor asignado para comisionar la inspección." };
    }

    if (!(await asesorGeneraComisiones(sb, asesorId))) {
      await quitarComisionesNoComisionables(sb, "cita_id", cita.id);
      return { ok: true };
    }

    // 3. Resolver la tarifa fija asignada
    let montoTarifa = 0;
    let reglaOrigen = "";

    if (opciones?.montoFijoCustom !== undefined && Number(opciones.montoFijoCustom) > 0) {
      montoTarifa = Number(opciones.montoFijoCustom);
      reglaOrigen = "Tarifa fija asignada manualmente a la inspección";
    } else {
      const resRegla = await resolverComisionInspeccion({ asesorId });
      montoTarifa = resRegla.montoFijo;
      reglaOrigen = resRegla.reglaOrigen;
    }

    // 4. Verificar si ya existe comisión para esta cita
    const { data: comisionesExistentes } = await sb
      .from("comisiones")
      .select("id, es_ajuste_manual, monto_comision, monto_pagado, estatus, asesor_id")
      .eq("cita_id", cita.id)
      .order("created_at", { ascending: false });

    let comisionExistente = null;
    if (comisionesExistentes && comisionesExistentes.length > 0) {
      const matchAsesor = comisionesExistentes.find((c: any) => c.asesor_id === asesorId);
      comisionExistente = matchAsesor || comisionesExistentes[0];
    }

    const fechaComision = cita.fecha || new Date().toISOString().split("T")[0];

    if (comisionExistente) {
      if (comisionExistente.es_ajuste_manual) {
        return { ok: true, comisionId: comisionExistente.id };
      }

      const pagado = Number(comisionExistente.monto_pagado || 0);
      const nuevoSaldo = Math.max(0, montoTarifa - pagado);
      let nuevoEstatus = comisionExistente.estatus;
      if (nuevoEstatus !== "cancelada") {
        if (pagado >= montoTarifa) nuevoEstatus = "pagada";
        else if (pagado > 0) nuevoEstatus = "parcial";
        else nuevoEstatus = "pendiente";
      }

      const { error: errUpd } = await sb
        .from("comisiones")
        .update({
          asesor_id: asesorId,
          expediente_id: cita.expediente_id || null,
          tipo_comision: "inspeccion",
          monto_venta: 0,
          costo_proveedor: 0,
          comision_bancaria: 0,
          base_comisionable: montoTarifa,
          porcentaje_comision: 100,
          monto_comision: montoTarifa,
          saldo_pendiente: nuevoSaldo,
          estatus: nuevoEstatus,
          detalles_calculo: {
            reglaOrigen,
            origen: "inspeccion_tecnica",
            citaId: cita.id,
            folioInspeccion: `INSP-${String(cita.id).slice(0, 6).toUpperCase()}`,
            clienteNombre: cita.cliente_nombre || null,
            fechaInspeccion: cita.fecha,
            fechaCalculo: new Date().toISOString(),
          },
          notas: opciones?.notas || cita.notas || "Comisión fija por inspección técnica ejecutada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", comisionExistente.id);

      if (errUpd) {
        console.warn("Aviso al actualizar comisión existente de inspección:", errUpd.message);
      }

      revalidatePath("/comisiones");
      if (cita.expediente_id) revalidatePath(`/expediente/${cita.expediente_id}`);
      return { ok: true, comisionId: comisionExistente.id };
    }

    // 5. Crear nueva comisión por inspección técnica ejecutada
    const { data: nuevaCom, error: errIns } = await sb
      .from("comisiones")
      .insert({
        cita_id: cita.id,
        tipo_comision: "inspeccion",
        asesor_id: asesorId,
        expediente_id: cita.expediente_id || null,
        fecha: fechaComision,
        monto_venta: 0,
        costo_proveedor: 0,
        comision_bancaria: 0,
        base_comisionable: montoTarifa,
        porcentaje_comision: 100,
        monto_comision: montoTarifa,
        monto_pagado: 0.0,
        saldo_pendiente: montoTarifa,
        estatus: "pendiente",
        es_ajuste_manual: Boolean(opciones?.montoFijoCustom),
        motivo_ajuste: opciones?.montoFijoCustom ? "Tarifa personalizada de inspección" : "",
        detalles_calculo: {
          reglaOrigen,
          origen: "inspeccion_tecnica",
          citaId: cita.id,
          folioInspeccion: `INSP-${String(cita.id).slice(0, 6).toUpperCase()}`,
          clienteNombre: cita.cliente_nombre || null,
          fechaInspeccion: cita.fecha,
          fechaCalculo: new Date().toISOString(),
        },
        notas: opciones?.notas || cita.notas || "Comisión fija por inspección técnica ejecutada",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (errIns) {
      // Manejar gracefully colisiones de clave única uq_comisiones_cita_asesor
      // (ocurre si el trigger trg_comision_inspeccion o un proceso paralelo ya insertó la comisión)
      if (
        errIns.code === "23505" ||
        errIns.message?.includes("uq_comisiones_cita_asesor") ||
        errIns.message?.includes("duplicate key")
      ) {
        const { data: comsRecuperadas } = await sb
          .from("comisiones")
          .select("id, monto_pagado, es_ajuste_manual, estatus")
          .eq("cita_id", cita.id)
          .order("created_at", { ascending: false });

        const comRecuperada = comsRecuperadas && comsRecuperadas.length > 0 ? comsRecuperadas[0] : null;
        if (comRecuperada) {
          if (!comRecuperada.es_ajuste_manual) {
            const pagado = Number(comRecuperada.monto_pagado || 0);
            const nuevoSaldo = Math.max(0, montoTarifa - pagado);
            let nuevoEstatus = comRecuperada.estatus;
            if (nuevoEstatus !== "cancelada") {
              if (pagado >= montoTarifa) nuevoEstatus = "pagada";
              else if (pagado > 0) nuevoEstatus = "parcial";
              else nuevoEstatus = "pendiente";
            }

            await sb
              .from("comisiones")
              .update({
                asesor_id: asesorId,
                expediente_id: cita.expediente_id || null,
                tipo_comision: "inspeccion",
                base_comisionable: montoTarifa,
                porcentaje_comision: 100,
                monto_comision: montoTarifa,
                saldo_pendiente: nuevoSaldo,
                estatus: nuevoEstatus,
                detalles_calculo: {
                  reglaOrigen,
                  origen: "inspeccion_tecnica",
                  citaId: cita.id,
                  folioInspeccion: `INSP-${String(cita.id).slice(0, 6).toUpperCase()}`,
                  clienteNombre: cita.cliente_nombre || null,
                  fechaInspeccion: cita.fecha,
                  fechaCalculo: new Date().toISOString(),
                },
                notas: opciones?.notas || cita.notas || "Comisión fija por inspección técnica ejecutada",
                updated_at: new Date().toISOString(),
              })
              .eq("id", comRecuperada.id);
          }

          revalidatePath("/comisiones");
          if (cita.expediente_id) revalidatePath(`/expediente/${cita.expediente_id}`);
          return { ok: true, comisionId: comRecuperada.id };
        }
      }

      console.error("Error al insertar comisión de inspección:", errIns);
      if (
        errIns.message?.includes('column "cita_id"') || 
        errIns.message?.includes('column "tipo_comision"') ||
        errIns.code === "42703"
      ) {
        return { ok: false, error: "Faltan las columnas cita_id y tipo_comision en la tabla comisiones de la base de datos (aplica la migración 0101)." };
      }
      return { ok: false, error: `Error al registrar comisión: ${errIns.message}` };
    }

    // Reflejar automáticamente la comisión devengada por inspección en Finanzas (OPEX: comisiones por visitas)
    try {
      const { registrarMovimientoAutomaticoCRM } = await import("@/app/actions/finanzas");
      const { data: asesor } = await sb.from("perfiles").select("nombre").eq("id", asesorId).maybeSingle();
      await registrarMovimientoAutomaticoCRM({
        tipo: "egreso",
        lineaPnl: "opex_comisiones_visitas",
        monto: montoTarifa,
        concepto: `Comisión ${asesor?.nombre || "Asesor"} - ${cita.cliente_nombre || "Inspección Técnica"}`,
        fecha: fechaComision,
        estado: "pendiente",
        contraparte: asesor?.nombre || "Asesor",
        crmDealId: cita.expediente_id || null,
        origen: nuevaCom?.id ? { modulo: "comision", id: nuevaCom.id, concepto: "comision" } : null,
      });
    } catch (errFin) {
      console.error("Error al registrar movimiento financiero de comisión (inspección):", errFin);
    }

    revalidatePath("/comisiones");
    if (cita.expediente_id) revalidatePath(`/expediente/${cita.expediente_id}`);
    return { ok: true, comisionId: nuevaCom?.id };
  } catch (err: any) {
    console.error("Error al sincronizar comisión de inspección:", err);
    return { ok: false, error: err.message || "Error al sincronizar comisión de inspección." };
  }
}

export async function marcarInspeccionEjecutada(datos: {
  citaId: string;
  notas?: string;
  montoFijoCustom?: number;
}): Promise<{ ok: boolean; comisionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener cita y validar
    const { data: citaActual, error: errCita } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("id", datos.citaId)
      .maybeSingle();

    if (errCita) {
      return { ok: false, error: `Error al consultar cita: ${errCita.message}` };
    }
    if (!citaActual) {
      return { ok: false, error: "Cita no encontrada en agenda_citas." };
    }

    // 2. Marcar como completada en agenda_citas
    const { error: errUpd } = await sb
      .from("agenda_citas")
      .update({
        estado: "completada",
        notas: datos.notas !== undefined ? datos.notas : citaActual.notas,
      })
      .eq("id", datos.citaId);

    if (errUpd) throw new Error(errUpd.message);

    // Marcarla de nuevo como ejecutada reactiva su comisión si había sido descartada
    if (citaActual.comision_descartada) {
      await sb.from("agenda_citas").update({ comision_descartada: false }).eq("id", datos.citaId);
    }

    // 3. Registrar actividad en el expediente si existe
    if (citaActual.expediente_id) {
      try {
        await sb.from("expedientes_actividades").insert({
          expediente_id: citaActual.expediente_id,
          tipo: "inspeccion_ejecutada",
          titulo: "Inspección Técnica Ejecutada",
          detalle: datos.notas ? `Inspección ejecutada con éxito. Notas: ${datos.notas}` : "Inspección técnica marcada como ejecutada en sitio. Se generó comisión para el asesor.",
          created_at: new Date().toISOString(),
        });
      } catch (actErr) {
        console.warn("Aviso al registrar actividad en expediente:", actErr);
      }
    }

    // 4. Generar/sincronizar la comisión fija pasando citaActual precargada
    const resCom = await sincronizarComisionParaInspeccion(datos.citaId, {
      montoFijoCustom: datos.montoFijoCustom,
      notas: datos.notas,
      forzar: true,
      citaData: {
        ...citaActual,
        estado: "completada",
        notas: datos.notas !== undefined ? datos.notas : citaActual.notas,
      },
    });

    if (!resCom.ok) {
      return { ok: false, error: resCom.error };
    }

    revalidatePath("/agenda");
    revalidatePath("/comisiones");
    if (citaActual.expediente_id) {
      revalidatePath(`/expediente/${citaActual.expediente_id}`);
    }

    return { ok: true, comisionId: resCom.comisionId };
  } catch (err: any) {
    console.error("Error al marcar inspección ejecutada:", err);
    return { ok: false, error: err.message || "Error al marcar inspección ejecutada." };
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

    // 2. Limpiar comisiones de recibos si existieran (protegiendo citas de inspección y remisiones)
    try {
      await sb
        .from("comisiones")
        .delete()
        .is("remision_factura_id", null)
        .is("cita_id", null)
        .not("recibo_pago_id", "is", null);
    } catch {}

    // 3. Procesar remisiones_facturas (origen de comisiones de venta)
    const { data: remisiones } = await sb
      .from("remisiones_facturas")
      .select("id");

    for (const r of remisiones || []) {
      const res = await sincronizarComisionParaRemision(r.id);
      if (res.ok) procesadas++;
    }

    // 4. Procesar inspecciones ejecutadas de expedientes
    let citasInsp: any[] = [];
    try {
      const { data: cData, error: errCData } = await sb
        .from("agenda_citas")
        .select("*")
        .or("tipo_cita.eq.inspeccion,tipo_cita.eq.visita,notas.ilike.%inspecci%");

      if (errCData) {
        console.warn("Aviso al consultar citas con filtro OR:", errCData.message);
        const { data: cDataFallback } = await sb
          .from("agenda_citas")
          .select("*")
          .eq("tipo_cita", "inspeccion");
        citasInsp = cDataFallback || [];
      } else {
        citasInsp = cData || [];
      }
    } catch (eInspQuery) {
      console.warn("Aviso al consultar citas de inspección:", eInspQuery);
    }

    const inspeccionesUnicasMap = new Map<string, any>();
    for (const c of citasInsp) {
      const esEjecutada = inspeccionRealizada(c);

      if (esEjecutada && c.id && !inspeccionesUnicasMap.has(c.id)) {
        inspeccionesUnicasMap.set(c.id, c);
      }
    }
    const inspeccionesEjecutadas = Array.from(inspeccionesUnicasMap.values());

    const errores: string[] = [];
    for (const insp of inspeccionesEjecutadas) {
      const res = await sincronizarComisionParaInspeccion(insp.id, { citaData: insp });
      if (res.ok) {
        procesadas++;
      } else {
        errores.push(res.error || `Error en cita ${insp.id}`);
      }
    }

    revalidatePath("/comisiones");

    if (errores.length > 0) {
      return {
        ok: false,
        creadas: procesadas,
        actualizadas: 0,
        error: `Se procesaron ${procesadas} comisiones de venta, pero falló la sincronización de inspecciones: ${errores[0]}`,
      };
    }

    return { ok: true, creadas: procesadas, actualizadas: 0 };
  } catch (err: any) {
    return { ok: false, creadas: 0, actualizadas: 0, error: err.message };
  }
}

