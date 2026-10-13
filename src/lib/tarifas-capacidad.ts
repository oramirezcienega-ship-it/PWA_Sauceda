// Costo del proveedor por capacidad en litros (proveedor_productos.tarifas_capacidad),
// para servicios que se cobran por tamaño: tinacos, aljibes/cisternas.

import type { TarifaCapacidad } from "@/lib/types";

export interface CostoCapacidad {
  hastaLitros: number;
  costo: number;
}

/** Capacidades más comunes en el mercado: tinacos (450–2,500 L) y aljibes/cisternas (2,800–10,000 L). */
export const CAPACIDADES_COMUNES_LITROS = [450, 750, 1100, 1500, 2500, 2800, 5000, 10000];

/** Normaliza el JSON (acepta snake_case de BD o camelCase), orden ascendente, sin escalones inválidos. */
export function normalizarCostosCapacidad(raw: unknown): CostoCapacidad[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      hastaLitros: Math.round(Number(t?.hasta_litros ?? t?.hastaLitros)),
      costo: Number(t?.costo),
    }))
    .filter((t) => Number.isFinite(t.hastaLitros) && t.hastaLitros > 0 && Number.isFinite(t.costo) && t.costo >= 0)
    .sort((a, b) => a.hastaLitros - b.hastaLitros);
}

export function costosCapacidadAJson(lista: CostoCapacidad[]) {
  return normalizarCostosCapacidad(lista).map((t) => ({ hasta_litros: t.hastaLitros, costo: t.costo }));
}

/**
 * Copia los costos del proveedor a las tarifas del producto: actualiza el costo de los
 * escalones existentes y agrega los que falten sin precio de venta (Sofía los ignora
 * hasta que se capture su precio).
 */
export function combinarCostosEnTarifas(tarifas: TarifaCapacidad[], costos: CostoCapacidad[]): TarifaCapacidad[] {
  const porLitros = new Map(tarifas.map((t) => [t.hastaLitros, { ...t }]));
  for (const c of normalizarCostosCapacidad(costos)) {
    const actual = porLitros.get(c.hastaLitros);
    porLitros.set(c.hastaLitros, actual ? { ...actual, costo: c.costo } : { hastaLitros: c.hastaLitros, precio: null, costo: c.costo });
  }
  return Array.from(porLitros.values()).sort((a, b) => a.hastaLitros - b.hastaLitros);
}
