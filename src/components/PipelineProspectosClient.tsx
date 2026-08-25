"use client";

import { useState, useMemo, DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Prospecto,
  Expediente,
  EstatusProspecto,
  EtapaId,
  CalificacionProspecto,
  OrigenAdquisicion,
} from "@/lib/types";
import { labelTipoNegocio } from "@/lib/types";
import { ESTATUS_PROSPECTO_LISTA } from "@/lib/estatus";
import { ETAPAS, PROBABILIDAD_POR_ETAPA } from "@/lib/etapas";
import { ORIGENES, ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import { cambiarEstatusMasivo } from "@/app/actions/prospectos";
import { moverEtapa } from "@/app/actions/expedientes";
import { programarCitaManual } from "@/app/actions/agenda";

interface Perfil {
  id: string;
  nombre: string;
  rol: string;
  activo?: boolean;
}

interface PipelineProspectosClientProps {
  prospectosIniciales: Prospecto[];
  expedientesIniciales?: Expediente[];
  perfiles: Perfil[];
}

interface ModalInspeccionData {
  prospectoId?: string | null;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  perfilId?: string | null;
}

export function PipelineProspectosClient({
  prospectosIniciales,
  expedientesIniciales = [],
  perfiles,
}: PipelineProspectosClientProps) {
  const router = useRouter();

  // Selector de Modo: Pipeline por Prospectos vs Pipeline por Expedientes
  const [tipoPipeline, setTipoPipeline] = useState<"prospectos" | "expedientes">("expedientes");

  // Estados locales para actualización optimista
  const [prospectos, setProspectos] = useState<Prospecto[]>(prospectosIniciales);
  const [expedientes, setExpedientes] = useState<Expediente[]>(expedientesIniciales);

  // Estados de filtrado
  const [busqueda, setBusqueda] = useState("");
  const [filtroCalificacion, setFiltroCalificacion] = useState<string>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<string>("todos");
  const [filtroAsesor, setFiltroAsesor] = useState<string>("todos");

  // Estados para Drag and Drop
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [columnaDestinoHover, setColumnaDestinoHover] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Estado para Modal de Programación de Inspección Técnica
  const [modalInspeccion, setModalInspeccion] = useState<ModalInspeccionData | null>(null);
  const [inspeccionPerfilId, setInspeccionPerfilId] = useState<string>("");
  const [inspeccionFecha, setInspeccionFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [inspeccionHoraInicio, setInspeccionHoraInicio] = useState<string>("10:00");
  const [inspeccionHoraFin, setInspeccionHoraFin] = useState<string>("11:00");
  const [inspeccionNotas, setInspeccionNotas] = useState<string>("");
  const [inspeccionNotificarWsp, setInspeccionNotificarWsp] = useState<boolean>(true);
  const [guardandoInspeccion, setGuardandoInspeccion] = useState<boolean>(false);

  function handleAbrirModalInspeccion(data: ModalInspeccionData) {
    setModalInspeccion(data);
    setInspeccionPerfilId(data.perfilId || (perfiles[0]?.id ?? ""));
    setInspeccionFecha(new Date().toISOString().slice(0, 10));
    setInspeccionHoraInicio("10:00");
    setInspeccionHoraFin("11:00");
    setInspeccionNotas("Inspección técnica en sitio programada desde el tablero comercial.");
    setInspeccionNotificarWsp(true);
  }

  async function handleGuardarInspeccion() {
    if (!modalInspeccion) return;
    if (!inspeccionFecha || !inspeccionHoraInicio || !inspeccionHoraFin) {
      alert("Por favor selecciona la fecha y franja horaria.");
      return;
    }
    if (!inspeccionPerfilId) {
      alert("Por favor selecciona al responsable de la inspección.");
      return;
    }

    setGuardandoInspeccion(true);
    try {
      const res = await programarCitaManual({
        prospectoId: modalInspeccion.prospectoId,
        expedienteId: modalInspeccion.expedienteId,
        perfilId: inspeccionPerfilId,
        clienteNombre: modalInspeccion.clienteNombre,
        clienteTelefono: modalInspeccion.clienteTelefono || "",
        tipoCita: "inspeccion",
        fecha: inspeccionFecha,
        horaInicio: inspeccionHoraInicio,
        horaFin: inspeccionHoraFin,
        notas: inspeccionNotas,
        notificarCliente: inspeccionNotificarWsp,
      });

      if (!res.ok) {
        alert("Error al agendar inspección: " + res.error);
        return;
      }

      alert(`¡Inspección técnica agendada con éxito para ${modalInspeccion.clienteNombre}!`);
      setModalInspeccion(null);
      router.refresh();
    } catch (err: any) {
      console.error("Error al agendar inspección:", err);
      alert("Error al agendar inspección: " + err.message);
    } finally {
      setGuardandoInspeccion(false);
    }
  }

  // Etapas para Prospectos
  const ETAPAS_PROSPECTO: { id: EstatusProspecto; nombre: string; descripcion: string }[] = [
    { id: "lead", nombre: "Lead", descripcion: "Captado recientemente" },
    { id: "mql", nombre: "MQL", descripcion: "En conversación" },
    { id: "sql", nombre: "SQL", descripcion: "Calificado / Expediente" },
    { id: "cliente", nombre: "Cerrado ganado", descripcion: "Cliente firmado / Ganado" },
    { id: "sin_contacto", nombre: "Sin contacto", descripcion: "Pendiente comunicación" },
    { id: "no_viable", nombre: "Cerrado perdido", descripcion: "Descartado / No viable" },
  ];

  // Aplicar filtros a Prospectos
  const prospectosFiltrados = useMemo(() => {
    return prospectos.filter((p) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincide =
          p.nombreCompleto.toLowerCase().includes(q) ||
          p.telefono.toLowerCase().includes(q) ||
          p.ciudad.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.notas.toLowerCase().includes(q);
        if (!coincide) return false;
      }
      if (filtroCalificacion !== "todos" && p.calificacion !== filtroCalificacion) return false;
      if (filtroOrigen !== "todos" && p.origen !== filtroOrigen) return false;
      if (filtroAsesor !== "todos") {
        if (filtroAsesor === "sin_asignar" && p.asesorId) return false;
        if (filtroAsesor !== "sin_asignar" && p.asesorId !== filtroAsesor) return false;
      }
      return true;
    });
  }, [prospectos, busqueda, filtroCalificacion, filtroOrigen, filtroAsesor]);

  // Funciones para ordenamiento descendente (de más reciente/nuevo a más antiguo)
  function obtenerTimestampProspecto(p: Prospecto): number {
    if (p.createdAt) {
      const t = new Date(p.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    const numId = parseInt(p.id.replace(/\D/g, ""), 10);
    return isNaN(numId) ? 0 : numId;
  }

  function obtenerTimestampExpediente(e: Expediente): number {
    if (e.ultimoMovimiento) {
      const t = new Date(e.ultimoMovimiento).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    const numId = parseInt(e.id.replace(/\D/g, ""), 10);
    return isNaN(numId) ? 0 : numId;
  }

  // Aplicar filtros a Expedientes
  const expedientesFiltrados = useMemo(() => {
    return expedientes.filter((e) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincide =
          e.nombreCompleto.toLowerCase().includes(q) ||
          e.telefono.toLowerCase().includes(q) ||
          e.fraccionamiento.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.situacion.toLowerCase().includes(q);
        if (!coincide) return false;
      }
      if (filtroAsesor !== "todos") {
        if (filtroAsesor === "sin_asignar" && e.asesorId) return false;
        if (filtroAsesor !== "sin_asignar" && e.asesorId !== filtroAsesor) return false;
      }
      return true;
    });
  }, [expedientes, busqueda, filtroAsesor]);

  // Handlers para Drag and Drop de Prospectos
  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setArrastrandoId(id);
  }

  function handleDragEnd() {
    setArrastrandoId(null);
    setColumnaDestinoHover(null);
  }

  function handleDragOver(e: DragEvent<HTMLElement>, columnaId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (columnaDestinoHover !== columnaId) {
      setColumnaDestinoHover(columnaId);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLElement>, columnaId: string) {
    e.preventDefault();
    if (columnaDestinoHover === columnaId) {
      setColumnaDestinoHover(null);
    }
  }

  async function handleDropProspecto(e: DragEvent<HTMLElement>, nuevaEtapa: EstatusProspecto) {
    e.preventDefault();
    setColumnaDestinoHover(null);
    const prospectoId = e.dataTransfer.getData("text/plain");
    if (!prospectoId) return;

    const pActual = prospectos.find((p) => p.id === prospectoId);
    if (!pActual || pActual.estatus === nuevaEtapa) return;

    // Actualización Optimista
    setProspectos((prev) =>
      prev.map((p) => (p.id === prospectoId ? { ...p, estatus: nuevaEtapa } : p)),
    );

    setGuardando(true);
    try {
      await cambiarEstatusMasivo([prospectoId], nuevaEtapa);
    } catch (err) {
      console.error("Error al actualizar estatus de prospecto:", err);
      setProspectos(prospectosIniciales);
      alert("No se pudo actualizar la etapa del prospecto.");
    } finally {
      setGuardando(false);
      setArrastrandoId(null);
    }
  }

  async function handleDropExpediente(e: DragEvent<HTMLElement>, nuevaEtapa: EtapaId) {
    e.preventDefault();
    setColumnaDestinoHover(null);
    const expedienteId = e.dataTransfer.getData("text/plain");
    if (!expedienteId) return;

    const eActual = expedientes.find((exp) => exp.id === expedienteId);
    if (!eActual || eActual.etapa === nuevaEtapa) return;

    // Actualización Optimista
    setExpedientes((prev) =>
      prev.map((exp) => (exp.id === expedienteId ? { ...exp, etapa: nuevaEtapa } : exp)),
    );

    setGuardando(true);
    try {
      await moverEtapa(expedienteId, nuevaEtapa);
    } catch (err) {
      console.error("Error al mover etapa del expediente:", err);
      setExpedientes(expedientesIniciales);
      alert("No se pudo mover la etapa del expediente.");
    } finally {
      setGuardando(false);
      setArrastrandoId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros y Selector de Vista */}
      <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Selector de tipo de Pipeline */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTipoPipeline("expedientes")}
              className={`rounded-lg px-3 py-1.5 transition ${
                tipoPipeline === "expedientes"
                  ? "bg-sauce text-white shadow-xs font-bold"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              📁 Embudo de Expedientes ({expedientesFiltrados.length})
            </button>
            <button
              type="button"
              onClick={() => setTipoPipeline("prospectos")}
              className={`rounded-lg px-3 py-1.5 transition ${
                tipoPipeline === "prospectos"
                  ? "bg-sauce text-white shadow-xs font-bold"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              👥 Embudo de Leads ({prospectosFiltrados.length})
            </button>
          </div>

          {/* Indicador de guardado optimista */}
          {guardando && (
            <div className="flex items-center gap-1.5 text-xs text-sauce font-semibold animate-pulse">
              <span className="h-2 w-2 rounded-full bg-sauce"></span>
              Guardando cambios...
            </div>
          )}
        </div>

        {/* Filtros rápidos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, teléfono, ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="rounded-lg border border-carbon/20 bg-white p-2 text-carbon outline-none focus:border-sauce"
          />

          {tipoPipeline === "prospectos" && (
            <>
              <select
                value={filtroCalificacion}
                onChange={(e) => setFiltroCalificacion(e.target.value)}
                className="rounded-lg border border-carbon/20 bg-white p-2 text-carbon outline-none focus:border-sauce"
              >
                <option value="todos">🔥 Calificación: Todas</option>
                <option value="caliente">🔥 Caliente</option>
                <option value="templado">🟡 Templado</option>
                <option value="frio">❄️ Frío</option>
                <option value="descalificado">🚫 Descalificado</option>
              </select>

              <select
                value={filtroOrigen}
                onChange={(e) => setFiltroOrigen(e.target.value)}
                className="rounded-lg border border-carbon/20 bg-white p-2 text-carbon outline-none focus:border-sauce"
              >
                <option value="todos">🌱 Origen: Todos</option>
                {ORIGENES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <select
            value={filtroAsesor}
            onChange={(e) => setFiltroAsesor(e.target.value)}
            className="rounded-lg border border-carbon/20 bg-white p-2 text-carbon outline-none focus:border-sauce"
          >
            <option value="todos">👤 Asesor: Todos</option>
            <option value="sin_asignar">Sin Asesor Asignado</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PIPELINE DE PROSPECTOS */}
      {/* ========================================================================= */}
      {tipoPipeline === "prospectos" && (
        <div className="flex gap-3.5 overflow-x-auto scrollbar-sutil pb-8 pt-1 min-h-[calc(100vh-280px)] w-full">
          {ETAPAS_PROSPECTO.map((etapa) => {
            const prospectosEtapa = prospectosFiltrados
              .filter((p) => p.estatus === etapa.id)
              .sort((a, b) => obtenerTimestampProspecto(b) - obtenerTimestampProspecto(a));
            const totalValorCampana = prospectosEtapa.reduce(
              (acc, p) => acc + (Number(p.valorCampana) || 0),
              0,
            );

            const estaHover = columnaDestinoHover === etapa.id;
            const esGanado = etapa.id === "cliente";
            const esPerdido = etapa.id === "no_viable";

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => handleDragOver(e, etapa.id)}
                onDragLeave={(e) => handleDragLeave(e, etapa.id)}
                onDrop={(e) => handleDropProspecto(e, etapa.id)}
                className={`flex w-72 sm:w-[275px] lg:w-[290px] xl:w-[300px] shrink-0 flex-col rounded-2xl border p-3.5 transition-all duration-200 ${
                  estaHover
                    ? "border-sauce bg-sauce/10 shadow-lg ring-2 ring-sauce/30 scale-[1.01]"
                    : esGanado
                    ? "border-emerald-200 bg-emerald-50/40 shadow-sm"
                    : esPerdido
                    ? "border-rose-200 bg-rose-50/40 shadow-sm"
                    : "border-carbon/10 bg-white/80 shadow-sm"
                }`}
              >
                {/* Encabezado */}
                <div className="mb-3 border-b border-carbon/10 pb-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className={`font-titular text-sm font-bold uppercase tracking-wider ${
                          esGanado
                            ? "text-emerald-800"
                            : esPerdido
                            ? "text-rose-800"
                            : "text-verde-profundo"
                        }`}
                      >
                        {esGanado && "🏆 "}
                        {esPerdido && "❌ "}
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-carbon/50">{etapa.descripcion}</p>
                    </div>
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-mono text-xs font-bold ${
                        esGanado
                          ? "bg-emerald-200/60 text-emerald-800"
                          : esPerdido
                          ? "bg-rose-200/60 text-rose-800"
                          : "bg-verde-profundo/10 text-verde-profundo"
                      }`}
                    >
                      {prospectosEtapa.length}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between text-[11px] font-mono">
                    <span className="text-carbon/50 uppercase text-[9px] font-bold">Total Campaña:</span>
                    <span className="font-bold text-verde-profundo">{formatoPesos(totalValorCampana)}</span>
                  </div>
                </div>

                {/* Tarjetas de Prospectos */}
                <div className="flex flex-1 flex-col gap-3 min-h-[200px]">
                  {prospectosEtapa.length === 0 && (
                    <div
                      className={`flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs transition ${
                        estaHover
                          ? "border-sauce text-sauce font-semibold bg-white/80"
                          : "border-carbon/15 text-carbon/40 bg-white/40"
                      }`}
                    >
                      {estaHover ? "¡Suelta aquí para mover a esta etapa!" : "Arrastra prospectos aquí"}
                    </div>
                  )}

                  {prospectosEtapa.map((p) => {
                    const inicialesAsesor = p.asesorNombre
                      ? p.asesorNombre
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      : null;

                    const siendoArrastrado = arrastrandoId === p.id;

                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, p.id)}
                        onDragEnd={handleDragEnd}
                        className={`group cursor-grab active:cursor-grabbing rounded-xl border bg-white p-3.5 shadow-xs transition-all duration-150 ${
                          siendoArrastrado
                            ? "opacity-40 border-sauce shadow-none scale-95"
                            : "border-carbon/10 hover:-translate-y-0.5 hover:border-sauce/50 hover:shadow-md"
                        }`}
                      >
                        {/* Drag Handle & Name */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span
                              className="text-carbon/30 group-hover:text-sauce select-none font-bold text-xs pt-0.5 shrink-0"
                              title="Arrastrar para mover"
                            >
                              ⋮⋮
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="font-titular text-sm font-bold text-verde-profundo group-hover:text-sauce transition-colors block truncate"
                                title={p.nombreCompleto}
                              >
                                {p.nombreCompleto}
                              </Link>
                              {p.telefono ? (
                                <a
                                  href={`tel:${p.telefono}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-mono text-xs font-bold text-verde-profundo hover:text-sauce hover:underline inline-flex items-center gap-1 mt-0.5 transition-colors block truncate"
                                  title={`Llamar a ${p.nombreCompleto} (${p.telefono})`}
                                >
                                  <span>📞 {p.telefono}</span>
                                </a>
                              ) : (
                                <span className="font-mono text-[10px] text-carbon/40 italic block mt-0.5">
                                  📞 Sin teléfono
                                </span>
                              )}
                              <span className="font-mono text-[10px] text-carbon/40 block mt-0.5">
                                {p.id}
                              </span>
                            </div>
                          </div>

                          <CalificacionProspectoBadge calificacion={p.calificacion} />
                        </div>

                        {/* Origen y Contacto */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-carbon/15 bg-white px-2 py-0.5 text-[10px] text-carbon/70 font-medium">
                            🌱 {ORIGEN_POR_ID[p.origen] || p.origen}
                          </span>
                          {p.ciudad && (
                            <span className="text-[11px] text-carbon/60">
                              📍 {p.ciudad}
                            </span>
                          )}
                        </div>

                        {/* Botón Programar Inspección Técnica */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAbrirModalInspeccion({
                              prospectoId: p.id,
                              clienteNombre: p.nombreCompleto,
                              clienteTelefono: p.telefono,
                              perfilId: p.asesorId,
                            });
                          }}
                          className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-sauce/30 bg-sauce/10 hover:bg-sauce hover:text-white px-2.5 py-1 text-xs font-bold text-sauce transition shadow-2xs cursor-pointer"
                        >
                          🔍 Programar Inspección
                        </button>

                        {/* Pie de Tarjeta */}
                        <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2 text-[11px]">
                          {p.asesorNombre ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-carbon/70 font-medium"
                              title={`Asesor: ${p.asesorNombre}`}
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-verde-profundo text-[9px] font-bold text-crema">
                                {inicialesAsesor}
                              </span>
                              <span className="truncate max-w-[100px]">{p.asesorNombre}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] italic text-carbon/30">Sin asesor</span>
                          )}

                          <span className="font-mono font-bold text-verde-profundo">
                            {p.valorCampana ? formatoPesos(p.valorCampana) : "$0"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pie de Columna */}
                <div className="mt-3 border-t border-carbon/10 pt-2 text-center text-[10px] text-carbon/50 font-mono">
                  Total: <span className="font-bold text-carbon/80">{formatoPesos(totalValorCampana)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PIPELINE DE EXPEDIENTES */}
      {/* ========================================================================= */}
      {tipoPipeline === "expedientes" && (
        <div className="flex gap-3.5 overflow-x-auto scrollbar-sutil pb-8 pt-1 min-h-[calc(100vh-280px)] w-full">
          {ETAPAS.map((etapa) => {
            const expedientesEtapa = expedientesFiltrados
              .filter((exp) => exp.etapa === etapa.id)
              .sort((a, b) => obtenerTimestampExpediente(b) - obtenerTimestampExpediente(a));
            const totalMonto = expedientesEtapa.reduce(
              (acc, exp) => acc + (Number(exp.valorEstimado) || 0),
              0,
            );
            const prob = PROBABILIDAD_POR_ETAPA[etapa.id] ?? 0;
            const montoPonderado = totalMonto * prob;

            const estaHover = columnaDestinoHover === etapa.id;
            const esGanado = etapa.id === "cerrado";
            const esPerdido = etapa.id === "perdido";

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => handleDragOver(e, etapa.id)}
                onDragLeave={(e) => handleDragLeave(e, etapa.id)}
                onDrop={(e) => handleDropExpediente(e, etapa.id)}
                className={`flex w-72 sm:w-[275px] lg:w-[290px] xl:w-[300px] shrink-0 flex-col rounded-2xl border p-3.5 transition-all duration-200 ${
                  estaHover
                    ? "border-sauce bg-sauce/10 shadow-lg ring-2 ring-sauce/30 scale-[1.01]"
                    : esGanado
                    ? "border-emerald-200 bg-emerald-50/40 shadow-sm"
                    : esPerdido
                    ? "border-rose-200 bg-rose-50/40 shadow-sm"
                    : "border-carbon/10 bg-white/80 shadow-sm"
                }`}
              >
                {/* Encabezado */}
                <div className="mb-3 border-b border-carbon/10 pb-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className={`font-titular text-sm font-bold uppercase tracking-wider ${
                          esGanado
                            ? "text-emerald-800"
                            : esPerdido
                            ? "text-rose-800"
                            : "text-verde-profundo"
                        }`}
                      >
                        {esGanado && "🏆 "}
                        {esPerdido && "❌ "}
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-carbon/50">{etapa.descripcion}</p>
                    </div>
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-mono text-xs font-bold ${
                        esGanado
                          ? "bg-emerald-200/60 text-emerald-800"
                          : esPerdido
                          ? "bg-rose-200/60 text-rose-800"
                          : "bg-verde-profundo/10 text-verde-profundo"
                      }`}
                    >
                      {expedientesEtapa.length}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between text-[11px] font-mono">
                    <span className="font-bold text-carbon/80">{formatoPesos(totalMonto)}</span>
                    <span className="text-[10px] text-carbon/50">
                      Pond: {formatoPesos(montoPonderado)} ({Math.round(prob * 100)}%)
                    </span>
                  </div>
                </div>

                {/* Tarjetas de Expedientes */}
                <div className="flex flex-1 flex-col gap-3 min-h-[200px]">
                  {expedientesEtapa.length === 0 && (
                    <div
                      className={`flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs transition ${
                        estaHover
                          ? "border-sauce text-sauce font-semibold bg-white/80"
                          : "border-carbon/15 text-carbon/40 bg-white/40"
                      }`}
                    >
                      {estaHover ? "¡Suelta aquí para mover a esta etapa!" : "Sin expedientes"}
                    </div>
                  )}

                  {expedientesEtapa.map((exp) => {
                    const inicialesAsesor = exp.asesorNombre
                      ? exp.asesorNombre
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      : null;

                    const siendoArrastrado = arrastrandoId === exp.id;
                    const etiquetaTipo = exp.tipoNegocio ? labelTipoNegocio(exp.tipoNegocio) : "Traspaso";

                    return (
                      <div
                        key={exp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, exp.id)}
                        onDragEnd={handleDragEnd}
                        className={`group cursor-grab active:cursor-grabbing rounded-xl border bg-white p-3.5 shadow-xs transition-all duration-150 ${
                          siendoArrastrado
                            ? "opacity-40 border-sauce shadow-none scale-95"
                            : "border-carbon/10 hover:-translate-y-0.5 hover:border-sauce/50 hover:shadow-md"
                        }`}
                      >
                        {/* Drag Handle & Name */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span
                              className="text-carbon/30 group-hover:text-sauce select-none font-bold text-xs pt-0.5 shrink-0"
                              title="Arrastrar para mover"
                            >
                              ⋮⋮
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/expediente/${exp.id}`}
                                className="font-titular text-sm font-bold text-verde-profundo group-hover:text-sauce transition-colors block truncate"
                                title={exp.nombreCompleto}
                              >
                                {exp.nombreCompleto}
                              </Link>
                              {exp.telefono ? (
                                <a
                                  href={`tel:${exp.telefono}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-mono text-xs font-bold text-verde-profundo hover:text-sauce hover:underline inline-flex items-center gap-1 mt-0.5 transition-colors block truncate"
                                  title={`Llamar a ${exp.nombreCompleto} (${exp.telefono})`}
                                >
                                  <span>📞 {exp.telefono}</span>
                                </a>
                              ) : (
                                <span className="font-mono text-[10px] text-carbon/40 italic block mt-0.5">
                                  📞 Sin teléfono
                                </span>
                              )}
                              <span className="font-mono text-[10px] text-carbon/40 block mt-0.5">
                                {exp.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Tipo de Negocio y Fraccionamiento en línea destacada */}
                        <div className="mt-2.5 space-y-1">
                          <div>
                            <span
                              className="inline-flex items-center rounded-md bg-sauce/10 border border-sauce/20 px-2 py-0.5 text-[11px] font-semibold text-verde-profundo leading-snug"
                              title={etiquetaTipo}
                            >
                              🏷️ {etiquetaTipo}
                            </span>
                          </div>
                          <div
                            className="text-xs font-medium text-carbon/70 truncate"
                            title={exp.fraccionamiento || "Sin fraccionamiento"}
                          >
                            📍 {exp.fraccionamiento || "Sin fraccionamiento"}
                          </div>
                        </div>

                        {/* Monto destacado estilo HubSpot */}
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-crema/60 px-2.5 py-1 border border-carbon/5">
                          <span className="text-[10px] font-semibold uppercase text-carbon/50">Monto Estimado</span>
                          <span className="font-mono text-xs font-bold text-verde-profundo">
                            {formatoPesos(exp.valorEstimado)}
                          </span>
                        </div>

                        {/* Botón Programar Inspección Técnica */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAbrirModalInspeccion({
                              expedienteId: exp.id,
                              clienteNombre: exp.nombreCompleto,
                              clienteTelefono: exp.telefono,
                              perfilId: exp.asesorId || exp.operadorId,
                            });
                          }}
                          className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-sauce/30 bg-sauce/10 hover:bg-sauce hover:text-white px-2.5 py-1 text-xs font-bold text-sauce transition shadow-2xs cursor-pointer"
                        >
                          🔍 Programar Inspección
                        </button>

                        {/* Pie de Tarjeta */}
                        <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2 text-[11px]">
                          {exp.asesorNombre ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-carbon/70 font-medium min-w-0"
                              title={`Asesor: ${exp.asesorNombre}`}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-verde-profundo text-[9px] font-bold text-crema">
                                {inicialesAsesor}
                              </span>
                              <span className="truncate max-w-[90px]">{exp.asesorNombre}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] italic text-carbon/30">Sin asesor</span>
                          )}

                          <span className="text-carbon/40 text-[10px] font-mono shrink-0">
                            {exp.ultimoMovimiento ? `⏱️ ${exp.ultimoMovimiento}` : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pie de Columna */}
                <div className="mt-3 border-t border-carbon/10 pt-2 text-center text-[10px] text-carbon/50 font-mono">
                  Total ({expedientesEtapa.length}):{" "}
                  <span className="font-bold text-carbon/80">{formatoPesos(totalMonto)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal de Configuración / Agendamiento de Inspección Técnica */}
      {modalInspeccion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-carbon/10 text-carbon my-8">
            <div className="flex items-start justify-between border-b border-carbon/10 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sauce block">
                  🔍 Inspección Técnica en Sitio
                </span>
                <h3 className="font-titular text-base font-bold text-verde-profundo">
                  Programar Inspección para {modalInspeccion.clienteNombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalInspeccion(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Responsable asignado */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  1. Técnico / Asesor Responsable:
                </label>
                <select
                  value={inspeccionPerfilId}
                  onChange={(e) => setInspeccionPerfilId(e.target.value)}
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2 text-xs font-semibold text-carbon focus:border-sauce"
                >
                  <option value="">-- Seleccionar Responsable --</option>
                  {perfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha y Horario */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-carbon/10 rounded-xl">
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Fecha de Visita
                  </label>
                  <input
                    type="date"
                    value={inspeccionFecha}
                    onChange={(e) => setInspeccionFecha(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={inspeccionHoraInicio}
                    onChange={(e) => setInspeccionHoraInicio(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    value={inspeccionHoraFin}
                    onChange={(e) => setInspeccionHoraFin(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  Instrucciones / Notas para el cliente o técnico:
                </label>
                <textarea
                  rows={3}
                  value={inspeccionNotas}
                  onChange={(e) => setInspeccionNotas(e.target.value)}
                  placeholder="Ej. Realizar levantamiento topográfico de la losa y verificar nivelación de drenajes."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>

              {/* Opción WhatsApp */}
              <label className="flex items-center gap-2 cursor-pointer bg-green-50/70 p-2.5 rounded-xl border border-green-200 text-green-900 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={inspeccionNotificarWsp}
                  onChange={(e) => setInspeccionNotificarWsp(e.target.checked)}
                  className="rounded text-sauce focus:ring-sauce h-4 w-4"
                />
                <span>Enviar confirmación automática por WhatsApp al cliente</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={() => setModalInspeccion(null)}
                className="rounded-lg border border-carbon/20 px-3.5 py-1.5 text-xs font-bold text-carbon/60 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarInspeccion}
                disabled={guardandoInspeccion}
                className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {guardandoInspeccion ? "Agendando..." : "🔍 Agendar Inspección"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
