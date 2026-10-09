/**
 * Lógica pura de aliados inmobiliarios (asesoría de compra).
 * Sin dependencias de servidor para poder probarla con `node --test`.
 */

import { ETIQUETA_CREDITO, normalizarCredito, normalizarTexto, precioMaximoPerfil, type TipoCredito } from "./match";

export const HORAS_LIMITE_BUSQUEDA = 72;

export const ESTADOS_BUSQUEDA = ["enviada", "vista", "respondida", "sin_resultados", "vencida"] as const;
export type EstadoBusqueda = (typeof ESTADOS_BUSQUEDA)[number];

export const ETIQUETA_ESTADO_BUSQUEDA: Record<EstadoBusqueda, string> = {
  enviada: "Enviada",
  vista: "Vista",
  respondida: "Respondida",
  sin_resultados: "Sin resultados",
  vencida: "Vencida",
};

export const CONVENIO_ESTATUS = ["sin_convenio", "enviado", "firmado", "suspendido"] as const;
export type ConvenioEstatus = (typeof CONVENIO_ESTATUS)[number];

export const ETIQUETA_CONVENIO: Record<ConvenioEstatus, string> = {
  sin_convenio: "Sin convenio",
  enviado: "Convenio enviado",
  firmado: "Convenio firmado",
  suspendido: "Suspendido",
};

/**
 * Criterios que se comparten con el aliado. Es una lista blanca: aunque la
 * fila del expediente traiga nombre o teléfono del cliente, nunca salen de aquí.
 */
export interface CriteriosBusqueda {
  zonas: string[];
  precio_min: number | null;
  precio_max: number | null;
  recamaras_min: number | null;
  tipo_credito: TipoCredito | null;
  requisitos: string | null;
}

export function construirCriteriosSnapshot(exp: Record<string, any>): CriteriosBusqueda {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const maximo = precioMaximoPerfil({
    busquedaPrecioMax: num(exp.busqueda_precio_max),
    montoCreditoPrecalificado: num(exp.monto_credito_precalificado),
    montoAhorroPropio: num(exp.monto_ahorro_propio),
  });
  return {
    zonas: Array.isArray(exp.busqueda_zonas) ? exp.busqueda_zonas.filter(Boolean) : [],
    precio_min: num(exp.busqueda_precio_min),
    precio_max: maximo,
    recamaras_min: num(exp.busqueda_recamaras_min),
    tipo_credito: normalizarCredito(exp.tipo_credito) ?? normalizarCredito(exp.precalificacion_fuente),
    requisitos: limpiarRequisitos(exp.busqueda_requisitos),
  };
}

