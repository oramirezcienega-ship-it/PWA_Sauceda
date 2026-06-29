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

export function labelTipoNegocio(tipo: string): string {
  switch (tipo) {
    case "traspaso_compra":
      return "Traspaso / Compra";
    case "promocion_venta":
      return "Promoción Venta";
    case "solo_tramite":
      return "Solo Trámite";
    case "construccion":
      return "Sauceda Construye";
    case "otro":
      return "Otro";
    default:
      return tipo || "—";
  }
}

/** Comparadores por columna (estables a nivel de módulo). */
const COMPARADORES: Record<string, (a: Expediente, b: Expediente) => number> = {
  cliente: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
  fraccionamiento: (a, b) =>
    a.fraccionamiento.localeCompare(b.fraccionamiento, "es"),
  tipoNegocio: (a, b) =>
    (a.tipoNegocio ?? "").localeCompare(b.tipoNegocio ?? "", "es"),
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

      <div className="hidden md:block overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
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
                ["tipoNegocio", "Negocio", "izquierda"],
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

              <td className="px-3 py-2.5 text-carbon/70">
                {exp.tipoNegocio ? labelTipoNegocio(exp.tipoNegocio) : "—"}
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

      {/* Vista de Tarjetas para Móviles */}
      <div className="space-y-3 md:hidden">
        {/* Selector de seleccionar todos en móvil */}
        <div className="flex justify-between items-center bg-crema/60 rounded-xl p-3 border border-carbon/10">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-verde-profundo">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={alternarTodos}
              className="cursor-pointer h-4 w-4 rounded border-carbon/25 text-sauce focus:ring-sauce/30"
            />
            <span>Seleccionar todos los visibles ({idsVisibles.length})</span>
          </label>
        </div>

        {/* Lista de Tarjetas */}
        <div className="space-y-3">
          {orden.ordenados.map((exp) => (
            <div
              key={exp.id}
              className={`rounded-xl border transition-all p-4 shadow-sm ${
                sel.has(exp.id)
                  ? "bg-sauce/5 border-sauce/40 shadow"
                  : "bg-white border-carbon/10 hover:border-sauce/40"
              }`}
            >
              {/* Encabezado: Checkbox + Nombre & ID + Chip Origen */}
              <div className="flex items-start justify-between gap-3 border-b border-carbon/5 pb-3">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={sel.has(exp.id)}
                    onChange={() => alternar(exp.id)}
                    aria-label={`Seleccionar ${exp.nombreCompleto}`}
                    className="cursor-pointer mt-1 h-4 w-4 rounded border-carbon/25 text-sauce focus:ring-sauce/30"
                  />
                  <div>
                    <Link
                      href={`/expediente/${exp.id}`}
                      className="font-titular font-bold text-verde-profundo hover:text-sauce text-base leading-tight block"
                    >
                      {exp.nombreCompleto}
                    </Link>
                    <span className="font-mono text-[10px] text-carbon/40 block mt-0.5">
                      ID: {exp.id}
                    </span>
                  </div>
                </div>
                <div>
                  {exp.origenProspecto ? (
                    <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2 py-0.5 text-[10px] font-semibold text-cielo">
                      {ORIGEN_POR_ID[exp.origenProspecto]}
                    </span>
                  ) : (
                    <span className="text-xs text-carbon/30">—</span>
                  )}
                </div>
              </div>

              {/* Contenido principal de la tarjeta */}
              <div className="grid grid-cols-2 gap-y-3 py-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Fraccionamiento</p>
                  <p className="text-carbon/75 font-medium mt-0.5 truncate">{exp.fraccionamiento || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Negocio</p>
                  <p className="text-carbon/75 font-medium mt-0.5 truncate">{exp.tipoNegocio ? labelTipoNegocio(exp.tipoNegocio) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Teléfono</p>
                  {exp.telefono ? (
                    <a
                      href={`tel:${exp.telefono}`}
                      className="font-mono text-sauce font-semibold hover:underline block mt-0.5 text-xs"
                    >
                      {exp.telefono}
                    </a>
                  ) : (
                    <p className="text-carbon/50 mt-0.5">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Valor Estimado</p>
                  <p className="font-mono font-bold text-sauce mt-0.5">{formatoPesos(exp.valorEstimado)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Saldo Deuda</p>
                  <p className="font-mono font-medium text-carbon/70 mt-0.5">{formatoPesos(exp.saldoDeuda)}</p>
                </div>
              </div>

              {/* Footer de la tarjeta: Selector de Etapa + Último Movimiento */}
              <div className="flex items-center justify-between border-t border-carbon/5 pt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-wider text-carbon/40 font-semibold">Etapa</span>
                  <select
                    value={exp.etapa}
                    onChange={(e) => moverEtapa(exp.id, e.target.value as EtapaId)}
                    className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none transition hover:border-sauce focus:border-sauce"
                    aria-label={`Cambiar etapa de ${exp.nombreCompleto}`}
                  >
                    {ETAPAS.map((etapa) => (
                      <option key={etapa.id} value={etapa.id}>
                        {etapa.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider text-carbon/40 font-semibold block">Último Movimiento</span>
                  <span className="text-xs text-carbon/60 font-semibold mt-1 block">{formatoFecha(exp.ultimoMovimiento)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
