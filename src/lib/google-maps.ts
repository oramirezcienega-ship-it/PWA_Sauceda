"use client";

/**
 * Carga perezosa de Google Maps JavaScript API (Places API New + Maps).
 * Requiere NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; sin clave, `mapsDisponible()` es
 * false y la UI cae a captura de texto.
 */

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/** Centro para sesgar las sugerencias (León, Gto.). */
export const CENTRO_BUSQUEDA = { lat: 21.1221, lng: -101.6823 };
export const RADIO_SESGO_M = 40000;

let promesa: Promise<any> | null = null;

export function mapsDisponible(): boolean {
  return Boolean(GOOGLE_MAPS_KEY);
}

export function cargarGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Solo en el navegador."));
  const w = window as any;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."));
  if (promesa) return promesa;
  promesa = new Promise((resolve, reject) => {
    const callback = "__saucedaMapsListo";
    w[callback] = () => resolve(w.google);
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_KEY,
      v: "weekly",
      loading: "async",
      libraries: "places,maps",
      language: "es",
      region: "MX",
      callback,
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => {
      promesa = null;
      reject(new Error("No se pudo cargar Google Maps."));
    };
    document.head.appendChild(s);
  });
  return promesa;
}
