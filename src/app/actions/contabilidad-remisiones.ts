"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

/**
 * La remisión manda: una vez aplicada, sus importes definitivos se reflejan
 * en Finanzas y en el centro de costos por producto.
 *
 *   venta            → ingreso  · ingresos_ventas    (pagado cuando los recibos cubren el total)
 *   costo_proveedor  → egreso   · costo_directo      (cuenta por pagar al proveedor)
 *   costo_financiero → egreso   · gastos_financieros (terminal/pasarela, se liquida al cobrar)
 *   otros_gastos     → egreso   · costo_directo      (otros gastos de venta de la remisión)
 *   comision         → egreso   · opex_nomina        (pagado cuando la comisión está pagada)
 *
 * Cada movimiento queda ligado a la remisión (origen_modulo/origen_id/origen_concepto),
 * así que editar la remisión actualiza el mismo movimiento en vez de duplicarlo.
 */

type ConceptoRemision = "venta" | "costo_proveedor" | "costo_financiero" | "otros_gastos" | "comision";

const ORIGEN = "remision";
const r2 = (n: number) => Math.round(n * 100) / 100;
const hoyISO = () => new Date().toISOString().split("T")[0];

/** El concepto contiene el folio exacto (sin confundir REM-2026-0001 con REM-2026-00010). */
function contieneFolio(concepto: string, folio: string): boolean {
  const idx = concepto.indexOf(folio);
  if (idx < 0) return false;
  const siguiente = concepto.charAt(idx + folio.length);
  return !/[0-9]/.test(siguiente);
}

/** Documentos de proveedor que corresponden a la obra de la remisión. */
async function documentosProveedorDeObra(
  sb: ReturnType<typeof supabaseServidor>,
  ordenTrabajoId: string | null,
  cotizacionId: string | null
): Promise<any[]> {
  const filtros: string[] = [];
  if (ordenTrabajoId) filtros.push(`orden_trabajo_id.eq.${ordenTrabajoId}`);
  if (cotizacionId) filtros.push(`cotizacion_id.eq.${cotizacionId}`);
  if (filtros.length === 0) return [];
  const { data } = await sb
    .from("documentos_proveedores")
    .select("id, folio, folio_proveedor, monto, producto_id, producto_nombre")
    .or(filtros.join(","));
  return data || [];
}

/**
 * Sincroniza en Finanzas y en el centro de costos los importes definitivos de una remisión.
 * Es idempotente: se puede llamar cada vez que cambie la remisión, sus cobros o su comisión.
 */
