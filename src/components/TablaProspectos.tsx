"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ORIGENES, ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import type { OrigenAdquisicion, Prospecto } from "@/lib/types";
import {
  cambiarOrigenMasivo,
  eliminarProspectosMasivo,
} from "@/app/actions/prospectos";
import { useOrden } from "@/hooks/useOrden";
import { listarSecuencias, enrolarLead } from "@/app/actions/secuencias";
import { ThOrden } from "./ThOrden";

const COMPARADORES: Record<string, (a: Prospecto, b: Prospecto) => number> = {
  nombre: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
  telefono: (a, b) => a.telefono.localeCompare(b.telefono, "es"),
  ciudad: (a, b) => a.ciudad.localeCompare(b.ciudad, "es"),
  origen: (a, b) =>
    ORIGEN_POR_ID[a.origen].localeCompare(ORIGEN_POR_ID[b.origen], "es"),
  valorCampana: (a, b) => a.valorCampana - b.valorCampana,
};

/** Tabla de prospectos con columnas ordenables y selección múltiple. */
export function TablaProspectos({ prospectos }: { prospectos: Prospecto[] }) {
  const router = useRouter();
  const orden = useOrden(prospectos, COMPARADORES);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [secuencias, setSecuencias] = useState<any[]>([]);

  useEffect(() => {
    listarSecuencias()
      .then((lista) => setSecuencias(lista.filter((s) => s.status === "activa")))
      .catch((err) => console.error("Error al cargar secuencias en tabla:", err));
  }, []);

  async function enrolarSeleccionEnSecuencia(sequenceId: string) {
    setTrabajando(true);
    try {
      const seleccionados = orden.ordenados.filter((p) => sel.has(p.id));
      for (const p of seleccionados) {
        await enrolarLead({
          sequenceId,
          phone: p.telefono,
          nombre: p.nombreCompleto,
          email: p.correo || undefined,
          prospectoId: p.id,
        }).catch((err) => console.warn(`No se pudo enrolar a ${p.nombreCompleto}:`, err.message));
      }
      setSel(new Set());
      alert("Enrolamiento masivo completado.");
      router.refresh();
    } finally {
      setTrabajando(false);
    }
  }

  const idsVisibles = orden.ordenados.map((p) => p.id);

  // Limpia de la selección los ids que ya no estén en la lista.
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

  async function cambiarOrigenSeleccion(origen: OrigenAdquisicion) {
    setTrabajando(true);
    try {
      await cambiarOrigenMasivo(ids, origen);
      setSel(new Set());
      router.refresh();
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminarSeleccion() {
    setTrabajando(true);
    try {
      await eliminarProspectosMasivo(ids);
      setSel(new Set());
      setConfirmarBorrado(false);
      router.refresh();
    } finally {
      setTrabajando(false);
    }
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
            Cambiar origen:
            <select
              defaultValue=""
              disabled={trabajando}
              onChange={(e) => {
                if (e.target.value) {
                  void cambiarOrigenSeleccion(e.target.value as OrigenAdquisicion);
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="">— elige origen —</option>
              {ORIGENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>

          {secuencias.length > 0 && (
            <label className="flex items-center gap-1.5 text-carbon/70">
              Enrolar en secuencia:
              <select
                defaultValue=""
                disabled={trabajando}
                onChange={(e) => {
                  if (e.target.value) {
                    void enrolarSeleccionEnSecuencia(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— elige secuencia —</option>
                {secuencias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {confirmarBorrado ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-carbon/70">¿Eliminar {ids.length}?</span>
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
        <table className="w-full min-w-[800px] border-collapse text-sm">
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
                ["nombre", "Prospecto", "izquierda"],
                ["telefono", "Teléfono", "izquierda"],
                ["ciudad", "Ciudad", "izquierda"],
                ["origen", "Origen", "izquierda"],
                ["valorCampana", "Valor campaña", "derecha"],
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
          {orden.ordenados.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-carbon/5 transition hover:bg-crema/40 ${
                sel.has(p.id) ? "bg-sauce/5" : ""
              }`}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={sel.has(p.id)}
                  onChange={() => alternar(p.id)}
                  aria-label={`Seleccionar ${p.nombreCompleto}`}
                  className="cursor-pointer"
                />
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/prospectos/${p.id}`}
                  className="font-titular font-medium text-verde-profundo hover:text-sauce"
                >
                  {p.nombreCompleto}
                </Link>
                <span className="ml-2 font-mono text-[10px] text-carbon/40">
                  {p.id}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-carbon/70">
                {p.telefono || "—"}
              </td>
              <td className="px-3 py-2.5 text-carbon/70">{p.ciudad || "—"}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-xs text-cielo">
                  {ORIGEN_POR_ID[p.origen]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-carbon/70">
                {formatoPesos(p.valorCampana)}
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
          {orden.ordenados.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border transition-all p-4 shadow-sm ${
                sel.has(p.id)
                  ? "bg-sauce/5 border-sauce/40 shadow"
                  : "bg-white border-carbon/10 hover:border-sauce/40"
              }`}
            >
              {/* Encabezado: Checkbox + Nombre & ID + Chip Origen */}
              <div className="flex items-start justify-between gap-3 border-b border-carbon/5 pb-3">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={sel.has(p.id)}
                    onChange={() => alternar(p.id)}
                    aria-label={`Seleccionar ${p.nombreCompleto}`}
                    className="cursor-pointer mt-1 h-4 w-4 rounded border-carbon/25 text-sauce focus:ring-sauce/30"
                  />
                  <div>
                    <Link
                      href={`/prospectos/${p.id}`}
                      className="font-titular font-bold text-verde-profundo hover:text-sauce text-base leading-tight block"
                    >
                      {p.nombreCompleto}
                    </Link>
                    <span className="font-mono text-[10px] text-carbon/40 block mt-0.5">
                      ID: {p.id}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-[10px] font-semibold text-cielo">
                    {ORIGEN_POR_ID[p.origen]}
                  </span>
                </div>
              </div>

              {/* Contenido principal de la tarjeta */}
              <div className="grid grid-cols-2 gap-y-3 pt-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Teléfono</p>
                  {p.telefono ? (
                    <a
                      href={`tel:${p.telefono}`}
                      className="font-mono text-sauce font-semibold hover:underline block mt-0.5 text-xs"
                    >
                      {p.telefono}
                    </a>
                  ) : (
                    <p className="text-carbon/50 mt-0.5">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Ciudad</p>
                  <p className="text-carbon/75 font-medium mt-0.5 truncate">{p.ciudad || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Valor Campaña</p>
                  <p className="font-mono font-bold text-carbon/70 mt-0.5">{formatoPesos(p.valorCampana)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
