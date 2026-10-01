"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";

/**
 * Contabilidad de marketing: jerarquía Centro de Costos → Cuenta Mayor →
 * Subcuenta (especialidad) → Producto, e importación mensual de Meta Ads.
 *
 * Los registros diarios de meta_ads_gastos son la capa de métricas. Solo al
 * aprobarse se convierten en movimientos contables (transactions): uno por mes
 * y subcuenta, ligados con origen 'meta_ads' para no duplicarse. Los registros
 * aplicados quedan en APLICADO_CRM con su transaction_id; los RECHAZADO no se importan.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estatus de meta_ads_gastos (restricción meta_ads_gastos_estatus_contable_check). */
const ESTATUS_APLICADO = "APLICADO_CRM";
const ESTATUS_RECHAZADO = "RECHAZADO";
const estaAplicado = (estatus: string | null, transactionId: string | null) =>
  Boolean(transactionId) && (estatus === ESTATUS_APLICADO || estatus === "CONTABILIZADO");

export interface CentroCostos {
  id: string;
  nombre: string;
  codigo: string | null;
}

export interface SubcuentaMarketing {
  codigo: string;
  nombre: string;
  cuentaMayorCodigo: string;
  cuentaMayorNombre: string;
  businessUnitId: string | null;
  esGeneral: boolean;
}

export interface ProductoMarketing {
  id: string;
  nombre: string;
  codigoSubcuenta: string | null;
}

export async function obtenerCatalogoMarketing(): Promise<{
  centros: CentroCostos[];
  subcuentas: SubcuentaMarketing[];
  productos: ProductoMarketing[];
}> {
  await requireAdministrador();
  const sb = supabaseServidor();

  const [resCc, resSub, resProd] = await Promise.all([
    sb.from("business_units").select("id, nombre, codigo").eq("activo", true).order("nombre"),
    sb
      .from("marketing_subcuentas")
      .select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id, es_general")
      .eq("activo", true)
      .order("orden"),
    sb.from("productos_servicios").select("id, nombre, codigo_subcuenta").order("nombre"),
  ]);

  return {
    centros: (resCc.data || []).map((c: any) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo || null })),
    subcuentas: (resSub.data || []).map((s: any) => ({
      codigo: s.codigo,
      nombre: s.nombre,
      cuentaMayorCodigo: s.cuenta_mayor_codigo,
      cuentaMayorNombre: s.cuenta_mayor_nombre,
      businessUnitId: s.business_unit_id,
      esGeneral: Boolean(s.es_general),
    })),
    productos: (resProd.data || []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      codigoSubcuenta: p.codigo_subcuenta || null,
    })),
  };
}

// ============================================================
// Importación de Meta Ads
// ============================================================

export interface GrupoImportacionMeta {
  codigoSubcuenta: string;
  nombreSubcuenta: string;
  cuentaMayor: string;
  centroCostos: string;
  businessUnitId: string | null;
  productoServicio: string;
  campanas: string[];
  registros: number;
  gasto: number;
  impresiones: number;
  clics: number;
  /** Monto ya aplicado (APLICADO_CRM) en Finanzas para este mes y subcuenta. */
  contabilizado: number;
  /** Registros diarios todavía sin contabilizar. */
  pendientes: number;
  transactionId: string | null;
}

export interface MesMeta {
  mes: string;
  gasto: number;
  contabilizado: number;
  registrosPendientes: number;
}

