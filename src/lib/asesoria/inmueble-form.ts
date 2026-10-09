/**
 * Validación y armado de un inmueble capturado por formulario (portal o link
 * de carga del aliado). Módulo puro, sin dependencias de servidor.
 */

import { TIPOS_CREDITO } from "./match";
import { descripcionAutomatica } from "./inmuebles";

export interface DatosInmuebleRapido {
  urlFuente?: string;
  precio: number | string;
  zona?: string;
  fraccionamiento?: string;
  colonia?: string;
  direccionPrivada?: string;
  metrosConstruccion?: number | string | null;
  metrosTerreno?: number | string | null;
  recamaras?: number | string | null;
  banos?: number | string | null;
  aceptaCredito?: string[];
  tieneEscritura?: boolean | null;
  tieneAdeudos?: boolean | null;
  tieneLitigios?: boolean | null;
  descripcionPublica?: string;
  notasInternas?: string;
  fotos?: string[];
}

export function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Valida y arma las columnas comunes de un inmueble capturado por formulario. */
export function filaInmuebleDesdeFormulario(d: DatosInmuebleRapido): { ok: true; fila: Record<string, any> } | { ok: false; mensaje: string } {
  const precio = numeroONull(d.precio);
  if (!precio || precio <= 0) return { ok: false, mensaje: "El precio es obligatorio." };
  const fotos = (d.fotos ?? []).filter((f) => typeof f === "string" && f && !f.includes(".."));
  const recamaras = numeroONull(d.recamaras);
  const banos = numeroONull(d.banos);
  const metrosConstruccion = numeroONull(d.metrosConstruccion);
  const metrosTerreno = numeroONull(d.metrosTerreno);
  const zona = (d.zona ?? "").trim() || null;
  const fraccionamiento = (d.fraccionamiento ?? "").trim() || null;
  return {
    ok: true,
    fila: {
      precio,
      url_fuente: (d.urlFuente ?? "").trim() || null,
      zona,
      fraccionamiento,
      colonia: (d.colonia ?? "").trim() || null,
      direccion_privada: (d.direccionPrivada ?? "").trim() || null,
      metros_construccion: metrosConstruccion,
      metros_terreno: metrosTerreno,
      recamaras: recamaras === null ? null : Math.round(recamaras),
      banos,
      acepta_credito: (d.aceptaCredito ?? []).filter((c) => (TIPOS_CREDITO as string[]).includes(c)),
      tiene_escritura: d.tieneEscritura ?? null,
      tiene_adeudos: d.tieneAdeudos ?? null,
      tiene_litigios: d.tieneLitigios ?? null,
      descripcion_publica:
        (d.descripcionPublica ?? "").trim() ||
        descripcionAutomatica({ fraccionamiento, zona, recamaras, banos, metrosConstruccion, metrosTerreno }),
      notas_internas: (d.notasInternas ?? "").trim() || null,
      fotos,
    },
  };
}

