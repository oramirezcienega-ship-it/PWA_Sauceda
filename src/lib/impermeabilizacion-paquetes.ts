/**
 * Paquetes de impermeabilización (Acrílico / Estándar / Premium).
 * Fuente única para la calculadora del CRM y para la imagen comparativa que
 * Sofía envía por WhatsApp. Los precios de aquí son sólo respaldo: los
 * vigentes vienen del catálogo de Productos y Servicios.
 */

export interface PaqueteInfo {
  id: "acrilico" | "estandar" | "premium";
  badge: string;
  titulo: string;
  subtitulo: string;
  precioM2: number;
  /** Cantidad mínima de cobro en m² (del catálogo; 0/undefined = sin mínimo). */
  minimoM2?: number;
  garantia: string;
  mejorPara: string;
  destacado?: boolean;
  colorRibbon?: string;
  incluye: string[];
}

export const PAQUETES_DEFAULT: PaqueteInfo[] = [
  {
    id: "acrilico",
    badge: "ACRÍLICO",
    titulo: "Impermeabilizante Acrílico",
    subtitulo: "Acrílico elastomérico con malla de refuerzo",
    precioM2: 170,
    garantia: "2 años",
    mejorPara: "Mantenimiento preventivo, azoteas con poco tráfico y presupuesto accesible.",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Sellado de grietas y fisuras",
      "Aplicación de acrílico elastomérico",
      "Malla de refuerzo intermedio",
      "Limpieza final de la zona",
    ],
  },
  {
    id: "estandar",
    badge: "ESTÁNDAR",
    titulo: "Impermeabilizante 3.5",
    subtitulo: "Con gravilla roja o gris a elegir",
    precioM2: 210,
    garantia: "5 años",
    mejorPara: "Solución eficaz y económica para azoteas con buen estado estructural.",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Aplicación profesional de impermeabilizante 3.5",
      "Gravilla (roja o gris, a elegir)",
      "Sellado de bordes y boquillas",
      "Limpieza final de la zona",
    ],
  },
  {
    id: "premium",
    badge: "PREMIUM",
    titulo: "Impermeabilizante 4.0 Poliéster",
    subtitulo: "Con gravilla roja o gris a elegir",
    precioM2: 260,
    garantia: "10 años",
    mejorPara: "Máxima durabilidad y tranquilidad a largo plazo. La elección más inteligente.",
    destacado: true,
    colorRibbon: "#C9A961",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Aplicación profesional de impermeabilizante 4.0 poliéster",
      "Gravilla (roja o gris, a elegir)",
      "Sellado reforzado de bordes y boquillas",
      "Limpieza final y documentación fotográfica",
      "Garantía escrita de 10 años",
    ],
  },
];

/**
 * Total de un paquete para `m2` metros respetando la cantidad mínima de cobro:
 * si el cliente pide menos que el mínimo, se cotiza el mínimo.
 */
export function cotizarPaquete(pkg: Pick<PaqueteInfo, "precioM2" | "minimoM2">, m2: number) {
  const minimo = pkg.minimoM2 && pkg.minimoM2 > 0 ? pkg.minimoM2 : 0;
  const m2Cobrados = Math.max(m2, minimo);
  return { m2Cobrados, total: m2Cobrados * pkg.precioM2, aplicaMinimo: m2Cobrados > m2 };
}
