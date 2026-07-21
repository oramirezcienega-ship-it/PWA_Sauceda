"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export function FiltrosDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Obtener valores iniciales de la URL
  const rangoActual = searchParams?.get("rango") || "todos";
  const desdeActual = searchParams?.get("desde") || "";
  const hastaActual = searchParams?.get("hasta") || "";

  const [rango, setRango] = useState(rangoActual);
  const [desde, setDesde] = useState(desdeActual);
  const [hasta, setHasta] = useState(hastaActual);

  // Sincronizar estado cuando cambien los parámetros de la URL externamente
  useEffect(() => {
    setRango(rangoActual);
    setDesde(desdeActual);
    setHasta(hastaActual);
  }, [rangoActual, desdeActual, hastaActual]);

  const aplicarFiltro = (nuevoRango: string, fDesde = desde, fHasta = hasta) => {
    const params = new URLSearchParams(window.location.search);
    
    if (nuevoRango === "todos") {
      params.delete("rango");
      params.delete("desde");
      params.delete("hasta");
    } else {
      params.set("rango", nuevoRango);
      if (nuevoRango === "personalizado") {
        if (fDesde) params.set("desde", fDesde);
        else params.delete("desde");
        if (fHasta) params.set("hasta", fHasta);
        else params.delete("hasta");
      } else {
        params.delete("desde");
        params.delete("hasta");
      }
    }
    
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  const manejarRangoRapido = (tipo: string) => {
    setRango(tipo);
    if (tipo !== "personalizado") {
      aplicarFiltro(tipo, "", "");
    }
  };

  const manejarSubmitPersonalizado = (e: React.FormEvent) => {
    e.preventDefault();
    aplicarFiltro("personalizado");
  };

  return (
    <div className="mt-4 rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Filtros Rápidos */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-carbon/50 mr-1.5 uppercase tracking-wider">
            Rango:
          </span>
          {[
            { id: "todos", label: "Histórico" },
            { id: "hoy", label: "Hoy" },
            { id: "7dias", label: "Últimos 7 días" },
            { id: "mes", label: "Este mes" },
            { id: "anio", label: "Este año" },
            { id: "personalizado", label: "Personalizado" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => manejarRangoRapido(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                rango === item.id
                  ? "bg-verde-profundo text-white shadow-sm"
                  : "bg-carbon/[0.02] text-carbon/60 border border-carbon/5 hover:bg-carbon/[0.06] hover:text-carbon"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Fechas Personalizadas */}
        {rango === "personalizado" && (
          <form
            onSubmit={manejarSubmitPersonalizado}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-carbon/5 bg-carbon/[0.01] p-2"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="desde" className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                Desde:
              </label>
              <input
                type="date"
                id="desde"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-mono text-carbon focus:border-sauce focus:outline-none"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hasta" className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                Hasta:
              </label>
              <input
                type="date"
                id="hasta"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-mono text-carbon focus:border-sauce focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="rounded bg-sauce hover:bg-verde-profundo text-white font-bold text-xs px-3.5 py-1.5 transition shadow"
            >
              Filtrar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
