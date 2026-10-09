/**
 * Etapas propias de una orden de trabajo según su tipo (catálogo `ot_etapas`).
 * Módulo puro para poder probarlo con `node --test`.
 */

import { evaluarCondicionCampo, type CondicionCampoJson } from "../bpm/condiciones";

export interface EtapaOT {
  clave: string;
  nombre: string;
  nombreCliente: string;
  descripcionCliente: string;
  orden: number;
  condicionCampo?: CondicionCampoJson;
  esFinal: boolean;
}

/** Fila de `ot_etapas` → modelo. */
export function filaAEtapaOT(f: Record<string, any>): EtapaOT {
  return {
    clave: f.clave,
    nombre: f.nombre,
    nombreCliente: f.nombre_cliente,
    descripcionCliente: f.descripcion_cliente ?? "",
    orden: Number(f.orden),
    condicionCampo: f.condicion_campo ?? null,
    esFinal: Boolean(f.es_final),
  };
}

/** Etapas que aplican a la OT según su ficha (p. ej. sin búsqueda si ya tiene casa), en orden. */
export function etapasAplicables(etapas: EtapaOT[], ficha: Record<string, unknown>): EtapaOT[] {
  return [...etapas]
    .sort((a, b) => a.orden - b.orden)
    .filter((e) => evaluarCondicionCampo(e.condicionCampo, ficha));
}

/** Etapa anterior (-1) o siguiente (+1) entre las aplicables; null en los extremos. */
export function etapaVecina(aplicables: EtapaOT[], actual: string | null, paso: 1 | -1): EtapaOT | null {
  const i = aplicables.findIndex((e) => e.clave === actual);
  if (i === -1) return paso === 1 ? aplicables[0] ?? null : null;
  return aplicables[i + paso] ?? null;
}

/** Si la etapa actual dejó de aplicar (cambió la ficha), la siguiente que sí aplica. */
export function normalizarEtapaActual(etapas: EtapaOT[], aplicables: EtapaOT[], actual: string | null): string | null {
  if (!actual) return aplicables[0]?.clave ?? null;
  if (aplicables.some((e) => e.clave === actual)) return actual;
  const ordenActual = etapas.find((e) => e.clave === actual)?.orden ?? 0;
  return aplicables.find((e) => e.orden > ordenActual)?.clave ?? aplicables[aplicables.length - 1]?.clave ?? null;
}

/** Catálogo de la OT de asesoría de compra (igual al sembrado en la migración 0141). */
export const ETAPAS_ASESORIA_COMPRA_OT: EtapaOT[] = [
  { clave: "precalificacion", nombre: "Precalificación", nombreCliente: "Precalificación", descripcionCliente: "", orden: 1, esFinal: false },
  { clave: "busqueda", nombre: "Búsqueda", nombreCliente: "Buscando tu casa", descripcionCliente: "", orden: 2, condicionCampo: { campo: "ya_tiene_casa", igual: false }, esFinal: false },
  { clave: "negociacion", nombre: "Negociación", nombreCliente: "Negociación", descripcionCliente: "", orden: 3, condicionCampo: { campo: "ya_tiene_casa", igual: false }, esFinal: false },
  { clave: "expediente", nombre: "Expediente del trámite", nombreCliente: "Integración de expediente", descripcionCliente: "", orden: 4, esFinal: false },
  { clave: "escrituracion", nombre: "Escrituración", nombreCliente: "Escrituración", descripcionCliente: "", orden: 5, esFinal: false },
  { clave: "entrega", nombre: "Entrega", nombreCliente: "Entrega", descripcionCliente: "", orden: 6, esFinal: false },
  { clave: "cerrada", nombre: "Cerrada", nombreCliente: "Concluido", descripcionCliente: "", orden: 7, esFinal: true },
];
