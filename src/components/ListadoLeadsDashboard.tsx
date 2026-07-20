"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BotonLlamar } from "@/components/BotonLlamar";
import { labelTipoNegocio } from "@/lib/types";

interface LeadDashboard {
  id: string;
  nombre: string;
  telefono: string;
  estatus: string;
  calificacion: string;
  fechaAsignacion: string;
  fechaCreacion?: string | null;
  ventanaAbierta?: boolean;
  expedienteId?: string;
  fraccionamiento?: string;
  etapaExpediente?: string;
  notasExpediente?: string;
  tipoNegocio?: string | null;
}

interface ListadoLeadsDashboardProps {
  leadsIniciales: LeadDashboard[];
}

import { ProximasVisitasWidget } from "@/components/ProximasVisitasWidget";

export function ListadoLeadsDashboard({ leadsIniciales }: ListadoLeadsDashboardProps) {
  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("activos"); // 'activos' por defecto
  const [filtroCalificacion, setFiltroCalificacion] = useState("todos");
  const [filtroFraccionamiento, setFiltroFraccionamiento] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const router = useRouter();

  // Notas
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [notaTemp, setNotaTemp] = useState<string>("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [escuchandoId, setEscuchandoId] = useState<string | null>(null);
  const [verTodasId, setVerTodasId] = useState<string | null>(null);

  function iniciarDictado(id: string) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("El dictado por voz no es compatible con este navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setEscuchandoId(id);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNotaTemp((prev) => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setEscuchandoId(null);
    };

    recognition.onend = () => {
      setEscuchandoId(null);
    };

    recognition.start();
  }

  // Expandir filtros automáticamente en desktop al montar
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setMostrarFiltros(true);
    }
  }, []);

  const filtrosActivosCount = useMemo(() => {
    let count = 0;
    if (busqueda) count++;
    if (filtroEstatus !== "activos") count++;
    if (filtroCalificacion !== "todos") count++;
    if (filtroFraccionamiento !== "todos") count++;
    if (fechaDesde) count++;
    if (fechaHasta) count++;
    return count;
  }, [busqueda, filtroEstatus, filtroCalificacion, filtroFraccionamiento, fechaDesde, fechaHasta]);

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
      {/* Widget de Próximas Visitas e Instalaciones */}
      <ProximasVisitasWidget />

      {/* Botón para contraer/expandir filtros */}
      <div className="flex items-center justify-between bg-white border border-carbon/10 rounded-xl p-3 shadow-sm shrink-0">
        <button
          type="button"
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className="inline-flex items-center gap-2 rounded-lg border border-carbon/15 bg-white px-3.5 py-1.5 text-xs font-bold text-carbon transition hover:bg-carbon/[0.02] focus:outline-none"
        >
          <span>{mostrarFiltros ? "▲ Ocultar Filtros" : "▼ Mostrar Filtros"}</span>
          {filtrosActivosCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sauce text-[10px] font-bold text-crema leading-none">
              {filtrosActivosCount}
            </span>
          )}
        </button>

        {tieneFiltrosActivos && (
          <button
            onClick={limpiarFiltros}
            className="text-xs font-bold text-rojo hover:underline focus:outline-none"
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Barra de Filtros (Colapsable) */}
      {mostrarFiltros && (
        <div className="rounded-xl border border-carbon/10 bg-carbon/[0.02] p-4 transition-all duration-300">
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
        </div>
      )}

      {/* Tabla con resultados */}
      {leadsFiltrados.length === 0 ? (
        <div className="py-12 text-center border border-carbon/10 rounded-xl bg-white">
          <p className="text-sm text-carbon/40 font-medium">No se encontraron leads con los filtros seleccionados.</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
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
                    {(l.fechaCreacion || l.fechaAsignacion) && (
                      <div className="text-[10px] text-carbon/30 mt-1">
                        Creado: {new Date(l.fechaCreacion || l.fechaAsignacion).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false
                        })}
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
                          {l.ventanaAbierta ? (
                            <Link
                              href={`/conversaciones?tel=${l.telefono}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                              title="WhatsApp Web CRM"
                            >
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.459 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                              </svg>
                              WhatsApp
                            </Link>
                          ) : (
                            <button
                              disabled
                              className="inline-flex items-center gap-1.5 rounded-lg border border-carbon/15 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-carbon/40 cursor-not-allowed opacity-60"
                              title="Ventana de 24h cerrada - No se puede contactar"
                            >
                              <svg className="h-3.5 w-3.5 text-carbon/30" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.459 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                              </svg>
                              WhatsApp
                            </button>
                          )}
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

        {/* Vista de tarjetas para Móvil */}
        <div className="block md:hidden space-y-3">
          {leadsFiltrados.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm space-y-3"
            >
              {/* Encabezado: Nombre y Calificación */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-titular font-bold text-verde-profundo text-base leading-tight">
                    {l.nombre}
                  </h3>
                  {l.telefono && (
                    <span className="font-mono text-xs text-carbon/40 mt-0.5 block">
                      {l.telefono}
                    </span>
                  )}
                  {(l.fechaCreacion || l.fechaAsignacion) && (
                    <span className="text-[10px] text-carbon/30 block mt-0.5">
                      Creado: {new Date(l.fechaCreacion || l.fechaAsignacion).toLocaleString("es-MX", {
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {l.expedienteId && (
                    <Link
                      href={`/expediente/${l.expedienteId}/editar`}
                      className="text-[10px] font-bold text-sauce hover:underline flex items-center gap-0.5 mb-0.5"
                      title="Editar expediente"
                    >
                      ✏️ Editar
                    </Link>
                  )}
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-bold uppercase ${
                    l.calificacion === "caliente" ? "bg-rojoLuz text-rojo" :
                    l.calificacion === "templado" ? "bg-dorado/20 text-[#B8860B]" :
                    l.calificacion === "frio" ? "bg-carbon/5 text-carbon/60" :
                    l.calificacion === "descalificado" ? "bg-carbon/10 text-carbon/50" :
                    "bg-carbon/10 text-carbon/40"
                  }`}>
                    {l.calificacion}
                  </span>
                </div>
              </div>

              {/* Contenido: Detalle Expediente, Tipo de Negocio y Estatus */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs border-t border-carbon/5 pt-3">
                {/* Expediente */}
                <div className="col-span-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-carbon/45 block">
                    Expediente
                  </span>
                  {l.expedienteId ? (
                    <div className="mt-1">
                      <Link
                        href={`/expediente/${l.expedienteId}`}
                        className="font-bold font-mono text-sauce hover:underline flex items-center gap-1"
                      >
                        📁 {l.expedienteId}
                      </Link>
                      <span className="text-[10px] text-carbon/60 block mt-0.5 truncate">
                        🏠 {l.fraccionamiento || "Sin fracc."}
                      </span>
                    </div>
                  ) : (
                    <span className="text-carbon/35 italic block mt-1">Sin expediente</span>
                  )}
                </div>

                {/* Estatus */}
                <div className="col-span-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-carbon/45 block">
                    Estatus
                  </span>
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold mt-1.5 ${
                    l.estatus === "cliente" ? "bg-verdeLuz text-verde-profundo" :
                    l.estatus === "expediente_abierto" ? "bg-cielo/15 text-[#3b667e]" :
                    l.estatus === "en_conversacion" ? "bg-amber-100 text-amber-800" :
                    l.estatus === "nuevo" ? "bg-verde-profundo/10 text-verde-profundo" :
                    l.estatus === "no_viable" ? "bg-carbon/10 text-carbon/50" :
                    "bg-carbon/10 text-carbon/50"
                  }`}>
                    {l.estatus.replace("_", " ")}
                  </span>
                </div>

                {/* Tipo de Negocio */}
                <div className="col-span-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-carbon/45 block">
                    Tipo de Negocio
                  </span>
                  <div className="mt-1">
                    {l.tipoNegocio ? (
                      <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-2.5 py-0.5 font-bold text-[9px] text-sauce">
                        {labelTipoNegocio(l.tipoNegocio)}
                      </span>
                    ) : (
                      <span className="text-carbon/35 italic text-[10px]">No definido</span>
                    )}
                  </div>
                </div>

                {/* Notas de Expediente */}
                {l.expedienteId && (() => {
                  const notasList = l.notasExpediente ? l.notasExpediente.split("\n\n").filter(Boolean) : [];
                  return (
                    <div className="col-span-2 bg-crema/25 p-2.5 rounded-lg border border-carbon/5 relative">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-carbon/45 block">
                          Notas del Expediente
                        </span>
                        {editandoNotaId !== l.expedienteId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoNotaId(l.expedienteId!);
                              setNotaTemp(""); // Empezamos en blanco para la nueva nota
                            }}
                            className="text-[9px] font-bold text-sauce hover:underline flex items-center gap-0.5"
                          >
                            ➕ Agregar nota
                          </button>
                        )}
                      </div>

                      {editandoNotaId === l.expedienteId ? (
                        /* Modo Edición / Escritura de nota */
                        <div className="space-y-1.5 mt-1">
                          <div className="relative">
                            <textarea
                              rows={2}
                              value={notaTemp}
                              onChange={(e) => setNotaTemp(e.target.value)}
                              placeholder="Escribe la nueva nota aquí..."
                              disabled={guardandoNota}
                              className="w-full rounded border border-carbon/25 p-1 pr-7 text-[10px] text-carbon outline-none resize-none bg-white focus:border-sauce"
                            />
                            <button
                              type="button"
                              disabled={guardandoNota}
                              onClick={() => iniciarDictado(l.expedienteId!)}
                              className={`absolute right-1.5 top-1.5 p-1 rounded-full transition ${
                                escuchandoId === l.expedienteId
                                  ? "bg-rojo/10 text-rojo animate-pulse"
                                  : "text-carbon/40 hover:bg-carbon/5 hover:text-sauce"
                              }`}
                              title="Dictar por voz"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                              </svg>
                            </button>
                          </div>
                          
                          {escuchandoId === l.expedienteId && (
                            <p className="text-[9px] text-rojo font-semibold animate-pulse flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-rojo"></span>
                              Escuchando voz... hable ahora.
                            </p>
                          )}

                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={guardandoNota}
                              onClick={() => setEditandoNotaId(null)}
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold text-carbon/50 hover:bg-carbon/5"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={guardandoNota || !notaTemp.trim()}
                              onClick={async () => {
                                if (!l.expedienteId || !notaTemp.trim()) return;
                                setGuardandoNota(true);
                                try {
                                  const { guardarNotaExpediente } = await import("@/app/actions/expedientes");
                                  await guardarNotaExpediente(l.expedienteId, notaTemp);
                                  
                                  // Actualizar localmente la nota prependiéndola para respuesta inmediata
                                  const { obtenerUsuarioActual } = await import("@/app/actions/usuarios");
                                  const user = await obtenerUsuarioActual();
                                  const name = user?.nombre || "Asesor";
                                  const dateStr = new Date().toLocaleString("es-MX", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: false
                                  });
                                  const header = `[${dateStr} - ${name}]`;
                                  const newFullText = `${header}\n${notaTemp.trim()}${l.notasExpediente ? `\n\n${l.notasExpediente}` : ""}`;
                                  l.notasExpediente = newFullText;
                                  
                                  setEditandoNotaId(null);
                                  router.refresh();
                                } catch (err) {
                                  console.error("Error al guardar nota:", err);
                                  alert("No se pudo guardar la nota.");
                                } finally {
                                  setGuardandoNota(false);
                                }
                              }}
                              className="rounded bg-sauce px-2 py-0.5 text-[9px] font-bold text-crema hover:bg-verde-profundo disabled:opacity-55"
                            >
                              {guardandoNota ? "Guardando..." : "Guardar"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Modo Visualización (Historial / Última nota) */
                        <div className="space-y-1.5">
                          {notasList.length > 0 ? (
                            <>
                              {/* Renderizar según verTodasId */}
                              {(verTodasId === l.expedienteId ? notasList : [notasList[0]]).map((nota, nIdx) => (
                                <div key={nIdx} className="text-[10px] text-carbon/75 border-l-2 border-sauce/30 pl-2 py-0.5 leading-tight">
                                  <p className="whitespace-pre-wrap">{nota}</p>
                                </div>
                              ))}
                              
                              {/* Toggle para ver historial completo */}
                              {notasList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setVerTodasId(verTodasId === l.expedienteId ? null : l.expedienteId!)}
                                  className="text-[9px] font-bold text-sauce hover:underline block mt-1"
                                >
                                  {verTodasId === l.expedienteId
                                    ? "▲ Ocultar historial"
                                    : `▼ Ver historial de notas (${notasList.length})`}
                                </button>
                              )}
                            </>
                          ) : (
                            <p className="text-[10px] text-carbon/40 italic whitespace-pre-wrap leading-tight mt-0.5">
                              Sin notas registradas. Toca en agregar nota para añadir comentarios.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-end gap-2 border-t border-carbon/5 pt-3">
                {l.telefono ? (
                  <>
                    <BotonLlamar
                      telefono={l.telefono}
                      prospectoId={l.id.startsWith("exp-") ? null : l.id}
                    />
                    {l.ventanaAbierta ? (
                      <Link
                        href={`/conversaciones?tel=${l.telefono}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                        title="WhatsApp Web CRM"
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.459 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-lg border border-carbon/15 bg-slate-50 px-3 py-1.5 text-xs font-bold text-carbon/40 cursor-not-allowed opacity-60"
                        title="Ventana de 24h cerrada - No se puede contactar"
                      >
                        <svg className="h-3.5 w-3.5 text-carbon/30" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.459 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-carbon/30 italic">Sin contacto</span>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
