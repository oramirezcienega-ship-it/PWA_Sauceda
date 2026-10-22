// Precio de venta por volumen (columna productos_servicios.precios_volumen).

export interface PrecioVolumen {
  /** A partir de esta cantidad (en la unidad del producto: m², pza…) aplica el precio. */
  desde: number;
  /** Precio unitario de venta para toda la cantidad cuando se alcanza `desde`. */
  precio: number;
}

/** Normaliza el JSON de tramos (orden ascendente, sin tramos inválidos ni repetidos). */
export function normalizarPreciosVolumen(raw: unknown): PrecioVolumen[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<number>();
  return raw
    .map((r: any) => ({ desde: Number(r?.desde), precio: Number(r?.precio) }))
    .filter((r) => Number.isFinite(r.desde) && r.desde > 0 && Number.isFinite(r.precio) && r.precio > 0)
    .sort((a, b) => a.desde - b.desde)
    .filter((r) => (vistos.has(r.desde) ? false : (vistos.add(r.desde), true)));
}

/**
 * Precio unitario para `cantidad`: el del tramo más alto cuyo `desde` alcanza
 * la cantidad (aplica a toda la cantidad, no sólo al excedente). Sin tramo
 * alcanzado, `precioBase`.
 */
export function precioUnitarioPorVolumen(tramos: PrecioVolumen[] | undefined, cantidad: number, precioBase: number): number {
  let precio = precioBase;
  for (const t of normalizarPreciosVolumen(tramos)) if (cantidad >= t.desde) precio = t.precio;
  return precio;
}
