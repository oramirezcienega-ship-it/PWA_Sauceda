/**
 * Match entre el perfil de búsqueda de un comprador y un inmueble.
 *
 * Módulo puro (sin dependencias) para poder probarlo con `node --test`.
 *
 * Filtros duros (si no se cumplen, el inmueble queda fuera):
 *  - precio ≤ precio máximo × 1.05 (si no hay máximo, se usa el poder de compra)
 *  - el tipo de crédito del cliente está en `acepta_credito`
 *  - `tiene_litigios` ≠ true
 *  - `estatus` = 'disponible'
 *
 * Score (0–100):
 *  - zona: dentro del radio de una zona confirmada en el mapa, o
 *    mismo nombre de zona/colonia/fraccionamiento ............ 40
 *  - precio dentro del rango (decrece hacia el tope) 25 → 12.5
 *  - recámaras ≥ mínimo .......................... 15
 *  - con escritura y sin adeudos ................. 10
 *  - 5 fotos o más ............................... 5
 *  - registrado hace menos de 30 días ............ 5
 *
 * Al empatar, gana el origen: propio > aliado > portal (el propio no comparte comisión).
 */

import { zonaQueCubre, type ZonaGeo } from "./zonas";

export type OrigenInmueble = "propio" | "aliado" | "portal";
export type TipoCredito = "infonavit" | "fovissste" | "bancario" | "cofinavit" | "contado";

export const TIPOS_CREDITO: TipoCredito[] = ["infonavit", "fovissste", "bancario", "cofinavit", "contado"];

export const ETIQUETA_CREDITO: Record<TipoCredito, string> = {
  infonavit: "INFONAVIT",
  fovissste: "FOVISSSTE",
  bancario: "Bancario",
  cofinavit: "Cofinavit",
  contado: "Contado",
};

export interface PerfilMatch {
  busquedaZonas?: string[] | null;
  /** Zonas confirmadas en Google Maps (con coordenadas y radio). */
  zonasGeo?: ZonaGeo[] | null;
  busquedaPrecioMin?: number | null;
  busquedaPrecioMax?: number | null;
  montoCreditoPrecalificado?: number | null;
  montoAhorroPropio?: number | null;
  busquedaRecamarasMin?: number | null;
  /** Texto libre de `expedientes.tipo_credito` (p. ej. "INFONAVIT"). */
  tipoCredito?: string | null;
  /** Respaldo si `tipoCredito` está vacío. */
  precalificacionFuente?: string | null;
}

export interface InmuebleMatch {
  id?: string;
  origen: OrigenInmueble;
  precio: number;
  acepta_credito?: string[] | null;
  zona?: string | null;
  fraccionamiento?: string | null;
  colonia?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  recamaras?: number | null;
  tiene_escritura?: boolean | null;
  tiene_adeudos?: boolean | null;
  tiene_litigios?: boolean | null;
  fotos?: string[] | null;
  estatus: string;
  created_at?: string | null;
}

export interface ResultadoMatch {
  score: number;
  cumple: boolean;
  razones: string[];
}

export const TOLERANCIA_PRECIO = 1.05;
export const PRIORIDAD_ORIGEN: Record<OrigenInmueble, number> = { propio: 0, aliado: 1, portal: 2 };

/** Minúsculas, sin acentos ni espacios repetidos (para comparar zonas). */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Traduce el texto libre del crédito del cliente a un tipo conocido. */
export function normalizarCredito(texto: string | null | undefined): TipoCredito | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  if (t.includes("cofinavit")) return "cofinavit";
  if (t.includes("fovissste") || t.includes("fovisste")) return "fovissste";
  if (t.includes("infonavit")) return "infonavit";
  if (t.includes("banc") || t.includes("hipotec")) return "bancario";
  if (t.includes("contado") || t.includes("efectivo") || t.includes("recursos propios")) return "contado";
  return null;
}

/** ¿El inmueble acepta el crédito del cliente? null = el inmueble no especifica. */
export function aceptaCredito(acepta: string[] | null | undefined, credito: TipoCredito): boolean | null {
  const lista = (acepta ?? []).map(normalizarCredito).filter(Boolean) as TipoCredito[];
  if (lista.length === 0) return null;
  if (lista.includes(credito)) return true;
  // Cofinavit = INFONAVIT + banco: lo acepta quien acepta ambos.
  if (credito === "cofinavit") return lista.includes("infonavit") && lista.includes("bancario");
  return false;
}

