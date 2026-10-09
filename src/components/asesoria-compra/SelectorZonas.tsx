"use client";

import { useEffect, useRef, useState } from "react";
import { CENTRO_BUSQUEDA, RADIO_SESGO_M, cargarGoogleMaps, mapsDisponible } from "@/lib/google-maps";
import { MAX_ZONAS, RADIOS_KM, RADIO_DEFAULT_KM, zonaConfirmada, type ZonaGeo } from "@/lib/asesoria/zonas";

const INPUT =
  "w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none";

export function zonaVacia(): ZonaGeo {
  return { nombre: "", placeId: null, lat: null, lng: null, direccion: null, radioKm: RADIO_DEFAULT_KM };
}

interface Sugerencia {
  placeId: string;
  principal: string;
  secundario: string;
  prediccion: any;
}

/**
 * Zonas de búsqueda: un campo por zona y "+ Agregar otra zona". Con Google
 * Maps configurado, cada zona se elige de las sugerencias (queda confirmada con
 * su ubicación) y se ven todas en el mapa con su radio.
 */
export function SelectorZonas({ zonas, onCambio }: { zonas: ZonaGeo[]; onCambio: (z: ZonaGeo[]) => void }) {
  const conMapa = mapsDisponible();
  const [errorMapa, setErrorMapa] = useState<string | null>(null);

  function actualizar(i: number, cambios: Partial<ZonaGeo>) {
    onCambio(zonas.map((z, j) => (j === i ? { ...z, ...cambios } : z)));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {zonas.map((zona, i) => (
          <FilaZona
            key={i}
            indice={i}
            zona={zona}
            conMapa={conMapa && !errorMapa}
            onError={setErrorMapa}
            onCambio={(c) => actualizar(i, c)}
            onQuitar={zonas.length > 1 ? () => onCambio(zonas.filter((_, j) => j !== i)) : undefined}
          />
        ))}
      </div>
      {zonas.length < MAX_ZONAS && (
        <button
          type="button"
          onClick={() => onCambio([...zonas, zonaVacia()])}
          className="text-xs font-semibold text-sauce hover:underline"
        >
          + Agregar otra zona
        </button>
      )}
      {!conMapa && (
        <p className="text-[11px] text-carbon/50">
          Google Maps no está configurado: las zonas se guardan como texto sin confirmar.
        </p>
      )}
      {errorMapa && <p className="text-[11px] text-rojo">{errorMapa} Las zonas se guardan como texto.</p>}
      {conMapa && !errorMapa && <MapaZonas zonas={zonas.filter(zonaConfirmada)} onError={setErrorMapa} />}
    </div>
  );
}

