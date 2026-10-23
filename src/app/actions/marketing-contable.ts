"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import {
  agruparMetaAdsMes,
  aplicarMetaAdsMes,
  estaAplicado,
  ESTATUS_RECHAZADO,
  type GrupoImportacionMeta,
} from "@/features/marketing/meta-ads";

export type { GrupoImportacionMeta };

/**
 * Contabilidad de marketing: jerarquía Centro de Costos → Cuenta Mayor →
 * Subcuenta (especialidad) → Producto, e importación mensual de Meta Ads.
 *
 * Los registros diarios de meta_ads_gastos son la capa de métricas. Al aplicarse
 * se convierten en movimientos contables (transactions): uno por mes y subcuenta,
 * ligados con origen 'meta_ads' para no duplicarse. La sincronización diaria
 * (features/marketing/meta-ads) los aplica sola; aquí queda la aprobación manual.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

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

export interface MesMeta {
  mes: string;
  gasto: number;
  contabilizado: number;
  registrosPendientes: number;
}

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
  return agruparMetaAdsMes(supabaseServidor(), mes);
}

/** Aprueba el gasto de Meta Ads de un mes en Finanzas (un movimiento por subcuenta). */
export async function aprobarImportacionMeta(datos: {
  mes: string;
  moneyAccountId: string | null;
  pagado: boolean;
  subcuentas?: string[];
}): Promise<{ ok: boolean; movimientos: number; total: number; error?: string }> {
  try {
    await requireAdministrador();
    const res = await aplicarMetaAdsMes(supabaseServidor(), datos);
    if (res.ok) revalidatePath("/finanzas");
    return res;
  } catch (err: any) {
    return { ok: false, movimientos: 0, total: 0, error: err?.message || "Error al importar Meta Ads." };
  }
}
