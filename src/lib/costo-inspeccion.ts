import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Costo de la visita técnica / inspección por línea de negocio (migración 0150):
 * configuracion_agente 'costos_inspeccion' = { "<tipo_negocio>": monto, "default": monto }.
 * Sin dato, COSTO_INSPECCION_BASE. El anticipo para apartar la visita es la mitad;
 * se descuenta completa si el cliente contrata.
 */

export const COSTO_INSPECCION_BASE = 500;
export const CLAVE_COSTOS_INSPECCION = "costos_inspeccion";

/** Líneas de negocio de construcción que pueden llevar visita técnica (tipo_negocio del expediente). */
export const LINEAS_INSPECCION: { tipo: string; etiqueta: string }[] = [
  { tipo: "construccion-impermeabilizacion", etiqueta: "Impermeabilización" },
  { tipo: "construccion", etiqueta: "Plomería, fontanería, electricidad, acabados y mantenimiento técnico" },
  { tipo: "construccion-remodelacion", etiqueta: "Remodelación y ampliación" },
  { tipo: "construccion-piso-estampado", etiqueta: "Piso / concreto estampado" },
  { tipo: "construccion-herreria", etiqueta: "Herrería" },
  { tipo: "construccion-mantenimiento-tinacos", etiqueta: "Mantenimiento de tinacos" },
  { tipo: "construccion-mantenimiento-calentadores", etiqueta: "Mantenimiento de calentadores solares" },
  { tipo: "construccion-mantenimiento-cisternas", etiqueta: "Mantenimiento de cisternas / aljibes" },
  { tipo: "construccion-mantenimiento-postventa", etiqueta: "Mantenimiento postventa" },
  { tipo: "seguridad", etiqueta: "Seguridad y videovigilancia" },
];

export type CostosInspeccion = Record<string, number>;

/** Normaliza el JSON guardado: solo montos válidos (≥ 0). */
export function normalizarCostosInspeccion(raw: unknown): CostosInspeccion {
  let obj: any = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  const out: CostosInspeccion = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

export async function cargarCostosInspeccion(sb: SupabaseClient): Promise<CostosInspeccion> {
  try {
    const { data } = await sb.from("configuracion_agente").select("valor").eq("clave", CLAVE_COSTOS_INSPECCION).maybeSingle();
    return normalizarCostosInspeccion(data?.valor);
  } catch {
    return {};
  }
}

/** Costo según línea de negocio (sin producto). */
export function costoInspeccionPorTipo(costos: CostosInspeccion, tipoNegocio?: string | null): number {
  if (tipoNegocio && costos[tipoNegocio] !== undefined) return costos[tipoNegocio];
  if (costos.default !== undefined) return costos.default;
  return COSTO_INSPECCION_BASE;
}

/** Anticipo para apartar la visita (la mitad, redondeada a pesos). */
export function anticipoInspeccion(costo: number): number {
  return Math.round(costo / 2);
}

export function formatoPesosEnteros(n: number): string {
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}