function FilaZona({
  indice,
  zona,
  conMapa,
  onCambio,
  onQuitar,
  onError,
}: {
  indice: number;
  zona: ZonaGeo;
  conMapa: boolean;
  onCambio: (c: Partial<ZonaGeo>) => void;
  onQuitar?: () => void;
  onError: (e: string) => void;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const token = useRef<any>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmada = zonaConfirmada(zona);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  function escribir(texto: string) {
    // Al editar el texto, la zona deja de estar confirmada hasta elegir una sugerencia.
    onCambio({ nombre: texto, placeId: null, lat: null, lng: null, direccion: null });
    if (!conMapa) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    if (texto.trim().length < 3) {
      setSugerencias([]);
      return;
    }
    temporizador.current = setTimeout(() => void sugerir(texto.trim()), 250);
  }

  async function sugerir(texto: string) {
    setBuscando(true);
    try {
      const google = await cargarGoogleMaps();
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary("places");
      if (!token.current) token.current = new AutocompleteSessionToken();
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: texto,
        sessionToken: token.current,
        includedRegionCodes: ["mx"],
        locationBias: { center: CENTRO_BUSQUEDA, radius: RADIO_SESGO_M },
        language: "es",
        region: "mx",
      });
      setSugerencias(
        (suggestions ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .slice(0, 6)
          .map((p: any) => ({
            placeId: p.placeId,
            principal: p.mainText?.text ?? p.text?.text ?? "",
            secundario: p.secondaryText?.text ?? "",
            prediccion: p,
          })),
      );
      setAbierto(true);
    } catch (e: any) {
      onError(e?.message || "No se pudo consultar Google Maps.");
    } finally {
      setBuscando(false);
    }
  }

  async function elegir(s: Sugerencia) {
    setAbierto(false);
    try {
      const lugar = s.prediccion.toPlace();
      await lugar.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      token.current = null; // la sesión de autocompletado termina al elegir
      onCambio({
        nombre: s.principal || lugar.displayName || "",
        placeId: s.placeId,
        lat: lugar.location?.lat() ?? null,
        lng: lugar.location?.lng() ?? null,
        direccion: lugar.formattedAddress ?? s.secundario ?? null,
      });
      setSugerencias([]);
    } catch (e: any) {
      onError(e?.message || "No se pudo obtener la ubicación de la zona.");
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={zona.nombre}
            onChange={(e) => escribir(e.target.value)}
            onFocus={() => sugerencias.length > 0 && setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            placeholder={indice === 0 ? "Villas de San Juan" : `Zona ${indice + 1}`}
            className={`${INPUT} ${conMapa ? "pr-7" : ""} ${confirmada ? "border-emerald-300" : ""}`}
            aria-label={`Zona ${indice + 1}`}
            autoComplete="off"
          />
          {conMapa && zona.nombre.trim() && (
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
              title={confirmada ? "Confirmada en Google Maps" : "Sin confirmar: elígela de las sugerencias"}
            >
              {buscando ? "…" : confirmada ? "📍" : "⚠️"}
            </span>
          )}
        </div>
        {conMapa && (
          <select
            value={zona.radioKm}
            onChange={(e) => onCambio({ radioKm: Number(e.target.value) })}
            className="shrink-0 rounded-md border border-carbon/20 bg-white px-1.5 py-1.5 text-xs focus:border-sauce focus:outline-none"
            aria-label={`Radio de la zona ${indice + 1}`}
            title="Radio alrededor de la zona"
          >
            {RADIOS_KM.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        )}
        {onQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar zona ${indice + 1}`}
            className="shrink-0 rounded-md border border-carbon/15 px-2 py-1.5 text-xs text-carbon/50 hover:border-rojo hover:text-rojo"
          >
            ✕
          </button>
        )}
      </div>
      {confirmada && zona.direccion && <p className="mt-0.5 truncate text-[10px] text-emerald-800">📍 {zona.direccion}</p>}
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-carbon/15 bg-white shadow-lg">
          {sugerencias.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void elegir(s)}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-violet-50"
              >
                <span className="font-semibold text-carbon">{s.principal}</span>
                {s.secundario && <span className="block text-[10px] text-carbon/50">{s.secundario}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mapa con un círculo por zona confirmada (su radio de búsqueda). */
export function MapaZonas({ zonas, onError, alto = 220 }: { zonas: ZonaGeo[]; onError?: (e: string) => void; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const figuras = useRef<any[]>([]);
  const clave = zonas.map((z) => `${z.placeId}:${z.radioKm}`).join("|");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const google = await cargarGoogleMaps();
        const { Map, Circle } = await google.maps.importLibrary("maps");
        if (cancelado || !contenedor.current) return;
        if (!mapa.current) {
          mapa.current = new Map(contenedor.current, {
            center: CENTRO_BUSQUEDA,
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }
        figuras.current.forEach((f) => f.setMap(null));
        figuras.current = [];
        if (zonas.length === 0) return;
        const limites = new google.maps.LatLngBounds();
        for (const z of zonas) {
          const centro = { lat: z.lat as number, lng: z.lng as number };
          const circulo = new Circle({
            map: mapa.current,
            center: centro,
            radius: z.radioKm * 1000,
            strokeColor: "#6d28d9",
            strokeWeight: 1.5,
            fillColor: "#8b5cf6",
            fillOpacity: 0.15,
          });
          const punto = new Circle({
            map: mapa.current,
            center: centro,
            radius: 60,
            strokeColor: "#4c1d95",
            fillColor: "#4c1d95",
            fillOpacity: 1,
          });
          figuras.current.push(circulo, punto);
          limites.union(circulo.getBounds());
        }
        mapa.current.fitBounds(limites, 24);
      } catch (e: any) {
        onError?.(e?.message || "No se pudo mostrar el mapa.");
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return <div ref={contenedor} style={{ height: alto }} className="w-full overflow-hidden rounded-md border border-carbon/10 bg-carbon/5" />;
}
