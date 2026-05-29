"use client";

import Link from "next/link";
import { useExpedientes } from "@/context/expedientes-context";
import { ETAPAS, etapaAnterior, etapaSiguiente } from "@/lib/etapas";
import { EtapaBadge } from "./EtapaBadge";
import { formatoFecha, formatoPesos } from "@/lib/formato";

/**
 * Vista de detalle de un expediente.
 * Muestra toda la información del caso, el avance por etapas y permite
 * mover el expediente a otra etapa (anterior / siguiente / directo).
 */
export function DetalleExpediente({ id }: { id: string }) {
  const { obtenerExpediente, moverEtapa } = useExpedientes();
  const expediente = obtenerExpediente(id);

  // Expediente inexistente (p. ej. id inválido en la URL).
  if (!expediente) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="font-titular text-2xl text-verde-profundo">
          Expediente no encontrado
        </p>
        <p className="mt-2 text-sm text-carbon/60">
          El expediente <span className="font-mono">{id}</span> no existe.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-sauce px-4 py-2 text-sm text-crema hover:bg-verde-profundo"
        >
          ← Volver al tablero
        </Link>
      </div>
    );
  }

  const anterior = etapaAnterior(expediente.etapa);
  const siguiente = etapaSiguiente(expediente.etapa);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
      >
        ← Volver al tablero
      </Link>

      {/* Cabecera */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            {expediente.cliente}
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            {expediente.fraccionamiento} · León, Gto.
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-carbon/40">
          {expediente.id}
        </span>
      </div>

      <div className="mt-3">
        <EtapaBadge etapa={expediente.etapa} />
      </div>

      {/* Avance por etapas */}
      <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
          Avance del traspaso
        </p>
        <ol className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa) => {
            const actual = etapa.id === expediente.etapa;
            const completada =
              etapa.orden < ETAPAS.find((e) => e.id === expediente.etapa)!.orden;
            return (
              <li
                key={etapa.id}
                className={`rounded-full px-3 py-1 text-xs ${
                  actual
                    ? "bg-verde-profundo text-crema"
                    : completada
                      ? "bg-sauce/20 text-verde-profundo"
                      : "bg-carbon/5 text-carbon/40"
                }`}
              >
                {etapa.nombre}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Datos del caso */}
      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-2">
        <Dato etiqueta="Teléfono" valor={expediente.telefono} mono />
        <Dato
          etiqueta="Último movimiento"
          valor={formatoFecha(expediente.ultimoMovimiento)}
        />
        <Dato
          etiqueta="Valor estimado"
          valor={formatoPesos(expediente.valorEstimado)}
          mono
          resaltar
        />
        <Dato
          etiqueta="Saldo de deuda"
          valor={formatoPesos(expediente.saldoDeuda)}
          mono
        />
      </dl>

      {/* Situación y notas */}
      <div className="mt-4 space-y-4">
        <Bloque titulo="Situación">{expediente.situacion}</Bloque>
        <Bloque titulo="Notas del asesor">{expediente.notas}</Bloque>
      </div>

      {/* Mover de etapa */}
      <div className="mt-6 rounded-xl border border-dorado/40 bg-dorado/5 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
          Mover de etapa
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={!anterior}
            onClick={() => anterior && moverEtapa(expediente.id, anterior.id)}
            className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition enabled:hover:border-sauce enabled:hover:text-sauce disabled:opacity-30"
          >
            ← {anterior?.nombre ?? "Primera etapa"}
          </button>
          <button
            type="button"
            disabled={!siguiente}
            onClick={() => siguiente && moverEtapa(expediente.id, siguiente.id)}
            className="flex-1 rounded-md bg-sauce px-3 py-2 text-sm text-crema transition enabled:hover:bg-verde-profundo disabled:opacity-30"
          >
            {siguiente?.nombre ?? "Última etapa"} →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Celda de dato dentro de la cuadrícula de información. */
function Dato({
  etiqueta,
  valor,
  mono,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  resaltar?: boolean;
}) {
  return (
    <div className="bg-white p-3">
      <dt className="text-[10px] uppercase tracking-wide text-carbon/40">
        {etiqueta}
      </dt>
      <dd
        className={`mt-0.5 ${mono ? "font-mono" : "font-cuerpo"} ${
          resaltar ? "text-sauce" : "text-carbon"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/** Bloque de texto con título (situación / notas). */
function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-carbon/50">
        {titulo}
      </p>
      <p className="text-sm text-carbon/80">{children}</p>
    </div>
  );
}
