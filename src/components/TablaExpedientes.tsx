"use client";

import { useEffect, useState } from "react";
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
  cliente: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
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
  const { moverEtapa, moverEtapaMasivo, eliminarMasivo } = useExpedientes();
  const orden = useOrden(expedientes, COMPARADORES);

  // Selección múltiple (por id). Se limpia cuando cambia el set de filas.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const idsVisibles = orden.ordenados.map((e) => e.id);

  // Quita de la selección los ids que ya no están visibles (al filtrar/borrar).
  useEffect(() => {
    setSel((prev) => {
      const visibles = new Set(idsVisibles);
      const siguiente = new Set(
        Array.from(prev).filter((id) => visibles.has(id)),
      );
      return siguiente.size === prev.size ? prev : siguiente;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsVisibles.join(",")]);

  function alternar(id: string) {
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function alternarTodos() {
    setSel((prev) =>
      prev.size === idsVisibles.length ? new Set() : new Set(idsVisibles),
    );
  }

  const ids = Array.from(sel);
  const todosMarcados = ids.length > 0 && ids.length === idsVisibles.length;

  async function cambiarEtapaSeleccion(etapa: EtapaId) {
    setTrabajando(true);
    try {
      await moverEtapaMasivo(ids, etapa);
      setSel(new Set());
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminarSeleccion() {
    setTrabajando(true);
    try {
      await eliminarMasivo(ids);
      setSel(new Set());
      setConfirmarBorrado(false);
    } finally {
      setTrabajando(false);
    }
  }

  if (expedientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
        Sin resultados. Ajusta la búsqueda o crea uno con “+ Nuevo expediente”.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Barra de acciones masivas */}
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sauce/30 bg-sauce/5 px-3 py-2 text-sm">
          <span className="font-medium text-verde-profundo">
            {ids.length} seleccionado{ids.length === 1 ? "" : "s"}
          </span>

          <label className="flex items-center gap-1.5 text-carbon/70">
            Cambiar etapa:
            <select
              defaultValue=""
              disabled={trabajando}
              onChange={(e) => {
                if (e.target.value) {
                  void cambiarEtapaSeleccion(e.target.value as EtapaId);
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="">— elige etapa —</option>
              {ETAPAS.map((etapa) => (
                <option key={etapa.id} value={etapa.id}>
                  {etapa.nombre}
                </option>
              ))}
            </select>
          </label>

          {confirmarBorrado ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-carbon/70">
                ¿Eliminar {ids.length}?
              </span>
              <button
                type="button"
                disabled={trabajando}
                onClick={eliminarSeleccion}
                className="rounded bg-rojo px-2 py-1 text-xs font-medium text-crema hover:opacity-90 disabled:opacity-60"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrado(false)}
                className="rounded px-2 py-1 text-xs text-carbon/60 hover:text-carbon"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => setConfirmarBorrado(true)}
              className="rounded-md border border-rojo/30 bg-white px-3 py-1 text-xs text-rojo transition hover:bg-rojo/10 disabled:opacity-60"
            >
              Eliminar
            </button>
          )}

          <button
            type="button"
            onClick={() => setSel(new Set())}
            className="ml-auto text-xs text-carbon/50 underline hover:text-carbon"
          >
            limpiar selección
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-carbon/10 bg-crema/60 text-left">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  aria-label="Seleccionar todos"
                  className="cursor-pointer"
                />
              </th>
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
              className={`border-b border-carbon/5 transition hover:bg-crema/40 ${
                sel.has(exp.id) ? "bg-sauce/5" : ""
              }`}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={sel.has(exp.id)}
                  onChange={() => alternar(exp.id)}
                  aria-label={`Seleccionar ${exp.nombreCompleto}`}
                  className="cursor-pointer"
                />
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/expediente/${exp.id}`}
                  className="font-titular font-medium text-verde-profundo hover:text-sauce"
                >
                  {exp.nombreCompleto}
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
                  aria-label={`Cambiar etapa de ${exp.nombreCompleto}`}
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
    </div>
  );
}
