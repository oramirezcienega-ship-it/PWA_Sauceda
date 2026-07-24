"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { obtenerExpedientesSeguimiento, type ExpedienteSeguimiento } from "@/app/actions/expedientes";

export function WidgetSeguimientoExpedientes() {
  const [expedientes, setExpedientes] = useState<ExpedienteSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  useEffect(() => {
    obtenerExpedientesSeguimiento()
      .then((data) => setExpedientes(data))
      .catch((err) => console.error("Error al obtener expedientes para seguimiento:", err))
      .finally(() => setCargando(false));
  }, []);

  // Filtrar expedientes primero
  const expedientesFiltrados = useMemo(() => {
    return expedientes.filter((e) => {
      const coincideBusqueda = 
        e.id.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.fraccionamiento.toLowerCase().includes(busqueda.toLowerCase());

      const coincideAccion = 
        filtroAccion === "todos" ||
        (filtroAccion === "urgente" && e.proximaAccionTipo === "cita") ||
        (filtroAccion === "tarea" && e.proximaAccionTipo === "tarea") ||
        (filtroAccion === "sin_tareas" && e.proximaAccionTipo === "ninguno");

      return coincideBusqueda && coincideAccion;
    });
  }, [expedientes, busqueda, filtroAccion]);

  // Configuración de las columnas principales
  const columnasConfig = [
    { key: "Traspaso / Compra Directa", label: "Traspaso / Compra", icon: "💰" },
    { key: "Promoción de Venta", label: "Promoción de Venta", icon: "📢" },
    { key: "Solo Trámite", label: "Solo Trámite", icon: "📄" },
    { key: "Construcción / Obra", label: "Construcción / Obra", icon: "🏗️" },
  ];

  // Algoritmo de ordenación: Citas (Inspecciones/Instalaciones) primero > Tareas del Asesor después > Sin tareas al final.
  // Dentro del mismo peso, se ordena por fecha de acción ascendente (más urgentes arriba/a la izquierda).
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

  // Agrupar expedientes por su tipo de negocio, ordenando las listas individuales
  const agrupados = useMemo(() => {
    const mapa: Record<string, ExpedienteSeguimiento[]> = {
      "Traspaso / Compra Directa": [],
      "Promoción de Venta": [],
      "Solo Trámite": [],
      "Construcción / Obra": [],
      "Otros": []
    };

    expedientesFiltrados.forEach((e) => {
      if (mapa[e.tipoNegocio] !== undefined) {
        mapa[e.tipoNegocio].push(e);
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
      // Si no hay ninguna fila activa pero no hay búsqueda, mostrar todas por defecto
      return activas.length > 0 ? activas : columnasConfig;
    }
    
    // Si se seleccionó una en específico
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
            Visualización y segmentación 100% horizontal priorizando citas y tareas críticas
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
              📁 Todos los Servicios
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

        {/* Fila 2: Búsqueda y Pendientes */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              placeholder="Buscar por cliente, ID o zona..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
            />
          </div>

          <select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce font-semibold text-carbon/70"
          >
            <option value="todos">Todos los pendientes</option>
            <option value="urgente">Solo Citas / Inspecciones / Instalaciones</option>
            <option value="tarea">Solo Tareas de Asesor</option>
            <option value="sin_tareas">Sin pendientes agendados</option>
          </select>
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
        /* Renderizado Horizontal por Filas y Desplazamiento de Tarjetas */
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
                className="space-y-2 border-b border-carbon/5 pb-4 last:border-0"
              >
                {/* Cabecera del Servicio */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <h3 className="font-titular text-xs font-bold text-verde-profundo uppercase tracking-wider">
                      {col.label}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-carbon/50 bg-slate-100 border border-carbon/10 px-2 py-0.5 rounded-full">
                    {lista.length} expedientes
                  </span>
                </div>

                {/* Carrusel/Desplazador Horizontal de Expedientes */}
                <div className="flex flex-row gap-3 overflow-x-auto pb-3 pt-1 pr-1 scrollbar-sutil">
                  {lista.length === 0 ? (
                    <div className="w-full text-center py-6 text-xs text-carbon/40 italic bg-slate-50 rounded-xl border border-dashed border-carbon/10">
                      No hay expedientes activos en este servicio.
                    </div>
                  ) : (
                    lista.map((e) => {
                      const isCita = e.proximaAccionTipo === "cita";
                      const isTarea = e.proximaAccionTipo === "tarea";

                      return (
                        <div 
                          key={e.id} 
                          className={`w-[290px] sm:w-[330px] flex-shrink-0 rounded-xl border p-3.5 flex flex-col justify-between gap-3 bg-white shadow-xs transition-all hover:shadow-md hover:border-sauce/30 ${
                            isCita 
                              ? "border-emerald-200 bg-emerald-50/[0.04]" 
                              : isTarea 
                                ? "border-amber-200 bg-amber-50/[0.04]" 
                                : "border-carbon/10"
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-1 flex-wrap">
                              <Link 
                                href={`/expediente/${e.id}`}
                                className="font-titular font-bold text-xs text-carbon hover:underline hover:text-sauce line-clamp-1"
                                title={e.clienteNombre}
                              >
                                {e.clienteNombre}
                              </Link>
                              <span className="font-mono text-[9px] text-carbon/30">{e.id}</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-carbon/60 max-w-[130px] truncate" title={e.fraccionamiento}>
                                📍 {e.fraccionamiento}
                              </span>
                              <span className="inline-block rounded-full bg-sauce/15 px-1.5 py-0.5 text-[8px] font-bold text-sauce uppercase">
                                {e.etapa}
                              </span>
                            </div>
                          </div>

                          {/* Caja de Próxima Acción */}
                          <div className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
                            isCita
                              ? "bg-emerald-50 border-emerald-200/50 text-emerald-900"
                              : isTarea
                                ? "bg-amber-50 border-amber-200/50 text-amber-900"
                                : "bg-slate-50 border-carbon/5 text-carbon/60"
                          }`}>
                            <div className="text-[8px] uppercase tracking-wider font-bold text-carbon/40 mb-0.5">
                              Próxima Acción / Pendiente
                            </div>
                            <div className="font-bold">
                              {e.proximaAccion}
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[8px] text-carbon/40 pt-2 border-t border-carbon/5">
                            <span>Ingreso: {new Date(e.fechaCreacion).toLocaleDateString()}</span>
                            <Link
                              href={`/expediente/${e.id}`}
                              className="font-bold text-sauce hover:underline uppercase"
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
    </div>
  );
}
