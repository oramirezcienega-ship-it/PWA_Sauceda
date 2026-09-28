"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  obtenerActividadesSemana,
  type ResumenSemanaActividades,
  type ActividadSemanaItem,
  type DiaSemanaInfo,
} from "@/app/actions/actividades-semana";

export function HeaderActividadesSemana() {
  const [datos, setDatos] = useState<ResumenSemanaActividades | null>(null);
  const [cargando, setCargando] = useState(true);
  // Regla: Siempre iniciar contraída por defecto
  const [colapsada, setColapsada] = useState(true);
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "instalacion" | "inspeccion">("todas");
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const toggleColapso = () => {
    setColapsada((prev) => !prev);
  };

  // Cargar datos de la semana
  const cargar = useCallback(async (offset: number) => {
    setCargando(true);
    try {
      const res = await obtenerActividadesSemana(offset);
      setDatos(res);
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

  // Filtrar actividades según selección
  const actividadesFiltradas = (datos?.actividades || []).filter((act) => {
    if (filtroTipo !== "todas" && act.tipo !== filtroTipo) return false;
    if (diaSeleccionado && act.fecha !== diaSeleccionado) return false;
    return true;
  });

  // Próxima actividad pendiente para el ticker
  const proximaActividad = (datos?.actividades || []).find((a) => {
    if (!datos?.fechaHoy) return true;
    return a.fecha >= datos.fechaHoy && a.estado !== "completada" && a.estado !== "cancelada";
  }) || datos?.actividades?.[0];

  return (
    <aside
      aria-label="Barra de actividades de la semana"
      className="hidden md:block sticky top-0 z-20 border-b border-carbon/10 bg-white/95 backdrop-blur-md text-carbon shadow-2xs transition-all duration-200"
    >
      {/* ========================================================= */}
      {/* 1. MODO CONTRAÍDO (Siempre activo por defecto)            */}
      {/* ========================================================= */}
      {colapsada ? (
        <div className="flex h-10 items-center justify-between px-3 text-xs bg-gradient-to-r from-white via-slate-50/60 to-white">
          {/* Lado izquierdo: Título e indicadores */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={toggleColapso}
              className="flex items-center gap-1.5 font-display font-semibold text-verde-profundo hover:text-sauce transition cursor-pointer group"
              title="Clic para desplegar las actividades de la semana"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-verde-profundo/10 text-verde-profundo text-xs group-hover:scale-105 transition-transform">
                📅
              </span>
              <span className="truncate font-bold tracking-tight">Actividades de la Semana</span>
            </button>

            {datos?.rangoTexto && (
              <span className="hidden xl:inline-block font-mono text-[10px] text-carbon/50 bg-carbon/5 px-1.5 py-0.5 rounded">
                {datos.rangoTexto}
              </span>
            )}

            {/* Badges de conteo */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                🛠️ {datos?.conteoInstalaciones ?? 0} {datos?.conteoInstalaciones === 1 ? "Instalación" : "Instalaciones"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                🔍 {datos?.conteoInspecciones ?? 0} {datos?.conteoInspecciones === 1 ? "Inspección" : "Inspecciones"}
              </span>
              {(datos?.conteoHoy ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rojo/10 border border-rojo/30 px-2 py-0.5 font-mono text-[11px] font-bold text-rojo animate-pulse">
                  ⚡ {datos?.conteoHoy} Hoy
                </span>
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
          <div className="flex items-center gap-1.5 shrink-0">
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
              className="flex items-center gap-1 rounded-md bg-verde-profundo text-crema px-2.5 py-1 text-[11px] font-semibold hover:bg-sauce transition shadow-2xs cursor-pointer ml-1"
            >
              <span>Desplegar</span>
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
        <div className="p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Fila superior: Título, rango de fechas, filtros y botón contraer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 pb-2">
            {/* Título & Rango */}
            <div className="flex items-center gap-2.5 flex-wrap">
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

            {/* Pestañas de Filtro (Todas / Instalaciones / Inspecciones) */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-carbon/10 text-xs">
              <button
                type="button"
                onClick={() => setFiltroTipo("todas")}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  filtroTipo === "todas"
                    ? "bg-white text-verde-profundo shadow-xs border border-carbon/10"
                    : "text-carbon/60 hover:text-carbon"
                }`}
              >
                Todas ({datos?.conteoTotal ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("instalacion")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                  filtroTipo === "instalacion"
                    ? "bg-white text-emerald-800 shadow-xs border border-emerald-300"
                    : "text-carbon/60 hover:text-emerald-800"
                }`}
              >
                <span>🛠️</span>
                <span>Instalaciones ({datos?.conteoInstalaciones ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("inspeccion")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                  filtroTipo === "inspeccion"
                    ? "bg-white text-amber-800 shadow-xs border border-amber-300"
                    : "text-carbon/60 hover:text-amber-800"
                }`}
              >
                <span>🔍</span>
                <span>Inspecciones ({datos?.conteoInspecciones ?? 0})</span>
              </button>
            </div>

            {/* Acciones del encabezado */}
            <div className="flex items-center gap-2">
              <Link
                href="/agenda"
                className="hidden lg:inline-flex items-center gap-1 rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-xs font-medium text-carbon/80 hover:bg-carbon/5 hover:text-verde-profundo transition"
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
                className="rounded-lg border border-carbon/20 bg-white p-1 text-carbon/60 hover:text-carbon transition"
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
                {datos?.conteoTotal ?? 0}
              </span>
            </button>

            {(datos?.dias || []).map((dia) => {
              const seleccionado = diaSeleccionado === dia.fecha;
              return (
                <button
                  key={dia.fecha}
                  type="button"
                  onClick={() => setDiaSeleccionado(dia.fecha)}
                  className={`relative flex items-center gap-2 shrink-0 rounded-lg px-2.5 py-1 text-xs transition ${
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

                  {/* Indicadores de actividades en ese día */}
                  <div className="flex items-center gap-1">
                    {dia.totalInstalaciones > 0 && (
                      <span
                        className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          seleccionado ? "bg-emerald-400 text-verde-profundo" : "bg-emerald-100 text-emerald-800"
                        }`}
                        title={`${dia.totalInstalaciones} instalación(es)`}
                      >
                        🛠️{dia.totalInstalaciones}
                      </span>
                    )}
                    {dia.totalInspecciones > 0 && (
                      <span
                        className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          seleccionado ? "bg-amber-300 text-carbon" : "bg-amber-100 text-amber-900"
                        }`}
                        title={`${dia.totalInspecciones} inspección(es)`}
                      >
                        🔍{dia.totalInspecciones}
                      </span>
                    )}
                    {dia.totalActividades === 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-carbon/20" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ========================================================= */}
          {/* Contenedor de Tarjetas de Actividades                      */}
          {/* ========================================================= */}
          {cargando && !datos ? (
            <div className="py-6 text-center text-xs text-carbon/40">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-verde-profundo border-t-transparent mr-2" />
              Cargando actividades de la semana...
            </div>
          ) : actividadesFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center rounded-xl border border-dashed border-carbon/15 bg-slate-50/50">
              <span className="text-2xl mb-1">📋</span>
              <p className="text-xs font-semibold text-carbon/70">
                {diaSeleccionado
                  ? "Sin actividades para el día seleccionado"
                  : filtroTipo !== "todas"
                  ? `Sin ${filtroTipo === "instalacion" ? "instalaciones" : "inspecciones"} esta semana`
                  : "Sin actividades programadas para esta semana"}
              </p>
              <p className="text-[11px] text-carbon/40 mt-0.5">
                Las citas e instalaciones agendadas en el CRM aparecerán automáticamente aquí.
              </p>
              <Link
                href="/agenda"
                className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-verde-profundo text-crema px-3 py-1 text-xs font-semibold hover:bg-sauce transition shadow-2xs"
              >
                <span>+ Programar en Agenda</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 max-h-[320px] overflow-y-auto pr-1 scrollbar-sutil">
              {actividadesFiltradas.map((act) => {
                const esInst = act.tipo === "instalacion";
                return (
                  <div
                    key={act.id}
                    className={`group relative flex flex-col justify-between rounded-xl border p-2.5 text-xs transition-all hover:shadow-md ${
                      act.esHoy
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
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : act.estado === "en_proceso"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : act.estado === "completada"
                              ? "bg-slate-100 text-slate-700"
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
