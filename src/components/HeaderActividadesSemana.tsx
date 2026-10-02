"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  obtenerActividadesSemana,
  type ResumenSemanaActividades,
  type ActividadSemanaItem,
  type DiaSemanaInfo,
} from "@/app/actions/actividades-semana";
import {
  obtenerCoordinacionesPendientes,
  recordarCoordinacionAsesores,
  cerrarCoordinacionPendiente,
  type CoordinacionPendienteItem,
} from "@/app/actions/coordinaciones-seguimiento";

function tiempoTranscurrido(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

type EtapaCoord = CoordinacionPendienteItem["etapa"];

const ETAPAS_COORD: { id: EtapaCoord; label: string; clase: string }[] = [
  { id: "esperando_asesores", label: "Esperando asesores", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  { id: "listo_para_cliente", label: "Listo para cliente", clase: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "esperando_cliente", label: "Esperando cliente", clase: "bg-sky-50 text-sky-800 border-sky-200" },
  { id: "sin_coincidencia", label: "Sin acuerdo", clase: "bg-rose-50 text-rose-800 border-rose-200" },
];

const MOTIVOS_CIERRE = [
  "El cliente ya no respondió",
  "El cliente ya no está interesado",
  "Se agendó por otro medio",
  "Coordinación duplicada",
  "Otro",
];

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function HeaderActividadesSemana() {
  const [datos, setDatos] = useState<ResumenSemanaActividades | null>(null);
  const [coordinaciones, setCoordinaciones] = useState<CoordinacionPendienteItem[]>([]);
  const [recordandoId, setRecordandoId] = useState<string | null>(null);
  const [avisoCoord, setAvisoCoord] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [filtroEtapaCoord, setFiltroEtapaCoord] = useState<EtapaCoord | "todas">("todas");
  const [cerrandoCoord, setCerrandoCoord] = useState<{ id: string; motivo: string } | null>(null);
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  const [cargando, setCargando] = useState(true);
  // Regla: Siempre iniciar contraída por defecto
  const [colapsada, setColapsada] = useState(true);
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "instalacion" | "inspeccion">("todas");
  // Filtro de estado: por defecto SIEMPRE solo pendientes (las completadas ocultas salvo clic explícito)
  const [filtroEstado, setFiltroEstado] = useState<"pendientes" | "completadas" | "todas">("pendientes");
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const toggleColapso = () => {
    setColapsada((prev) => !prev);
  };

  // Cargar datos de la semana
  const cargar = useCallback(async (offset: number) => {
    setCargando(true);
    try {
      const [res, coords] = await Promise.all([
        obtenerActividadesSemana(offset),
        obtenerCoordinacionesPendientes().catch(() => ({ ok: false, items: [] as CoordinacionPendienteItem[] })),
      ]);
      setDatos(res);
      setCoordinaciones(coords.items || []);
    } catch (err) {
      console.error("Error al cargar actividades de la semana en header:", err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(semanaOffset);
  }, [cargar, semanaOffset]);

  // Recarga automática cada 60 segundos y al enfocar ventana
  useEffect(() => {
    const timer = setInterval(() => {
      cargar(semanaOffset);
    }, 60000);

    const onFocus = () => {
      cargar(semanaOffset);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [cargar, semanaOffset]);

  const handleRecordar = async (id: string) => {
    setRecordandoId(id);
    setAvisoCoord(null);
    const r = await recordarCoordinacionAsesores(id);
    setRecordandoId(null);
    setAvisoCoord(
      r.ok
        ? { tipo: "ok", texto: `Recordatorio enviado (${r.recordados} mensaje${r.recordados === 1 ? "" : "s"}).` }
        : { tipo: "error", texto: r.error || "No se pudo enviar el recordatorio." }
    );
  };

  const handleCerrarCoord = async () => {
    if (!cerrandoCoord) return;
    const { id, motivo } = cerrandoCoord;
    setGuardandoCierre(true);
    const r = await cerrarCoordinacionPendiente(id, motivo);
    setGuardandoCierre(false);
    if (r.ok) {
      setCoordinaciones((prev) => prev.filter((c) => c.id !== id));
      setCerrandoCoord(null);
      setAvisoCoord({ tipo: "ok", texto: "Coordinación cerrada." });
    } else {
      setAvisoCoord({ tipo: "error", texto: r.error || "No se pudo cerrar la coordinación." });
    }
  };

  const hayCoordUrgentes = coordinaciones.some((c) => c.urgente);
  // Más antiguas primero: son las que más urge cerrar
  const coordsOrdenadas = useMemo(
    () => [...coordinaciones].sort((a, b) => new Date(a.creadaAt).getTime() - new Date(b.creadaAt).getTime()),
    [coordinaciones]
  );
  const coordsVisibles =
    filtroEtapaCoord === "todas" ? coordsOrdenadas : coordsOrdenadas.filter((c) => c.etapa === filtroEtapaCoord);

  // Conteos globales de estado para la semana
  const conteos = useMemo(() => {
    const acts = datos?.actividades || [];
    const pendientes = acts.filter((a) => a.estado !== "completada" && a.estado !== "cancelada");
    const completadas = acts.filter((a) => a.estado === "completada");

    return {
      total: acts.length,
      pendientes: pendientes.length,
      completadas: completadas.length,
    };
  }, [datos?.actividades]);

  // Actividades filtradas primero por estado (pendientes / completadas / todas)
  const actsSegunEstado = useMemo(() => {
    const acts = datos?.actividades || [];
    if (filtroEstado === "pendientes") {
      return acts.filter((a) => a.estado !== "completada" && a.estado !== "cancelada");
    }
    if (filtroEstado === "completadas") {
      return acts.filter((a) => a.estado === "completada");
    }
    return acts;
  }, [datos?.actividades, filtroEstado]);

  // Conteos de tipos según el filtro de estado activo
  const conteoTipoSegunEstado = useMemo(() => {
    const inst = actsSegunEstado.filter((a) => a.tipo === "instalacion").length;
    const insp = actsSegunEstado.filter((a) => a.tipo === "inspeccion").length;
    return {
      total: actsSegunEstado.length,
      instalaciones: inst,
      inspecciones: insp,
    };
  }, [actsSegunEstado]);

  // Filtrar actividades según selección final (estado + tipo + día)
  const actividadesFiltradas = useMemo(() => {
    return actsSegunEstado.filter((act) => {
      if (filtroTipo !== "todas" && act.tipo !== filtroTipo) return false;
      if (diaSeleccionado && act.fecha !== diaSeleccionado) return false;
      return true;
    });
  }, [actsSegunEstado, filtroTipo, diaSeleccionado]);

  // Próxima actividad pendiente para el ticker
  const proximaActividad = (datos?.actividades || []).find((a) => {
    if (!datos?.fechaHoy) return true;
    return a.fecha >= datos.fechaHoy && a.estado !== "completada" && a.estado !== "cancelada";
  }) || datos?.actividades?.[0];

  return (
    <aside
      aria-label="Barra de actividades de la semana"
      className="sticky top-14 md:top-0 z-20 border-b border-carbon/10 bg-white/95 backdrop-blur-md text-carbon shadow-2xs transition-all duration-200"
    >
      {/* ========================================================= */}
      {/* 1. MODO CONTRAÍDO (Siempre activo por defecto)            */}
      {/* ========================================================= */}
      {colapsada ? (
        <div className="flex h-10 items-center justify-between px-2 sm:px-3 text-xs bg-gradient-to-r from-white via-slate-50/60 to-white overflow-hidden">
          {/* Lado izquierdo: Título e indicadores */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 overflow-x-auto scrollbar-none py-0.5">
            <button
              type="button"
              onClick={toggleColapso}
              className="flex items-center gap-1 sm:gap-1.5 font-display font-semibold text-verde-profundo hover:text-sauce transition cursor-pointer group shrink-0"
              title="Clic para desplegar las actividades de la semana"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-verde-profundo/10 text-verde-profundo text-xs group-hover:scale-105 transition-transform">
                📅
              </span>
              <span className="font-bold tracking-tight">
                <span className="hidden sm:inline">Actividades de la Semana</span>
                <span className="sm:hidden">Actividades</span>
              </span>
            </button>

            {datos?.rangoTexto && (
              <span className="hidden xl:inline-block font-mono text-[10px] text-carbon/50 bg-carbon/5 px-1.5 py-0.5 rounded shrink-0">
                {datos.rangoTexto}
              </span>
            )}

            {/* Badges de conteo responsivos (compactos en móvil, completos en escritorio) */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <span
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 sm:px-2 py-0.5 font-mono text-[10.5px] sm:text-[11px] font-semibold text-emerald-800"
                title={`${datos?.conteoInstalaciones ?? 0} Instalaciones`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                🛠️ {datos?.conteoInstalaciones ?? 0}
                <span className="hidden md:inline">
                  {" "}{datos?.conteoInstalaciones === 1 ? "Instalación" : "Instalaciones"}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 sm:px-2 py-0.5 font-mono text-[10.5px] sm:text-[11px] font-semibold text-amber-800"
                title={`${datos?.conteoInspecciones ?? 0} Inspecciones`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                🔍 {datos?.conteoInspecciones ?? 0}
                <span className="hidden md:inline">
                  {" "}{datos?.conteoInspecciones === 1 ? "Inspección" : "Inspecciones"}
                </span>
              </span>
              {(datos?.conteoHoy ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-rojo/10 border border-rojo/30 px-1.5 sm:px-2 py-0.5 font-mono text-[10.5px] sm:text-[11px] font-bold text-rojo animate-pulse"
                  title={`${datos?.conteoHoy} actividades para hoy`}
                >
                  ⚡ {datos?.conteoHoy} <span className="hidden md:inline">Hoy</span>
                </span>
              )}
              {coordinaciones.length > 0 && (
                <button
                  type="button"
                  onClick={toggleColapso}
                  title="Coordinaciones solicitadas pendientes: da clic para ver el seguimiento"
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 sm:px-2 py-0.5 font-mono text-[10.5px] sm:text-[11px] font-bold cursor-pointer ${
                    hayCoordUrgentes
                      ? "bg-rojo/10 border-rojo/30 text-rojo animate-pulse"
                      : "bg-indigo-50 border-indigo-200 text-indigo-800"
                  }`}
                >
                  🔔 {coordinaciones.length}
                  <span className="hidden md:inline">
                    {" "}{coordinaciones.length === 1 ? "Coordinación" : "Coordinaciones"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Centro: Ticker de próxima actividad */}
          {proximaActividad ? (
            <div
              onClick={toggleColapso}
              className="hidden lg:flex items-center gap-2 max-w-lg truncate cursor-pointer rounded-lg bg-carbon/5 px-2.5 py-1 text-[11px] text-carbon/80 hover:bg-carbon/10 transition border border-carbon/5"
              title="Clic para ver detalles de la agenda"
            >
              <span className="font-semibold text-verde-profundo shrink-0">
                {proximaActividad.esHoy ? "⚡ Hoy" : proximaActividad.diaSemanaNombre} {proximaActividad.horaInicio}:
              </span>
              <span className="truncate">
                {proximaActividad.tipo === "instalacion" ? "🛠️" : "🔍"} {proximaActividad.clienteNombre}
                {proximaActividad.fraccionamiento ? ` · ${proximaActividad.fraccionamiento}` : ""}
              </span>
            </div>
          ) : (
            <div className="hidden lg:inline-block text-[11px] text-carbon/40 italic">
              Sin compromisos pendientes para esta semana
            </div>
          )}

          {/* Lado derecho: Acciones y botón desplegar */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1">
            <Link
              href="/agenda"
              className="text-[11px] font-medium text-carbon/60 hover:text-verde-profundo hover:underline hidden sm:inline px-1"
              title="Abrir módulo de agenda completo"
            >
              Agenda →
            </Link>

            <button
              type="button"
              onClick={() => cargar(semanaOffset)}
              disabled={cargando}
              title="Recargar actividades"
              className="rounded p-1 text-carbon/50 hover:bg-carbon/5 hover:text-carbon transition cursor-pointer"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cargando ? "animate-spin text-verde-profundo" : ""}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </button>

            <button
              type="button"
              onClick={toggleColapso}
              className="flex items-center gap-1 rounded-md bg-verde-profundo text-crema px-2 sm:px-2.5 py-1 text-[11px] font-semibold hover:bg-sauce transition shadow-2xs cursor-pointer"
            >
              <span className="hidden xs:inline">Desplegar</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* 2. MODO DESPLEGADO (Vista detallada temporal)             */
        /* ========================================================= */
        <div className="p-2.5 sm:p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200 max-h-[85vh] overflow-y-auto">
          {/* Fila superior: Título, rango de fechas, filtros y botón contraer */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-carbon/10 pb-2">
            {/* Título & Rango */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-verde-profundo text-crema text-xs shadow-xs">
                  📅
                </span>
                <span className="font-display text-sm font-bold text-verde-profundo tracking-tight">
                  Actividades de la Semana
                </span>
              </div>

              {/* Rango de fechas y selector de semana */}
              <div className="flex items-center gap-1 bg-carbon/5 rounded-lg p-0.5 border border-carbon/10">
                <button
                  type="button"
                  onClick={() => setSemanaOffset((prev) => prev - 1)}
                  title="Semana anterior"
                  className="rounded p-1 hover:bg-white text-carbon/70 hover:text-carbon transition text-xs"
                >
                  ◀
                </button>

                <button
                  type="button"
                  onClick={() => setSemanaOffset(0)}
                  title="Volver a la semana corriente"
                  className={`px-2 py-0.5 text-xs font-semibold rounded transition ${
                    datos?.esSemanaActual
                      ? "bg-white text-verde-profundo shadow-2xs border border-carbon/10 font-bold"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                >
                  {datos?.rangoTexto || "Semana"}
                  {datos?.esSemanaActual && (
                    <span className="ml-1 text-[10px] text-emerald-700 font-normal">
                      (Actual)
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSemanaOffset((prev) => prev + 1)}
                  title="Semana siguiente"
                  className="rounded p-1 hover:bg-white text-carbon/70 hover:text-carbon transition text-xs"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Grupo de Filtros: Filtro de Estado (Solo Pendientes / Completadas / Todas) y Filtro de Tipo */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* FILTRO DE ESTADO (Por defecto activo PENDIENTES) */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-carbon/10 text-xs">
                <button
                  type="button"
                  onClick={() => setFiltroEstado("pendientes")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroEstado === "pendientes"
                      ? "bg-verde-profundo text-crema shadow-xs font-bold"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="Mostrar solo citas y trabajos pendientes (filtro por defecto)"
                >
                  <span>⏳</span>
                  <span>Pendientes ({conteos.pendientes})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("completadas")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroEstado === "completadas"
                      ? "bg-slate-700 text-white shadow-xs font-bold"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="Mostrar actividades ya concluidas"
                >
                  <span>✅</span>
                  <span>Completadas ({conteos.completadas})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("todas")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroEstado === "todas"
                      ? "bg-white text-carbon shadow-xs border border-carbon/20 font-bold"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="Mostrar todas las actividades (pendientes y completadas)"
                >
                  <span>Todas ({conteos.total})</span>
                </button>
              </div>

              {/* FILTRO DE TIPO (Todas / Instalaciones / Inspecciones) */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-carbon/10 text-xs">
                <button
                  type="button"
                  onClick={() => setFiltroTipo("todas")}
                  className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroTipo === "todas"
                      ? "bg-white text-verde-profundo shadow-xs border border-carbon/10 font-bold"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                >
                  Todas ({conteoTipoSegunEstado.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroTipo("instalacion")}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroTipo === "instalacion"
                      ? "bg-white text-emerald-800 shadow-xs border border-emerald-300 font-bold"
                      : "text-carbon/60 hover:text-emerald-800"
                  }`}
                >
                  <span>🛠️</span>
                  <span>Instalaciones ({conteoTipoSegunEstado.instalaciones})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroTipo("inspeccion")}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    filtroTipo === "inspeccion"
                      ? "bg-white text-amber-800 shadow-xs border border-amber-300 font-bold"
                      : "text-carbon/60 hover:text-amber-800"
                  }`}
                >
                  <span>🔍</span>
                  <span>Inspecciones ({conteoTipoSegunEstado.inspecciones})</span>
                </button>
              </div>
            </div>

            {/* Acciones del encabezado */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/agenda"
                className="hidden xl:inline-flex items-center gap-1 rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-xs font-medium text-carbon/80 hover:bg-carbon/5 hover:text-verde-profundo transition"
                title="Abrir agenda completa"
              >
                <span>Ver Agenda Completa</span>
                <span className="text-[10px]">↗</span>
              </Link>

              <button
                type="button"
                onClick={() => cargar(semanaOffset)}
                disabled={cargando}
                title="Recargar actividades"
                className="rounded-lg border border-carbon/20 bg-white p-1 text-carbon/60 hover:text-carbon transition cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cargando ? "animate-spin text-verde-profundo" : ""}
                >
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </button>

              <button
                type="button"
                onClick={toggleColapso}
                className="flex items-center gap-1 rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 hover:text-verde-profundo transition cursor-pointer"
                title="Contraer barra superior"
              >
                <span>Contraer</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Selector horizontal de días de la semana (Lunes a Domingo) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-sutil">
            <button
              type="button"
              onClick={() => setDiaSeleccionado(null)}
              className={`flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                diaSeleccionado === null
                  ? "bg-verde-profundo text-crema shadow-xs"
                  : "bg-slate-100 text-carbon/70 hover:bg-slate-200"
              }`}
            >
              <span>Toda la semana</span>
              <span className={`text-[10px] rounded-full px-1.5 py-0.2 ${
                diaSeleccionado === null ? "bg-white/20 text-white" : "bg-carbon/10 text-carbon"
              }`}>
                {conteoTipoSegunEstado.total}
              </span>
            </button>

            {(datos?.dias || []).map((dia) => {
              const seleccionado = diaSeleccionado === dia.fecha;
              const actsDia = actsSegunEstado.filter((a) => a.fecha === dia.fecha);
              const totalDia = actsDia.length;
              const instDia = actsDia.filter((a) => a.tipo === "instalacion").length;
              const inspDia = actsDia.filter((a) => a.tipo === "inspeccion").length;

              const totalDiaOriginal = (datos?.actividades || []).filter((a) => a.fecha === dia.fecha).length;
              const completadasDia = (datos?.actividades || []).filter(
                (a) => a.fecha === dia.fecha && a.estado === "completada"
              ).length;

              return (
                <button
                  key={dia.fecha}
                  type="button"
                  onClick={() => setDiaSeleccionado(dia.fecha)}
                  className={`relative flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs transition ${
                    seleccionado
                      ? "bg-verde-profundo text-crema shadow-xs font-semibold ring-2 ring-dorado/50"
                      : dia.esHoy
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold"
                      : "bg-slate-100 text-carbon/80 hover:bg-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-bold">{dia.diaNombre}</span>
                    <span>{dia.diaNumero}</span>
                    {dia.esHoy && (
                      <span className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${
                        seleccionado ? "bg-dorado text-verde-profundo" : "bg-emerald-600 text-white"
                      }`}>
                        Hoy
                      </span>
                    )}
                  </div>

                  {/* Indicadores de actividades en ese día según filtro activo */}
                  <div className="flex items-center gap-1">
                    {instDia > 0 && (
                      <span
                        className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          seleccionado ? "bg-emerald-400 text-verde-profundo" : "bg-emerald-100 text-emerald-800"
                        }`}
                        title={`${instDia} instalación(es)`}
                      >
                        🛠️{instDia}
                      </span>
                    )}
                    {inspDia > 0 && (
                      <span
                        className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          seleccionado ? "bg-amber-300 text-carbon" : "bg-amber-100 text-amber-900"
                        }`}
                        title={`${inspDia} inspección(es)`}
                      >
                        🔍{inspDia}
                      </span>
                    )}
                    {filtroEstado === "pendientes" && totalDia === 0 && completadasDia > 0 && (
                      <span
                        className="text-[10px]"
                        title={`${completadasDia} actividad(es) completada(s)`}
                      >
                        ✅
                      </span>
                    )}
                    {totalDia === 0 && (filtroEstado !== "pendientes" || completadasDia === 0) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-carbon/20" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ========================================================= */}
          {/* Coordinaciones solicitadas pendientes de seguimiento       */}
          {/* ========================================================= */}
          {coordinaciones.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-900">
                  🔔 Coordinaciones por dar seguimiento ({coordinaciones.length})
                </span>
                {avisoCoord && (
                  <span className={`text-[11px] font-semibold ${avisoCoord.tipo === "ok" ? "text-emerald-700" : "text-rojo"}`}>
                    {avisoCoord.texto}
                  </span>
                )}
              </div>

              {/* Filtro por estatus */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[{ id: "todas" as const, label: "Todas", clase: "bg-white text-carbon/70 border-carbon/15" }, ...ETAPAS_COORD].map((e) => {
                  const n = e.id === "todas" ? coordinaciones.length : coordinaciones.filter((c) => c.etapa === e.id).length;
                  if (e.id !== "todas" && n === 0) return null;
                  const activo = filtroEtapaCoord === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setFiltroEtapaCoord(e.id)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${
                        activo ? "bg-indigo-900 text-white border-indigo-900" : e.clase
                      }`}
                    >
                      {e.label} ({n})
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-indigo-100 bg-white">
                {/* Encabezado (solo escritorio) */}
                <div className="hidden lg:grid grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto] gap-3 px-3 py-1.5 border-b border-indigo-100 bg-indigo-50/60 text-[9.5px] font-bold uppercase tracking-wide text-indigo-900/60 sticky top-0">
                  <span>Antigüedad</span>
                  <span>Cliente</span>
                  <span>Estatus</span>
                  <span>Asesores</span>
                  <span className="text-right">Acciones</span>
                </div>

                {coordsVisibles.map((c) => {
                  const etapa = ETAPAS_COORD.find((e) => e.id === c.etapa);
                  const edadClase =
                    c.minutosPendiente >= 1440
                      ? "bg-rojo/10 text-rojo"
                      : c.minutosPendiente >= 120
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-carbon/70";
                  const cerrando = cerrandoCoord?.id === c.id;
                  return (
                    <div key={c.id} className={`border-b border-slate-100 last:border-b-0 ${c.urgente ? "bg-rojo/[0.03]" : ""}`}>
                      <div className="grid grid-cols-1 lg:grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto] gap-x-3 gap-y-1 px-3 py-2 text-[11px] items-center">
                        <div className="flex lg:flex-col items-center lg:items-start gap-1.5 lg:gap-0.5">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${edadClase}`} title="Tiempo desde que se solicitó">
                            ⏱ {tiempoTranscurrido(c.minutosPendiente)}
                          </span>
                          <span className="text-[10px] text-carbon/50" title="Fecha en que se generó">
                            {fechaCorta(c.creadaAt)}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-carbon truncate">{c.clienteNombre}</div>
                          <div className="text-carbon/55 truncate">
                            {c.servicioNombre} · {c.ubicacion}
                          </div>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          {etapa && (
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${etapa.clase}`}>
                              {etapa.label}
                            </span>
                          )}
                          <div className="text-[10.5px] text-indigo-900/80 truncate" title={c.etapaLabel}>
                            {c.etapaLabel}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {c.asesores.map((a) => (
                            <span
                              key={a.id}
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${
                                a.respondio ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
                              }`}
                              title={`${a.nombre}: ${a.recibido ? "recibió" : "sin confirmación de envío"} · ${a.leido ? "leyó" : "sin confirmar lectura"} · ${a.respondio ? "respondió" : "sin respuesta"}`}
                            >
                              <span className="font-semibold">{a.nombre.split(" ")[0]}</span>
                              <span>{a.recibido ? "📨" : "⚠️"}</span>
                              <span>{a.leido ? "👁️" : "⏳"}</span>
                              <span>{a.respondio ? "✅" : "❔"}</span>
                            </span>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center lg:justify-end gap-1.5">
                          <Link
                            href={`/prospectos/${c.prospectoId}`}
                            className="rounded-md bg-verde-profundo text-crema px-2 py-1 font-semibold hover:bg-sauce transition whitespace-nowrap"
                          >
                            Abrir cabina →
                          </Link>
                          {c.etapa === "esperando_asesores" && (
                            <button
                              type="button"
                              onClick={() => handleRecordar(c.id)}
                              disabled={recordandoId === c.id}
                              className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-2 py-1 font-semibold hover:bg-amber-100 transition disabled:opacity-50 whitespace-nowrap"
                              title="Envía un recordatorio por WhatsApp y Telegram a los asesores que no han respondido"
                            >
                              {recordandoId === c.id ? "Enviando…" : "⏰ Recordar"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCerrandoCoord(cerrando ? null : { id: c.id, motivo: MOTIVOS_CIERRE[0] })}
                            className="rounded-md border border-carbon/15 bg-white text-carbon/70 px-2 py-1 font-semibold hover:bg-slate-50 transition whitespace-nowrap"
                            title="Cerrar esta coordinación sin cita (queda registrado el motivo)"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>

                      {cerrando && (
                        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[11px]">
                          <span className="font-semibold text-carbon/70">Motivo de cierre:</span>
                          <select
                            value={cerrandoCoord?.motivo ?? MOTIVOS_CIERRE[0]}
                            onChange={(e) => setCerrandoCoord({ id: c.id, motivo: e.target.value })}
                            className="rounded border border-carbon/20 px-1.5 py-1 text-[11px] bg-white"
                          >
                            {MOTIVOS_CIERRE.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleCerrarCoord}
                            disabled={guardandoCierre}
                            className="rounded-md bg-rojo text-white px-2 py-1 font-bold hover:opacity-90 disabled:opacity-50"
                          >
                            {guardandoCierre ? "Cerrando…" : "Confirmar cierre"}
                          </button>
                          <button type="button" onClick={() => setCerrandoCoord(null)} className="text-carbon/50 hover:underline">
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-carbon/50">
                Más antiguas primero · ⏱ ámbar &gt; 2 h, rojo &gt; 1 día · 📨 recibió · 👁️ leyó · ✅ respondió. Se muestran hasta que la cita se confirma o se cierra.
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* Contenedor de Tarjetas de Actividades                      */}
          {/* ========================================================= */}
          {cargando && !datos ? (
            <div className="py-6 text-center text-xs text-carbon/40">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-verde-profundo border-t-transparent mr-2" />
              Cargando actividades de la semana...
            </div>
          ) : actividadesFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center rounded-xl border border-dashed border-carbon/15 bg-slate-50/50 p-4">
              <span className="text-2xl mb-1">
                {filtroEstado === "pendientes" ? "✨" : "📋"}
              </span>
              <p className="text-xs font-semibold text-carbon/70">
                {diaSeleccionado
                  ? filtroEstado === "pendientes"
                    ? "Sin actividades pendientes para el día seleccionado"
                    : "Sin actividades para el día seleccionado"
                  : filtroEstado === "pendientes"
                  ? "¡No hay actividades pendientes para los filtros seleccionados!"
                  : filtroTipo !== "todas"
                  ? `Sin ${filtroTipo === "instalacion" ? "instalaciones" : "inspecciones"} esta semana`
                  : "Sin actividades programadas para esta semana"}
              </p>
              <p className="text-[11px] text-carbon/40 mt-0.5">
                {filtroEstado === "pendientes" && conteos.completadas > 0
                  ? `Hay ${conteos.completadas} actividad(es) completada(s) esta semana.`
                  : "Las citas e instalaciones agendadas en el CRM aparecerán automáticamente aquí."}
              </p>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap justify-center">
                {filtroEstado === "pendientes" && conteos.completadas > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroEstado("completadas")}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-700 text-white px-3 py-1 text-xs font-semibold hover:bg-slate-800 transition shadow-2xs cursor-pointer"
                  >
                    <span>✅ Ver actividades completadas ({conteos.completadas})</span>
                  </button>
                )}
                <Link
                  href="/agenda"
                  className="inline-flex items-center gap-1 rounded-lg bg-verde-profundo text-crema px-3 py-1 text-xs font-semibold hover:bg-sauce transition shadow-2xs"
                >
                  <span>+ Programar en Agenda</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-sutil">
              {actividadesFiltradas.map((act) => {
                const esInst = act.tipo === "instalacion";
                const esCompletada = act.estado === "completada";
                return (
                  <div
                    key={act.id}
                    className={`group relative flex flex-col justify-between rounded-xl border p-2.5 text-xs transition-all hover:shadow-md ${
                      esCompletada
                        ? "bg-slate-50/80 border-slate-200 opacity-90 hover:opacity-100"
                        : act.esHoy
                        ? "bg-white border-verde-profundo/40 shadow-xs ring-1 ring-verde-profundo/20"
                        : "bg-white border-carbon/10 hover:border-carbon/25"
                    }`}
                  >
                    {/* Encabezado de la tarjeta */}
                    <div>
                      <div className="flex items-start justify-between gap-1.5 mb-1.5">
                        {/* Badge de Tipo */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                            esInst
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          <span>{esInst ? "🛠️" : "🔍"}</span>
                          <span>{act.tipoLabel}</span>
                        </span>

                        {/* Estatus */}
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${
                            act.estado === "confirmada"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                              : act.estado === "en_proceso"
                              ? "bg-blue-50 text-blue-800 border border-blue-200 font-semibold"
                              : act.estado === "completada"
                              ? "bg-slate-200 text-slate-800 border border-slate-300 font-bold"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {act.estadoLabel}
                        </span>
                      </div>

                      {/* Horario y Día */}
                      <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-carbon/80 mb-1">
                        <span className={act.esHoy ? "text-emerald-700 font-bold" : "text-verde-profundo"}>
                          {act.esHoy ? "HOY" : act.diaSemanaNombre} {act.horaInicio}
                        </span>
                        {act.horaFin && (
                          <span className="text-carbon/40 font-normal">
                            - {act.horaFin}
                          </span>
                        )}
                        <span className="text-carbon/30">·</span>
                        <span className="text-carbon/50 font-sans text-[10px]">
                          {act.fecha.slice(8, 10)}/{act.fecha.slice(5, 7)}
                        </span>
                      </div>

                      {/* Cliente */}
                      <p className="font-semibold text-carbon text-xs leading-snug line-clamp-1" title={act.clienteNombre}>
                        👤 {act.clienteNombre}
                      </p>

                      {/* Dirección / Fraccionamiento */}
                      <p className="mt-0.5 text-[11px] text-carbon/70 leading-snug line-clamp-1 flex items-center gap-1" title={act.direccion}>
                        <span className="text-dorado shrink-0">📍</span>
                        <span className="truncate">{act.fraccionamiento || act.direccion}</span>
                      </p>

                      {/* Responsables */}
                      <p className="mt-1 text-[10px] text-carbon/60 line-clamp-1 flex items-center gap-1" title={act.responsables.join(", ")}>
                        <span className="shrink-0">👷</span>
                        <span className="truncate">{act.responsables.join(", ")}</span>
                      </p>

                      {/* OT Folio si existe */}
                      {act.ordenTrabajoFolio && (
                        <p className="mt-0.5 font-mono text-[10px] text-emerald-800 font-semibold">
                          OT: {act.ordenTrabajoFolio}
                        </p>
                      )}

                      {/* Notas breves si existen */}
                      {act.notas && (
                        <p className="mt-1 text-[10px] text-carbon/50 italic line-clamp-1 border-t border-carbon/5 pt-1" title={act.notas}>
                          &quot;{act.notas}&quot;
                        </p>
                      )}
                    </div>

                    {/* Acciones Rápidas (Pie de la tarjeta) */}
                    <div className="mt-2 pt-2 border-t border-carbon/10 flex items-center justify-between gap-1 text-[11px]">
                      {/* WhatsApp / Teléfono */}
                      <div className="flex items-center gap-1">
                        {act.clienteWhatsAppLink ? (
                          <a
                            href={act.clienteWhatsAppLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold border border-emerald-200 transition"
                            title="Enviar mensaje por WhatsApp"
                          >
                            <span>💬</span>
                            <span>WhatsApp</span>
                          </a>
                        ) : null}

                        {act.clienteTelefonoLink ? (
                          <a
                            href={`tel:${act.clienteTelefonoLink}`}
                            className="inline-flex items-center rounded bg-slate-100 hover:bg-slate-200 text-carbon/70 p-1 text-[10px] transition"
                            title={`Llamar a ${act.clienteTelefono}`}
                          >
                            📞
                          </a>
                        ) : null}
                      </div>

                      {/* Enlace al Expediente o Cotización */}
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        {act.ordenTrabajoId ? (
                          <Link
                            href={`/ordenes-trabajo`}
                            className="text-verde-profundo font-semibold hover:underline"
                            title="Ver en Órdenes de Trabajo"
                          >
                            Ver OT →
                          </Link>
                        ) : act.expedienteId ? (
                          <Link
                            href={`/expediente/${act.expedienteId}`}
                            className="text-verde-profundo font-semibold hover:underline"
                            title="Ver Expediente"
                          >
                            Expediente →
                          </Link>
                        ) : act.cotizacionId ? (
                          <Link
                            href={`/cotizaciones/${act.cotizacionId}`}
                            className="text-verde-profundo font-semibold hover:underline"
                            title="Ver Cotización"
                          >
                            Cotización →
                          </Link>
                        ) : act.prospectoId ? (
                          <Link
                            href={`/prospectos/${act.prospectoId}`}
                            className="text-verde-profundo font-semibold hover:underline"
                            title="Ver Prospecto"
                          >
                            Prospecto →
                          </Link>
                        ) : (
                          <Link
                            href="/agenda"
                            className="text-carbon/50 hover:text-carbon hover:underline"
                            title="Ver en Agenda"
                          >
                            Agenda →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
