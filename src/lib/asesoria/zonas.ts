/**
 * Zonas de búsqueda del comprador confirmadas en Google Maps.
 *
 * Cada zona guarda el nombre que eligió el asesor en las sugerencias de Google,
 * su identificador (placeId), sus coordenadas y un radio en km. Una zona sin
 * placeId/coordenadas es texto libre "sin confirmar".
 *
 * Módulo puro (sin dependencias) para poder probarlo con `node --test`.
 */

export interface ZonaGeo {
  nombre: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  direccion: string | null;
  radioKm: number;
}

export const RADIOS_KM = [1, 2, 3, 5] as const;
export const RADIO_DEFAULT_KM = 2;
export const MAX_ZONAS = 15;

export function zonaConfirmada(z: Pick<ZonaGeo, "placeId" | "lat" | "lng">): boolean {
  return Boolean(z.placeId) && Number.isFinite(z.lat) && Number.isFinite(z.lng) && z.lat !== null && z.lng !== null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Limpia la lista: sin vacías, sin repetidas (por placeId o nombre), coordenadas válidas y radio permitido. */
export function normalizarZonasGeo(v: unknown): ZonaGeo[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const salida: ZonaGeo[] = [];
  for (const crudo of v) {
    const z = (typeof crudo === "string" ? { nombre: crudo } : crudo) as Record<string, unknown>;
    if (!z || typeof z !== "object") continue;
    const nombre = String(z.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!nombre) continue;
    let lat = num(z.lat);
    let lng = num(z.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      lat = null;
      lng = null;
    }
    const placeId = typeof z.placeId === "string" && z.placeId.trim() && lat !== null ? z.placeId.trim().slice(0, 300) : null;
    const radio = num(z.radioKm);
    const radioKm = radio !== null && (RADIOS_KM as readonly number[]).includes(radio) ? radio : RADIO_DEFAULT_KM;
    const clave = placeId ?? nombre.toLocaleLowerCase("es-MX");
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({
      nombre,
      placeId,
      lat: placeId ? lat : null,
      lng: placeId ? lng : null,
      direccion: placeId && typeof z.direccion === "string" ? z.direccion.slice(0, 300) : null,
      radioKm,
    });
    if (salida.length >= MAX_ZONAS) break;
  }
  return salida;
}

/** Distancia en km entre dos puntos (fórmula de haversine). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** La zona confirmada más cercana que cubre el punto (dentro de su radio), o null. */
export function zonaQueCubre(
  zonas: ZonaGeo[] | null | undefined,
  punto: { lat: number | null | undefined; lng: number | null | undefined },
): { zona: ZonaGeo; km: number } | null {
  const lat = num(punto.lat);
  const lng = num(punto.lng);
  if (lat === null || lng === null) return null;
  let mejor: { zona: ZonaGeo; km: number } | null = null;
  for (const z of zonas ?? []) {
    if (!zonaConfirmada(z)) continue;
    const km = distanciaKm({ lat: z.lat as number, lng: z.lng as number }, { lat, lng });
    if (km <= z.radioKm && (!mejor || km < mejor.km)) mejor = { zona: z, km };
  }
  return mejor;
}
