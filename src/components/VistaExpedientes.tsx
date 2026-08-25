"use client";

import { useEffect, useMemo, useState } from "react";
import { useExpedientes } from "@/context/expedientes-context";
import { TODAS_LAS_ETAPAS } from "@/lib/etapas";
import type { EtapaId } from "@/lib/types";
import { TableroExpedientes } from "./TableroExpedientes";
import { TablaExpedientes } from "./TablaExpedientes";

type Vista = "lista" | "tablero";
type RangoPreset =
  | "todos"
  | "hoy"
  | "ayer"
  | "ultima-semana"
  | "este-mes"
  | "mes-pasado"
  | "personalizado";

const CLAVE_VISTA = "sauceda.vista";

/** Fecha local en formato YYYY-MM-DD. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** Calcula [desde, hasta] (YYYY-MM-DD) según el preset. */
function calcularRango(
  preset: RangoPreset,
  desde: string,
  hasta: string,
): { desde: string; hasta: string } | null {
  const hoy = new Date();
  switch (preset) {
    case "hoy":
      return { desde: ymd(hoy), hasta: ymd(hoy) };
    case "ayer": {
      const a = new Date(hoy);
      a.setDate(a.getDate() - 1);
      return { desde: ymd(a), hasta: ymd(a) };
    }
    case "ultima-semana": {
      const i = new Date(hoy);
      i.setDate(i.getDate() - 6);
      return { desde: ymd(i), hasta: ymd(hoy) };
    }
    case "este-mes": {
      const i = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: ymd(i), hasta: ymd(hoy) };
    }
    case "mes-pasado": {
      const i = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: ymd(i), hasta: ymd(f) };
    }
    case "personalizado":
      if (!desde && !hasta) return null;
      return { desde: desde || "0000-01-01", hasta: hasta || "9999-12-31" };
    default:
      return null;
  }
}

/**
 * Contenedor de las visualizaciones de expedientes con filtros:
 * búsqueda, multi-selección de etapas y rango de fecha (último movimiento).
 */
export function VistaExpedientes() {
  const { expedientes, cargado, error } = useExpedientes();
  const [vista, setVista] = useState<Vista>("lista");
  const [busqueda, setBusqueda] = useState("");
  const [etapasSel, setEtapasSel] = useState<EtapaId[]>([]);
  const [rango, setRango] = useState<RangoPreset>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    const guardada = window.localStorage.getItem(CLAVE_VISTA);
    if (guardada === "lista" || guardada === "tablero") setVista(guardada);
  }, []);

  function cambiarVista(v: Vista) {
    setVista(v);
    window.localStorage.setItem(CLAVE_VISTA, v);
  }

  function alternarEtapa(id: EtapaId) {
    setEtapasSel((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const r = calcularRango(rango, desde, hasta);
    return expedientes.filter((e) => {
      const coincideTexto =
        !q ||
        e.nombreCompleto.toLowerCase().includes(q) ||
        e.fraccionamiento.toLowerCase().includes(q);
      const coincideEtapa =
        etapasSel.length === 0
          ? e.etapa !== "perdido" // por defecto se excluyen los Perdido
          : etapasSel.includes(e.etapa);
      const coincideFecha =
        !r || (e.ultimoMovimiento >= r.desde && e.ultimoMovimiento <= r.hasta);
      return coincideTexto && coincideEtapa && coincideFecha;
    });
  }, [expedientes, busqueda, etapasSel, rango, desde, hasta]);

  const filtrando =
    busqueda.trim() !== "" || etapasSel.length > 0 || rango !== "todos";

  if (error) {
    return (
      <div className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo flex items-center justify-between">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void recargar()}
          className="rounded bg-rojo px-3 py-1 text-xs text-crema hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!cargado) {
    return (
      <div className="flex items-center gap-3 px-1 py-8 text-sm text-carbon/60">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sauce border-t-transparent"></div>
        <span>Cargando negocios…</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        {/* Fila 1: búsqueda + fecha + vista */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente o fraccionamiento…"
              className="w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30 sm:max-w-xs"
            />
            <select
              value={rango}
              onChange={(e) => setRango(e.target.value as RangoPreset)}
              className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
              title="Filtrar por último movimiento"
            >
              <option value="todos">Cualquier fecha</option>
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="ultima-semana">Últimos 7 días</option>
              <option value="este-mes">Este mes</option>
              <option value="mes-pasado">Mes pasado</option>
              <option value="personalizado">Personalizado…</option>
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

        {/* Rango personalizado */}
        {rango === "personalizado" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-carbon/60">Del</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1.5 text-sm"
            />
            <span className="text-carbon/60">al</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {/* Fila 2: chips de etapas (multi-selección) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          <span className="mr-1 text-xs text-carbon/50 shrink-0">Etapas:</span>
          {TODAS_LAS_ETAPAS.map((etapa) => {
            const activo = etapasSel.includes(etapa.id);
            return (
              <button
                key={etapa.id}
                type="button"
                onClick={() => alternarEtapa(etapa.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition shrink-0 ${
                  activo
                    ? "border-sauce bg-sauce text-crema"
                    : "border-carbon/15 bg-white text-carbon/60 hover:border-sauce"
                }`}
              >
                {etapa.nombre}
              </button>
            );
          })}
          {etapasSel.length > 0 && (
            <button
              type="button"
              onClick={() => setEtapasSel([])}
              className="ml-1 text-xs text-carbon/50 underline hover:text-carbon shrink-0"
            >
              limpiar
            </button>
          )}
        </div>
      </div>

      {/* Contador */}
      <p className="mb-3 text-sm text-carbon/60">
        <span className="font-mono font-medium text-verde-profundo">
          {filtrados.length}
        </span>{" "}
        {filtrando ? (
          <>
            de {expedientes.length} negocio
            {expedientes.length === 1 ? "" : "s"}
          </>
        ) : (
          <>negocio{filtrados.length === 1 ? "" : "s"}</>
        )}
        {etapasSel.length === 0 && (
          <span className="text-carbon/40"> · Perdido oculto</span>
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
