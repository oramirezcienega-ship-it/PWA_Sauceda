/** Utilidades de formato para la UI (Incremento 1). */

/** Formatea un monto en pesos mexicanos sin decimales. Ej: $980,000 */
export function formatoPesos(monto: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(monto);
}

/** Formatea una fecha ISO a formato legible en español. Ej: 28 may 2026 */
export function formatoFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
