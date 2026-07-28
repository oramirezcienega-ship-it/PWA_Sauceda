"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { obtenerExpedientesSeguimiento, type ExpedienteSeguimiento } from "@/app/actions/expedientes";
import { concluirTareaYProgramarSiguiente } from "@/app/actions/bpm";

export function WidgetSeguimientoExpedientes() {
  const [expedientes, setExpedientes] = useState<ExpedienteSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");
  const [filtroProspectoEstatus, setFiltroProspectoEstatus] = useState("todos");
  const [filtroFecha, setFiltroFecha] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Estado del Modal de Conclusión de Tarea
  const [expedienteAConcluir, setExpedienteAConcluir] = useState<ExpedienteSeguimiento | null>(null);
  const [retroNotas, setRetroNotas] = useState("");
  const [reprogramarSiguiente, setReprogramarSiguiente] = useState(true);
  const [diasSiguiente, setDiasSiguiente] = useState<number>(2);
  const [fechaSiguiente, setFechaSiguiente] = useState("");
  const [tituloSiguiente, setTituloSiguiente] = useState("📞 Llamada de seguimiento");
  const [guardandoConclusion, setGuardandoConclusion] = useState(false);

  const handleGuardarConclusion = async () => {
    if (!expedienteAConcluir) return;
    setGuardandoConclusion(true);
    try {
      await concluirTareaYProgramarSiguiente({
        expedienteId: expedienteAConcluir.id,
        prospectoId: expedienteAConcluir.prospectoId,
        tareaId: expedienteAConcluir.tareaBpmId,
        taskAsesorId: expedienteAConcluir.tareaAsesorId,
        citaId: expedienteAConcluir.citaId,
        resultadoNotas: retroNotas,
        reprogramarSiguiente,
        diasSiguiente,
        fechaSiguiente: fechaSiguiente || null,
        tituloSiguiente,
        responsableId: expedienteAConcluir.asesorId || null
      });

      // Recargar expedientes
      const datosActualizados = await obtenerExpedientesSeguimiento();
      setExpedientes(datosActualizados);

      // Cerrar modal
      setExpedienteAConcluir(null);
      setRetroNotas("");
    } catch (err) {
      console.error("Error al concluir tarea:", err);
      alert("Ocurrió un error al concluir la tarea.");
    } finally {
      setGuardandoConclusion(false);
    }
  };

  useEffect(() => {
    obtenerExpedientesSeguimiento()
      .then((data) => setExpedientes(data))
      .catch((err) => console.error("Error al obtener expedientes para seguimiento:", err))
      .finally(() => setCargando(false));
  }, []);

  // Etapas y Estatus disponibles dinámicamente
  const etapasDisponibles = useMemo(() => {
    const set = new Set<string>();
    expedientes.forEach((e) => {
      if (e.etapa) set.add(e.etapa);
    });
    return Array.from(set).sort();
  }, [expedientes]);

  const prospectoEstatusDisponibles = useMemo(() => {
    const set = new Set<string>();
    expedientes.forEach((e) => {
      if (e.prospectoEstatus) set.add(e.prospectoEstatus);
    });
    return Array.from(set).sort();
  }, [expedientes]);

  const hayFiltrosActivos = useMemo(() => {
    return (
      busqueda !== "" ||
      filtroAccion !== "todos" ||
      filtroTipo !== "todos" ||
      filtroEtapa !== "todos" ||
      filtroProspectoEstatus !== "todos" ||
      filtroFecha !== "todos" ||
      fechaDesde !== "" ||
      fechaHasta !== ""
    );
  }, [
    busqueda,
    filtroAccion,
    filtroTipo,
    filtroEtapa,
    filtroProspectoEstatus,
    filtroFecha,
    fechaDesde,
    fechaHasta,
  ]);

  const limpiarTodosLosFiltros = () => {
    setBusqueda("");
    setFiltroAccion("todos");
    setFiltroTipo("todos");
    setFiltroEtapa("todos");
    setFiltroProspectoEstatus("todos");
    setFiltroFecha("todos");
    setFechaDesde("");
    setFechaHasta("");
  };

  // Filtrar expedientes primero
  const expedientesFiltrados = useMemo(() => {
    const hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    const hace7diasStr = hace7dias.toISOString().slice(0, 10);

    const proxima7dias = new Date();
    proxima7dias.setDate(proxima7dias.getDate() + 7);
    const proxima7diasStr = proxima7dias.toISOString().slice(0, 10);

    return expedientes.filter((e) => {
      const coincideBusqueda = 
        !busqueda ||
        e.id.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.fraccionamiento.toLowerCase().includes(busqueda.toLowerCase());

      const coincideAccion = 
        filtroAccion === "todos" ||
        (filtroAccion === "urgente" && e.proximaAccionTipo === "cita") ||
        (filtroAccion === "tarea" && e.proximaAccionTipo === "tarea") ||
        (filtroAccion === "sin_tareas" && e.proximaAccionTipo === "ninguno");

      const coincideEtapa =
        filtroEtapa === "todos" ||
        e.etapa.toLowerCase() === filtroEtapa.toLowerCase();

      const coincideProspectoEstatus =
        filtroProspectoEstatus === "todos" ||
        (e.prospectoEstatus && e.prospectoEstatus.toLowerCase() === filtroProspectoEstatus.toLowerCase());

      let coincideFecha = true;
      const fechaCreacionShort = e.fechaCreacion ? e.fechaCreacion.slice(0, 10) : "";
      const fechaProximaShort = e.proximaAccionFecha ? e.proximaAccionFecha.slice(0, 10) : "";

      if (filtroFecha === "hoy") {
        coincideFecha = fechaCreacionShort === hoyStr || fechaProximaShort === hoyStr;
      } else if (filtroFecha === "ultimos_7_dias") {
        coincideFecha = fechaCreacionShort >= hace7diasStr;
      } else if (filtroFecha === "proxima_hoy") {
        coincideFecha = !!fechaProximaShort && fechaProximaShort <= hoyStr;
      } else if (filtroFecha === "proxima_7_dias") {
        coincideFecha = !!fechaProximaShort && fechaProximaShort >= hoyStr && fechaProximaShort <= proxima7diasStr;
      } else if (filtroFecha === "rango") {
        if (fechaDesde && fechaCreacionShort < fechaDesde) coincideFecha = false;
        if (fechaHasta && fechaCreacionShort > fechaHasta) coincideFecha = false;
      }

      return (
        coincideBusqueda &&
        coincideAccion &&
        coincideEtapa &&
        coincideProspectoEstatus &&
        coincideFecha
      );
    });
  }, [
    expedientes,
    busqueda,
    filtroAccion,
    filtroEtapa,
    filtroProspectoEstatus,
    filtroFecha,
    fechaDesde,
    fechaHasta,
  ]);

  // Configuración de las categorías/servicios (Impermeabilización 1º, Remodelación 2º)
  const columnasConfig = [
    { key: "Impermeabilización", label: "Impermeabilización", icon: "💧" },
    { key: "Remodelación", label: "Remodelación", icon: "🔨" },
    { key: "Traspaso / Compra", label: "Traspaso / Compra", icon: "💰" },
    { key: "Promoción de Venta", label: "Promoción de Venta", icon: "📢" },
    { key: "Solo Trámite", label: "Solo Trámite", icon: "📄" },
    { key: "Construcción / Obra", label: "Construcción / Obra", icon: "🏗️" },
  ];

  // Algoritmo de ordenación: Citas (Inspecciones/Instalaciones) primero > Tareas del Asesor después > Sin tareas al final.
  // Dentro del mismo peso, se ordena por fecha de acción ascendente (más urgentes arriba).
  const ordenarExpedientes = (lista: ExpedienteSeguimiento[]) => {
    return [...lista].sort((a, b) => {
      const pesoA = a.proximaAccionTipo === "cita" ? 2 : (a.proximaAccionTipo === "tarea" ? 1 : 0);
      const pesoB = b.proximaAccionTipo === "cita" ? 2 : (b.proximaAccionTipo === "tarea" ? 1 : 0);

      if (pesoA !== pesoB) {
        return pesoB - pesoA;
      }

      if (a.proximaAccionFecha && b.proximaAccionFecha) {
        return new Date(a.proximaAccionFecha).getTime() - new Date(b.proximaAccionFecha).getTime();
      }

      return new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
    });
  };

  // Normalizar tipo de negocio para soportar cualquier variación de slug o texto
  const normalizarTipo = (tipo?: string | null): string => {
    if (!tipo) return "Otros";
    const t = tipo.trim().toLowerCase();
    if (t.includes("impermeabiliz")) return "Impermeabilización";
    if (t.includes("remodelac")) return "Remodelación";
    if (t.includes("traspaso") || t === "compra") return "Traspaso / Compra";
    if (t.includes("promocion") || t === "venta") return "Promoción de Venta";
    if (t.includes("tramite") || t.includes("trámite")) return "Solo Trámite";
    if (t.includes("construcc") || t.includes("obra")) return "Construcción / Obra";
    return tipo;
  };

  // Agrupar expedientes por su tipo de negocio, ordenando las listas individuales
  const agrupados = useMemo(() => {
    const mapa: Record<string, ExpedienteSeguimiento[]> = {
      "Impermeabilización": [],
      "Remodelación": [],
      "Traspaso / Compra": [],
      "Promoción de Venta": [],
      "Solo Trámite": [],
      "Construcción / Obra": [],
      "Otros": []
    };

    expedientesFiltrados.forEach((e) => {
      const tipoNorm = normalizarTipo(e.tipoNegocio);
      if (mapa[tipoNorm] !== undefined) {
        mapa[tipoNorm].push(e);
      } else {
        mapa["Otros"].push(e);
      }
    });

    Object.keys(mapa).forEach((key) => {
      mapa[key] = ordenarExpedientes(mapa[key]);
    });

    return mapa;
  }, [expedientesFiltrados]);

  // Decidir qué categorías/filas mostrar según el filtro de tipo de negocio seleccionado
  const columnasAMostrar = useMemo(() => {
    if (filtroTipo === "todos") {
      const activas = columnasConfig.filter((col) => (agrupados[col.key]?.length ?? 0) > 0);
      // Si hay elementos en "Otros", incluirla de forma dinámica
      if (agrupados["Otros"] && agrupados["Otros"].length > 0) {
        return [...activas, { key: "Otros", label: "Otros Servicios", icon: "📁" }];
      }
      return activas.length > 0 ? activas : columnasConfig;
    }
    
    const seleccionada = columnasConfig.find((col) => col.key === filtroTipo);
    if (seleccionada) return [seleccionada];
    if (filtroTipo === "Otros") return [{ key: "Otros", label: "Otros Servicios", icon: "📁" }];
    return [];
  }, [filtroTipo, agrupados]);

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="font-titular text-lg font-semibold text-verde-profundo flex items-center gap-1.5">
            📋 Monitoreo & Seguimiento de Expedientes
          </h2>
          <p className="text-xs text-carbon/50">
            Seguimiento ordenado por filas verticales con priorización de citas y tareas críticas arriba
          </p>
        </div>
        <div className="text-xs text-carbon/40 font-mono">
          Total activos: <strong>{expedientes.filter(x => x.etapa !== "perdido" && x.etapa !== "venta").length}</strong>
        </div>
      </div>

      {/* Filtros Superiores */}
      <div className="space-y-4">
        {/* Fila 1: Filtro por Servicio / Tipo de Negocio (Pills Horizontales) */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold text-carbon/40 uppercase tracking-wider">
            Filtrar por Servicio / Tipo de Negocio
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFiltroTipo("todos")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition ${
                filtroTipo === "todos"
                  ? "bg-verde-profundo text-white border-verde-profundo shadow-sm"
                  : "bg-slate-50 border-carbon/10 hover:bg-slate-100 text-carbon/70"
              }`}
            >
              📂 Todos los Servicios
            </button>
            {columnasConfig.map((col) => (
              <button
                key={col.key}
                type="button"
                onClick={() => setFiltroTipo(col.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition flex items-center gap-1.5 ${
                  filtroTipo === col.key
                    ? "bg-verde-profundo text-white border-verde-profundo shadow-sm"
                    : "bg-slate-50 border-carbon/10 hover:bg-slate-100 text-carbon/70"
                }`}
              >
                <span>{col.icon}</span>
                <span>{col.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Fila 2: Búsqueda, Estatus de Expediente, Estatus de Prospecto, Pendientes y Fecha */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <input
              type="text"
              placeholder="Buscar por cliente, ID o zona..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
            />
          </div>

          {/* Filtro por Estatus/Etapa del Expediente */}
          <select
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce font-semibold text-carbon/70"
          >
            <option value="todos">📋 Estatus Expediente: Todos</option>
            {etapasDisponibles.map((et) => (
              <option key={et} value={et}>
                Etapa: {et}
              </option>
            ))}
          </select>

          {/* Filtro por Estatus del Prospecto */}
          <select
            value={filtroProspectoEstatus}
            onChange={(e) => setFiltroProspectoEstatus(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce font-semibold text-carbon/70"
          >
            <option value="todos">👤 Estatus Prospecto: Todos</option>
            {prospectoEstatusDisponibles.map((p) => (
              <option key={p} value={p}>
                Prospecto: {p}
              </option>
            ))}
          </select>

          {/* Filtro por Pendientes / Acciones */}
          <select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce font-semibold text-carbon/70"
          >
            <option value="todos">⚡ Todos los pendientes</option>
            <option value="urgente">Solo Citas / Inspecciones / Instalaciones</option>
            <option value="tarea">Solo Tareas de Asesor</option>
            <option value="sin_tareas">Sin pendientes agendados</option>
          </select>

          {/* Filtro por Fecha */}
          <select
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce font-semibold text-carbon/70"
          >
            <option value="todos">📅 Filtro Fecha: Cualquier fecha</option>
            <option value="hoy">Creado o Acción Hoy</option>
            <option value="ultimos_7_dias">Creado en últimos 7 días</option>
            <option value="proxima_hoy">Próxima Acción Hoy / Vencida</option>
            <option value="proxima_7_dias">Próxima Acción en siguientes 7 días</option>
            <option value="rango">Rango de fechas de creación...</option>
          </select>

          {filtroFecha === "rango" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="rounded-lg border border-carbon/20 px-2 py-1 text-xs bg-white"
                placeholder="Desde"
              />
              <span className="text-xs text-carbon/40">-</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="rounded-lg border border-carbon/20 px-2 py-1 text-xs bg-white"
                placeholder="Hasta"
              />
            </div>
          )}

          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarTodosLosFiltros}
              className="rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 text-xs font-semibold transition flex items-center gap-1"
            >
              <span>✕</span>
              <span>Limpiar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="py-12 text-center text-xs text-carbon/40 font-medium animate-pulse">
          Cargando expedientes y próximos pendientes...
        </div>
      ) : expedientesFiltrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-8 text-center text-xs text-carbon/40 font-medium bg-slate-50/50">
          No se encontraron expedientes con los criterios seleccionados.
        </div>
      ) : (
        /* Renderizado Vertical en Filas aprovechando todo el ancho */
        <div className="space-y-6">
          {columnasAMostrar.map((col) => {
            const lista = agrupados[col.key] || [];
            
            // Ocultar si está vacío al mostrar todos para evitar contaminación visual
            if (lista.length === 0 && filtroTipo === "todos") {
              return null;
            }

            return (
              <div 
                key={col.key} 
                className="space-y-3 border-b border-carbon/5 pb-5 last:border-0"
              >
                {/* Cabecera del Servicio */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <h3 className="font-titular text-xs font-bold text-verde-profundo uppercase tracking-wider">
                      {col.label}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-carbon/50 bg-slate-100 border border-carbon/10 px-2.5 py-0.5 rounded-full">
                    {lista.length} expedientes
                  </span>
                </div>

                {/* Lista Vertical de Expedientes en Filas de Ancho Completo */}
                <div className="flex flex-col gap-2 pt-1">
                  {lista.length === 0 ? (
                    <div className="text-center py-6 text-xs text-carbon/40 italic bg-slate-50 rounded-xl border border-dashed border-carbon/10">
                      No hay expedientes activos en este servicio.
                    </div>
                  ) : (
                    lista.map((e) => {
                      const isCita = e.proximaAccionTipo === "cita";
                      const isTarea = e.proximaAccionTipo === "tarea";

                      return (
                        <div 
                          key={e.id} 
                          className={`rounded-xl border p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white shadow-xs transition-all hover:shadow-md hover:border-sauce/30 ${
                            isCita 
                              ? "border-emerald-200 bg-emerald-50/[0.03]" 
                              : isTarea 
                                ? "border-amber-200 bg-amber-50/[0.03]" 
                                : "border-carbon/10"
                          }`}
                        >
                          {/* Nombre del cliente, ID y fraccionamiento */}
                          <div className="flex-1 min-w-[240px] space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] font-bold text-carbon/40 bg-slate-100 border px-1.5 py-0.5 rounded">
                                {e.id}
                              </span>
                              <Link 
                                href={`/expediente/${e.id}`}
                                className="font-titular font-bold text-sm text-carbon hover:underline hover:text-sauce"
                              >
                                {e.clienteNombre}
                              </Link>
                            </div>
                            <div className="text-xs text-carbon/50 flex items-center gap-2 flex-wrap">
                              <span>📍 {e.fraccionamiento}</span>
                              <span>•</span>
                              <span>Ingreso: {new Date(e.fechaCreacion).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Etapa actual del expediente y estatus del prospecto */}
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className="inline-block rounded-full bg-sauce/10 text-sauce px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                              {e.etapa}
                            </span>
                            {e.prospectoEstatus && (
                              <span className="inline-block rounded-full bg-slate-100 text-carbon/70 px-2 py-0.5 text-[9px] font-medium border border-carbon/10">
                                👤 Prospecto: {e.prospectoEstatus}
                              </span>
                            )}
                          </div>

                          {/* Próximo Pendiente / Acción */}
                          <div className="flex-1 min-w-[280px]">
                            <div className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                              isCita
                                ? "bg-emerald-50 border-emerald-200/50 text-emerald-900"
                                : isTarea
                                  ? "bg-amber-50 border-amber-200/50 text-amber-900"
                                  : "bg-slate-50 border-carbon/5 text-carbon/60"
                            }`}>
                              <span className="text-base select-none mt-0.5">
                                {isCita ? "📅" : isTarea ? "⚡" : "💬"}
                              </span>
                              <div>
                                <div className="text-[8px] uppercase tracking-wider font-bold text-carbon/40">
                                  Próxima Acción / Pendiente
                                </div>
                                <div className="font-semibold leading-tight">
                                  {e.proximaAccion}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Botones de Acción */}
                          <div className="flex-shrink-0 flex items-center gap-2 justify-end">
                            {(e.proximaAccionTipo === "cita" || e.proximaAccionTipo === "tarea") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpedienteAConcluir(e);
                                  setRetroNotas("");
                                  setReprogramarSiguiente(true);
                                  setDiasSiguiente(2);
                                  setFechaSiguiente("");
                                  setTituloSiguiente("📞 Llamada de seguimiento");
                                }}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition flex items-center gap-1 cursor-pointer"
                              >
                                <span>✓</span>
                                <span>Concluir / Retro</span>
                              </button>
                            )}
                            <Link
                              href={`/expediente/${e.id}`}
                              className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 border px-3 py-1.5 text-xs font-semibold transition"
                            >
                              Ver Expediente →
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Conclusión / Retro de Seguimiento */}
      {expedienteAConcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in duration-150 border border-carbon/10">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-titular text-base font-bold text-verde-profundo flex items-center gap-1.5">
                  ✅ Concluir & Retro de Seguimiento
                </h3>
                <p className="text-xs text-carbon/50">
                  {expedienteAConcluir.clienteNombre} ({expedienteAConcluir.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpedienteAConcluir(null)}
                className="text-carbon/40 hover:text-carbon text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-carbon/10 text-xs">
                <span className="font-bold text-carbon/60 uppercase text-[9px] block">Acción Pendiente Actual:</span>
                <span className="font-semibold text-carbon">{expedienteAConcluir.proximaAccion}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/70 mb-1">
                  Retro / Avance de la llamada o seguimiento:
                </label>
                <textarea
                  rows={3}
                  placeholder="Ej. Se llamó a la clienta Susana, le pareció bien la cotización pero pide llamada en 3 días para confirmar con su esposo..."
                  value={retroNotas}
                  onChange={(e) => setRetroNotas(e.target.value)}
                  className="w-full rounded-lg border border-carbon/20 p-2.5 text-xs bg-white focus:outline-none focus:border-sauce"
                />
              </div>

              <div className="border-t pt-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-carbon/80 select-none">
                  <input
                    type="checkbox"
                    checked={reprogramarSiguiente}
                    onChange={(e) => setReprogramarSiguiente(e.target.checked)}
                    className="rounded border-carbon/30 text-sauce focus:ring-sauce"
                  />
                  <span>⚡ Programar automáticamente siguiente llamada en BPM</span>
                </label>

                {reprogramarSiguiente && (
                  <div className="pl-6 space-y-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-carbon/50 uppercase">Título del siguiente seguimiento:</label>
                      <input
                        type="text"
                        value={tituloSiguiente}
                        onChange={(e) => setTituloSiguiente(e.target.value)}
                        className="w-full rounded-md border border-carbon/20 px-2.5 py-1 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-carbon/50 uppercase">Plazo / Regla de Fecha:</label>
                        <select
                          value={diasSiguiente}
                          onChange={(e) => {
                            setDiasSiguiente(Number(e.target.value));
                            setFechaSiguiente("");
                          }}
                          className="w-full rounded-md border border-carbon/20 p-1 text-xs"
                        >
                          <option value={1}>En 1 día (Mañana)</option>
                          <option value={2}>En 2 días</option>
                          <option value={3}>En 3 días</option>
                          <option value={5}>En 5 días</option>
                          <option value={7}>En 1 semana (7 días)</option>
                          <option value={14}>En 2 semanas</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-carbon/50 uppercase">O Fecha específica:</label>
                        <input
                          type="date"
                          value={fechaSiguiente}
                          onChange={(e) => setFechaSiguiente(e.target.value)}
                          className="w-full rounded-md border border-carbon/20 p-1 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setExpedienteAConcluir(null)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/70 px-3 py-1.5 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoConclusion}
                onClick={handleGuardarConclusion}
                className="rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white px-4 py-1.5 text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                {guardandoConclusion ? "Guardando..." : "💾 Guardar y Concluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