const rangoMes = (mes: string) => {
  const [anio, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fin = new Date(anio, m, 0).toISOString().split("T")[0];
  return { inicio, fin };
};

/** Resumen por mes del gasto de Meta Ads y cuánto falta por contabilizar. */
export async function listarMesesMetaAds(): Promise<MesMeta[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("meta_ads_gastos")
    .select("fecha_inicio, gasto, estatus_contable, transaction_id");
  if (error) throw new Error(error.message);

  const meses = new Map<string, MesMeta>();
  for (const r of data || []) {
    const mes = String(r.fecha_inicio || "").slice(0, 7);
    if (!mes || r.estatus_contable === ESTATUS_RECHAZADO) continue;
    const g = meses.get(mes) || { mes, gasto: 0, contabilizado: 0, registrosPendientes: 0 };
    const gasto = Number(r.gasto || 0);
    g.gasto += gasto;
    if (estaAplicado(r.estatus_contable, r.transaction_id)) g.contabilizado += gasto;
    else g.registrosPendientes += 1;
    meses.set(mes, g);
  }
  return Array.from(meses.values())
    .map((m) => ({ ...m, gasto: r2(m.gasto), contabilizado: r2(m.contabilizado) }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

/** Agrupa por subcuenta el gasto de Meta Ads de un mes (formato YYYY-MM). */
export async function previsualizarImportacionMeta(mes: string): Promise<GrupoImportacionMeta[]> {
  await requireAdministrador();
  const sb = supabaseServidor();
  const { inicio, fin } = rangoMes(mes);

  const [{ data: filas, error }, { data: subcuentas }, { data: centros }] = await Promise.all([
    sb
      .from("meta_ads_gastos")
      .select("campaign_name, centro_costos, cuenta_mayor, codigo_subcuenta, nombre_subcuenta, producto_servicio, gasto, impresiones, clics, estatus_contable, transaction_id")
      .gte("fecha_inicio", inicio)
      .lte("fecha_inicio", fin),
    sb.from("marketing_subcuentas").select("codigo, nombre, cuenta_mayor_codigo, cuenta_mayor_nombre, business_unit_id"),
    sb.from("business_units").select("id, codigo"),
  ]);
  if (error) throw new Error(error.message);

  const ccPorCodigo = new Map<string, string>();
  (centros || []).forEach((c: any) => c.codigo && ccPorCodigo.set(c.codigo, c.id));
  const subPorCodigo = new Map<string, any>();
  (subcuentas || []).forEach((s: any) => subPorCodigo.set(s.codigo, s));

  const grupos = new Map<string, GrupoImportacionMeta & { _campanas: Set<string> }>();
  for (const f of filas || []) {
    if (f.estatus_contable === ESTATUS_RECHAZADO) continue;
    const codigo = f.codigo_subcuenta || "SIN-SUBCUENTA";
    const sub = subPorCodigo.get(codigo);
    const g =
      grupos.get(codigo) ||
      ({
        codigoSubcuenta: codigo,
        nombreSubcuenta: sub?.nombre || f.nombre_subcuenta || "Sin subcuenta",
        cuentaMayor: sub ? `${sub.cuenta_mayor_codigo} ${sub.cuenta_mayor_nombre}` : f.cuenta_mayor || "",
        centroCostos: f.centro_costos || "",
        businessUnitId: sub?.business_unit_id || ccPorCodigo.get(f.centro_costos) || null,
        productoServicio: f.producto_servicio || "",
        campanas: [],
        registros: 0,
        gasto: 0,
        impresiones: 0,
        clics: 0,
        contabilizado: 0,
        pendientes: 0,
        transactionId: null,
        _campanas: new Set<string>(),
      } as GrupoImportacionMeta & { _campanas: Set<string> });

    const gasto = Number(f.gasto || 0);
    g.registros += 1;
    g.gasto += gasto;
    g.impresiones += Number(f.impresiones || 0);
    g.clics += Number(f.clics || 0);
    if (f.campaign_name) g._campanas.add(f.campaign_name);
    if (estaAplicado(f.estatus_contable, f.transaction_id)) {
      g.contabilizado += gasto;
      g.transactionId = g.transactionId || f.transaction_id;
    } else {
      g.pendientes += 1;
    }
    grupos.set(codigo, g);
  }

  return Array.from(grupos.values())
    .map(({ _campanas, ...g }) => ({
      ...g,
      campanas: Array.from(_campanas),
      gasto: r2(g.gasto),
      contabilizado: r2(g.contabilizado),
    }))
    .sort((a, b) => a.codigoSubcuenta.localeCompare(b.codigoSubcuenta));
}

/**
 * Aprueba el gasto de Meta Ads de un mes: crea o actualiza un movimiento por
 * subcuenta (origen meta_ads, id "YYYY-MM|subcuenta") con el total del mes y
 * marca los registros diarios como APLICADO_CRM ligados a ese movimiento.
 */
export async function aprobarImportacionMeta(datos: {
  mes: string;
  moneyAccountId: string | null;
  pagado: boolean;
  subcuentas?: string[];
}): Promise<{ ok: boolean; movimientos: number; total: number; error?: string }> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const { inicio, fin } = rangoMes(datos.mes);

    const grupos = (await previsualizarImportacionMeta(datos.mes)).filter(
      (g) =>
        g.codigoSubcuenta !== "SIN-SUBCUENTA" &&
        (!datos.subcuentas || datos.subcuentas.includes(g.codigoSubcuenta))
    );
    if (grupos.length === 0) return { ok: false, movimientos: 0, total: 0, error: "No hay gasto por importar en ese mes." };

    const { data: cat } = await sb
      .from("categories")
      .select("id")
      .eq("linea_pnl", "costo_marketing")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    if (!cat) return { ok: false, movimientos: 0, total: 0, error: "No hay una categoría activa de Marketing y Publicidad." };

    // El cargo de Meta se registra al cierre del mes (o hoy si el mes sigue en curso)
    const hoy = new Date().toISOString().split("T")[0];
    const fechaOperacion = fin < hoy ? fin : hoy;

    let movimientos = 0;
    let total = 0;
    for (const g of grupos) {
      if (!g.businessUnitId) continue;
      const origenId = `${datos.mes}|${g.codigoSubcuenta}`;

      const { data: existente } = await sb
        .from("transactions")
        .select("id, estado, fecha_pago, money_account_id")
        .eq("origen_modulo", "meta_ads")
        .eq("origen_id", origenId)
        .maybeSingle();

      const yaPagado = existente?.estado === "pagado";
      const estado = datos.pagado || yaPagado ? "pagado" : "pendiente";
      const payload = {
        fecha_operacion: fechaOperacion,
        fecha_pago: estado === "pagado" ? existente?.fecha_pago || fechaOperacion : null,
        tipo: "egreso",
        categoria_id: cat.id,
        business_unit_id: g.businessUnitId,
        codigo_subcuenta: g.codigoSubcuenta,
        money_account_id: datos.moneyAccountId || existente?.money_account_id || null,
        monto_total: g.gasto,
        concepto: `Meta Ads ${datos.mes} - ${g.nombreSubcuenta}`,
        contraparte: "Meta Platforms (Facebook / Instagram Ads)",
        estado,
        origen_modulo: "meta_ads",
        origen_id: origenId,
        origen_concepto: "gasto",
        updated_at: new Date().toISOString(),
      };

      let transactionId = existente?.id || null;
      if (existente) {
        const { error } = await sb.from("transactions").update(payload).eq("id", existente.id);
        if (error) throw new Error(error.message);
      } else {
        const { data: nuevo, error } = await sb
          .from("transactions")
          .insert({ ...payload, is_demo: false })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        transactionId = nuevo.id;
      }

      const { error: errMeta } = await sb
        .from("meta_ads_gastos")
        .update({
          estatus_contable: ESTATUS_APLICADO,
          transaction_id: transactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("codigo_subcuenta", g.codigoSubcuenta)
        .neq("estatus_contable", ESTATUS_RECHAZADO)
        .gte("fecha_inicio", inicio)
        .lte("fecha_inicio", fin);
      if (errMeta) throw new Error(errMeta.message);

      movimientos++;
      total += g.gasto;
    }

    revalidatePath("/finanzas");
    return { ok: true, movimientos, total: r2(total) };
  } catch (err: any) {
    return { ok: false, movimientos: 0, total: 0, error: err?.message || "Error al importar Meta Ads." };
  }
}
