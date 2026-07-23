"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { obtenerExpedientesSeguimiento, type ExpedienteSeguimiento } from "@/app/actions/expedientes";

export function WidgetSeguimientoExpedientes() {
  const [expedientes, setExpedientes] = useState<ExpedienteSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("todos");

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

  // Configuración de las 4 columnas principales horizontales
  const columnasConfig = [
    { key: "Traspaso / Compra Directa", label: "Traspaso / Compra", icon: "💰", color: "border-t-emerald-500" },
    { key: "Promoción de Venta", label: "Promoción de Venta", icon: "📢", color: "border-t-sky-500" },
    { key: "Solo Trámite", label: "Solo Trámite", icon: "📄", color: "border-t-indigo-500" },
    { key: "Construcción / Obra", label: "Construcción / Obra", icon: "🏗️", color: "border-t-amber-500" },
  ];

  // Algoritmo de ordenación: Citas (Inspecciones/Instalaciones) primero > Tareas del Asesor después > Sin tareas al final.
  // Dentro del mismo peso, se ordena por fecha de acción ascendente (más urgentes arriba).
  const ordenarExpedientes = (lista: ExpedienteSeguimiento[]) => {
    return [...lista].sort((a, b) => {
      // Peso de tipo de acción
      const pesoA = a.proximaAccionTipo === "cita" ? 2 : (a.proximaAccionTipo === "tarea" ? 1 : 0);
      const pesoB = b.proximaAccionTipo === "cita" ? 2 : (b.proximaAccionTipo === "tarea" ? 1 : 0);

      if (pesoA !== pesoB) {
        return pesoB - pesoA; // mayor prioridad primero
      }

      // Si ambos tienen una cita o tarea agendada, ordenar por fecha (más próxima arriba)
      if (a.proximaAccionFecha && b.proximaAccionFecha) {
        return new Date(a.proximaAccionFecha).getTime() - new Date(b.proximaAccionFecha).getTime();
      }

      // Si ninguno tiene pendientes programados, ordenar por fecha de ingreso al sistema descendente (más nuevos arriba)
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

    // Ordenar cada grupo por su prioridad y fecha
    Object.keys(mapa).forEach((key) => {
      mapa[key] = ordenarExpedientes(mapa[key]);
    });

    return mapa;
  }, [expedientesFiltrados]);

  // Verificar si hay registros en la columna "Otros"
  const mostrarOtros = agrupados["Otros"] && agrupados["Otros"].length > 0;

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="font-titular text-lg font-semibold text-verde-profundo flex items-center gap-1.5">
            📋 Monitoreo & Seguimiento de Expedientes
          </h2>
          <p className="text-xs text-carbon/50">
            Clasificación horizontal por Tipo de Negocio con priorización de pendientes y citas críticas arriba
          </p>
        </div>
        <div className="text-xs text-carbon/40 font-mono">
          Total activos: <strong>{expedientes.filter(x => x.etapa !== "perdido" && x.etapa !== "venta").length}</strong>
        </div>
      </div>

      {/* Filtros de Búsqueda y Acción */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por cliente, ID o zona..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
        />

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

      {cargando ? (
        <div className="py-12 text-center text-xs text-carbon/40 font-medium animate-pulse">
          Cargando expedientes y próximos pendientes...
        </div>
      ) : expedientesFiltrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-8 text-center text-xs text-carbon/40 font-medium bg-slate-50/50">
          No se encontraron expedientes con los criterios seleccionados.
        </div>
      ) : (
        /* Acomodo Horizontal Kanban */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start pb-4">
          {columnasConfig.map((col) => {
            const lista = agrupados[col.key] || [];
            return (
              <div 
                key={col.key} 
                className={`rounded-xl border border-carbon/10 bg-slate-50/60 p-3 flex flex-col gap-3 min-h-[480px] border-t-4 ${col.color}`}
              >
                {/* Cabecera de Columna */}
                <div className="flex items-center justify-between border-b border-carbon/5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{col.icon}</span>
                    <span className="font-titular text-xs font-bold text-carbon/80 uppercase tracking-wider">
                      {col.label}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-carbon/50 bg-white border border-carbon/10 px-2 py-0.5 rounded-full">
                    {lista.length}
                  </span>
                </div>

                {/* Tarjetas Verticales */}
                <div className="flex flex-col gap-2.5 max-h-[580px] overflow-y-auto pr-1 scrollbar-sutil">
                  {lista.length === 0 ? (
                    <div className="text-center py-10 text-[10px] text-carbon/40 italic">
                      Sin expedientes activos
                    </div>
                  ) : (
                    lista.map((e) => {
                      const isCita = e.proximaAccionTipo === "cita";
                      const isTarea = e.proximaAccionTipo === "tarea";

                      return (
                        <div 
                          key={e.id} 
                          className={`rounded-xl border p-3 flex flex-col gap-2.5 bg-white shadow-xs transition-all hover:shadow-md hover:border-sauce/30 ${
                            isCita 
                              ? "border-emerald-200/60 bg-emerald-50/[0.08]" 
                              : isTarea 
                                ? "border-amber-200/60 bg-amber-50/[0.08]" 
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
                            
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-carbon/60 max-w-[120px] truncate" title={e.fraccionamiento}>
                                📍 {e.fraccionamiento}
                              </span>
                              <span className="inline-block rounded-full bg-sauce/15 px-1.5 py-0.5 text-[8px] font-bold text-sauce uppercase">
                                {e.etapa}
                              </span>
                            </div>
                          </div>

                          {/* Caja de Próxima Acción */}
                          <div className={`p-2 rounded-lg border text-[11px] leading-snug ${
                            isCita
                              ? "bg-emerald-50 border-emerald-200/70 text-emerald-900"
                              : isTarea
                                ? "bg-amber-50 border-amber-200/70 text-amber-900"
                                : "bg-slate-50 border-carbon/5 text-carbon/60"
                          }`}>
                            <div className="text-[8px] uppercase tracking-wider font-bold text-carbon/40 mb-0.5">
                              Próxima Acción / Pendiente
                            </div>
                            <div className="font-semibold">
                              {e.proximaAccion}
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[8px] text-carbon/40 pt-1.5 border-t border-carbon/5">
                            <span>Ingreso: {new Date(e.fechaCreacion).toLocaleDateString()}</span>
                            <Link
                              href={`/expediente/${e.id}`}
                              className="font-bold text-sauce hover:underline uppercase"
                            >
                              Ver →
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
