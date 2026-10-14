/**
 * Portal del cliente comprador ("Tus opciones").
 *
 * Todo lo que sale hacia el cliente pasa por `aOpcionCliente`, que arma el
 * objeto con una LISTA BLANCA de campos: nunca incluye el aliado, su
 * contacto, la URL de la fuente, notas internas ni el expediente vendedor, y
 * la dirección exacta solo aparece cuando la propuesta ya tiene visita.
 *
 * Módulo puro para poder probarlo con `node --test`.
 */

import type { EstatusPropuesta, MotivoDescarte } from "./inmuebles";
import { MOTIVOS_DESCARTE } from "./inmuebles";

/** Estatus que el cliente ve en su portal (las sugeridas y descartadas no). */
export const ESTATUS_VISIBLES_CLIENTE: EstatusPropuesta[] = [
  "publicada",
  "vista",
  "me_interesa",
  "visita_agendada",
  "visitada",
  "ofertada",
  "elegida",
];

/** A partir de estos estatus se revela la dirección exacta. */
export const ESTATUS_REVELA_DIRECCION: EstatusPropuesta[] = ["visita_agendada", "visitada", "ofertada", "elegida"];

/** Estatus desde los que el cliente todavía puede responder (interés, descarte, visita). */
export const ESTATUS_RESPONDIBLES: EstatusPropuesta[] = ["publicada", "vista", "me_interesa"];

export const ETIQUETA_ESTATUS_CLIENTE: Partial<Record<EstatusPropuesta, string>> = {
  publicada: "Nueva",
  vista: "Vista",
  me_interesa: "Te interesa",
  visita_agendada: "Visita agendada",
  visitada: "Visitada",
  ofertada: "En negociación",
  elegida: "¡Tu casa!",
};

export interface OpcionCliente {
  id: string;
  estatus: EstatusPropuesta;
  etiquetaEstatus: string;
  precio: number;
  zona: string | null;
  metrosConstruccion: number | null;
  metrosTerreno: number | null;
  recamaras: number | null;
  banos: number | null;
  descripcion: string | null;
  fotos: string[];
  /** Solo con visita agendada (o después). */
  direccion: string | null;
  visita: { fecha: string; hora: string } | null;
  puedeResponder: boolean;
}

/** Construye la opción visible para el cliente (lista blanca de campos). */
export function aOpcionCliente(
  propuesta: { id: string; estatus: EstatusPropuesta },
  inmueble: Record<string, any>,
  fotosUrl: string[],
  visita: { fecha: string; hora_inicio: string } | null = null,
): OpcionCliente {
  const revela = ESTATUS_REVELA_DIRECCION.includes(propuesta.estatus);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: propuesta.id,
    estatus: propuesta.estatus,
    etiquetaEstatus: ETIQUETA_ESTATUS_CLIENTE[propuesta.estatus] ?? propuesta.estatus,
    precio: Number(inmueble.precio),
    zona: inmueble.fraccionamiento || inmueble.zona || inmueble.colonia || null,
    metrosConstruccion: num(inmueble.metros_construccion),
    metrosTerreno: num(inmueble.metros_terreno),
    recamaras: num(inmueble.recamaras),
    banos: num(inmueble.banos),
    descripcion: inmueble.descripcion_publica || null,
    fotos: fotosUrl,
    direccion: revela
      ? [inmueble.direccion_privada, inmueble.colonia, inmueble.ciudad].filter(Boolean).join(", ") || null
      : null,
    visita: revela && visita ? { fecha: visita.fecha, hora: String(visita.hora_inicio).slice(0, 5) } : null,
    puedeResponder: ESTATUS_RESPONDIBLES.includes(propuesta.estatus),
  };
}

export function esMotivoDescarte(m: unknown): m is MotivoDescarte {
  return typeof m === "string" && (MOTIVOS_DESCARTE as readonly string[]).includes(m);
}

/**
 * Valida la fecha y hora que propone el cliente para la visita
 * (al menos 2 horas a futuro, máximo 60 días, entre 8:00 y 19:00).
 * `ahora` y la fecha se comparan en hora del centro de México (UTC-6).
 */
export function validarFechaVisita(
  fecha: string,
  hora: string,
  ahora: Date = new Date(),
): { ok: true; horaFin: string } | { ok: false; mensaje: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
    return { ok: false, mensaje: "Elige una fecha y hora válidas." };
  }
  const [h, m] = hora.split(":").map(Number);
  if (h < 8 || h > 19 || (h === 19 && m > 0) || m > 59) {
    return { ok: false, mensaje: "Las visitas son de 8:00 a 19:00." };
  }
  const instante = new Date(`${fecha}T${hora}:00-06:00`);
  if (Number.isNaN(instante.getTime())) return { ok: false, mensaje: "Fecha inválida." };
  const diff = instante.getTime() - ahora.getTime();
  if (diff < 2 * 3600 * 1000) return { ok: false, mensaje: "Agenda con al menos 2 horas de anticipación." };
  if (diff > 60 * 24 * 3600 * 1000) return { ok: false, mensaje: "Agenda dentro de los próximos 60 días." };
  const fin = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { ok: true, horaFin: fin };
}

export function esTokenPortalValido(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}
