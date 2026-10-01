"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { revalidatePath } from "next/cache";

export interface RemisionFacturaEnriquecida {
  id: string;
  cotizacionId: string | null;
  ordenTrabajoId: string | null;
  expedienteId: string | null;
  tipo: "remision" | "factura";
  folio: string;
  fecha: string;
  tipoCambio: number;
  datosDocumento: Record<string, any>;
  serviciosExtra: number;
  costoFinanciero: number;
  otrosGastos: number;
  costoProveedor: number;
  montoSubtotal: number;
  montoTotal: number;
  createdAt: string;
  updatedAt: string;

  // Datos de Ejecución & Proveedor
  proveedorId?: string;
  proveedorNombre?: string;
  proveedorConcepto?: string;

  // Análisis de Pagos & Pasarela
  metodosPagoRecibos: string[];
  tienePasarela: boolean;

  // Base Gravable de Comisión
  baseGravableComision: number;
  comisionAsesorMonto?: number;
  comisionAsesorPorcentaje?: number;
  comisionId?: string;
  comisionEsAjusteManual?: boolean;
  comisionAjusteModo?: "porcentaje" | "monto" | null;
  comisionMotivoAjuste?: string;
  comisionMontoPagado?: number;

  // Datos Enriquecidos del Cliente
  clienteNombre: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  clienteDireccion?: string;
  prospectoId?: string;

  // Datos de la Orden de Trabajo
  ordenFolio?: string;
  ordenTitulo?: string;
  ordenEstatus?: string;
  ordenTipoNegocio?: string;
  ordenEntregaToken?: string;
  asesorId?: string;
  asesorNombre?: string;

  // Datos de la Cotización
  cotizacionFolio?: string;
  cotizacionToken?: string;
  cotizacionServicioTipo?: string;

  // Cobranza vinculada a la OT
  totalCobrado: number;
  saldoRestante: number;
}

export interface FiltrosRemisiones {
  tipo?: string; // "todas" | "remision" | "factura"
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
}

/**
 * Obtiene la lista completa y enriquecida de remisiones y facturas
 * para el concentrado administrativo.
 */
