// Pago a meses con intereses vía Mercado Pago Point.
//
// Sauceda no absorbe el costo: el cliente paga la comisión de Mercado Pago
// (cobro con tarjeta de crédito + comisión por plazo, más IVA), de modo que
// el neto que se recibe es el precio de contado.

/** Comisión base por cobro con tarjeta de crédito (Point). */
export const COMISION_BASE_TARJETA = 3.5;

/** IVA que Mercado Pago cobra sobre sus comisiones. */
export const IVA_COMISION = 0.16;

/** Comisión adicional por plazo (Mercado Pago Point). */
export const COMISIONES_PLAZO: Record<number, number> = {
  3: 4.69,
  6: 7.69,
  9: 11.19,
  12: 12.89,
  18: 19.39,
  24: 27.29,
};

export const PLAZOS_DISPONIBLES = [3, 6, 9, 12, 18, 24];
export const PLAZOS_DEFAULT = [3, 6, 12];

export interface OpcionMeses {
  meses: number;
  /** Total que paga el cliente con tarjeta (mensualidad × meses). */
  total: number;
  mensualidad: number;
  /** Diferencia contra el precio de contado. */
  costoFinanciamiento: number;
  /** Comisión efectiva total (%) aplicada sobre el cobro. */
  tasaEfectiva: number;
}

/** Comisión efectiva (fracción) que Mercado Pago descuenta del cobro a ese plazo. */
export function tasaEfectivaMeses(meses: number, incluirIva = true): number {
  const pct = COMISION_BASE_TARJETA + (COMISIONES_PLAZO[meses] ?? 0);
  return (pct / 100) * (incluirIva ? 1 + IVA_COMISION : 1);
}

/**
 * Calcula cuánto cobrar a meses para recibir neto el precio de contado.
 * cobro − cobro × tasa = contado  ⇒  cobro = contado / (1 − tasa)
 */
export function calcularOpcionMeses(contado: number, meses: number, incluirIva = true): OpcionMeses {
  const tasa = tasaEfectivaMeses(meses, incluirIva);
  const cobroNecesario = contado / (1 - tasa);
  const mensualidad = Math.ceil(cobroNecesario / meses);
  const total = mensualidad * meses;
  return {
    meses,
    total,
    mensualidad,
    costoFinanciamiento: total - contado,
    tasaEfectiva: tasa * 100,
  };
}
