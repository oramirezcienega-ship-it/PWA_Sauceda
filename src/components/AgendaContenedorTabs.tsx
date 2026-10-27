"use client";

import { useState } from "react";
import { RutaSemanalDashboard } from "./RutaSemanalDashboard";
import { AgendaDashboard } from "./AgendaDashboard";

interface AgendaContenedorTabsProps {
  usuarioActual: {
    id: string;
    nombre: string;
    rol: "admin" | "asesor" | "operaciones";
  };
  asesoresActivos: {
    id: string;
    nombre: string;
  }[];
  siteUrl: string;
}

export function AgendaContenedorTabs({
  usuarioActual,
  asesoresActivos,
  siteUrl,
}: AgendaContenedorTabsProps) {
  const [tabActiva, setTabActiva] = useState<"ruta" | "calendario">("ruta");

  return (
    <div className="space-y-6">
      {/* Conmutador de Pestañas Superior */}
      <div className="flex items-center gap-2 border-b border-carbon/10 pb-3">
        <button
          type="button"
          onClick={() => setTabActiva("ruta")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            tabActiva === "ruta"
              ? "bg-verde-profundo text-white shadow-sm"
              : "bg-white border border-carbon/15 text-carbon hover:bg-carbon/5"
          }`}
        >
          <span>🗺️</span> Ruta Semanal de Inspecciones
        </button>

        <button
          type="button"
          onClick={() => setTabActiva("calendario")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            tabActiva === "calendario"
              ? "bg-verde-profundo text-white shadow-sm"
              : "bg-white border border-carbon/15 text-carbon hover:bg-carbon/5"
          }`}
        >
          <span>📅</span> Calendario Mensual y Bloqueos
        </button>
      </div>

      {/* Renderizado de la pestaña activa */}
      {tabActiva === "ruta" ? (
        <RutaSemanalDashboard />
      ) : (
        <AgendaDashboard
          usuarioActual={usuarioActual}
          asesoresActivos={asesoresActivos}
          siteUrl={siteUrl}
        />
      )}
    </div>
  );
}
