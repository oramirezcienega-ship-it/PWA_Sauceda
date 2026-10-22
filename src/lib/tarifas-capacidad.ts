// Tarifas por escalón para servicios que se cobran por tamaño. La medida del escalón
// la define el producto (productos_servicios.tarifa_medida): litros (tinacos,
// aljibes/cisternas) o tubos (calentadores solares). La llave JSON sigue siendo
// `hasta_litros` / `hastaLitros` por compatibilidad: su valor está en esa medida.

import type { TarifaCapacidad } from "@/lib/types";

export interface CostoCapacidad {
  hastaLitros: number;
  costo: number;
}

export type MedidaTarifa = "litros" | "tubos";

export const MEDIDAS_TARIFA: Record<
  MedidaTarifa,
  { etiqueta: string; abrev: string; ejemplos: string; comunes: number[] }
> = {
  // Tinacos (450–2,500 L) y aljibes/cisternas (2,800–10,000 L).
  litros: {
    etiqueta: "Litros",
    abrev: "L",
    ejemplos: "tinacos, aljibes, cisternas",
    comunes: [450, 750, 1100, 1500, 2500, 2800, 5000, 10000],
  },
  // Calentadores solares de tubos al vacío.
  tubos: { etiqueta: "Tubos", abrev: "tubos", ejemplos: "calentadores solares", comunes: [8, 10, 12, 15, 18, 20, 24, 30] },
};

/** Compatibilidad: capacidades comunes en litros. */
export const CAPACIDADES_COMUNES_LITROS = MEDIDAS_TARIFA.litros.comunes;

export function medidaTarifa(valor: unknown): MedidaTarifa {
  return valor === "tubos" ? "tubos" : "litros";
}

/** Medida sugerida por el nombre del producto; null si no parece cobrarse por escalones. */
export function medidaSugeridaPorNombre(nombre: string): MedidaTarifa | null {
  if (/calentador|solar/i.test(nombre)) return "tubos";
  if (/tinaco|aljib|cisterna/i.test(nombre)) return "litros";
  return null;
}

/** "1,100 L" / "12 tubos" */
export function formatoEscalon(valor: number, medida: MedidaTarifa): string {
  return `${valor.toLocaleString("es-MX")} ${MEDIDAS_TARIFA[medida].abrev}`;
}

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

/** Escalón que cubre la capacidad indicada (el primero con hastaLitros >= valor; si excede, el mayor). */
export function escalonParaValor(tarifas: TarifaCapacidad[] | undefined, valor: number): TarifaCapacidad | null {
  if (!tarifas?.length || !(valor > 0)) return null;
  const orden = [...tarifas].sort((a, b) => a.hastaLitros - b.hastaLitros);
  return orden.find((t) => t.hastaLitros >= valor) ?? orden[orden.length - 1];
}

const PATRON_MEDIDA: Record<MedidaTarifa, string> = { litros: "(?:l|lts?|litros)", tubos: "tubos?" };

/** "12,000 L", "1100 lts", "12 tubos": número (con o sin separador de miles) + la medida. */
const reEscalon = (medida: MedidaTarifa) =>
  new RegExp(String.raw`(\d{1,3}(?:[,.]\d{3})+|\d+)\s*` + PATRON_MEDIDA[medida] + String.raw`(?![a-z])`, "i");

/** Capacidad mencionada en un texto ("aljibe de 12,000 L" → 12000; "12 tubos" → 12). null si no hay. */
export function valorEscalonEnTexto(texto: string, medida: MedidaTarifa): number | null {
  const m = texto.match(reEscalon(medida));
  if (!m) return null;
  const n = Number(m[1].replace(/[,.]/g, ""));
  return n > 0 ? n : null;
}

/** Reemplaza la capacidad mencionada en el texto por la del escalón; si no menciona ninguna, la agrega al final. */
export function textoConEscalon(texto: string, valor: number, medida: MedidaTarifa): string {
  const re = reEscalon(medida);
  const etiqueta = formatoEscalon(valor, medida);
  return re.test(texto) ? texto.replace(re, etiqueta) : `${texto.trim()} — hasta ${etiqueta}`;
}
