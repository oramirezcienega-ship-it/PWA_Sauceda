"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ORIGENES, ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import type { OrigenAdquisicion, Prospecto, EstatusProspecto, CalificacionProspecto } from "@/lib/types";
import {
  cambiarOrigenMasivo,
  eliminarProspectosMasivo,
  cambiarEstatusMasivo,
  cambiarCalificacionMasivo,
  asignarAsesorMasivo,
  asignarOperadorMasivo,
  actualizarCampoMasivo,
} from "@/app/actions/prospectos";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import { useOrden } from "@/hooks/useOrden";
import {
  listarSecuencias,
  enrolarLead,
  listarEnrollments,
  cambiarEstadoEnrollment,
} from "@/app/actions/secuencias";
import { ThOrden } from "./ThOrden";
import { EstatusProspectoBadge } from "./EstatusProspectoBadge";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import { ESTATUS_PROSPECTO_LISTA } from "@/lib/estatus";

const COMPARADORES: Record<string, (a: Prospecto, b: Prospecto) => number> = {
  nombre: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
  fecha: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  telefono: (a, b) => a.telefono.localeCompare(b.telefono, "es"),
  ciudad: (a, b) => a.ciudad.localeCompare(b.ciudad, "es"),
  origen: (a, b) =>
    ORIGEN_POR_ID[a.origen].localeCompare(ORIGEN_POR_ID[b.origen], "es"),
  valorCampana: (a, b) => a.valorCampana - b.valorCampana,
  estatus: (a, b) => a.estatus.localeCompare(b.estatus, "es"),
  calificacion: (a, b) => a.calificacion.localeCompare(b.calificacion, "es"),
  asesor: (a, b) => (a.asesorNombre ?? "").localeCompare(b.asesorNombre ?? "", "es"),
};

