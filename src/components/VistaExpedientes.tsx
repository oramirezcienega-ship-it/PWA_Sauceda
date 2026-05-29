"use client";

import { useEffect, useState } from "react";
import { useExpedientes } from "@/context/expedientes-context";
import { TableroExpedientes } from "./TableroExpedientes";
import { TablaExpedientes } from "./TablaExpedientes";

type Vista = "lista" | "tablero";

const CLAVE_VISTA = "sauceda.vista";

/**
 * Contenedor de las visualizaciones de expedientes.
 * Permite alternar entre la vista de LISTA (tipo HubSpot, principal) y
 * el TABLERO kanban. Recuerda la preferencia en localStorage.
 */
export function VistaExpedientes() {
  const { expedientes, cargado } = useExpedientes();
  const [vista, setVista] = useState<Vista>("lista");

  // Carga la preferencia guardada (sin romper la hidratación).
  useEffect(() => {
    const guardada = window.localStorage.getItem(CLAVE_VISTA);
    if (guardada === "lista" || guardada === "tablero") setVista(guardada);
  }, []);

  function cambiar(v: Vista) {
    setVista(v);
    window.localStorage.setItem(CLAVE_VISTA, v);
  }

  return (
    <>
      {/* Barra: total + selector de vista */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-carbon/60">
          {cargado ? (
            <>
              <span className="font-mono font-medium text-verde-profundo">
                {expedientes.length}
              </span>{" "}
              expediente{expedientes.length === 1 ? "" : "s"}
            </>
          ) : (
            "…"
          )}
        </p>

        <div className="inline-flex rounded-lg border border-carbon/15 bg-white p-0.5">
          <BotonVista
            activo={vista === "lista"}
            onClick={() => cambiar("lista")}
          >
            Lista
          </BotonVista>
          <BotonVista
            activo={vista === "tablero"}
            onClick={() => cambiar("tablero")}
          >
            Tablero
          </BotonVista>
        </div>
      </div>

      {vista === "lista" ? <TablaExpedientes /> : <TableroExpedientes />}
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
