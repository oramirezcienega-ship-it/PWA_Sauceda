"use client";

import Link from "next/link";
import type { Prospecto, EstatusProspecto, CalificacionProspecto } from "@/lib/types";
import { ESTATUS_PROSPECTO_LISTA } from "@/lib/estatus";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import { EstatusProspectoBadge } from "./EstatusProspectoBadge";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import { cambiarEstatusMasivo } from "@/app/actions/prospectos";

interface TableroProspectosKanbanProps {
  prospectos: Prospecto[];
  onEstatusCambiado?: () => void;
}

/**
 * Tablero Kanban estilo HubSpot para Prospectos organizado por Etapa del Embudo Comercial.
 */
export function TableroProspectosKanban({
  prospectos,
  onEstatusCambiado,
}: TableroProspectosKanbanProps) {
  // Agrupar prospectos por etapa
  const etapasVisibles: { id: EstatusProspecto; nombre: string }[] = [
    { id: "lead", nombre: "Lead" },
    { id: "mql", nombre: "MQL" },
    { id: "sql", nombre: "SQL" },
    { id: "cliente", nombre: "Cerrado ganado" },
    { id: "sin_contacto", nombre: "Sin contacto" },
    { id: "no_viable", nombre: "Cerrado perdido" },
  ];

  async function moverProspectoEtapa(prospectoId: string, nuevoEstatus: EstatusProspecto) {
    try {
      await cambiarEstatusMasivo([prospectoId], nuevoEstatus);
      if (onEstatusCambiado) onEstatusCambiado();
    } catch (e) {
      console.error("Error al mover prospecto de etapa:", e);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-6 pt-1">
      {etapasVisibles.map((etapa) => {
        const enEtapa = prospectos.filter((p) => p.estatus === etapa.id);
        const totalValorCampana = enEtapa.reduce(
          (acc, p) => acc + (Number(p.valorCampana) || 0),
          0,
        );

        return (
          <section
            key={etapa.id}
            className="flex w-76 shrink-0 flex-col rounded-2xl bg-white/70 border border-carbon/10 p-3.5 shadow-sm transition hover:shadow-md"
            aria-label={`Etapa ${etapa.nombre}`}
          >
            {/* Encabezado de Columna */}
            <div className="mb-3 border-b border-carbon/10 pb-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                  {etapa.nombre}
                </h2>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sauce/15 px-2 font-mono text-xs font-bold text-verde-profundo">
                  {enEtapa.length}
                </span>
              </div>

              {/* Totalizador por Columna */}
              <div className="mt-1 flex items-baseline justify-between text-[11px]">
                <span className="text-carbon/50 uppercase tracking-wider font-semibold">Valor Campaña</span>
                <span className="font-mono font-bold text-verde-profundo">
                  {formatoPesos(totalValorCampana)}
                </span>
              </div>
            </div>

            {/* Tarjetas de la Etapa */}
            <div className="flex flex-1 flex-col gap-3 min-h-[160px]">
              {enEtapa.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-carbon/15 bg-white/40 p-4 text-center text-xs text-carbon/40">
                  Sin prospectos en esta etapa
                </div>
              )}

              {enEtapa.map((p) => {
                const inicialesAsesor = p.asesorNombre
                  ? p.asesorNombre
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : null;

                return (
                  <div
                    key={p.id}
                    className="group rounded-xl border border-carbon/10 bg-white p-3.5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-sauce/40 hover:shadow-md"
                  >
                    {/* Nombre y ID */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/prospectos/${p.id}`}
                          className="font-titular text-sm font-bold text-verde-profundo group-hover:text-sauce transition-colors block truncate"
                          title={p.nombreCompleto}
                        >
                          {p.nombreCompleto}
                        </Link>
                        {p.telefono ? (
                          <a
                            href={`tel:${p.telefono}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs font-bold text-verde-profundo hover:text-sauce hover:underline inline-flex items-center gap-1 mt-0.5 transition-colors block truncate"
                            title={`Llamar a ${p.nombreCompleto} (${p.telefono})`}
                          >
                            <span>📞 {p.telefono}</span>
                          </a>
                        ) : (
                          <span className="font-mono text-[10px] text-carbon/40 italic block mt-0.5">
                            📞 Sin teléfono
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-carbon/40 bg-carbon/5 px-1.5 py-0.5 rounded">
                        {p.id}
                      </span>
                    </div>

                    {/* Origen y Calificación */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="inline-flex items-center rounded-full border border-carbon/15 bg-white px-2 py-0.5 text-[10px] text-carbon/70 font-medium">
                        {ORIGEN_POR_ID[p.origen] || p.origen}
                      </span>
                      <CalificacionProspectoBadge calificacion={p.calificacion} />
                    </div>

                    {/* Ciudad */}
                    {p.ciudad && (
                      <div className="mt-2 text-xs text-carbon/70 font-mono">
                        📍 {p.ciudad}
                      </div>
                    )}

                    {/* Pie de Tarjeta: Asesor y Menú de Mover Etapa */}
                    <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2 text-[11px]">
                      {p.asesorNombre ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-carbon/70 font-medium"
                          title={`Asesor: ${p.asesorNombre}`}
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-verde-profundo text-[9px] font-bold text-crema">
                            {inicialesAsesor}
                          </span>
                          <span className="truncate max-w-[90px]">{p.asesorNombre}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] italic text-carbon/30">Sin asesor</span>
                      )}

                      {/* Selector directo de etapa estilo HubSpot */}
                      <select
                        value={p.estatus}
                        onChange={(e) =>
                          moverProspectoEtapa(p.id, e.target.value as EstatusProspecto)
                        }
                        className="rounded border border-carbon/15 bg-crema/40 px-1.5 py-0.5 text-[10px] font-medium text-carbon/80 outline-none hover:border-sauce cursor-pointer"
                        title="Cambiar etapa del prospecto"
                      >
                        {etapasVisibles.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            → {ev.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen del Pie de Columna */}
            <div className="mt-3 border-t border-carbon/10 pt-2 text-center text-[10px] text-carbon/50 font-mono">
              Total ({enEtapa.length}):{" "}
              <span className="font-bold text-carbon/80">{formatoPesos(totalValorCampana)}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