export async function listarRemisionesFacturas(
  filtros?: FiltrosRemisiones
): Promise<RemisionFacturaEnriquecida[]> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Consulta base de remisiones_facturas
    let query = sb
      .from("remisiones_facturas")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros?.tipo && filtros.tipo !== "todas") {
      query = query.eq("tipo", filtros.tipo);
    }
    if (filtros?.fechaInicio) {
      query = query.gte("fecha", filtros.fechaInicio);
    }
    if (filtros?.fechaFin) {
      query = query.lte("fecha", filtros.fechaFin);
    }

    const { data: rows, error: errRem } = await query;
    if (errRem) {
      console.error("Error al consultar remisiones_facturas:", errRem);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    // 2. Extraer IDs únicos para enriquecer en paralelo sin joins frágiles
    const otIds = Array.from(new Set(rows.map((r: any) => r.orden_trabajo_id).filter(Boolean)));
    const cotIds = Array.from(new Set(rows.map((r: any) => r.cotizacion_id).filter(Boolean)));
    const expIds = Array.from(new Set(rows.map((r: any) => r.expediente_id).filter(Boolean)));

    // 3. Ejecutar consultas complementarias en paralelo
    const [otsRes, cotsRes, recsRes] = await Promise.all([
      otIds.length > 0
        ? sb
            .from("ordenes_trabajo")
            .select("id, folio, titulo, estatus, tipo_negocio, entrega_token, asesor_ejecutor_id, prospecto_id, cotizacion_id, cliente_nombre, cliente_telefono, cliente_direccion, proveedor_id, costo_proveedor, proveedor_concepto")
            .in("id", otIds)
        : Promise.resolve({ data: [] }),
      cotIds.length > 0
        ? sb
            .from("cotizaciones")
            .select("id, token, servicio_tipo, prospecto_id, expediente_id, precio_final")
            .in("id", cotIds)
        : Promise.resolve({ data: [] }),
      otIds.length > 0
        ? sb
            .from("recibos_pago")
            .select("orden_trabajo_id, monto, metodo_pago")
            .in("orden_trabajo_id", otIds)
        : Promise.resolve({ data: [] }),
    ]);

    const otsMap = new Map<string, any>();
    (otsRes.data || []).forEach((ot: any) => otsMap.set(ot.id, ot));

    const cotsMap = new Map<string, any>();
    (cotsRes.data || []).forEach((c: any) => cotsMap.set(c.id, c));

    // Analizar recibos de pago por orden de trabajo (montos y métodos de pago como terminal/pasarela)
    const cobradoPorOt = new Map<string, number>();
    const metodosPorOt = new Map<string, Set<string>>();
    (recsRes.data || []).forEach((r: any) => {
      const prev = cobradoPorOt.get(r.orden_trabajo_id) || 0;
      cobradoPorOt.set(r.orden_trabajo_id, prev + Number(r.monto || 0));
      if (!metodosPorOt.has(r.orden_trabajo_id)) {
        metodosPorOt.set(r.orden_trabajo_id, new Set<string>());
      }
      if (r.metodo_pago) {
        metodosPorOt.get(r.orden_trabajo_id)!.add(String(r.metodo_pago).toLowerCase());
      }
    });

    // 4. Reunir IDs de prospectos, asesores y proveedores
    const prospectoIds = new Set<string>();
    const proveedorIds = new Set<string>();
    (otsRes.data || []).forEach((ot: any) => {
      if (ot.prospecto_id) prospectoIds.add(ot.prospecto_id);
      if (ot.proveedor_id) proveedorIds.add(ot.proveedor_id);
    });
    (cotsRes.data || []).forEach((c: any) => {
      if (c.prospecto_id) prospectoIds.add(c.prospecto_id);
    });

    const asesorIds = Array.from(
      new Set(
        (otsRes.data || [])
          .map((ot: any) => ot.asesor_ejecutor_id)
          .filter(Boolean)
      )
    );

    const remisionIds = rows.map((r: any) => r.id);

    const [prospRes, expRes, asesoresRes, provRes, comRes] = await Promise.all([
      prospectoIds.size > 0
        ? sb
            .from("prospectos")
            .select("id, nombre, primer_apellido, segundo_apellido, telefono, email, correo, direccion, empresa")
            .in("id", Array.from(prospectoIds))
        : Promise.resolve({ data: [] }),
      expIds.length > 0
        ? sb
            .from("expedientes")
            .select("id, cliente, telefono, fraccionamiento")
            .in("id", expIds)
        : Promise.resolve({ data: [] }),
      asesorIds.length > 0
        ? sb
            .from("usuarios")
            .select("id, nombre")
            .in("id", asesorIds)
        : Promise.resolve({ data: [] }),
      proveedorIds.size > 0
        ? sb
            .from("proveedores")
            .select("id, nombre, razon_social")
            .in("id", Array.from(proveedorIds))
        : Promise.resolve({ data: [] }),
      remisionIds.length > 0
        ? sb
            .from("comisiones")
            .select("id, remision_factura_id, porcentaje_comision, monto_comision, monto_pagado, estatus, es_ajuste_manual, motivo_ajuste, detalles_calculo")
            .in("remision_factura_id", remisionIds)
        : Promise.resolve({ data: [] }),
    ]);

    const prospMap = new Map<string, any>();
    (prospRes.data || []).forEach((p: any) => prospMap.set(p.id, p));

    const expMap = new Map<string, any>();
    (expRes.data || []).forEach((e: any) => expMap.set(e.id, e));

    const asesoresMap = new Map<string, string>();
    (asesoresRes.data || []).forEach((a: any) => asesoresMap.set(a.id, a.nombre));

    const provMap = new Map<string, string>();
    (provRes.data || []).forEach((p: any) => provMap.set(p.id, p.razon_social || p.nombre));

    const comMap = new Map<string, any>();
    (comRes.data || []).forEach((c: any) => comMap.set(c.remision_factura_id, c));

    // 5. Ensamblar los registros enriquecidos
    const listaEnriquecida: RemisionFacturaEnriquecida[] = rows.map((r: any) => {
      const ot = r.orden_trabajo_id ? otsMap.get(r.orden_trabajo_id) : null;
      const cot = r.cotizacion_id ? cotsMap.get(r.cotizacion_id) : null;
      const exp = r.expediente_id ? expMap.get(r.expediente_id) : null;

      const pId = ot?.prospecto_id || cot?.prospecto_id;
      const prosp = pId ? prospMap.get(pId) : null;

      // Determinación del nombre de cliente más preciso disponible
      let nombreCliente = "Cliente General";
      if (r.tipo === "factura" && r.datos_documento?.razonSocial) {
        nombreCliente = r.datos_documento.razonSocial;
      } else if (r.datos_documento?.personaRecibe) {
        nombreCliente = r.datos_documento.personaRecibe;
      } else if (ot?.cliente_nombre) {
        nombreCliente = ot.cliente_nombre;
      } else if (prosp) {
        const parts = [prosp.nombre, prosp.primer_apellido, prosp.segundo_apellido].filter(Boolean);
        nombreCliente = parts.join(" ") || "Cliente General";
      } else if (exp?.cliente) {
        nombreCliente = exp.cliente;
      }

      // Teléfono y Correo
      const telefonoCliente =
        ot?.cliente_telefono || prosp?.telefono || exp?.telefono || "";
      const emailCliente =
        prosp?.correo || prosp?.email || r.datos_documento?.email || "";
      const direccionCliente =
        r.datos_documento?.direccionEntrega ||
        ot?.cliente_direccion ||
        prosp?.direccion ||
        exp?.fraccionamiento ||
        "";

      // Asesor
      const asesorNombre = ot?.asesor_ejecutor_id
        ? asesoresMap.get(ot.asesor_ejecutor_id) || "Sin asignar"
        : "Sin asignar";

      // Proveedor & Costos de Ejecución
      const provId = r.proveedor_id || ot?.proveedor_id || null;
      const provNombre = provId ? provMap.get(provId) || "Proveedor Asignado" : undefined;
      const provConcepto = ot?.proveedor_concepto || undefined;
      const costoProveedor = Number(r.costo_proveedor || ot?.costo_proveedor || 0);

      // Cobranza & Métodos de Pago (Detección de Terminal / Pasarela)
      const cobrado = r.orden_trabajo_id
        ? cobradoPorOt.get(r.orden_trabajo_id) || 0
        : 0;
      const metodosSet = r.orden_trabajo_id ? metodosPorOt.get(r.orden_trabajo_id) : null;
      const metodosPagoRecibos = metodosSet ? Array.from(metodosSet) : [];
      const tienePasarela =
        metodosPagoRecibos.some((m) =>
          ["terminal_tarjeta", "tarjeta", "terminal", "clip", "pasarela", "stripe"].includes(m)
        ) || Number(r.costo_financiero || 0) > 0;

      const montoTotal = Number(r.monto_total || 0);
      const costoFinanciero = Number(r.costo_financiero || 0);
      const otrosGastos = Number(r.otros_gastos || 0);
      const saldoRestante = Math.max(0, montoTotal - cobrado);

      // BASE GRAVABLE DE COMISIÓN = Total - Costo Financiero (Pasarela) - Costo Ejecución (Proveedor)
      const baseGravableComision = Math.max(0, montoTotal - costoFinanciero - costoProveedor);

      // Comisión registrada si ya existe
      const comData = comMap.get(r.id);

      return {
        id: r.id,
        cotizacionId: r.cotizacion_id || null,
        ordenTrabajoId: r.orden_trabajo_id || null,
        expedienteId: r.expediente_id || null,
        tipo: r.tipo as "remision" | "factura",
        folio: r.folio || "SIN-FOLIO",
        fecha: r.fecha || r.created_at?.split("T")[0] || "",
        tipoCambio: Number(r.tipo_cambio || 1.0),
        datosDocumento: r.datos_documento || {},
        serviciosExtra: Number(r.servicios_extra || 0),
        costoFinanciero,
        otrosGastos,
        costoProveedor,
        montoSubtotal: Number(r.monto_subtotal || 0),
        montoTotal,
        createdAt: r.created_at,
        updatedAt: r.updated_at,

        proveedorId: provId || undefined,
        proveedorNombre: provNombre,
        proveedorConcepto: provConcepto,

        metodosPagoRecibos,
        tienePasarela,

        baseGravableComision,
        comisionAsesorMonto: comData ? Number(comData.monto_comision) : undefined,
        comisionAsesorPorcentaje: comData ? Number(comData.porcentaje_comision) : undefined,
        comisionId: comData?.id,
        comisionEsAjusteManual: comData ? Boolean(comData.es_ajuste_manual) : undefined,
        comisionAjusteModo: comData?.es_ajuste_manual
          ? comData.detalles_calculo?.ajusteModo === "porcentaje"
            ? "porcentaje"
            : "monto"
          : null,
        comisionMotivoAjuste: comData?.motivo_ajuste || undefined,
        comisionMontoPagado: comData ? Number(comData.monto_pagado || 0) : undefined,

        clienteNombre: nombreCliente,
        clienteTelefono: telefonoCliente,
        clienteEmail: emailCliente,
        clienteDireccion: direccionCliente,
        prospectoId: pId,

        ordenFolio: ot?.folio,
        ordenTitulo: ot?.titulo,
        ordenEstatus: ot?.estatus,
        ordenTipoNegocio: ot?.tipo_negocio || cot?.servicio_tipo,
        ordenEntregaToken: ot?.entrega_token,
        asesorId: ot?.asesor_ejecutor_id,
        asesorNombre,

        cotizacionFolio: cot?.folio || cot?.id,
        cotizacionToken: cot?.token,
        cotizacionServicioTipo: cot?.servicio_tipo,

        totalCobrado: cobrado,
        saldoRestante,
      };
    });

    // 6. Filtro en memoria por búsqueda si se envió
    if (filtros?.busqueda?.trim()) {
      const q = filtros.busqueda.toLowerCase().trim();
      return listaEnriquecida.filter((item) => {
        return (
          item.folio.toLowerCase().includes(q) ||
          item.clienteNombre.toLowerCase().includes(q) ||
          (item.clienteTelefono && item.clienteTelefono.toLowerCase().includes(q)) ||
          (item.ordenFolio && item.ordenFolio.toLowerCase().includes(q)) ||
          (item.ordenTitulo && item.ordenTitulo.toLowerCase().includes(q)) ||
          (item.proveedorNombre && item.proveedorNombre.toLowerCase().includes(q)) ||
          (item.datosDocumento?.rfc && String(item.datosDocumento.rfc).toLowerCase().includes(q)) ||
          (item.datosDocumento?.razonSocial && String(item.datosDocumento.razonSocial).toLowerCase().includes(q))
        );
      });
    }

    return listaEnriquecida;
  } catch (error) {
    console.error("Error catastrófico en listarRemisionesFacturas:", error);
    return [];
  }
}

