"use client";

import { useExpedientes } from "@/context/expedientes-context";
import { ETAPAS, etapaAnterior, etapaSiguiente } from "@/lib/etapas";
import type { EtapaId, Expediente } from "@/lib/types";
import { TarjetaExpediente } from "./TarjetaExpediente";

/**
 * Tablero de operación (tipo kanban) de expedientes de traspaso.
 * Recibe la lista ya filtrada; usa el contexto solo para mover de etapa.
 * Mobile-first: las columnas se desplazan horizontalmente.
 * Cada tarjeta permite mover el expediente a la etapa anterior/siguiente.
 */
export function TableroExpedientes({
  expedientes,
}: {
  expedientes: Expediente[];
}) {
  const { moverEtapa } = useExpedientes();

  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-4">
      {ETAPAS.map((etapa) => {
        const enEtapa = expedientes.filter((e) => e.etapa === etapa.id);
        return (
          <section
            key={etapa.id}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-white/60 p-3"
            aria-label={`Etapa ${etapa.nombre}`}
          >
            {/* Encabezado de columna */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-titular text-lg font-semibold text-verde-profundo">
                {etapa.nombre}
              </h2>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sauce px-2 font-mono text-xs text-crema">
                {enEtapa.length}
              </span>
            </div>

            {/* Tarjetas de la etapa */}
            <div className="flex flex-1 flex-col gap-3">
              {enEtapa.length === 0 && (
                <p className="rounded-lg border border-dashed border-carbon/15 p-4 text-center text-xs text-carbon/40">
                  Sin expedientes
                </p>
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
