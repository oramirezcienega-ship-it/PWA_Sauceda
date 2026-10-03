// Costo del proveedor por rango de cantidad (columna productos_servicios.costos_volumen).

export interface CostoVolumen {
  /** Límite superior del rango, en la unidad del producto (m², pza…). */
  hasta: number;
  /** Costo unitario del proveedor dentro del rango. */
  costo: number;
}

/** Normaliza el JSON de rangos (orden ascendente, sin rangos inválidos). */
export function normalizarCostosVolumen(raw: unknown): CostoVolumen[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ hasta: Number(r?.hasta), costo: Number(r?.costo) }))
    .filter((r) => Number.isFinite(r.hasta) && r.hasta > 0 && Number.isFinite(r.costo) && r.costo >= 0)
    .sort((a, b) => a.hasta - b.hasta);
}

/**
 * Costo unitario para `cantidad`: el del primer rango que la cubre; por encima
 * del último rango se usa el último. Sin rangos, `costoBase`.
 */
export function costoUnitarioPorVolumen(rangos: CostoVolumen[] | undefined, cantidad: number, costoBase: number): number {
  const lista = normalizarCostosVolumen(rangos);
  if (!lista.length) return costoBase;
  return (lista.find((r) => cantidad <= r.hasta) ?? lista[lista.length - 1]).costo;
}