/**
 * Obtiene el detalle completo de una remisión o factura específica por su ID
 */
export async function obtenerRemisionFacturaPorId(
  id: string
): Promise<{ ok: boolean; remision?: RemisionFacturaEnriquecida; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: rem, error } = await sb
      .from("remisiones_facturas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !rem) {
      return { ok: false, error: "Documento no encontrado." };
    }

    const lista = await listarRemisionesFacturas();
    const encontrado = lista.find((r) => r.id === id);

    if (encontrado) {
      return { ok: true, remision: encontrado };
    }

    const montoTotal = Number(rem.monto_total || 0);
    const costoFinanciero = Number(rem.costo_financiero || 0);
    const costoProveedor = Number(rem.costo_proveedor || 0);

    return {
      ok: true,
      remision: {
        id: rem.id,
        cotizacionId: rem.cotizacion_id,
        ordenTrabajoId: rem.orden_trabajo_id,
        expedienteId: rem.expediente_id,
        tipo: rem.tipo,
        folio: rem.folio,
        fecha: rem.fecha,
        tipoCambio: Number(rem.tipo_cambio || 1.0),
        datosDocumento: rem.datos_documento || {},
        serviciosExtra: Number(rem.servicios_extra || 0),
        costoFinanciero,
        otrosGastos: Number(rem.otros_gastos || 0),
        costoProveedor,
        montoSubtotal: Number(rem.monto_subtotal || 0),
        montoTotal,
        createdAt: rem.created_at,
        updatedAt: rem.updated_at,
        metodosPagoRecibos: [],
        tienePasarela: costoFinanciero > 0,
        baseGravableComision: Math.max(0, montoTotal - costoFinanciero - costoProveedor),
        clienteNombre: rem.datos_documento?.razonSocial || rem.datos_documento?.personaRecibe || "Cliente General",
        totalCobrado: 0,
        saldoRestante: montoTotal,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al obtener documento." };
  }
}