export async function sincronizarFinanzasRemision(
  remisionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = supabaseServidor();

    const { data: rem, error: errRem } = await sb
      .from("remisiones_facturas")
      .select("id, folio, tipo, fecha, monto_total, monto_subtotal, costo_financiero, costo_proveedor, otros_gastos, cotizacion_id, expediente_id, orden_trabajo_id, datos_documento")
      .eq("id", remisionId)
      .maybeSingle();

    if (errRem || !rem) return { ok: false, error: "Remisión no encontrada." };

    const folio: string = rem.folio || "";
    const fecha: string = rem.fecha || hoyISO();
    const montoTotal = Number(rem.monto_total || rem.monto_subtotal || 0);
    const costoFinanciero = Number(rem.costo_financiero || 0);
    const otrosGastos = Number(rem.otros_gastos || 0);

    // ---- Datos relacionados ----
    let ot: any = null;
    if (rem.orden_trabajo_id) {
      const { data } = await sb
        .from("ordenes_trabajo")
        .select("id, titulo, costo_proveedor, cliente_nombre, proveedor_id")
        .eq("id", rem.orden_trabajo_id)
        .maybeSingle();
      ot = data;
    }
    const costoProveedorCapturado = Number(rem.costo_proveedor || ot?.costo_proveedor || 0);

    let cot: any = null;
    if (rem.cotizacion_id) {
      const { data } = await sb
        .from("cotizaciones")
        .select("id, servicio_tipo, prospecto_id")
        .eq("id", rem.cotizacion_id)
        .maybeSingle();
      cot = data;
    }

    let clienteNombre: string =
      rem.datos_documento?.razonSocial || rem.datos_documento?.personaRecibe || ot?.cliente_nombre || "";
    if (!clienteNombre && cot?.prospecto_id) {
      const { data: pr } = await sb.from("prospectos").select("nombre").eq("id", cot.prospecto_id).maybeSingle();
      clienteNombre = pr?.nombre || "";
    }
    clienteNombre = clienteNombre || "Cliente";

    let proveedorNombre = "Proveedor";
    if (ot?.proveedor_id) {
      const { data: prov } = await sb.from("proveedores").select("nombre").eq("id", ot.proveedor_id).maybeSingle();
      proveedorNombre = prov?.nombre || proveedorNombre;
    }

    // Cobranza (recibos de la OT)
    let totalCobrado = 0;
    let ultimaFechaCobro: string | null = null;
    if (rem.orden_trabajo_id) {
      const { data: recibos } = await sb
        .from("recibos_pago")
        .select("monto, fecha_pago")
        .eq("orden_trabajo_id", rem.orden_trabajo_id);
      totalCobrado = (recibos || []).reduce((acc: number, r: any) => acc + Number(r.monto || 0), 0);
      ultimaFechaCobro =
        (recibos || []).map((r: any) => r.fecha_pago).filter(Boolean).sort().pop() || null;
    }
    const ventaCobrada = montoTotal > 0 && totalCobrado >= montoTotal - 0.01;

    // Comisión del asesor
    const { data: com } = await sb
      .from("comisiones")
      .select("id, monto_comision, estatus, updated_at, asesor_id")
      .eq("remision_factura_id", remisionId)
      .maybeSingle();
    const montoComision = com && com.estatus !== "cancelada" ? Number(com.monto_comision || 0) : 0;
    let asesorNombre = "Asesor";
    if (com?.asesor_id) {
      const { data: as } = await sb.from("perfiles").select("nombre").eq("id", com.asesor_id).maybeSingle();
      asesorNombre = as?.nombre || asesorNombre;
    }

    // crm_deal_id solo si el expediente existe (FK)
    let crmDealId: string | null = null;
    if (rem.expediente_id) {
      const { data: exp } = await sb.from("expedientes").select("id").eq("id", rem.expediente_id).maybeSingle();
      crmDealId = exp?.id || null;
    }

    // Categorías por línea de P&L
    const { data: categorias } = await sb
      .from("categories")
      .select("id, linea_pnl")
      .eq("activo", true)
      .in("linea_pnl", ["ingresos_ventas", "costo_directo", "gastos_financieros", "opex_nomina"]);
    const catPorLinea = new Map<string, string>();
    (categorias || []).forEach((c: any) => {
      if (!catPorLinea.has(c.linea_pnl)) catPorLinea.set(c.linea_pnl, c.id);
    });

    // ---- Movimientos ya ligados y registros previos sin vínculo (por folio) ----
    const { data: ligados } = await sb
      .from("transactions")
      .select("id, origen_concepto, estado, fecha_pago")
      .eq("origen_modulo", ORIGEN)
      .eq("origen_id", remisionId);
    const ligadoPorConcepto = new Map<string, any>();
    (ligados || []).forEach((t: any) => ligadoPorConcepto.set(t.origen_concepto, t));

    let previosSinVinculo: any[] = [];
    if (folio) {
      const { data } = await sb
        .from("transactions")
        .select("id, tipo, concepto, estado, fecha_pago")
        .is("origen_modulo", null)
        .ilike("concepto", `%${folio}%`);
      previosSinVinculo = (data || []).filter((t: any) => contieneFolio(t.concepto || "", folio));
    }

    // Registros del módulo legado (transacciones_financieras se copia sola a transactions)
    const idsPrevios = previosSinVinculo.map((t) => t.id);
    const idsLegado = new Set<string>();
    if (idsPrevios.length > 0) {
      const { data: legado } = await sb.from("transacciones_financieras").select("id").in("id", idsPrevios);
      (legado || []).forEach((l: any) => idsLegado.add(l.id));
    }

    const clasificarPrevio = (t: any): ConceptoRemision | null => {
      const c: string = t.concepto || "";
      if (t.tipo === "ingreso" && (c.startsWith("Venta - ") || c.includes("Venta de Cotización"))) return "venta";
      if (t.tipo === "egreso" && c.startsWith("Costo Financiero de ")) return "costo_financiero";
      if (t.tipo === "egreso" && c.startsWith("Otros Gastos de ")) return "otros_gastos";
      if (t.tipo === "egreso" && c.startsWith("Comisión ")) return "comision";
      return null;
    };

    const eliminarMovimiento = async (id: string) => {
      if (idsLegado.has(id)) {
        await sb.from("transacciones_financieras").delete().eq("id", id);
      }
      await sb.from("transactions").delete().eq("id", id);
    };

    const aplicarMovimiento = async (p: {
      concepto: ConceptoRemision;
      tipo: "ingreso" | "egreso";
      lineaPnl: string;
      monto: number;
      descripcion: string;
      contraparte: string;
      liquidado: boolean;
      fechaPago: string | null;
    }) => {
      // Adoptar un registro previo sin vínculo (el más reciente que no sea legado);
      // los demás duplicados se eliminan.
      const previos = previosSinVinculo.filter((t) => clasificarPrevio(t) === p.concepto);
      let existente = ligadoPorConcepto.get(p.concepto) || null;
      for (const t of previos) {
        if (!existente && !idsLegado.has(t.id)) {
          existente = t;
        } else {
          await eliminarMovimiento(t.id);
        }
      }

      if (p.monto <= 0) {
        if (existente) await eliminarMovimiento(existente.id);
        return;
      }

      const categoriaId = catPorLinea.get(p.lineaPnl);
      if (!categoriaId) {
        console.warn(`sincronizarFinanzasRemision: falta categoría activa para ${p.lineaPnl}.`);
        return;
      }

      // Nunca se revierte a "pendiente" un movimiento que ya se marcó pagado en Finanzas.
      const yaPagado = existente?.estado === "pagado";
      const estado = p.liquidado || yaPagado ? "pagado" : "pendiente";
      const fechaPago =
        estado === "pagado" ? (yaPagado && existente?.fecha_pago) || p.fechaPago || fecha : null;

      const payload = {
        fecha_operacion: fecha,
        fecha_pago: fechaPago,
        tipo: p.tipo,
        categoria_id: categoriaId,
        monto_total: r2(p.monto),
        concepto: p.descripcion,
        contraparte: p.contraparte,
        crm_deal_id: crmDealId,
        estado,
        origen_modulo: ORIGEN,
        origen_id: remisionId,
        origen_concepto: p.concepto,
        updated_at: new Date().toISOString(),
      };

      if (existente) {
        const { error } = await sb.from("transactions").update(payload).eq("id", existente.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb.from("transactions").insert({ ...payload, is_demo: false });
        if (error) throw new Error(error.message);
      }
    };

    const tituloObra = ot?.titulo ? ` - ${ot.titulo}` : "";

    await aplicarMovimiento({
      concepto: "venta",
      tipo: "ingreso",
      lineaPnl: "ingresos_ventas",
      monto: montoTotal,
      descripcion: `Venta - ${folio}${tituloObra}`,
      contraparte: clienteNombre,
      liquidado: ventaCobrada,
      fechaPago: ultimaFechaCobro,
    });

    // Costo de proveedor: la remisión sustituye a los documentos de proveedor de la misma obra.
    const docsObra = await documentosProveedorDeObra(sb, rem.orden_trabajo_id, rem.cotizacion_id);
    // Si la remisión no trae costo de proveedor capturado, se usa lo que suman
    // los documentos del proveedor de la obra para no perder ese costo.
    const costoProveedor =
      costoProveedorCapturado > 0
        ? costoProveedorCapturado
        : r2(docsObra.reduce((acc, d) => acc + Number(d.monto || 0), 0));
    let proveedorLiquidado = false;
    let fechaPagoProveedor: string | null = null;
    if (docsObra.length > 0) {
      const idsDocs = docsObra.map((d) => d.id);
      const { data: movsDocs } = await sb
        .from("transactions")
        .select("id, estado, fecha_pago")
        .eq("origen_modulo", "documento_proveedor")
        .in("origen_id", idsDocs);

      const foliosDocs = docsObra
        .map((d) => d.folio_proveedor || d.folio)
        .filter((f: string | null) => f && f !== "s/folio");
      let movsLegado: any[] = [];
      for (const f of foliosDocs) {
        const { data } = await sb
          .from("transactions")
          .select("id, concepto, estado, fecha_pago")
          .is("origen_modulo", null)
          .eq("tipo", "egreso")
          .ilike("concepto", `Compra a Proveedor - %${f}%`);
        movsLegado = movsLegado.concat((data || []).filter((t: any) => contieneFolio(t.concepto || "", f)));
      }

      const reemplazados = [...(movsDocs || []), ...movsLegado];
      if (reemplazados.length > 0) {
        proveedorLiquidado = reemplazados.every((t: any) => t.estado === "pagado");
        fechaPagoProveedor =
          reemplazados.map((t: any) => t.fecha_pago).filter(Boolean).sort().pop() || null;
        for (const t of reemplazados) {
          await sb.from("transactions").delete().eq("id", t.id);
        }
      }
    }

    await aplicarMovimiento({
      concepto: "costo_proveedor",
      tipo: "egreso",
      lineaPnl: "costo_directo",
      monto: costoProveedor,
      descripcion: `Costo de Proveedor - ${folio}${tituloObra}`,
      contraparte: proveedorNombre,
      liquidado: proveedorLiquidado,
      fechaPago: fechaPagoProveedor,
    });

    await aplicarMovimiento({
      concepto: "costo_financiero",
      tipo: "egreso",
      lineaPnl: "gastos_financieros",
      monto: costoFinanciero,
      descripcion: `Comisión Bancaria / Terminal - ${folio}`,
      contraparte: "Terminal / Pasarela de pago",
      liquidado: ventaCobrada,
      fechaPago: ultimaFechaCobro,
    });

    await aplicarMovimiento({
      concepto: "otros_gastos",
      tipo: "egreso",
      lineaPnl: "costo_directo",
      monto: otrosGastos,
      descripcion: `Otros Gastos de Venta - ${folio}`,
      contraparte: clienteNombre,
      liquidado: false,
      fechaPago: null,
    });

    await aplicarMovimiento({
      concepto: "comision",
      tipo: "egreso",
      lineaPnl: "opex_nomina",
      monto: montoComision,
      descripcion: `Comisión ${asesorNombre} - ${folio}`,
      contraparte: asesorNombre,
      liquidado: com?.estatus === "pagada",
      fechaPago: com?.estatus === "pagada" ? (com.updated_at || "").split("T")[0] || null : null,
    });

    // ---- Centro de costos por producto ----
    await recalcularRentabilidadProductos(sb, {
      remisionId,
      fecha,
      montoTotal,
      costoProveedor,
      costoFinanciero,
      otrosGastos,
      montoComision,
      cotizacionId: rem.cotizacion_id,
      ordenTrabajoId: rem.orden_trabajo_id,
      expedienteId: crmDealId,
      nombreSinDesglose: cot?.servicio_tipo || ot?.titulo || "Sin desglose de producto",
      docsObra,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("Error en sincronizarFinanzasRemision:", err?.message);
    return { ok: false, error: err?.message || "Error al sincronizar la remisión con Finanzas." };
  }
}

/**
 * Desglosa la remisión por producto/servicio. El ingreso se toma de los conceptos
 * de la cotización (escalados al total remitido); el costo de proveedor se asigna
 * directo al producto cuando el documento del proveedor lo indica y el resto (más
 * otros gastos de venta) se prorratea por ingreso, igual que el costo financiero
 * y la comisión.
 */
async function recalcularRentabilidadProductos(
  sb: ReturnType<typeof supabaseServidor>,
  p: {
    remisionId: string;
    fecha: string;
    montoTotal: number;
    costoProveedor: number;
    costoFinanciero: number;
    otrosGastos: number;
    montoComision: number;
    cotizacionId: string | null;
    ordenTrabajoId: string | null;
    expedienteId: string | null;
    nombreSinDesglose: string;
    docsObra: any[];
  }
): Promise<void> {
  type Linea = {
    productoId: string | null;
    nombre: string;
    cantidad: number;
    unidad: string;
    importe: number;
    ingreso: number;
    costoProveedor: number;
    costoFinanciero: number;
    comision: number;
  };

  const grupos = new Map<string, Linea>();

  if (p.cotizacionId) {
    const { data: conceptos } = await sb
      .from("cotizacion_conceptos")
      .select("producto_servicio_id, descripcion, cantidad, unidad, importe")
      .eq("cotizacion_id", p.cotizacionId);

    const idsProd = Array.from(
      new Set((conceptos || []).map((c: any) => c.producto_servicio_id).filter(Boolean))
    ) as string[];
    const nombresProd = new Map<string, string>();
    if (idsProd.length > 0) {
      const { data: prods } = await sb.from("productos_servicios").select("id, nombre").in("id", idsProd);
      (prods || []).forEach((pr: any) => nombresProd.set(pr.id, pr.nombre));
    }

    for (const c of conceptos || []) {
      const importe = Number(c.importe || 0);
      if (importe <= 0) continue;
      const nombre =
        (c.producto_servicio_id && nombresProd.get(c.producto_servicio_id)) ||
        (c.descripcion || "").trim() ||
        "Concepto sin nombre";
      const clave = c.producto_servicio_id || `desc:${nombre.toLowerCase()}`;
      const g = grupos.get(clave) || {
        productoId: c.producto_servicio_id || null,
        nombre,
        cantidad: 0,
        unidad: c.unidad || "m2",
        importe: 0,
        ingreso: 0,
        costoProveedor: 0,
        costoFinanciero: 0,
        comision: 0,
      };
      g.cantidad += Number(c.cantidad || 0);
      g.importe += importe;
      grupos.set(clave, g);
    }
  }

  let lineas = Array.from(grupos.values());
  if (lineas.length === 0) {
    lineas = [
      {
        productoId: null,
        nombre: p.nombreSinDesglose,
        cantidad: 0,
        unidad: "lote",
        importe: p.montoTotal,
        ingreso: 0,
        costoProveedor: 0,
        costoFinanciero: 0,
        comision: 0,
      },
    ];
  }

  // Reparte un monto entre las líneas según un peso, cuadrando centavos en la última.
  const repartir = (total: number, pesos: number[], asignar: (l: Linea, v: number) => void) => {
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    let acumulado = 0;
    lineas.forEach((l, i) => {
      const v =
        i === lineas.length - 1
          ? r2(total - acumulado)
          : sumaPesos > 0
          ? r2((total * pesos[i]) / sumaPesos)
          : r2(total / lineas.length);
      acumulado = r2(acumulado + v);
      asignar(l, v);
    });
  };

  repartir(p.montoTotal, lineas.map((l) => l.importe), (l, v) => (l.ingreso = v));

  // Costo de proveedor directo por producto (según documentos del proveedor)
  const directoPorProducto = new Map<string, number>();
  for (const d of p.docsObra) {
    if (!d.producto_id) continue;
    if (!lineas.some((l) => l.productoId === d.producto_id)) continue;
    directoPorProducto.set(d.producto_id, (directoPorProducto.get(d.producto_id) || 0) + Number(d.monto || 0));
  }
  const directoTotal = Array.from(directoPorProducto.values()).reduce((a, b) => a + b, 0);
  const escalaDirecto = directoTotal > p.costoProveedor && directoTotal > 0 ? p.costoProveedor / directoTotal : 1;
  let asignadoDirecto = 0;
  lineas.forEach((l) => {
    const directo = l.productoId ? r2((directoPorProducto.get(l.productoId) || 0) * escalaDirecto) : 0;
    l.costoProveedor = directo;
    asignadoDirecto = r2(asignadoDirecto + directo);
  });
  // El resto del costo de proveedor y los otros gastos de venta se prorratean como costo directo
  const restanteProveedor = r2(Math.max(0, p.costoProveedor - asignadoDirecto) + p.otrosGastos);
  repartir(restanteProveedor, lineas.map((l) => l.ingreso), (l, v) => (l.costoProveedor = r2(l.costoProveedor + v)));

  repartir(p.costoFinanciero, lineas.map((l) => l.ingreso), (l, v) => (l.costoFinanciero = v));
  repartir(p.montoComision, lineas.map((l) => l.ingreso), (l, v) => (l.comision = v));

  await sb.from("remisiones_rentabilidad_productos").delete().eq("remision_factura_id", p.remisionId);

  if (p.montoTotal <= 0) return;

  const filas = lineas.map((l) => ({
    remision_factura_id: p.remisionId,
    fecha: p.fecha,
    producto_servicio_id: l.productoId,
    producto_nombre: l.nombre,
    cantidad: r2(l.cantidad),
    unidad: l.unidad,
    ingreso: l.ingreso,
    costo_proveedor: l.costoProveedor,
    costo_financiero: l.costoFinanciero,
    comision: l.comision,
    utilidad: r2(l.ingreso - l.costoProveedor - l.costoFinanciero - l.comision),
    orden_trabajo_id: p.ordenTrabajoId,
    expediente_id: p.expedienteId,
  }));

  const { error } = await sb.from("remisiones_rentabilidad_productos").insert(filas);
  if (error) console.warn("No se pudo registrar el centro de costos de la remisión:", error.message);
}

/** Sincroniza las remisiones ligadas a una orden de trabajo (p. ej. tras registrar un cobro). */
export async function sincronizarFinanzasPorOrdenTrabajo(ordenTrabajoId: string): Promise<void> {
  try {
    const sb = supabaseServidor();
    const { data } = await sb
      .from("remisiones_facturas")
      .select("id")
      .eq("orden_trabajo_id", ordenTrabajoId);
    for (const r of data || []) {
      await sincronizarFinanzasRemision(r.id);
    }
  } catch (err: any) {
    console.warn("Aviso al sincronizar Finanzas por orden de trabajo:", err?.message);
  }
}

/** Indica si la obra (OT o cotización) ya tiene una remisión que manda sobre sus costos. */
export async function obraTieneRemision(
  ordenTrabajoId: string | null,
  cotizacionId: string | null
): Promise<boolean> {
  const filtros: string[] = [];
  if (ordenTrabajoId) filtros.push(`orden_trabajo_id.eq.${ordenTrabajoId}`);
  if (cotizacionId) filtros.push(`cotizacion_id.eq.${cotizacionId}`);
  if (filtros.length === 0) return false;
  const sb = supabaseServidor();
  const { data } = await sb.from("remisiones_facturas").select("id").or(filtros.join(",")).limit(1);
  return Boolean(data && data.length > 0);
}

/** Recalcula Finanzas y centro de costos de todas las remisiones (corrige históricos y duplicados). */
export async function recalcularContabilidadRemisiones(): Promise<{
  ok: boolean;
  procesadas: number;
  errores: number;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data } = await sb.from("remisiones_facturas").select("id").order("fecha", { ascending: true });
    let procesadas = 0;
    let errores = 0;
    for (const r of data || []) {
      const res = await sincronizarFinanzasRemision(r.id);
      if (res.ok) procesadas++;
      else errores++;
    }
    revalidatePath("/finanzas");
    revalidatePath("/remisiones");
    return { ok: true, procesadas, errores };
  } catch (err: any) {
    return { ok: false, procesadas: 0, errores: 0, error: err?.message || "Error al recalcular." };
  }
}

