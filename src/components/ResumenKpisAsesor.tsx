"use client";

import { useState } from "react";

interface ResumenKpisAsesorProps {
  totalLeads: number;
  tareasPendientes: number;
  tareasCompletadas: number;
  cerrados: number;
  tasaConversion: number;
}

export function ResumenKpisAsesor({
  totalLeads,
  tareasPendientes,
  tareasCompletadas,
  cerrados,
  tasaConversion,
}: ResumenKpisAsesorProps) {
  const [expandido, setExpandido] = useState(false);

  function Metrica({
    etiqueta,
    valor,
    resaltar,
  }: {
    etiqueta: string;
    valor: string;
    resaltar?: boolean;
  }) {
    return (
      <div className="rounded-xl border border-carbon/10 bg-white p-2 sm:p-3 shadow-sm flex flex-col justify-between h-full min-h-[58px] sm:min-h-[70px]">
        <p className="text-[8px] sm:text-[10px] uppercase font-bold tracking-wider text-carbon/40 truncate" title={etiqueta}>
          {etiqueta}
        </p>
        <p
          className={`mt-0.5 font-mono text-sm sm:text-xl font-bold ${
            resaltar ? "text-sauce" : "text-verde-profundo"
          }`}
        >
          {valor}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      {/* Grid de KPIs */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 md:grid-cols-5">
        {/* KPI 1: Leads Asignados */}
        <Metrica etiqueta="Leads Asignados" valor={String(totalLeads)} />

        {/* KPI 2: Tareas Pendientes */}
        <Metrica
          etiqueta="Tareas Pendientes"
          valor={String(tareasPendientes)}
          resaltar={tareasPendientes > 0}
        />

        {/* KPI 3: Conversión */}
        <Metrica etiqueta="Conversión" valor={`${tasaConversion}%`} resaltar />

        {/* KPIs extra: en móvil se muestran condicionalmente si está expandido, de lo contrario ocultos mediante css */}
        <div className={`${expandido ? "block" : "hidden"} md:block`}>
          <Metrica etiqueta="Tareas Compl." valor={String(tareasCompletadas)} />
        </div>
        <div className={`${expandido ? "block" : "hidden"} md:block`}>
          <Metrica etiqueta="Exp. Cerrados" valor={String(cerrados)} />
        </div>
      </div>

      {/* Botón de toggle (solo móvil) */}
      <div className="md:hidden flex justify-end mt-1.5">
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-sauce hover:underline focus:outline-none bg-sauce/5 px-2 py-0.5 rounded border border-sauce/10"
        >
          {expandido ? "▲ Menos KPIs" : "▼ Más KPIs"}
        </button>
      </div>
    </div>
  );
}
