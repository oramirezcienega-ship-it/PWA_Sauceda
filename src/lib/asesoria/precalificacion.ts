/**
 * Precalificación del comprador como FILTRO para iniciar la búsqueda.
 *
 * - Requisitos por tipo de crédito (catálogo `requisitos_precalificacion`).
 * - Dictamen: apto / apto con condiciones / no apto (la OT queda en pausa).
 * - Compuerta de Búsqueda: dictamen favorable, evidencia, zonas (confirmadas en
 *   el mapa si Google Maps está activo) y precio máximo dentro del poder de
 *   compra (o justificado).
 *
 * Módulo puro (sin dependencias) para poder probarlo con `node --test`.
 */

export type TipoRespuesta = "si_no" | "numero" | "texto";

export interface RequisitoPrecalificacion {
  id: string;
  tipoCredito: string;
  clave: string;
  etiqueta: string;
  ayuda: string;
  tipoRespuesta: TipoRespuesta;
  minimo: number | null;
  obligatorio: boolean;
  orden: number;
}

export function filaARequisito(f: Record<string, any>): RequisitoPrecalificacion {
  return {
    id: f.id,
    tipoCredito: f.tipo_credito,
    clave: f.clave,
    etiqueta: f.etiqueta,
    ayuda: f.ayuda ?? "",
    tipoRespuesta: (["si_no", "numero", "texto"].includes(f.tipo_respuesta) ? f.tipo_respuesta : "si_no") as TipoRespuesta,
    minimo: f.minimo === null || f.minimo === undefined ? null : Number(f.minimo),
    obligatorio: f.obligatorio !== false,
    orden: Number(f.orden ?? 0),
  };
}

/** Respuesta guardada: sí/no, número o texto. */
export type Respuesta = boolean | number | string | null;
export type Respuestas = Record<string, Respuesta>;

export type EstadoRequisito = "pendiente" | "cumple" | "no_cumple";

export function estadoRequisito(r: RequisitoPrecalificacion, valor: Respuesta | undefined): EstadoRequisito {
  if (valor === null || valor === undefined || valor === "") return "pendiente";
  if (r.tipoRespuesta === "si_no") return valor === true ? "cumple" : valor === false ? "no_cumple" : "pendiente";
  if (r.tipoRespuesta === "numero") {
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return "pendiente";
    return r.minimo === null || n >= r.minimo ? "cumple" : "no_cumple";
  }
  return String(valor).trim() ? "cumple" : "pendiente";
}

export interface EvaluacionRequisitos {
  total: number;
  cumplen: number;
  pendientes: RequisitoPrecalificacion[];
  noCumplen: RequisitoPrecalificacion[];
}

/** Evalúa solo los requisitos obligatorios. */
export function evaluarRequisitos(requisitos: RequisitoPrecalificacion[], respuestas: Respuestas): EvaluacionRequisitos {
  const obligatorios = requisitos.filter((r) => r.obligatorio);
  const pendientes: RequisitoPrecalificacion[] = [];
  const noCumplen: RequisitoPrecalificacion[] = [];
  let cumplen = 0;
  for (const r of obligatorios) {
    const e = estadoRequisito(r, respuestas?.[r.clave]);
    if (e === "cumple") cumplen++;
    else if (e === "no_cumple") noCumplen.push(r);
    else pendientes.push(r);
  }
  return { total: obligatorios.length, cumplen, pendientes, noCumplen };
}

/** Limpia las respuestas: solo claves del catálogo y con el tipo correcto. */
export function normalizarRespuestas(requisitos: RequisitoPrecalificacion[], entrada: unknown): Respuestas {
  const crudo = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const salida: Respuestas = {};
  for (const r of requisitos) {
    const v = crudo[r.clave];
    if (v === null || v === undefined || v === "") continue;
    if (r.tipoRespuesta === "si_no") {
      if (v === true || v === "si" || v === "true") salida[r.clave] = true;
      else if (v === false || v === "no" || v === "false") salida[r.clave] = false;
    } else if (r.tipoRespuesta === "numero") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && String(v).trim() !== "") salida[r.clave] = n;
    } else {
      const t = String(v).trim().slice(0, 500);
      if (t) salida[r.clave] = t;
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Dictamen
// ---------------------------------------------------------------------------

export const DICTAMENES = ["apto", "apto_condiciones", "no_apto"] as const;
export type Dictamen = (typeof DICTAMENES)[number];

export const ETIQUETA_DICTAMEN: Record<Dictamen, string> = {
  apto: "Apto",
  apto_condiciones: "Apto con condiciones",
  no_apto: "No apto (en pausa)",
};

export interface EvidenciaPrecalificacion {
  ruta: string;
  nombre: string;
  subidoEn: string;
}

export function normalizarEvidencias(v: unknown): EvidenciaPrecalificacion[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e) => e && typeof e === "object" && typeof (e as any).ruta === "string")
    .map((e: any) => ({ ruta: e.ruta, nombre: String(e.nombre || "evidencia"), subidoEn: String(e.subidoEn || "") }));
}

export interface EntradaDictamen {
  dictamen: Dictamen | null;
  nota: string | null;
  retomarEl: string | null;
}

