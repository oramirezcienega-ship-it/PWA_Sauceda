/**
 * Convenio de comisión compartida con aliados y cálculo de su comisión.
 * Módulo puro para poder probarlo con `node --test`.
 */

/** Orden de las cláusulas de la plantilla `plantillas_clausulas` (tipo_servicio = 'convenio_aliado'). */
export const CLAUSULAS_CONVENIO: { clave: string; titulo: string }[] = [
  { clave: "partes", titulo: "Partes" },
  { clave: "objeto", titulo: "Objeto" },
  { clave: "comision", titulo: "Comisión compartida" },
  { clave: "no_contacto", titulo: "No contacto directo con el cliente" },
  { clave: "vigencia", titulo: "Vigencia" },
  { clave: "confidencialidad", titulo: "Confidencialidad" },
  { clave: "firma", titulo: "Firma" },
];

export interface DatosConvenio {
  prestador: string;
  prestadorDomicilio: string;
  aliado: string;
  aliadoContacto: string;
  pct: number;
  /** Texto de la fecha ("9 de octubre de 2026"). */
  fecha: string;
}

export interface ConvenioRenderizado {
  titulo: string;
  clausulas: { titulo: string; texto: string }[];
}

function sustituir(texto: string, d: DatosConvenio): string {
  const valores: Record<string, string> = {
    prestador: d.prestador,
    prestador_domicilio: d.prestadorDomicilio,
    aliado: d.aliado,
    aliado_contacto: d.aliadoContacto || d.aliado,
    pct: Number.isInteger(d.pct) ? String(d.pct) : d.pct.toFixed(2),
    fecha: d.fecha,
  };
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));
}

/** Arma el convenio a partir de las cláusulas guardadas (las que falten se omiten). */
export function armarConvenio(plantillas: Record<string, string>, datos: DatosConvenio): ConvenioRenderizado {
  return {
    titulo: plantillas.titulo || "CONVENIO DE COMISIÓN COMPARTIDA",
    clausulas: CLAUSULAS_CONVENIO.filter((c) => (plantillas[c.clave] ?? "").trim()).map((c) => ({
      titulo: c.titulo,
      texto: sustituir(plantillas[c.clave], datos),
    })),
  };
}

export interface CalculoComisionAliado {
  precio: number;
  pctHonorarios: number;
  honorarios: number;
  pctAliado: number;
  montoAliado: number;
  /** % efectivo sobre el precio (para `comisiones.porcentaje_comision`). */
  pctEfectivo: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Comisión del aliado = precio × % honorarios del lado comprador × % compartido.
 * Ej.: casa de $1,000,000, honorarios 3% ($30,000), aliado 50% → $15,000.
 */
export function calcularComisionAliado(precio: number, pctHonorarios: number, pctAliado: number): CalculoComisionAliado {
  if (!(precio > 0)) throw new Error("El precio de compraventa debe ser mayor a cero.");
  if (!(pctHonorarios >= 0 && pctHonorarios <= 100)) throw new Error("El % de honorarios es inválido.");
  if (!(pctAliado >= 0 && pctAliado <= 100)) throw new Error("El % compartido del aliado es inválido.");
  const honorarios = redondear((precio * pctHonorarios) / 100);
  const montoAliado = redondear((honorarios * pctAliado) / 100);
  return {
    precio,
    pctHonorarios,
    honorarios,
    pctAliado,
    montoAliado,
    pctEfectivo: Math.round(((pctHonorarios * pctAliado) / 100) * 10000) / 10000,
  };
}

/** Siguiente folio de convenio: CONV-AAAA-0001. */
export function siguienteFolioConvenio(ultimo: string | null | undefined, anio: number): string {
  const prefijo = `CONV-${anio}-`;
  const n = ultimo && ultimo.startsWith(prefijo) ? parseInt(ultimo.slice(prefijo.length), 10) : 0;
  return `${prefijo}${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, "0")}`;
}