// ============================================================
// Reporte: Rentabilidad y retorno por producto
// ============================================================

export interface RentabilidadProducto {
  clave: string;
  productoId: string | null;
  productoNombre: string;
  unidad: string;
  remisiones: number;
  cantidad: number;
  ingreso: number;
  costoProveedor: number;
  costoFinanciero: number;
  comision: number;
  costoTotal: number;
  utilidad: number;
  /** Utilidad / ingreso (%) */
  margen: number;
  /** Utilidad / costo total invertido (%) */
  roi: number;
  precioPromedioUnidad: number | null;
  costoProveedorPromedioUnidad: number | null;
}

export interface ReporteRentabilidadProductos {
  productos: RentabilidadProducto[];
  totales: {
    remisiones: number;
    ingreso: number;
    costoProveedor: number;
    costoFinanciero: number;
    comision: number;
    costoTotal: number;
    utilidad: number;
    margen: number;
    roi: number;
  };
}

export async function obtenerRentabilidadProductos(
  fechaInicio?: string,
  fechaFin?: string
): Promise<ReporteRentabilidadProductos> {
  await requireAdmin();
  const sb = supabaseServidor();

  let query = sb
    .from("remisiones_rentabilidad_productos")
    .select("remision_factura_id, producto_servicio_id, producto_nombre, cantidad, unidad, ingreso, costo_proveedor, costo_financiero, comision, utilidad");
  if (fechaInicio) query = query.gte("fecha", fechaInicio);
  if (fechaFin) query = query.lte("fecha", fechaFin);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const grupos = new Map<string, RentabilidadProducto & { _rems: Set<string> }>();
  const remisionesTotales = new Set<string>();

  for (const f of data || []) {
    const clave = f.producto_servicio_id || `nombre:${(f.producto_nombre || "").toLowerCase()}`;
    const g =
      grupos.get(clave) ||
      ({
        clave,
        productoId: f.producto_servicio_id || null,
        productoNombre: f.producto_nombre || "Sin nombre",
        unidad: f.unidad || "m2",
        remisiones: 0,
        cantidad: 0,
        ingreso: 0,
        costoProveedor: 0,
        costoFinanciero: 0,
        comision: 0,
        costoTotal: 0,
        utilidad: 0,
        margen: 0,
        roi: 0,
        precioPromedioUnidad: null,
        costoProveedorPromedioUnidad: null,
        _rems: new Set<string>(),
      } as RentabilidadProducto & { _rems: Set<string> });

    g._rems.add(f.remision_factura_id);
    remisionesTotales.add(f.remision_factura_id);
    g.cantidad += Number(f.cantidad || 0);
    g.ingreso += Number(f.ingreso || 0);
    g.costoProveedor += Number(f.costo_proveedor || 0);
    g.costoFinanciero += Number(f.costo_financiero || 0);
    g.comision += Number(f.comision || 0);
    g.utilidad += Number(f.utilidad || 0);
    grupos.set(clave, g);
  }

  const productos: RentabilidadProducto[] = Array.from(grupos.values())
    .map(({ _rems, ...g }) => {
      const costoTotal = g.costoProveedor + g.costoFinanciero + g.comision;
      return {
        ...g,
        remisiones: _rems.size,
        cantidad: r2(g.cantidad),
        ingreso: r2(g.ingreso),
        costoProveedor: r2(g.costoProveedor),
        costoFinanciero: r2(g.costoFinanciero),
        comision: r2(g.comision),
        costoTotal: r2(costoTotal),
        utilidad: r2(g.utilidad),
        margen: g.ingreso > 0 ? r2((g.utilidad / g.ingreso) * 100) : 0,
        roi: costoTotal > 0 ? r2((g.utilidad / costoTotal) * 100) : 0,
        precioPromedioUnidad: g.cantidad > 0 ? r2(g.ingreso / g.cantidad) : null,
        costoProveedorPromedioUnidad: g.cantidad > 0 ? r2(g.costoProveedor / g.cantidad) : null,
      };
    })
    .sort((a, b) => b.utilidad - a.utilidad);

  const t = productos.reduce(
    (acc, p) => ({
      ingreso: acc.ingreso + p.ingreso,
      costoProveedor: acc.costoProveedor + p.costoProveedor,
      costoFinanciero: acc.costoFinanciero + p.costoFinanciero,
      comision: acc.comision + p.comision,
      utilidad: acc.utilidad + p.utilidad,
    }),
    { ingreso: 0, costoProveedor: 0, costoFinanciero: 0, comision: 0, utilidad: 0 }
  );
  const costoTotal = t.costoProveedor + t.costoFinanciero + t.comision;

  return {
    productos,
    totales: {
      remisiones: remisionesTotales.size,
      ingreso: r2(t.ingreso),
      costoProveedor: r2(t.costoProveedor),
      costoFinanciero: r2(t.costoFinanciero),
      comision: r2(t.comision),
      costoTotal: r2(costoTotal),
      utilidad: r2(t.utilidad),
      margen: t.ingreso > 0 ? r2((t.utilidad / t.ingreso) * 100) : 0,
      roi: costoTotal > 0 ? r2((t.utilidad / costoTotal) * 100) : 0,
    },
  };
}

