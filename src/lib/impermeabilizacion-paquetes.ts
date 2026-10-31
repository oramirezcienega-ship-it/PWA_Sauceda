/**
 * Paquetes de impermeabilización (Acrílico / Estándar / Premium).
 * Fuente única para la calculadora del CRM y para la imagen comparativa que
 * Sofía envía por WhatsApp. Los precios de aquí son sólo respaldo: los
 * vigentes vienen del catálogo de Productos y Servicios.
 */

import { precioUnitarioPorVolumen, type PrecioVolumen } from "@/lib/precios-volumen";

export interface PaqueteInfo {
  id: "acrilico" | "estandar" | "premium";
  badge: string;
  titulo: string;
  subtitulo: string;
  precioM2: number;
  /** Cantidad mínima de cobro en m² (del catálogo; 0/undefined = sin mínimo). */
  minimoM2?: number;
  /** Precio por m² a partir de cierta superficie (del catálogo). */
  preciosVolumen?: PrecioVolumen[];
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
    precioM2: 165,
    minimoM2: 25,
    preciosVolumen: [
      { desde: 26, precio: 165 },
      { desde: 101, precio: 155 },
    ],
    garantia: "3 años",
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
    precioM2: 225,
    minimoM2: 25,
    preciosVolumen: [
      { desde: 26, precio: 225 },
      { desde: 101, precio: 210 },
    ],
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
    precioM2: 275,
    minimoM2: 25,
    preciosVolumen: [
      { desde: 26, precio: 275 },
      { desde: 101, precio: 260 },
    ],
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
 * Total de un paquete para `m2` metros respetando la cantidad mínima de cobro
 * (si el cliente pide menos que el mínimo, se cotiza el mínimo) y el precio por
 * volumen (al alcanzar un tramo, su precio aplica a todos los m²).
 */
export function cotizarPaquete(pkg: Pick<PaqueteInfo, "precioM2" | "minimoM2" | "preciosVolumen">, m2: number) {
  const minimo = pkg.minimoM2 && pkg.minimoM2 > 0 ? pkg.minimoM2 : 0;
  const m2Cobrados = Math.max(m2, minimo);
  const precioM2 = precioUnitarioPorVolumen(pkg.preciosVolumen, m2Cobrados, pkg.precioM2);
  return {
    m2Cobrados,
    precioM2,
    total: m2Cobrados * precioM2,
    aplicaMinimo: m2Cobrados > m2,
    aplicaVolumen: precioM2 !== pkg.precioM2,
  };
}