/**
 * Actualiza los costos deducibles de una remisión (financiero/pasarela y ejecución/proveedor)
 * y sincroniza automáticamente la base gravable de las comisiones.
 */
export async function actualizarCostosRemision(datos: {
  remisionId: string;
  costoFinanciero: number;
  costoProveedor: number;
  otrosGastos?: number;
}): Promise<{ ok: boolean; success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Obtener la remisión actual
    const { data: rem, error: errRem } = await sb
      .from("remisiones_facturas")
      .select("id, folio, orden_trabajo_id, cotizacion_id, expediente_id")
      .eq("id", datos.remisionId)
      .single();

    if (errRem || !rem) {
      return { ok: false, success: false, error: "Remisión no encontrada." };
    }

    const cFin = Math.max(0, Number(datos.costoFinanciero || 0));
    const cProv = Math.max(0, Number(datos.costoProveedor || 0));

    // 2. Actualizar únicamente las deducciones; el cobro y los montos del
    // documento no se tocan. otros_gastos solo se escribe si se envía.
    const cambios: Record<string, any> = {
      costo_financiero: cFin,
      costo_proveedor: cProv,
      updated_at: new Date().toISOString(),
    };
    if (datos.otrosGastos !== undefined) {
      cambios.otros_gastos = Math.max(0, Number(datos.otrosGastos || 0));
    }

    const { error: errUpd } = await sb
      .from("remisiones_facturas")
      .update(cambios)
      .eq("id", datos.remisionId);

    if (errUpd) throw new Error(errUpd.message);

    // 3. Si tiene orden de trabajo vinculada, sincronizar costo_proveedor en la OT
    if (rem.orden_trabajo_id && cProv > 0) {
      await sb
        .from("ordenes_trabajo")
        .update({
          costo_proveedor: cProv,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rem.orden_trabajo_id);
    }

    // 4. Sincronizar comisiones automáticamente para reflejar la nueva base gravable
    try {
      const { sincronizarComisionParaRemision } = await import("@/app/actions/comisiones");
      await sincronizarComisionParaRemision(datos.remisionId);
    } catch (errCom) {
      console.warn("Aviso al recalcular comisión tras actualizar costos:", errCom);
    }

    revalidatePath("/remisiones");
    revalidatePath("/comisiones");
    if (rem.orden_trabajo_id) revalidatePath(`/ordenes-trabajo/${rem.orden_trabajo_id}`);
    if (rem.cotizacion_id) revalidatePath(`/construccion/${rem.cotizacion_id}`);

    return { ok: true, success: true };
  } catch (err: any) {
    console.error("Error en actualizarCostosRemision:", err);
    return { ok: false, success: false, error: err?.message || "Error al actualizar costos." };
  }
}

