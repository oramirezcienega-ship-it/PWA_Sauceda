"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { BotonLlamar } from "@/components/BotonLlamar";
import { labelTipoNegocio } from "@/lib/types";

interface LeadDashboard {
  id: string;
  nombre: string;
  telefono: string;
  estatus: string;
  calificacion: string;
  fechaAsignacion: string;
  expedienteId?: string;
  fraccionamiento?: string;
  etapaExpediente?: string;
  notasExpediente?: string;
  tipoNegocio?: string | null;
}

interface ListadoLeadsDashboardProps {
  leadsIniciales: LeadDashboard[];
}

export function ListadoLeadsDashboard({ leadsIniciales }: ListadoLeadsDashboardProps) {
  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("activos"); // 'activos' por defecto
  const [filtroCalificacion, setFiltroCalificacion] = useState("todos");
  const [filtroFraccionamiento, setFiltroFraccionamiento] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Obtener fraccionamientos únicos para el dropdown
  const fraccionamientos = useMemo(() => {
    const lista = leadsIniciales
      .map((l) => l.fraccionamiento?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(lista)).sort();
  }, [leadsIniciales]);

  // Filtrado de leads
  const leadsFiltrados = useMemo(() => {
    return leadsIniciales.filter((l) => {
      // 1. Filtro por búsqueda de texto (Nombre o Teléfono)
      if (busqueda) {
        const query = busqueda.toLowerCase();
        const cumpleNombre = l.nombre.toLowerCase().includes(query);
        const cumpleTel = l.telefono.includes(query);
        if (!cumpleNombre && !cumpleTel) return false;
      }

      // 2. Filtro por Estatus
      if (filtroEstatus === "activos") {
        // Excluir "no viable" y "perdido"
        if (l.estatus === "no_viable" || l.etapaExpediente === "perdido") return false;
      } else if (filtroEstatus !== "todos") {
        if (l.estatus !== filtroEstatus) return false;
      }

      // 3. Filtro por Calificación
      if (filtroCalificacion !== "todos") {
        if (l.calificacion !== filtroCalificacion) return false;
      }

      // 4. Filtro por Fraccionamiento
      if (filtroFraccionamiento !== "todos") {
        if (l.fraccionamiento !== filtroFraccionamiento) return false;
      }

      // 5. Filtro por Rango de Fechas (fechaAsignacion)
      if (l.fechaAsignacion) {
        const fechaLead = new Date(l.fechaAsignacion).getTime();

        if (fechaDesde) {
          const limiteDesde = new Date(`${fechaDesde}T00:00:00`).getTime();
          if (fechaLead < limiteDesde) return false;
        }

        if (fechaHasta) {
          const limiteHasta = new Date(`${fechaHasta}T23:59:59`).getTime();
          if (fechaLead > limiteHasta) return false;
        }
      } else if (fechaDesde || fechaHasta) {
        // Si no tiene fecha pero el usuario filtró por fecha, lo ocultamos
        return false;
      }

      return true;
    });
  }, [leadsIniciales, busqueda, filtroEstatus, filtroCalificacion, filtroFraccionamiento, fechaDesde, fechaHasta]);

  const tieneFiltrosActivos =
    busqueda !== "" ||
    filtroEstatus !== "activos" ||
    filtroCalificacion !== "todos" ||
    filtroFraccionamiento !== "todos" ||
    fechaDesde !== "" ||
    fechaHasta !== "";

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstatus("activos");
    setFiltroCalificacion("todos");
    setFiltroFraccionamiento("todos");
    setFechaDesde("");
    setFechaHasta("");
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros */}
      <div className="rounded-xl border border-carbon/10 bg-carbon/[0.02] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Búsqueda */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Buscar</label>
            <input
              type="text"
              placeholder="Nombre o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-carbon placeholder-carbon/40 focus:border-sauce focus:outline-none"
            />
          </div>

          {/* Estatus */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Estatus</label>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2.5 py-1.5 text-xs text-carbon focus:border-sauce focus:outline-none"
            >
              <option value="activos">Activos (Sin Perdidos)</option>
              <option value="todos">Todos los estatus</option>
              <option value="nuevo">Nuevo</option>
              <option value="en_conversacion">En conversación</option>
              <option value="expediente_abierto">Expediente abierto</option>
              <option value="cliente">Cliente</option>
              <option value="no_viable">No viable (Perdido)</option>
              <option value="sin_contacto">Sin contacto</option>
            </select>
          </div>

          {/* Calificación */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Calificación</label>
            <select
              value={filtroCalificacion}
              onChange={(e) => setFiltroCalificacion(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2.5 py-1.5 text-xs text-carbon focus:border-sauce focus:outline-none"
            >
              <option value="todos">Todas</option>
              <option value="caliente">Caliente</option>
              <option value="templado">Templado</option>
              <option value="frio">Frío</option>
              <option value="descalificado">Descalificado</option>
            </select>
          </div>

          {/* Fraccionamiento */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Fraccionamiento</label>
            <select
              value={filtroFraccionamiento}
              onChange={(e) => setFiltroFraccionamiento(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2.5 py-1.5 text-xs text-carbon focus:border-sauce focus:outline-none"
            >
              <option value="todos">Todos</option>
              {fraccionamientos.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Desde fecha</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">Hasta fecha</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
            />
          </div>
        </div>

        {/* Botón de limpiar filtros */}
        {tieneFiltrosActivos && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={limpiarFiltros}
              className="text-xs font-semibold text-rojo hover:underline focus:outline-none"
            >
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla con resultados */}
      {leadsFiltrados.length === 0 ? (
        <div className="py-12 text-center border border-carbon/10 rounded-xl bg-white">
          <p className="text-sm text-carbon/40 font-medium">No se encontraron leads con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-carbon/10 text-xs font-semibold uppercase tracking-wider text-carbon/40">
                <th className="pb-3">Nombre / Contacto</th>
                <th className="pb-3">Detalle Expediente</th>
                <th className="pb-3">Tipo de Negocio</th>
                <th className="pb-3">Calificación</th>
                <th className="pb-3">Estatus</th>
                <th className="pb-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon/5 text-sm">
              {leadsFiltrados.map((l) => (
                <tr key={l.id} className="hover:bg-carbon/[0.01] transition align-top">
                  <td className="py-4 font-medium text-carbon align-top">
                    <div>{l.nombre}</div>
                    {l.telefono && (
                      <div className="text-xs text-carbon/40 font-mono mt-0.5">{l.telefono}</div>
                    )}
                    {l.fechaAsignacion && (
                      <div className="text-[10px] text-carbon/30 mt-1">
                        Asignado: {new Date(l.fechaAsignacion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </td>
                  <td className="py-4 text-xs align-top">
                    {l.expedienteId ? (
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/expediente/${l.expedienteId}`}
                          className="font-bold font-mono text-sauce hover:underline flex items-center gap-1 text-sm"
                        >
                          📁 {l.expedienteId}
                        </Link>
                        <span className="text-[11px] text-carbon/60">
                          🏠 {l.fraccionamiento || "Sin fraccionamiento"}
                        </span>
                        {l.etapaExpediente && (
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded self-start mt-0.5 ${
                            l.etapaExpediente === "perdido" ? "bg-rojo/10 text-rojo" :
                            l.etapaExpediente === "cerrado" ? "bg-verde-profundo/10 text-verde-profundo" :
                            "bg-[#3b667e]/10 text-[#3b667e]"
                          }`}>
                            {l.etapaExpediente}
                          </span>
                        )}
                        {l.notasExpediente && (
                          <span className="text-[10px] text-carbon/50 italic block max-w-[220px] whitespace-pre-wrap mt-0.5" title={l.notasExpediente}>
                            {l.notasExpediente}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-carbon/30 italic">Sin expediente enlazado</span>
                    )}
                  </td>
                  <td className="py-4 align-top text-xs text-carbon/80">
                    {l.tipoNegocio ? (
                      <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-2.5 py-0.5 font-semibold text-sauce">
                        {labelTipoNegocio(l.tipoNegocio)}
                      </span>
                    ) : (
                      <span className="text-carbon/30 italic">No definido</span>
                    )}
                  </td>
                  <td className="py-4 align-top">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                      l.calificacion === "caliente" ? "bg-rojoLuz text-rojo" :
                      l.calificacion === "templado" ? "bg-dorado/20 text-[#B8860B]" :
                      l.calificacion === "frio" ? "bg-carbon/5 text-carbon/60" :
                      l.calificacion === "descalificado" ? "bg-carbon/10 text-carbon/50" :
                      "bg-carbon/10 text-carbon/40"
                    }`}>
                      {l.calificacion}
                    </span>
                  </td>
                  <td className="py-4 align-top">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      l.estatus === "cliente" ? "bg-verdeLuz text-verde-profundo" :
                      l.estatus === "expediente_abierto" ? "bg-cielo/15 text-[#3b667e]" :
                      l.estatus === "en_conversacion" ? "bg-amber-100 text-amber-800" :
                      l.estatus === "nuevo" ? "bg-verde-profundo/10 text-verde-profundo" :
                      l.estatus === "no_viable" ? "bg-carbon/10 text-carbon/50" :
                      "bg-carbon/10 text-carbon/50"
                    }`}>
                      {l.estatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-4 text-right align-top">
                    <div className="flex items-center justify-end gap-2 flex-wrap md:flex-nowrap">
                      {l.telefono ? (
                        <>
                          <BotonLlamar
                            telefono={l.telefono}
                            prospectoId={l.id.startsWith("exp-") ? null : l.id}
                          />
                          <Link
                            href={`/conversaciones?tel=${l.telefono}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                            title="WhatsApp Web CRM"
                          >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WhatsApp
                          </Link>
                        </>
                      ) : (
                        <span className="text-xs text-carbon/30 italic">Sin número</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
