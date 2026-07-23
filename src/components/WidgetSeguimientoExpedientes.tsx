"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { obtenerExpedientesSeguimiento, type ExpedienteSeguimiento } from "@/app/actions/expedientes";

export function WidgetSeguimientoExpedientes() {
  const [expedientes, setExpedientes] = useState<ExpedienteSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroAccion, setFiltroAccion] = useState("todos");

  useEffect(() => {
    obtenerExpedientesSeguimiento()
      .then((data) => setExpedientes(data))
      .catch((err) => console.error("Error al obtener expedientes para seguimiento:", err))
      .finally(() => setCargando(false));
  }, []);

  const expedientesFiltrados = useMemo(() => {
    return expedientes.filter((e) => {
      const coincideBusqueda = 
        e.id.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.clienteNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.fraccionamiento.toLowerCase().includes(busqueda.toLowerCase());

      const coincideTipo = filtroTipo === "todos" || e.tipoNegocio.toLowerCase().includes(filtroTipo.toLowerCase());

      const coincideAccion = 
        filtroAccion === "todos" ||
        (filtroAccion === "pendiente" && e.proximaAccionTipo !== "ninguno") ||
        (filtroAccion === "sin_tareas" && e.proximaAccionTipo === "ninguno");

      return coincideBusqueda && coincideTipo && coincideAccion;
    });
  }, [expedientes, busqueda, filtroTipo, filtroAccion]);

  // Group expedientes by business type
  const agrupadosPorTipo = useMemo(() => {
    const grupos: Record<string, ExpedienteSeguimiento[]> = {};
    expedientesFiltrados.forEach((e) => {
      const tipo = e.tipoNegocio;
      if (!grupos[tipo]) grupos[tipo] = [];
      grupos[tipo].push(e);
    });
    return grupos;
  }, [expedientesFiltrados]);

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="font-titular text-lg font-semibold text-verde-profundo flex items-center gap-1.5">
            📋 Monitoreo & Seguimiento de Expedientes
          </h2>
          <p className="text-xs text-carbon/50">
            Control de obras, trámites y traspasos con sus próximas acciones pendientes
          </p>
        </div>
        <div className="text-xs text-carbon/40 font-mono">
          Total activos: <strong>{expedientes.filter(x => x.etapa !== "perdido" && x.etapa !== "venta").length}</strong>
        </div>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por ID, cliente o zona..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
        />
        
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
        >
          <option value="todos">Todos los negocios</option>
          <option value="Traspaso">Traspaso / Compra</option>
          <option value="Venta">Promoción de Venta</option>
          <option value="Trámite">Solo Trámite</option>
          <option value="Obra">Construcción / Obra</option>
        </select>

        <select
          value={filtroAccion}
          onChange={(e) => setFiltroAccion(e.target.value)}
          className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-sauce"
        >
          <option value="todos">Todas las acciones</option>
          <option value="pendiente">Con cita o tarea pendiente</option>
          <option value="sin_tareas">Sin tareas agendadas</option>
        </select>
      </div>

      {cargando ? (
        <div className="py-8 text-center text-xs text-carbon/40 font-medium">
          Cargando expedientes y próximos pendientes...
        </div>
      ) : expedientesFiltrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-8 text-center text-xs text-carbon/40 font-medium bg-slate-50/50">
          No se encontraron expedientes con los criterios seleccionados.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(agrupadosPorTipo).map(([grupoNombre, lista]) => (
            <div key={grupoNombre} className="space-y-2">
              {/* Encabezado del grupo */}
              <h3 className="text-xs font-bold text-verde-profundo uppercase tracking-wider bg-slate-100/60 p-2 rounded-lg flex items-center justify-between">
                <span>📁 {grupoNombre}</span>
                <span className="font-mono text-[10px] text-carbon/50 bg-white border px-2 py-0.5 rounded-full">{lista.length}</span>
              </h3>

              {/* Lista del grupo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lista.map((e) => {
                  const isCita = e.proximaAccionTipo === "cita";
                  const isTarea = e.proximaAccionTipo === "tarea";
                  const isNinguna = e.proximaAccionTipo === "ninguno";

                  return (
                    <div 
                      key={e.id} 
                      className="rounded-xl border border-carbon/10 bg-white p-3.5 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md hover:border-sauce/30 transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <Link 
                            href={`/expediente/${e.id}`}
                            className="font-titular font-bold text-sm text-verde-profundo hover:underline hover:text-sauce"
                          >
                            {e.clienteNombre}
                          </Link>
                          <span className="font-mono text-[10px] text-carbon/40">{e.id}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-carbon/60 uppercase">
                            📍 {e.fraccionamiento}
                          </span>
                          <span className="inline-block rounded-full bg-sauce/15 px-2.5 py-0.5 text-[9px] font-bold text-sauce uppercase">
                            {e.etapa}
                          </span>
                        </div>
                      </div>

                      {/* Caja de Próxima Acción */}
                      <div className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                        isCita
                          ? "bg-emerald-50/50 border-emerald-100 text-emerald-800"
                          : isTarea
                            ? "bg-amber-50/50 border-amber-100 text-amber-800"
                            : "bg-slate-50 border-carbon/5 text-carbon/70"
                      }`}>
                        <div className="text-[9px] uppercase tracking-wider font-bold text-carbon/40">
                          Próximo Pendiente
                        </div>
                        <div className="font-medium truncate leading-relaxed">
                          {e.proximaAccion}
                        </div>
                        
                        {e.proximaAccionFecha && (
                          <div className="text-[10px] text-carbon/40 font-mono mt-0.5">
                            Fecha: {new Date(e.proximaAccionFecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-carbon/40 pt-1 border-t border-carbon/5">
                        <span>Creado: {new Date(e.fechaCreacion).toLocaleDateString()}</span>
                        <Link
                          href={`/expediente/${e.id}`}
                          className="font-bold text-sauce hover:underline"
                        >
                          Ver Expediente →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