/** Precio máximo efectivo: el del perfil o, si no hay, el poder de compra. */
export function precioMaximoPerfil(perfil: PerfilMatch): number | null {
  if (perfil.busquedaPrecioMax && perfil.busquedaPrecioMax > 0) return perfil.busquedaPrecioMax;
  const poder = (perfil.montoCreditoPrecalificado ?? 0) + (perfil.montoAhorroPropio ?? 0);
  return poder > 0 ? poder : null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export function calcularMatch(perfil: PerfilMatch, inmueble: InmuebleMatch, ahora: Date = new Date()): ResultadoMatch {
  const razones: string[] = [];
  let cumple = true;
  const fuera = (motivo: string) => {
    cumple = false;
    razones.push(`✗ ${motivo}`);
  };

  // --- Filtros duros ---
  if (inmueble.estatus !== "disponible") fuera(`No está disponible (${inmueble.estatus})`);
  if (inmueble.tiene_litigios === true) fuera("Tiene litigios");

  const maximo = precioMaximoPerfil(perfil);
  if (maximo !== null && inmueble.precio > maximo * TOLERANCIA_PRECIO) {
    fuera(`Precio ${MXN.format(inmueble.precio)} rebasa el tope de ${MXN.format(maximo)} (+5%)`);
  }

  const credito = normalizarCredito(perfil.tipoCredito) ?? normalizarCredito(perfil.precalificacionFuente);
  if (credito) {
    const acepta = aceptaCredito(inmueble.acepta_credito, credito);
    if (acepta === false) fuera(`No acepta crédito ${ETIQUETA_CREDITO[credito]}`);
    else if (acepta === null) razones.push("⚠ El inmueble no indica qué créditos acepta");
  } else {
    razones.push("⚠ El cliente no tiene tipo de crédito definido");
  }

  // --- Score ---
  let score = 0;

  const zonasPerfil = (perfil.busquedaZonas ?? []).map(normalizarTexto).filter(Boolean);
  const zonasInmueble = [inmueble.zona, inmueble.fraccionamiento, inmueble.colonia].map(normalizarTexto).filter(Boolean);
  const zonaCoincide = zonasInmueble.find((z) => zonasPerfil.includes(z));
  const cubre = zonaQueCubre(perfil.zonasGeo, {
    lat: inmueble.lat === null || inmueble.lat === undefined ? null : Number(inmueble.lat),
    lng: inmueble.lng === null || inmueble.lng === undefined ? null : Number(inmueble.lng),
  });
  if (cubre) {
    score += 40;
    razones.push(`+40 A ${cubre.km.toFixed(1)} km de ${cubre.zona.nombre}`);
  } else if (zonaCoincide) {
    score += 40;
    razones.push(`+40 Zona buscada (${inmueble.fraccionamiento || inmueble.zona || inmueble.colonia})`);
  }

  if (maximo !== null) {
    const minimo = Math.max(0, perfil.busquedaPrecioMin ?? 0);
    if (inmueble.precio >= minimo && inmueble.precio <= maximo) {
      // 25 en el mínimo y baja linealmente hasta 12.5 en el tope.
      const avance = maximo > minimo ? (inmueble.precio - minimo) / (maximo - minimo) : 0;
      const puntos = Math.round((25 - 12.5 * avance) * 10) / 10;
      score += puntos;
      razones.push(`+${puntos} Precio dentro del rango`);
    } else if (inmueble.precio < minimo) {
      razones.push("Precio por debajo del mínimo buscado");
    } else {
      razones.push("Precio arriba del rango (dentro del 5% de tolerancia)");
    }
  }

  const minRec = perfil.busquedaRecamarasMin ?? null;
  if (minRec === null || minRec <= 0) {
    score += 15;
    razones.push("+15 Sin mínimo de recámaras");
  } else if (inmueble.recamaras != null && inmueble.recamaras >= minRec) {
    score += 15;
    razones.push(`+15 ${inmueble.recamaras} recámaras (mín. ${minRec})`);
  } else {
    razones.push(`Recámaras: ${inmueble.recamaras ?? "?"} (mín. ${minRec})`);
  }

  if (inmueble.tiene_escritura === true && inmueble.tiene_adeudos === false) {
    score += 10;
    razones.push("+10 Con escritura y sin adeudos");
  }

  if ((inmueble.fotos ?? []).length >= 5) {
    score += 5;
    razones.push("+5 Tiene 5 fotos o más");
  }

  if (inmueble.created_at) {
    const dias = (ahora.getTime() - new Date(inmueble.created_at).getTime()) / DIA_MS;
    if (dias >= 0 && dias < 30) {
      score += 5;
      razones.push("+5 Registro reciente (menos de 30 días)");
    }
  }

  return { score: Math.round(score * 10) / 10, cumple, razones };
}

/** Ordena por score (mayor primero) y, al empatar, por origen: propio > aliado > portal. */
export function compararCandidatos(
  a: { score: number; origen: OrigenInmueble },
  b: { score: number; origen: OrigenInmueble },
): number {
  if (b.score !== a.score) return b.score - a.score;
  return PRIORIDAD_ORIGEN[a.origen] - PRIORIDAD_ORIGEN[b.origen];
}

/** Evalúa una lista de inmuebles y devuelve solo los que cumplen, ordenados. */
export function rankearInmuebles<I extends InmuebleMatch>(
  perfil: PerfilMatch,
  inmuebles: I[],
  ahora: Date = new Date(),
): Array<{ inmueble: I; score: number; origen: OrigenInmueble; razones: string[] }> {
  return inmuebles
    .map((inmueble) => ({ inmueble, origen: inmueble.origen, ...calcularMatch(perfil, inmueble, ahora) }))
    .filter((r) => r.cumple)
    .map(({ inmueble, origen, score, razones }) => ({ inmueble, origen, score, razones }))
    .sort(compararCandidatos);
}
