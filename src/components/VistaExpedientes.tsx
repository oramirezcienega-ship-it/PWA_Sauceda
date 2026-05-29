"use client";

import { useEffect, useMemo, useState } from "react";
import { useExpedientes } from "@/context/expedientes-context";
import { ETAPAS } from "@/lib/etapas";
import type { EtapaId } from "@/lib/types";
import { TableroExpedientes } from "./TableroExpedientes";
import { TablaExpedientes } from "./TablaExpedientes";

type Vista = "lista" | "tablero";
type FiltroEtapa = EtapaId | "todas";

const CLAVE_VISTA = "sauceda.vista";

/**
 * Contenedor de las visualizaciones de expedientes.
 * Maneja: selector de vista (Lista/Tablero), búsqueda por cliente o
 * fraccionamiento y filtro por etapa. El filtrado aplica a ambas vistas.
 */
export function VistaExpedientes() {
  const { expedientes, cargado, error } = useExpedientes();
  const [vista, setVista] = useState<Vista>("lista");
  const [busqueda, setBusqueda] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState<FiltroEtapa>("todas");

  // Carga la preferencia de vista guardada (sin romper la hidratación).
  useEffect(() => {
    const guardada = window.localStorage.getItem(CLAVE_VISTA);
    if (guardada === "lista" || guardada === "tablero") setVista(guardada);
  }, []);

  function cambiarVista(v: Vista) {
    setVista(v);
    window.localStorage.setItem(CLAVE_VISTA, v);
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return expedientes.filter((e) => {
      const coincideTexto =
        !q ||
        e.cliente.toLowerCase().includes(q) ||
        e.fraccionamiento.toLowerCase().includes(q);
      const coincideEtapa = etapaFiltro === "todas" || e.etapa === etapaFiltro;
      return coincideTexto && coincideEtapa;
    });
  }, [expedientes, busqueda, etapaFiltro]);

  const filtrando = busqueda.trim() !== "" || etapaFiltro !== "todas";

  if (error) {
    return (
      <p className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
        {error}
      </p>
    );
  }

  if (!cargado) {
    return (
      <p className="px-1 py-8 text-sm text-carbon/50">Cargando expedientes…</p>
    );
  }

  return (
    <>
      {/* Controles: búsqueda + filtro de etapa + selector de vista */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o fraccionamiento…"
            className="w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30 sm:max-w-xs"
          />
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value as FiltroEtapa)}
            className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
          >
            <option value="todas">Todas las etapas</option>
            {ETAPAS.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex shrink-0 rounded-lg border border-carbon/15 bg-white p-0.5">
          <BotonVista
            activo={vista === "lista"}
            onClick={() => cambiarVista("lista")}
          >
            Lista
          </BotonVista>
          <BotonVista
            activo={vista === "tablero"}
            onClick={() => cambiarVista("tablero")}
          >
            Tablero
          </BotonVista>
        </div>
      </div>

      {/* Contador */}
      <p className="mb-3 text-sm text-carbon/60">
        <span className="font-mono font-medium text-verde-profundo">
          {filtrados.length}
        </span>{" "}
        {filtrando ? (
          <>
            de {expedientes.length} expediente
            {expedientes.length === 1 ? "" : "s"}
          </>
        ) : (
          <>expediente{filtrados.length === 1 ? "" : "s"}</>
        )}
      </p>

      {vista === "lista" ? (
        <TablaExpedientes expedientes={filtrados} />
      ) : (
        <TableroExpedientes expedientes={filtrados} />
      )}
    </>
  );
}

function BotonVista({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        activo
          ? "bg-sauce text-crema"
          : "text-carbon/60 hover:text-verde-profundo"
      }`}
    >
      {children}
    </button>
  );
}