/**
 * Valida que el dictamen sea coherente con los requisitos y la evidencia:
 * - apto: todos los obligatorios cumplen y hay evidencia.
 * - apto con condiciones: todos respondidos, evidencia y la condición escrita.
 * - no apto: motivo escrito; fecha para retomar opcional (hoy o después).
 */
export function validarDictamen(
  entrada: EntradaDictamen,
  evaluacion: EvaluacionRequisitos,
  evidencias: number,
  hoy: string = new Date().toISOString().slice(0, 10),
): string[] {
  const errores: string[] = [];
  const nota = (entrada.nota ?? "").trim();
  switch (entrada.dictamen) {
    case null:
      break;
    case "apto":
      if (evaluacion.pendientes.length > 0) errores.push(`Faltan ${evaluacion.pendientes.length} requisito(s) por responder.`);
      if (evaluacion.noCumplen.length > 0) {
        errores.push(`No cumple: ${evaluacion.noCumplen.map((r) => r.etiqueta).join(", ")}. Usa "Apto con condiciones" o "No apto".`);
      }
      if (evidencias === 0) errores.push("Sube al menos una evidencia de la precalificación.");
      break;
    case "apto_condiciones":
      if (evaluacion.pendientes.length > 0) errores.push(`Faltan ${evaluacion.pendientes.length} requisito(s) por responder.`);
      if (evidencias === 0) errores.push("Sube al menos una evidencia de la precalificación.");
      if (!nota) errores.push("Escribe la condición (p. ej. \"juntar $80,000 de enganche\").");
      break;
    case "no_apto":
      if (!nota) errores.push("Escribe el motivo por el que no es apto.");
      if (entrada.retomarEl) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.retomarEl)) errores.push("La fecha para retomar no es válida.");
        else if (entrada.retomarEl < hoy) errores.push("La fecha para retomar no puede ser pasada.");
      }
      break;
    default:
      errores.push("Dictamen no válido.");
  }
  return errores;
}

// ---------------------------------------------------------------------------
// Compuerta para pasar a Búsqueda
// ---------------------------------------------------------------------------

export interface DatosCompuertaBusqueda {
  tipoCredito: string | null;
  montoCreditoPrecalificado: number | null;
  montoAhorroPropio: number | null;
  busquedaPrecioMax: number | null;
  justificacionPrecio: string | null;
  busquedaZonas: string[];
  zonasConfirmadas: number;
  dictamen: Dictamen | null;
  evidencias: number;
  evaluacion: EvaluacionRequisitos;
}

export interface PendienteCompuerta {
  clave: string;
  texto: string;
}

/**
 * Lista de lo que falta para salir de Precalificación (vacía = lista).
 * Con `soloPrecalificacion` (el cliente ya tiene casa) no se piden zonas ni
 * rango de precio: solo crédito, requisitos, evidencia y dictamen.
 */
export function pendientesParaBusqueda(
  d: DatosCompuertaBusqueda,
  opciones: { mapaActivo: boolean; soloPrecalificacion?: boolean },
): PendienteCompuerta[] {
  const p: PendienteCompuerta[] = [];
  if (d.dictamen === "no_apto") {
    p.push({ clave: "pausa", texto: "La precalificación es \"No apto\": la orden está en pausa." });
    return p;
  }
  if (!d.tipoCredito) p.push({ clave: "credito", texto: "Define el tipo de crédito del cliente." });
  const poder = (d.montoCreditoPrecalificado ?? 0) + (d.montoAhorroPropio ?? 0);
  if (d.tipoCredito !== "contado" && !((d.montoCreditoPrecalificado ?? 0) > 0)) {
    p.push({ clave: "monto", texto: "Captura el monto de crédito precalificado." });
  } else if (poder <= 0) {
    p.push({ clave: "monto", texto: "Captura el ahorro o recursos propios del cliente." });
  }
  if (d.tipoCredito && d.evaluacion.total > 0 && d.evaluacion.pendientes.length > 0) {
    p.push({ clave: "requisitos", texto: `Responde los requisitos de precalificación (${d.evaluacion.pendientes.length} pendientes).` });
  }
  if (d.evidencias === 0) p.push({ clave: "evidencia", texto: "Sube la evidencia de la precalificación." });
  if (d.dictamen !== "apto" && d.dictamen !== "apto_condiciones") {
    p.push({ clave: "dictamen", texto: "Registra el dictamen de la precalificación (Apto o Apto con condiciones)." });
  }
  if (opciones.soloPrecalificacion) return p;
  if (d.busquedaZonas.length === 0) p.push({ clave: "zonas", texto: "Agrega al menos una zona de búsqueda." });
  else if (opciones.mapaActivo && d.zonasConfirmadas === 0) {
    p.push({ clave: "zonas_mapa", texto: "Confirma al menos una zona en el mapa (elígela de las sugerencias de Google)." });
  }
  if (d.busquedaPrecioMax !== null && poder > 0 && d.busquedaPrecioMax > poder && !(d.justificacionPrecio ?? "").trim()) {
    p.push({ clave: "precio", texto: "El precio máximo rebasa el poder de compra: justifícalo o ajústalo." });
  }
  return p;
}