// ============================================================
// Validación de costos definitivos antes de generar la remisión
// ============================================================

export interface PrevisualizacionCostosRemision {
  montoTotal: number;
  costoProveedorPactado: number;
  costoProveedorDocumentos: number;
  documentosProveedor: number;
  costoProveedorSugerido: number;
  comisionBancariaPct: number;
  costoFinancieroSugerido: number;
  porcentajeComision: number;
  reglaComision: string;
  asesorNombre: string | null;
}

export async function previsualizarCostosRemisionOT(
  ordenTrabajoId: string
): Promise<{ ok: boolean; datos?: PrevisualizacionCostosRemision; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: ot } = await sb
      .from("ordenes_trabajo")
      .select("id, cotizacion_id, expediente_id, costo_proveedor, comision_bancaria_pct, asesor_responsable_id, asesor_ejecutor_id")
      .eq("id", ordenTrabajoId)
      .maybeSingle();
    if (!ot) return { ok: false, error: "Orden de trabajo no encontrada." };

    let montoTotal = 0;
    let servicioTipo: string | null = null;
    let asesorId: string | null = null;
    if (ot.cotizacion_id) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("precio_final, servicio_tipo, prospecto_id")
        .eq("id", ot.cotizacion_id)
        .maybeSingle();
      montoTotal = Number(cot?.precio_final || 0);
      servicioTipo = cot?.servicio_tipo || null;
      if (cot?.prospecto_id) {
        const { data: pr } = await sb.from("prospectos").select("asesor_id").eq("id", cot.prospecto_id).maybeSingle();
        asesorId = pr?.asesor_id || null;
      }
    }
    if (!asesorId && ot.expediente_id) {
      const { data: exp } = await sb.from("expedientes").select("asesor_id").eq("id", ot.expediente_id).maybeSingle();
      asesorId = exp?.asesor_id || null;
    }
    if (!asesorId) asesorId = ot.asesor_responsable_id || ot.asesor_ejecutor_id || null;

    let asesorNombre: string | null = null;
    if (asesorId) {
      const { data: as } = await sb.from("perfiles").select("nombre").eq("id", asesorId).maybeSingle();
      asesorNombre = as?.nombre || null;
    }

    const docs = await documentosProveedorDeObra(sb, ot.id, ot.cotizacion_id);
    const costoProveedorDocumentos = r2(docs.reduce((acc, d) => acc + Number(d.monto || 0), 0));
    const costoProveedorPactado = Number(ot.costo_proveedor || 0);

    const comisionBancariaPct = Number(ot.comision_bancaria_pct || 0);

    const { resolverPorcentajeComision } = await import("@/app/actions/comisiones");
    const { porcentaje, reglaOrigen } = await resolverPorcentajeComision({ asesorId, servicioTipo });

    return {
      ok: true,
      datos: {
        montoTotal,
        costoProveedorPactado,
        costoProveedorDocumentos,
        documentosProveedor: docs.length,
        costoProveedorSugerido: costoProveedorDocumentos > 0 ? costoProveedorDocumentos : costoProveedorPactado,
        comisionBancariaPct,
        costoFinancieroSugerido: r2(montoTotal * (comisionBancariaPct / 100)),
        porcentajeComision: porcentaje,
        reglaComision: reglaOrigen,
        asesorNombre,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al validar costos." };
  }
}
