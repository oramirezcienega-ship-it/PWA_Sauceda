/**
 * Resolución de la subcuenta de marketing (especialidad) de una venta.
 * La subcuenta une ventas (remisiones) con publicidad para medir margen,
 * CAC y ROAS por especialidad.
 */

export interface SubcuentaMarketingBase {
  codigo: string;
  business_unit_id: string | null;
  servicio_tipos: string[] | null;
  es_general?: boolean | null;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Palabras clave por subcuenta para textos libres (conceptos, títulos de obra). */
const PALABRAS_CLAVE: [string, RegExp][] = [
  ["601-01-001", /impermeab/],
  ["601-01-004", /mantenimiento|tinaco|cisterna|limpieza/],
  ["601-01-005", /herreri|cancel|estructura metalica|porton|reja/],
  ["601-01-003", /concreto|firme|trazo|nivelacion|losa|cimentacion|colado/],
  ["601-01-002", /remodel|pintura|acabado|piso|azulejo|tablaroca|construccion/],
];

/** Subcuenta por tipo de servicio de la cotización u OT (ej. "impermeabilizacion"). */
export function subcuentaPorServicio(
  servicio: string | null | undefined,
  subcuentas: SubcuentaMarketingBase[]
): string | null {
  if (!servicio) return null;
  const s = normalizar(servicio);
  const sub = subcuentas.find((x) => (x.servicio_tipos || []).some((t) => normalizar(t) === s));
  return sub?.codigo || null;
}

/** Subcuenta por palabras clave en un texto libre. */
export function subcuentaPorTexto(
  texto: string | null | undefined,
  subcuentas: SubcuentaMarketingBase[]
): string | null {
  if (!texto) return null;
  const t = normalizar(texto);
  // Gana la especialidad que aparece primero en el texto: "Mantenimiento de cisterna …
  // acabado con impermeabilizante" es mantenimiento, no impermeabilización.
  let mejor: { codigo: string; pos: number } | null = null;
  for (const [codigo, re] of PALABRAS_CLAVE) {
    if (!subcuentas.some((s) => s.codigo === codigo)) continue;
    const m = re.exec(t);
    if (m && (!mejor || m.index < mejor.pos)) mejor = { codigo, pos: m.index };
  }
  return mejor?.codigo || null;
}
