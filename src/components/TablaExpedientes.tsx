"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useExpedientes } from "@/context/expedientes-context";
import { TODAS_LAS_ETAPAS, TODAS_LAS_ETAPAS_POR_ID, obtenerEtapasPorNegocio } from "@/lib/etapas";
import { ORIGEN_POR_ID, ORIGENES } from "@/lib/origenes";
import { type EtapaId, type Expediente, type OrigenAdquisicion, type CalificacionProspecto, labelTipoNegocio } from "@/lib/types";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { useOrden } from "@/hooks/useOrden";
import { ThOrden } from "./ThOrden";
import { listarSecuencias, enrolarLead } from "@/app/actions/secuencias";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import { BotonLlamar } from "./BotonLlamar";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";

/** Comparadores por columna (estables a nivel de módulo). */
const COMPARADORES: Record<string, (a: Expediente, b: Expediente) => number> = {
  cliente: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
  fecha: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  fraccionamiento: (a, b) =>
    a.fraccionamiento.localeCompare(b.fraccionamiento, "es"),
  tipoNegocio: (a, b) =>
    (a.tipoNegocio ?? "").localeCompare(b.tipoNegocio ?? "", "es"),
  origen: (a, b) =>
    (a.origenProspecto ?? "").localeCompare(b.origenProspecto ?? "", "es"),
  telefono: (a, b) => a.telefono.localeCompare(b.telefono, "es"),
  etapa: (a, b) =>
    (TODAS_LAS_ETAPAS_POR_ID[a.etapa]?.orden ?? 99) -
    (TODAS_LAS_ETAPAS_POR_ID[b.etapa]?.orden ?? 99),
  valorEstimado: (a, b) => a.valorEstimado - b.valorEstimado,
  saldoDeuda: (a, b) => a.saldoDeuda - b.saldoDeuda,
  ultimoMovimiento: (a, b) =>
    a.ultimoMovimiento.localeCompare(b.ultimoMovimiento),
  asesor: (a, b) => (a.asesorNombre ?? "").localeCompare(b.asesorNombre ?? "", "es"),
  secuenciaNombre: (a, b) =>
    (a.secuenciaNombre ?? "").localeCompare(b.secuenciaNombre ?? "", "es"),
  ultimaActividadFecha: (a, b) =>
    (a.ultimaActividadFecha ?? "").localeCompare(b.ultimaActividadFecha ?? ""),
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
  const {
    moverEtapa,
    moverEtapaMasivo,
    asignarAsesorMasivo,
    asignarOperadorMasivo,
    cambiarOrigenMasivo,
    cambiarCalificacionMasivo,
    eliminarMasivo,
  } = useExpedientes();
  const orden = useOrden(expedientes, COMPARADORES, "fecha", "desc");

  // Selección múltiple (por id). Se limpia cuando cambia el set de filas.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [secuencias, setSecuencias] = useState<any[]>([]);
  const [perfiles, setPerfiles] = useState<{ id: string; nombre: string; rol: string }[]>([]);

  useEffect(() => {
    listarSecuencias()
      .then((lista) => setSecuencias(lista.filter((s) => s.status === "activa")))
      .catch(() => {});
    listarPerfilesActivos()
      .then(setPerfiles)
      .catch((err) => console.error("Error al cargar perfiles:", err));
  }, []);

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

  async function asignarAsesorSeleccion(asesorId: string | null, nombre?: string | null) {
    setTrabajando(true);
    try {
      await asignarAsesorMasivo(ids, asesorId, nombre);
      setSel(new Set());
    } finally {
      setTrabajando(false);
    }
  }

  async function asignarOperadorSeleccion(operadorId: string | null, nombre?: string | null) {
    setTrabajando(true);
    try {
      await asignarOperadorMasivo(ids, operadorId, nombre);
      setSel(new Set());
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarOrigenSeleccion(origen: OrigenAdquisicion) {
    setTrabajando(true);
    try {
      await cambiarOrigenMasivo(ids, origen);
      setSel(new Set());
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarCalificacionSeleccion(calificacion: CalificacionProspecto) {
    setTrabajando(true);
    try {
      await cambiarCalificacionMasivo(ids, calificacion);
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

  async function enrolarSeleccionEnSecuencia(sequenceId: string) {
    setTrabajando(true);
    try {
      const seleccionados = orden.ordenados.filter((e) => sel.has(e.id));
      for (const e of seleccionados) {
        await enrolarLead({
          sequenceId,
          phone: e.telefono,
          nombre: e.nombreCompleto,
          expedienteId: e.id,
        }).catch((err) => console.warn(`No se pudo enrolar ${e.nombreCompleto}:`, err.message));
      }
      setSel(new Set());
      alert("Enrolamiento completado.");
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

          {/* Cambiar etapa */}
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
              {TODAS_LAS_ETAPAS.map((etapa) => (
                <option key={etapa.id} value={etapa.id}>
                  {etapa.nombre}
                </option>
              ))}
            </select>
          </label>

          {/* Asignar Asesor */}
          <label className="flex items-center gap-1.5 text-carbon/70">
            Asesor:
            <select
              defaultValue=""
              disabled={trabajando}
              onChange={(e) => {
                if (e.target.value) {
                  const val = e.target.value === "desasignar" ? null : e.target.value;
                  const perfil = perfiles.find((p) => p.id === val);
                  void asignarAsesorSeleccion(val, perfil?.nombre ?? null);
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="">— asesor —</option>
              <option value="desasignar">Sin asignar / Quitar</option>
              {perfiles
                .filter((p) => p.rol === "asesor" || p.rol === "admin")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          </label>

          {/* Asignar Operador */}
          <label className="flex items-center gap-1.5 text-carbon/70">
            Operador:
            <select
              defaultValue=""
              disabled={trabajando}
              onChange={(e) => {
                if (e.target.value) {
                  const val = e.target.value === "desasignar" ? null : e.target.value;
                  const perfil = perfiles.find((p) => p.id === val);
                  void asignarOperadorSeleccion(val, perfil?.nombre ?? null);
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="">— operador —</option>
              <option value="desasignar">Sin asignar / Quitar</option>
              {perfiles
                .filter((p) => p.rol === "operaciones")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          </label>

          {/* Cambiar Calificación */}
          <label className="flex items-center gap-1.5 text-carbon/70">
            Calificación:
            <select
              defaultValue=""
              disabled={trabajando}
              onChange={(e) => {
                if (e.target.value) {
                  void cambiarCalificacionSeleccion(e.target.value as CalificacionProspecto);
                  e.target.value = "";
                }
              }}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="">— calif —</option>
              <option value="caliente">Caliente 🔥</option>
              <option value="templado">Templado ⚡</option>
              <option value="frio">Frío ❄️</option>
              <option value="descalificado">Descalificado ❌</option>
            </select>
          </label>

          {/* Cambiar Origen */}
          <label className="flex items-center gap-1.5 text-carbon/70">
            Origen:
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
              <option value="">— origen —</option>
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

      <div className="hidden md:block max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
        <table className="w-full min-w-[1300px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
            <tr className="border-b border-carbon/10 bg-crema/90 text-left">
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
                ["fecha", "Registro", "izquierda"],
                ["cliente", "Expediente", "izquierda"],
                ["asesor", "Asesor", "izquierda"],
                ["fraccionamiento", "Fraccionamiento", "izquierda"],
                ["tipoNegocio", "Negocio", "izquierda"],
                ["origen", "Origen", "izquierda"],
                ["telefono", "Teléfono", "izquierda"],
                ["etapa", "Etapa", "izquierda"],
                ["valorEstimado", "Valor estimado", "derecha"],
                ["saldoDeuda", "Saldo deuda", "derecha"],
                ["secuenciaNombre", "Secuencia", "izquierda"],
                ["ultimaActividadFecha", "Última Acción", "izquierda"],
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
              <td className="px-3 py-2.5 align-top">
                <input
                  type="checkbox"
                  checked={sel.has(exp.id)}
                  onChange={() => alternar(exp.id)}
                  aria-label={`Seleccionar ${exp.nombreCompleto}`}
                  className="cursor-pointer"
                />
              </td>
              <td className="px-3 py-2.5 align-top text-xs text-carbon/70 whitespace-nowrap">
                {exp.createdAt ? new Date(exp.createdAt).toLocaleDateString("es-MX") : "—"}
              </td>
              <td className="px-3 py-2.5 align-top">
                <Link
                  href={`/expediente/${exp.id}`}
                  className="font-titular font-medium text-verde-profundo hover:text-sauce block font-semibold"
                >
                  {exp.nombreCompleto}
                </Link>
                <div className="flex flex-col gap-1 mt-1 text-[10px]">
                  <span className="font-mono text-carbon/40 font-semibold bg-carbon/5 px-1.5 py-0.5 rounded w-max">
                    {exp.id}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-top text-carbon/70">
                {exp.asesorNombre || (
                  <span className="text-xs text-carbon/30 italic">Sin asignar</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top text-carbon/70 font-medium">
                {exp.fraccionamiento}
              </td>

              <td className="px-3 py-2.5 align-top text-carbon/70">
                {exp.tipoNegocio ? labelTipoNegocio(exp.tipoNegocio) : "—"}
              </td>

              <td className="px-3 py-2.5 align-top">
                {exp.origenProspecto ? (
                  <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2 py-0.5 text-xs text-cielo">
                    {ORIGEN_POR_ID[exp.origenProspecto]}
                  </span>
                ) : (
                  <span className="text-xs text-carbon/30">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top font-mono text-xs text-carbon/70">
                {exp.telefono || "—"}
              </td>

              <td className="px-3 py-2.5 align-top">
                {(() => {
                  const opciones = obtenerEtapasPorNegocio(exp.tipoNegocio);
                  const listaEtapas = opciones.some((o) => o.id === exp.etapa) ? opciones : TODAS_LAS_ETAPAS;
                  return (
                    <select
                      value={exp.etapa}
                      onChange={(e) => moverEtapa(exp.id, e.target.value as EtapaId)}
                      className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none transition hover:border-sauce focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                      aria-label={`Cambiar etapa de ${exp.nombreCompleto}`}
                    >
                      {listaEtapas.map((etapa) => (
                        <option key={etapa.id} value={etapa.id}>
                          {etapa.nombre}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </td>

              <td className="px-3 py-2.5 align-top text-right font-mono text-sauce">
                {formatoPesos(exp.valorEstimado)}
              </td>

              <td className="px-3 py-2.5 align-top text-right font-mono text-carbon/70">
                {formatoPesos(exp.saldoDeuda)}
              </td>

              <td className="px-3 py-2.5 align-top text-xs">
                {exp.secuenciaNombre ? (
                  <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-2.5 py-0.5 text-xs font-semibold text-sauce whitespace-nowrap">
                    {exp.secuenciaNombre}
                  </span>
                ) : (
                  <span className="text-carbon/35 italic">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top text-xs">
                {exp.ultimaActividadTitulo ? (
                  <div className="flex flex-col gap-0.5 max-w-[220px]">
                    <span className="font-semibold text-carbon leading-tight" title={exp.ultimaActividadTitulo}>
                      {exp.ultimaActividadTitulo}
                    </span>
                    {exp.ultimaActividadFecha && (
                      <span className="text-[10px] text-carbon/40 font-mono mt-0.5 whitespace-nowrap">
                        {new Date(exp.ultimaActividadFecha).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-carbon/35 italic">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top text-xs text-carbon/50">
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
                    <div className="flex flex-col gap-0.5 mt-0.5 text-[10px] text-carbon/40 font-mono">
                      <span>ID: {exp.id}</span>
                      {exp.createdAt && (
                        <span>
                          Creado: {new Date(exp.createdAt).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <CalificacionProspectoBadge calificacion={exp.calificacion || "frio"} />
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
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Asesor</p>
                  <p className="text-carbon/75 font-medium mt-0.5 truncate">{exp.asesorNombre || "Sin asignar"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Teléfono</p>
                  {exp.telefono ? (
                    <div className="flex flex-col gap-1 mt-0.5">
                      <a
                        href={`tel:${exp.telefono}`}
                        className="font-mono text-sauce font-semibold hover:underline block text-xs"
                      >
                        {exp.telefono}
                      </a>
                      <BotonLlamar telefono={exp.telefono} prospectoId={exp.prospectoId} />
                    </div>
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
                <div className="col-span-2 border-t border-carbon/5 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Secuencia Activa</p>
                  {exp.secuenciaNombre ? (
                    <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-2.5 py-0.5 text-xs font-semibold text-sauce mt-1">
                      {exp.secuenciaNombre}
                    </span>
                  ) : (
                    <p className="text-carbon/40 italic mt-0.5 text-xs">Ninguna</p>
                  )}
                </div>
                <div className="col-span-2 border-t border-carbon/5 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">Última Acción</p>
                  {exp.ultimaActividadTitulo ? (
                    <div className="mt-1">
                      <p className="text-carbon/75 font-semibold text-xs leading-tight">{exp.ultimaActividadTitulo}</p>
                      {exp.ultimaActividadFecha && (
                        <p className="text-[10px] text-carbon/40 font-mono mt-0.5">
                          {new Date(exp.ultimaActividadFecha).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false
                          })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-carbon/40 italic mt-0.5 text-xs">Sin acciones registradas</p>
                  )}
                </div>
              </div>

              {/* Footer de la tarjeta: Selector de Etapa + Último Movimiento */}
              <div className="flex items-center justify-between border-t border-carbon/5 pt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-wider text-carbon/40 font-semibold">Etapa</span>
                  {(() => {
                    const opciones = obtenerEtapasPorNegocio(exp.tipoNegocio);
                    const listaEtapas = opciones.some((o) => o.id === exp.etapa) ? opciones : TODAS_LAS_ETAPAS;
                    return (
                      <select
                        value={exp.etapa}
                        onChange={(e) => moverEtapa(exp.id, e.target.value as EtapaId)}
                        className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none transition hover:border-sauce focus:border-sauce"
                        aria-label={`Cambiar etapa de ${exp.nombreCompleto}`}
                      >
                        {listaEtapas.map((etapa) => (
                          <option key={etapa.id} value={etapa.id}>
                            {etapa.nombre}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
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
