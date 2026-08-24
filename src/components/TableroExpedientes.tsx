"use client";

import { useExpedientes } from "@/context/expedientes-context";
import { TODAS_LAS_ETAPAS, etapaAnterior, etapaSiguiente, PROBABILIDAD_POR_ETAPA } from "@/lib/etapas";
import type { EtapaId, Expediente } from "@/lib/types";
import { formatoPesos } from "@/lib/formato";
import { TarjetaExpediente } from "./TarjetaExpediente";

/**
 * Tablero de operación (tipo kanban) de expedientes estilo HubSpot.
 * Recibe la lista ya filtrada; usa el contexto para mover de etapa.
 * Incluye resumen totalizador ($ acumulado y valor ponderado) por columna.
 */
export function TableroExpedientes({
  expedientes,
}: {
  expedientes: Expediente[];
}) {
  const { moverEtapa } = useExpedientes();

  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-6 pt-1">
      {TODAS_LAS_ETAPAS.map((etapa) => {
        const enEtapa = expedientes.filter((e) => e.etapa === etapa.id);
        const totalMonto = enEtapa.reduce((acc, e) => acc + (Number(e.valorEstimado) || 0), 0);
        const prob = PROBABILIDAD_POR_ETAPA[etapa.id] ?? 0;
        const montoPonderado = totalMonto * prob;

        return (
          <section
            key={etapa.id}
            className="flex w-76 shrink-0 flex-col rounded-2xl bg-white/70 border border-carbon/10 p-3.5 shadow-sm transition hover:shadow-md"
            aria-label={`Etapa ${etapa.nombre}`}
          >
            {/* Encabezado de columna estilo HubSpot */}
            <div className="mb-3 border-b border-carbon/10 pb-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                  {etapa.nombre}
                </h2>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-verde-profundo/10 px-2 font-mono text-xs font-bold text-verde-profundo">
                  {enEtapa.length}
                </span>
              </div>

              {/* Totalizador superior de columna */}
              <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
                <span className="font-mono font-bold text-carbon/80">
                  {formatoPesos(totalMonto)}
                </span>
                <span className="font-mono text-[10px] text-carbon/50">
                  Pond: {formatoPesos(montoPonderado)} ({Math.round(prob * 100)}%)
                </span>
              </div>
            </div>

            {/* Tarjetas de la etapa */}
            <div className="flex flex-1 flex-col gap-3 min-h-[160px]">
              {enEtapa.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-carbon/15 bg-white/40 p-4 text-center text-xs text-carbon/40">
                  Sin expedientes en esta etapa
                </div>
              )}

              {enEtapa.map((exp) => (
                <div key={exp.id}>
                  <TarjetaExpediente expediente={exp} />
                  <ControlesMover
                    etapaActual={exp.etapa}
                    onMover={(destino) => moverEtapa(exp.id, destino)}
                  />
                </div>
              ))}
            </div>

            {/* Resumen al pie de columna estilo HubSpot */}
            <div className="mt-3 border-t border-carbon/10 pt-2 text-center text-[10px] text-carbon/50 font-mono">
              Total ({enEtapa.length}): <span className="font-bold text-carbon/80">{formatoPesos(totalMonto)}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Botones para mover un expediente a la etapa anterior o siguiente. */
function ControlesMover({
  etapaActual,
  onMover,
}: {
  etapaActual: EtapaId;
  onMover: (destino: EtapaId) => void;
}) {
  const anterior = etapaAnterior(etapaActual);
  const siguiente = etapaSiguiente(etapaActual);

  return (
    <div className="mt-1.5 flex items-center justify-between gap-2">
      <button
        type="button"
        disabled={!anterior}
        onClick={() => anterior && onMover(anterior.id)}
        className="flex-1 rounded-md border border-carbon/10 bg-white px-2 py-1 font-cuerpo text-xs text-carbon/70 transition enabled:hover:border-sauce enabled:hover:text-sauce disabled:opacity-30"
        title={anterior ? `Mover a ${anterior.nombre}` : "Es la primera etapa"}
      >
        ← {anterior?.nombre ?? "—"}
      </button>
      <button
        type="button"
        disabled={!siguiente}
        onClick={() => siguiente && onMover(siguiente.id)}
        className="flex-1 rounded-md border border-sauce/30 bg-sauce/10 px-2 py-1 font-cuerpo text-xs text-sauce transition enabled:hover:bg-sauce enabled:hover:text-crema disabled:opacity-30"
        title={siguiente ? `Mover a ${siguiente.nombre}` : "Es la última etapa"}
      >
        {siguiente?.nombre ?? "—"} →
      </button>
    </div>
  );
}
