"use client";

import Link from "next/link";
import { useExpedientes } from "@/context/expedientes-context";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import type { EtapaId, Expediente } from "@/lib/types";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { useOrden } from "@/hooks/useOrden";
import { ThOrden } from "./ThOrden";

/** Comparadores por columna (estables a nivel de módulo). */
const COMPARADORES: Record<string, (a: Expediente, b: Expediente) => number> = {
  cliente: (a, b) => a.cliente.localeCompare(b.cliente, "es"),
  fraccionamiento: (a, b) =>
    a.fraccionamiento.localeCompare(b.fraccionamiento, "es"),
  origen: (a, b) =>
    (a.origenProspecto ?? "").localeCompare(b.origenProspecto ?? "", "es"),
  telefono: (a, b) => a.telefono.localeCompare(b.telefono, "es"),
  etapa: (a, b) => ETAPAS_POR_ID[a.etapa].orden - ETAPAS_POR_ID[b.etapa].orden,
  valorEstimado: (a, b) => a.valorEstimado - b.valorEstimado,
  saldoDeuda: (a, b) => a.saldoDeuda - b.saldoDeuda,
  ultimoMovimiento: (a, b) =>
    a.ultimoMovimiento.localeCompare(b.ultimoMovimiento),
};

/**
 * Vista de LISTA de expedientes (tipo HubSpot).
 * Columnas ordenables (clic en el encabezado) y etapa editable en línea.
 * Recibe la lista ya filtrada; usa el contexto solo para mover de etapa.
 */
export function TablaExpedientes({
  expedientes,
}: {
  expedientes: Expediente[];
}) {
  const { moverEtapa } = useExpedientes();
  const orden = useOrden(expedientes, COMPARADORES);

  if (expedientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
        Sin resultados. Ajusta la búsqueda o crea uno con “+ Nuevo expediente”.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
      <table className="w-full min-w-[940px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-carbon/10 bg-crema/60 text-left">
            {(
              [
                ["cliente", "Expediente", "izquierda"],
                ["fraccionamiento", "Fraccionamiento", "izquierda"],
                ["origen", "Origen", "izquierda"],
                ["telefono", "Teléfono", "izquierda"],
                ["etapa", "Etapa", "izquierda"],
                ["valorEstimado", "Valor estimado", "derecha"],
                ["saldoDeuda", "Saldo deuda", "derecha"],
                ["ultimoMovimiento", "Último mov.", "izquierda"],
              ] as const
            ).map(([columna, label, alineado]) => (
              <ThOrden
                key={columna}
                columna={columna}
                claveActiva={orden.clave}
                dir={orden.dir}
                onOrdenar={orden.ordenarPor}
                alineado={alineado}
              >
                {label}
              </ThOrden>
            ))}
          </tr>
        </thead>
        <tbody>
          {orden.ordenados.map((exp) => (
            <tr
              key={exp.id}
              className="border-b border-carbon/5 transition hover:bg-crema/40"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/expediente/${exp.id}`}
                  className="font-titular font-medium text-verde-profundo hover:text-sauce"
                >
                  {exp.cliente}
                </Link>
                <span className="ml-2 font-mono text-[10px] text-carbon/40">
                  {exp.id}
                </span>
              </td>

              <td className="px-3 py-2.5 text-carbon/70">
                {exp.fraccionamiento}
              </td>

              <td className="px-3 py-2.5">
                {exp.origenProspecto ? (
                  <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2 py-0.5 text-xs text-cielo">
                    {ORIGEN_POR_ID[exp.origenProspecto]}
                  </span>
                ) : (
                  <span className="text-xs text-carbon/30">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 font-mono text-xs text-carbon/70">
                {exp.telefono || "—"}
              </td>

              <td className="px-3 py-2.5">
                <select
                  value={exp.etapa}
                  onChange={(e) => moverEtapa(exp.id, e.target.value as EtapaId)}
                  className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none transition hover:border-sauce focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                  aria-label={`Cambiar etapa de ${exp.cliente}`}
                >
                  {ETAPAS.map((etapa) => (
                    <option key={etapa.id} value={etapa.id}>
                      {etapa.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-3 py-2.5 text-right font-mono text-sauce">
                {formatoPesos(exp.valorEstimado)}
              </td>

              <td className="px-3 py-2.5 text-right font-mono text-carbon/70">
                {formatoPesos(exp.saldoDeuda)}
              </td>

              <td className="px-3 py-2.5 text-xs text-carbon/50">
                {formatoFecha(exp.ultimoMovimiento)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