/** Quita teléfonos y correos que el asesor haya escrito por error en los requisitos. */
export function limpiarRequisitos(texto: unknown): string | null {
  const t = String(texto ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[dato omitido]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[dato omitido]")
    .trim();
  return t || null;
}

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Fecha límite legible en hora de León (centro de México). */
export function formatoFechaLimite(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

/**
 * Mensaje de la solicitud para el aliado (HTML de Telegram o texto plano para
 * WhatsApp). Solo usa los criterios: no recibe datos personales del cliente.
 */
export function armarMensajeBusqueda(
  criterios: CriteriosBusqueda,
  opciones: { link: string; fechaLimite: string; formato: "html" | "texto"; folio?: string },
): string {
  const html = opciones.formato === "html";
  const b = (s: string) => (html ? `<b>${escaparHtml(s)}</b>` : `*${s}*`);
  const t = (s: string) => (html ? escaparHtml(s) : s);
  const rango =
    criterios.precio_min && criterios.precio_max
      ? `${MXN.format(criterios.precio_min)} a ${MXN.format(criterios.precio_max)}`
      : criterios.precio_max
      ? `hasta ${MXN.format(criterios.precio_max)}`
      : criterios.precio_min
      ? `desde ${MXN.format(criterios.precio_min)}`
      : "a consultar";
  const lineas = [
    `🏠 ${b("SAUCEDA busca casa para un comprador")}${opciones.folio ? ` (${t(opciones.folio)})` : ""}`,
    "",
    `📍 ${b("Zona:")} ${t(criterios.zonas.length ? criterios.zonas.join(", ") : "León (abierta)")}`,
    `💰 ${b("Rango:")} ${t(rango)}`,
    `🏦 ${b("Crédito:")} ${t(criterios.tipo_credito ? ETIQUETA_CREDITO[criterios.tipo_credito] : "por definir")}`,
    `🛏️ ${b("Recámaras:")} ${t(criterios.recamaras_min ? `${criterios.recamaras_min} o más` : "indistinto")}`,
  ];
  if (criterios.requisitos) lineas.push(`📝 ${b("Requisitos:")} ${t(criterios.requisitos)}`);
  lineas.push(
    `⏰ ${b("Fecha límite:")} ${t(formatoFechaLimite(opciones.fechaLimite))}`,
    "",
    `Sube tus casas aquí (2 min por casa, de 5 a 15 fotos):`,
    html ? escaparHtml(opciones.link) : opciones.link,
    "",
    t("Recuerda: el cliente es presentado por SAUCEDA y todo contacto es a través de nosotros."),
  );
  return lineas.join("\n");
}

/** ¿Las zonas de cobertura del aliado se cruzan con las zonas que busca el cliente? */
export function zonasSeCruzan(cobertura: string[] | null | undefined, buscadas: string[] | null | undefined): boolean {
  const a = (cobertura ?? []).map(normalizarTexto).filter(Boolean);
  const b = (buscadas ?? []).map(normalizarTexto).filter(Boolean);
  if (a.length === 0 || b.length === 0) return false;
  // Coincidencia exacta o una zona contenida en la otra ("San Juan" ⊂ "Villas de San Juan").
  return a.some((x) => b.some((y) => x === y || x.includes(y) || y.includes(x)));
}

/** Estado considerando la fecha límite: enviada/vista pasada la fecha → vencida. */
export function estadoEfectivo(estado: EstadoBusqueda, fechaLimite: string, ahora: Date = new Date()): EstadoBusqueda {
  if ((estado === "enviada" || estado === "vista") && new Date(fechaLimite).getTime() < ahora.getTime()) return "vencida";
  return estado;
}

/**
 * Calificación del aliado (0–100):
 *  60% tasa de respuesta (respondidas + sin resultados) / solicitudes cerradas o vencidas
 *  40% tasa de aceptación: propuestas suyas que el cliente marcó "me interesa" o más,
 *      sobre las que se le publicaron al cliente.
 * Sin historial suficiente devuelve null.
 */
export function calcularCalificacionAliado(datos: {
  busquedas: { estado: EstadoBusqueda }[];
  propuestasPublicadas: number;
  propuestasAceptadas: number;
}): number | null {
  const evaluables = datos.busquedas.filter((b) => b.estado !== "enviada" && b.estado !== "vista");
  if (evaluables.length === 0 && datos.propuestasPublicadas === 0) return null;
  const respondidas = evaluables.filter((b) => b.estado === "respondida" || b.estado === "sin_resultados").length;
  const tasaRespuesta = evaluables.length > 0 ? respondidas / evaluables.length : null;
  const tasaAceptacion = datos.propuestasPublicadas > 0 ? datos.propuestasAceptadas / datos.propuestasPublicadas : null;
  if (tasaRespuesta === null) return Math.round((tasaAceptacion ?? 0) * 100);
  if (tasaAceptacion === null) return Math.round(tasaRespuesta * 100);
  return Math.round((0.6 * tasaRespuesta + 0.4 * tasaAceptacion) * 100);
}

/** Estatus de propuesta que cuentan como "aceptada" por el cliente. */
export const ESTATUS_ACEPTADA = ["me_interesa", "visita_agendada", "visitada", "ofertada", "elegida"];

/** Token del link de carga: 32 bytes aleatorios en base64url (sin depender de Node). */
export function generarTokenCarga(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function esTokenCargaValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}