/** Tabla de prospectos con columnas ordenables, filtros por etapa y acciones masivas completas. */
export function TablaProspectos({ prospectos }: { prospectos: Prospecto[] }) {
  const router = useRouter();

  // Estados de filtrado
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<string>("todos");
  const [filtroCalificacion, setFiltroCalificacion] = useState<string>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<string>("todos");
  const [filtroAsesor, setFiltroAsesor] = useState<string>("todos");

  // Estado para modal de cambio masivo de campos (ej. ciudad o notas)
  const [modalCampoMasivo, setModalCampoMasivo] = useState<"ciudad" | "notas" | null>(null);
  const [valCampoMasivo, setValCampoMasivo] = useState("");

  // Aplicar filtros a los prospectos
  const prospectosFiltrados = useMemo(() => {
    return prospectos.filter((p) => {
      // 1. Buscador texto
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincideTexto =
          p.nombreCompleto.toLowerCase().includes(q) ||
          p.telefono.toLowerCase().includes(q) ||
          p.ciudad.toLowerCase().includes(q) ||
          p.correo.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.notas.toLowerCase().includes(q);
        if (!coincideTexto) return false;
      }
      // 2. Filtro Estatus / Etapa del Prospecto
      if (filtroEstatus !== "todos") {
        if (filtroEstatus === "lead" && !(p.estatus === "lead" || p.estatus === "nuevo")) return false;
        if (filtroEstatus === "mql" && !(p.estatus === "mql" || p.estatus === "en_conversacion")) return false;
        if (filtroEstatus === "sql" && !(p.estatus === "sql" || p.estatus === "expediente_abierto")) return false;
        if (
          filtroEstatus !== "lead" &&
          filtroEstatus !== "mql" &&
          filtroEstatus !== "sql" &&
          p.estatus !== filtroEstatus
        ) {
          return false;
        }
      }
      // 3. Filtro Calificación
      if (filtroCalificacion !== "todos" && p.calificacion !== filtroCalificacion) return false;
      // 4. Filtro Origen
      if (filtroOrigen !== "todos" && p.origen !== filtroOrigen) return false;
      // 5. Filtro Asesor
      if (filtroAsesor !== "todos") {
        if (filtroAsesor === "sin_asignar" && p.asesorId) return false;
        if (filtroAsesor !== "sin_asignar" && p.asesorId !== filtroAsesor) return false;
      }
      return true;
    });
  }, [prospectos, busqueda, filtroEstatus, filtroCalificacion, filtroOrigen, filtroAsesor]);

  const orden = useOrden(prospectosFiltrados, COMPARADORES, "fecha", "desc");

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [secuencias, setSecuencias] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [perfiles, setPerfiles] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  useEffect(() => {
    listarSecuencias()
      .then((lista) => setSecuencias(lista.filter((s) => s.status === "activa")))
      .catch((err) => console.error("Error al cargar secuencias en tabla:", err));

    listarEnrollments()
      .then((lista) => setEnrollments(lista.filter((e) => e.status === "activo")))
      .catch((err) => console.error("Error al cargar enrolamientos en tabla:", err));

    listarPerfilesActivos()
      .then(setPerfiles)
      .catch((err) => console.error("Error al cargar perfiles en tabla:", err));
  }, []);

  async function enrolarSeleccionEnSecuencia(sequenceId: string) {
    setErrorAccion(null);
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
          forzarCambio: true,
        }).catch((err) => console.warn(`No se pudo enrolar a ${p.nombreCompleto}:`, err.message));
      }
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al enrolar en secuencia");
    } finally {
      setTrabajando(false);
    }
  }

  async function detenerSecuenciaSeleccion() {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      const seleccionados = orden.ordenados.filter((p) => sel.has(p.id));
      for (const p of seleccionados) {
        const enrollment = enrollments.find(
          (en) => en.prospecto_id === p.id || en.phone === p.telefono,
        );
        if (enrollment) {
          await cambiarEstadoEnrollment(enrollment.id, "salido").catch((err) =>
            console.warn(`No se pudo detener secuencia de ${p.nombreCompleto}:`, err.message),
          );
        }
      }
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al detener secuencia");
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

  const algunoConSecuencia = ids.some((id) => {
    const p = orden.ordenados.find((pr) => pr.id === id);
    return p && enrollments.some(
      (en) => en.prospecto_id === p.id || en.phone === p.telefono,
    );
  });

  async function cambiarOrigenSeleccion(origen: OrigenAdquisicion) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await cambiarOrigenMasivo(ids, origen);
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al cambiar origen");
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarEstatusSeleccion(estatus: EstatusProspecto) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await cambiarEstatusMasivo(ids, estatus);
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al cambiar estatus");
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarCalificacionSeleccion(calificacion: CalificacionProspecto) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await cambiarCalificacionMasivo(ids, calificacion);
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al cambiar calificación");
    } finally {
      setTrabajando(false);
    }
  }

  async function asignarAsesorSeleccion(asesorId: string | null) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await asignarAsesorMasivo(ids, asesorId);
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al asignar asesor");
    } finally {
      setTrabajando(false);
    }
  }

  async function asignarOperadorSeleccion(operadorId: string | null) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await asignarOperadorMasivo(ids, operadorId);
      setSel(new Set());
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al asignar operador");
    } finally {
      setTrabajando(false);
    }
  }

  async function aplicarCambioCampoMasivo(campo: string, valor: any) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await actualizarCampoMasivo(ids, campo, valor);
      setSel(new Set());
      setModalCampoMasivo(null);
      setValCampoMasivo("");
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al aplicar cambio masivo");
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminarSeleccion() {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await eliminarProspectosMasivo(ids);
      setSel(new Set());
      setConfirmarBorrado(false);
      router.refresh();
    } catch (err: any) {
      setErrorAccion(err.message || "Error al eliminar prospectos");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 🔍 BARRA DE BÚSQUEDA Y FILTROS POR ETAPA */}
      <div className="rounded-xl border border-carbon/10 bg-white p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Input de Buscador */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, teléfono, ciudad, notas..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-carbon/15 bg-crema/30 px-3 py-1.5 text-xs text-carbon placeholder:text-carbon/40 outline-none focus:border-sauce focus:bg-white transition"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-carbon/40 hover:text-carbon"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro Calificación */}
          <select
            value={filtroCalificacion}
            onChange={(e) => setFiltroCalificacion(e.target.value)}
            className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
          >
            <option value="todos">Todas las Calificaciones</option>
            <option value="caliente">🔥 Caliente (Alta prioridad)</option>
            <option value="templado">⚡ Templado (Media prioridad)</option>
            <option value="frio">❄️ Frío (Baja prioridad)</option>
            <option value="descalificado">❌ Descalificado</option>
          </select>

          {/* Filtro Origen */}
          <select
            value={filtroOrigen}
            onChange={(e) => setFiltroOrigen(e.target.value)}
            className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
          >
            <option value="todos">Todos los Orígenes</option>
            {ORIGENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>

          {/* Filtro Asesor */}
          <select
            value={filtroAsesor}
            onChange={(e) => setFiltroAsesor(e.target.value)}
            className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
          >
            <option value="todos">Todos los Asesores</option>
            <option value="sin_asignar">Sin Asesor Asignado</option>
            {perfiles
              .filter((p) => p.rol === "asesor")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>

          {(busqueda || filtroEstatus !== "todos" || filtroCalificacion !== "todos" || filtroOrigen !== "todos" || filtroAsesor !== "todos") && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                setFiltroEstatus("todos");
                setFiltroCalificacion("todos");
                setFiltroOrigen("todos");
                setFiltroAsesor("todos");
              }}
              className="text-xs font-medium text-rojo hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Píldoras de Etapa del Prospecto (`estatus`) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-carbon/5 text-xs">
          <span className="font-semibold text-carbon/60 mr-1">Etapa del Prospecto:</span>
          <button
            type="button"
            onClick={() => setFiltroEstatus("todos")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              filtroEstatus === "todos"
                ? "bg-verde-profundo text-crema shadow-xs"
                : "bg-carbon/5 text-carbon/70 hover:bg-carbon/10"
            }`}
          >
            Todos ({prospectos.length})
          </button>
          {ESTATUS_PROSPECTO_LISTA.map((es) => {
            const cantidad = prospectos.filter((p) => {
              if (es.id === "lead") return p.estatus === "lead" || p.estatus === "nuevo";
              if (es.id === "mql") return p.estatus === "mql" || p.estatus === "en_conversacion";
              if (es.id === "sql") return p.estatus === "sql" || p.estatus === "expediente_abierto";
              return p.estatus === es.id;
            }).length;

            const activo = filtroEstatus === es.id;
            return (
              <button
                key={es.id}
                type="button"
                onClick={() => setFiltroEstatus(es.id)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  activo
                    ? "bg-sauce text-white shadow-xs font-semibold"
                    : "bg-carbon/5 text-carbon/70 hover:bg-carbon/10"
                }`}
              >
                {es.nombre.split(" ")[0]} ({cantidad})
              </button>
            );
          })}
        </div>
      </div>

      {/* ⚡ BARRA DE ACCIONES MASIVAS */}
      {ids.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sauce/30 bg-sauce/5 px-3 py-2 text-sm shadow-xs">
            <span className="font-semibold text-verde-profundo">
              {ids.length} seleccionado{ids.length === 1 ? "" : "s"}
            </span>

            {/* Cambiar Estatus */}
            <label className="flex items-center gap-1.5 text-carbon/70">
              Estatus / Etapa:
              <select
                defaultValue=""
                disabled={trabajando}
                onChange={(e) => {
                  if (e.target.value) {
                    void cambiarEstatusSeleccion(e.target.value as EstatusProspecto);
                    e.target.value = "";
                  }
                }}
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— cambiar estatus —</option>
                {ESTATUS_PROSPECTO_LISTA.map((es) => (
                  <option key={es.id} value={es.id}>
                    {es.nombre}
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
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— calificación —</option>
                <option value="caliente">🔥 Caliente</option>
                <option value="templado">⚡ Templado</option>
                <option value="frio">❄️ Frío</option>
                <option value="descalificado">❌ Descalificado</option>
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
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— origen —</option>
                {ORIGENES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
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
                    void asignarAsesorSeleccion(val);
                    e.target.value = "";
                  }
                }}
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— asesor —</option>
                <option value="desasignar">Sin asignar / Quitar</option>
                {perfiles
                  .filter((p) => p.rol === "asesor")
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
                    void asignarOperadorSeleccion(val);
                    e.target.value = "";
                  }
                }}
                className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="">— operador —</option>
                <option value="desasignar">Sin asignar / Quitar</option>
                {perfiles
                  .filter((p) => p.rol === "operaciones" || p.rol === "admin")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol === "admin" ? "Admin" : "Operador"})
                    </option>
                  ))}
              </select>
            </label>

            {/* Editar Campo Arbitrario (Ciudad / Notas) */}
            <button
              type="button"
              disabled={trabajando}
              onClick={() => {
                setModalCampoMasivo("ciudad");
                setValCampoMasivo("");
              }}
              className="rounded-md border border-carbon/15 bg-white px-2.5 py-1 text-xs font-medium text-verde-profundo hover:border-sauce"
            >
              🏙️ Editar Ciudad
            </button>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => {
                setModalCampoMasivo("notas");
                setValCampoMasivo("");
              }}
              className="rounded-md border border-carbon/15 bg-white px-2.5 py-1 text-xs font-medium text-verde-profundo hover:border-sauce"
            >
              📝 Editar Notas
            </button>

            {secuencias.length > 0 && (
              <label className="flex items-center gap-1.5 text-carbon/70">
                Secuencia:
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
                  <option value="">— secuencia —</option>
                  {secuencias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {algunoConSecuencia && (
              <button
                type="button"
                disabled={trabajando}
                onClick={detenerSecuenciaSeleccion}
                className="rounded-md border border-amber-400/40 bg-white px-3 py-1 text-xs text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
              >
                Detener secuencia
              </button>
            )}

            {confirmarBorrado ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-carbon/70 font-medium">¿Eliminar {ids.length}?</span>
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
                className="rounded-md border border-rojo/30 bg-white px-3 py-1 text-xs font-medium text-rojo transition hover:bg-rojo/10 disabled:opacity-60"
              >
                Eliminar
              </button>
            )}

            <button
              type="button"
              onClick={() => setSel(new Set())}
              className="ml-auto text-xs font-medium text-carbon/50 underline hover:text-carbon"
            >
              limpiar selección
            </button>
          </div>

          {errorAccion && (
            <div className="rounded-lg border border-rojo/30 bg-rojo/10 px-3 py-2 text-xs text-rojo flex items-center justify-between">
              <span>{errorAccion}</span>
              <button
                onClick={() => setErrorAccion(null)}
                className="font-bold underline hover:opacity-85 text-rojo/80"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* 📌 TABLA PRINCIPAL DE PROSPECTOS */}
      <div className="hidden md:block max-h-[calc(100vh-250px)] overflow-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil shadow-xs">
        <table className="w-full min-w-[950px] border-collapse text-sm">
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
                  ["nombre", "Prospecto", "izquierda"],
                  ["asesor", "Asesor", "izquierda"],
                  ["telefono", "Teléfono", "izquierda"],
                  ["ciudad", "Ciudad", "izquierda"],
                  ["origen", "Origen", "izquierda"],
                  ["estatus", "Etapa / Estatus", "izquierda"],
                  ["calificacion", "Calificación", "izquierda"],
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
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-carbon/70 text-left">
                Secuencia
              </th>
              <ThOrden
                columna="valorCampana"
                claveActiva={orden.clave}
                dir={orden.dir}
                onOrdenar={orden.ordenarPor}
                alineado="derecha"
              >
                Valor campaña
              </ThOrden>
            </tr>
          </thead>
          <tbody>
            {orden.ordenados.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm text-carbon/40">
                  No se encontraron prospectos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              orden.ordenados.map((p) => (
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
                  <td className="px-3 py-2.5 text-xs text-carbon/70 whitespace-nowrap">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-MX") : "—"}
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
                  <td className="px-3 py-2.5 text-carbon/70">
                    {p.asesorNombre || (
                      <span className="text-xs text-carbon/30 italic">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-carbon/70">
                    {p.telefono || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-carbon/70">
                    {p.ciudad || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="inline-flex items-center rounded-full border border-carbon/15 bg-white px-2 py-0.5 font-medium text-carbon/80">
                      {ORIGEN_POR_ID[p.origen] || p.origen}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <EstatusProspectoBadge estatus={p.estatus} />
                  </td>
                  <td className="px-3 py-2.5">
                    <CalificacionProspectoBadge calificacion={p.calificacion} />
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {enrollments.some(
                      (en) => en.prospecto_id === p.id || en.phone === p.telefono,
                    ) ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Secuencia activa
                      </span>
                    ) : (
                      <span className="text-carbon/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-carbon/70">
                    {p.valorCampana ? formatoPesos(p.valorCampana) : "$0"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 📱 VISTA MÓVIL (TARJETAS) */}
      <div className="space-y-2 md:hidden">
        {orden.ordenados.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-carbon/10 bg-white p-3.5 shadow-xs space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/prospectos/${p.id}`}
                  className="font-titular font-semibold text-verde-profundo"
                >
                  {p.nombreCompleto}
                </Link>
                <div className="text-[11px] text-carbon/50 font-mono">{p.id}</div>
              </div>
              <EstatusProspectoBadge estatus={p.estatus} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-carbon/70 pt-1 border-t border-carbon/5">
              <div>📞 {p.telefono || "Sin tel"}</div>
              <div>📍 {p.ciudad || "Sin ciudad"}</div>
              <div>👤 Asesor: {p.asesorNombre || "Sin asignar"}</div>
              <div>🌱 Origen: {ORIGEN_POR_ID[p.origen] || p.origen}</div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <CalificacionProspectoBadge calificacion={p.calificacion} />
              <span className="font-mono text-xs text-carbon/60">
                {p.valorCampana ? formatoPesos(p.valorCampana) : "$0"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 🛠️ MODAL DE CAMBIO MASIVO DE CAMPO (CIUDAD / NOTAS) */}
      {modalCampoMasivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl border border-carbon/10 space-y-4">
            <h3 className="font-titular text-lg font-semibold text-verde-profundo">
              Modificar masivamente: {modalCampoMasivo === "ciudad" ? "Ciudad" : "Notas"}
            </h3>
            <p className="text-xs text-carbon/70">
              Se actualizará el campo <strong className="capitalize">{modalCampoMasivo}</strong> para los{" "}
              <strong className="text-sauce">{ids.length} prospectos</strong> seleccionados.
            </p>
            <input
              type="text"
              placeholder={modalCampoMasivo === "ciudad" ? "Ej. León, Gto." : "Escribe las notas..."}
              value={valCampoMasivo}
              onChange={(e) => setValCampoMasivo(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon focus:border-sauce outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalCampoMasivo(null);
                  setValCampoMasivo("");
                }}
                className="rounded-lg border border-carbon/15 px-3 py-1.5 text-xs text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={trabajando}
                onClick={() => void aplicarCambioCampoMasivo(modalCampoMasivo, valCampoMasivo)}
                className="rounded-lg bg-sauce px-4 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-60"
              >
                {trabajando ? "Guardando..." : "Aplicar cambio masivo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