export interface TasaPasarela {
  id: string;
  clave: string;
  etiqueta: string;
  porcentaje: number;
  notas: string;
}

/**
 * Parámetros para el editor de deducciones y comisión de una remisión:
 * tasas de pasarela configuradas (reglas tipo 'pasarela') y el porcentaje
 * que la regla automática asignaría al asesor.
 */
export async function obtenerParametrosComisionRemision(remisionId: string): Promise<{
  ok: boolean;
  tasasPasarela: TasaPasarela[];
  porcentajeRegla: number;
  reglaOrigen: string;
  error?: string;
}> {
  const tasasPorDefecto: TasaPasarela[] = [
    { id: "default-clip", clave: "clip", etiqueta: "Clip", porcentaje: 4.18, notas: "3.6% Clip + IVA" },
    { id: "default-bancaria", clave: "bancaria", etiqueta: "Bancaria", porcentaje: 3.5, notas: "Terminal bancaria" },
  ];

  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: reglasPasarela, error: errPas } = await sb
      .from("comisiones_reglas")
      .select("id, clave, etiqueta, porcentaje, notas")
      .eq("tipo", "pasarela")
      .eq("activo", true)
      .order("etiqueta", { ascending: true });

    // Si la migración aún no se aplica, se usan las tasas por defecto
    const tasasPasarela: TasaPasarela[] =
      !errPas && reglasPasarela && reglasPasarela.length > 0
        ? reglasPasarela.map((r: any) => ({
            id: r.id,
            clave: r.clave,
            etiqueta: r.etiqueta,
            porcentaje: Number(r.porcentaje || 0),
            notas: r.notas || "",
          }))
        : tasasPorDefecto;

    // Resolver el % de la regla automática (asesor de la comisión o del prospecto)
    const { data: rem } = await sb
      .from("remisiones_facturas")
      .select("id, cotizacion_id, orden_trabajo_id")
      .eq("id", remisionId)
      .maybeSingle();

    let asesorId: string | null = null;
    let servicioTipo: string | null = null;

    const { data: com } = await sb
      .from("comisiones")
      .select("asesor_id")
      .eq("remision_factura_id", remisionId)
      .maybeSingle();
    asesorId = com?.asesor_id || null;

    if (rem?.cotizacion_id) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("servicio_tipo, prospecto_id")
        .eq("id", rem.cotizacion_id)
        .maybeSingle();
      servicioTipo = cot?.servicio_tipo || null;
      if (!asesorId && cot?.prospecto_id) {
        const { data: pros } = await sb
          .from("prospectos")
          .select("asesor_id")
          .eq("id", cot.prospecto_id)
          .maybeSingle();
        asesorId = pros?.asesor_id || null;
      }
    }

    if (!asesorId && rem?.orden_trabajo_id) {
      const { data: ot } = await sb
        .from("ordenes_trabajo")
        .select("asesor_responsable_id, asesor_ejecutor_id")
        .eq("id", rem.orden_trabajo_id)
        .maybeSingle();
      asesorId = ot?.asesor_responsable_id || ot?.asesor_ejecutor_id || null;
    }

    const { resolverPorcentajeComision } = await import("@/app/actions/comisiones");
    const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({ asesorId, servicioTipo });

    return { ok: true, tasasPasarela, porcentajeRegla: porcentaje, reglaOrigen };
  } catch (err: any) {
    return {
      ok: false,
      tasasPasarela: tasasPorDefecto,
      porcentajeRegla: 5,
      reglaOrigen: "Regla por defecto de contingencia (5.0%)",
      error: err?.message || "Error al cargar parámetros.",
    };
  }
}

/**
 * Ajusta la comisión del asesor de una remisión en particular.
 * - automatica: quita el ajuste manual y vuelve a aplicar la regla configurada.
 * - porcentaje: fija un % propio para esta remisión (el monto sigue a la base gravable).
 * - monto: fija un monto de comisión exacto para esta remisión.
 * No modifica el cobro, los recibos ni los montos del documento.
 */
export async function ajustarComisionAsesorRemision(datos: {
  remisionId: string;
  modo: "automatica" | "porcentaje" | "monto";
  porcentaje?: number;
  monto?: number;
  motivo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { sincronizarComisionParaRemision } = await import("@/app/actions/comisiones");

    // Asegurar que exista la comisión de la remisión
    let { data: com } = await sb
      .from("comisiones")
      .select("id, base_comisionable, monto_pagado, estatus, detalles_calculo")
      .eq("remision_factura_id", datos.remisionId)
      .maybeSingle();

    if (!com) {
      const resSync = await sincronizarComisionParaRemision(datos.remisionId);
      if (!resSync.ok) return { ok: false, error: resSync.error || "No se pudo generar la comisión." };
      const { data: creada } = await sb
        .from("comisiones")
        .select("id, base_comisionable, monto_pagado, estatus, detalles_calculo")
        .eq("remision_factura_id", datos.remisionId)
        .maybeSingle();
      com = creada;
    }

    if (!com) return { ok: false, error: "No se encontró la comisión de la remisión." };

    if (datos.modo === "automatica") {
      const detalles = { ...(com.detalles_calculo || {}) };
      delete detalles.ajusteModo;
      const { error } = await sb
        .from("comisiones")
        .update({
          es_ajuste_manual: false,
          motivo_ajuste: "",
          detalles_calculo: detalles,
          updated_at: new Date().toISOString(),
        })
        .eq("id", com.id);
      if (error) throw new Error(error.message);
      await sincronizarComisionParaRemision(datos.remisionId);
    } else {
      const motivo = (datos.motivo || "").trim();
      if (!motivo) return { ok: false, error: "Indique el motivo del ajuste de comisión." };

      const base = Number(com.base_comisionable || 0);
      let porcentaje: number;
      let monto: number;

      if (datos.modo === "porcentaje") {
        porcentaje = Math.max(0, Math.min(100, Number(datos.porcentaje || 0)));
        monto = Math.round(base * (porcentaje / 100) * 100) / 100;
      } else {
        monto = Math.max(0, Math.round(Number(datos.monto || 0) * 100) / 100);
        porcentaje = base > 0 ? Math.min(100, Math.round((monto / base) * 10000) / 100) : 0;
      }

      const pagado = Number(com.monto_pagado || 0);
      const estatus =
        com.estatus === "cancelada"
          ? "cancelada"
          : pagado >= monto
          ? "pagada"
          : pagado > 0
          ? "parcial"
          : "pendiente";

      const { error } = await sb
        .from("comisiones")
        .update({
          porcentaje_comision: porcentaje,
          monto_comision: monto,
          saldo_pendiente: Math.max(0, monto - pagado),
          estatus,
          es_ajuste_manual: true,
          motivo_ajuste: motivo,
          detalles_calculo: {
            ...(com.detalles_calculo || {}),
            ajusteModo: datos.modo,
            fechaAjuste: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", com.id);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/remisiones");
    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al ajustar la comisión." };
  }
}

/**
 * Elimina una remisión o factura (Solo administradores)
 */
export async function eliminarRemisionFactura(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb.from("remisiones_facturas").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/remisiones");
    revalidatePath("/ordenes-trabajo");
    revalidatePath("/comisiones");

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar remisión." };
  }
}
