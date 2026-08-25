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

  // Handlers para Drag and Drop
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
      {/* Barra de Control de Pipeline y Filtros Reorganizada */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Selector de tipo de Pipeline con diseño de pestaña segmentada */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setTipoPipeline("expedientes")}
              className={`flex-1 sm:flex-none rounded-lg px-3.5 py-1.5 transition ${
                tipoPipeline === "expedientes"
                  ? "bg-white text-emerald-950 shadow-2xs font-bold"
                  : "hover:text-slate-900"
              }`}
            >
              📁 Embudo de Expedientes ({expedientesFiltrados.length})
            </button>
            <button
              type="button"
              onClick={() => setTipoPipeline("prospectos")}
              className={`flex-1 sm:flex-none rounded-lg px-3.5 py-1.5 transition ${
                tipoPipeline === "prospectos"
                  ? "bg-white text-emerald-950 shadow-2xs font-bold"
                  : "hover:text-slate-900"
              }`}
            >
              👥 Embudo de Leads ({prospectosFiltrados.length})
            </button>
          </div>

          {/* Indicador de guardado optimista */}
          {guardando && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold animate-pulse">
              <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
              Guardando cambios...
            </div>
          )}
        </div>

        {/* Filtros rápidos estilizados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, teléfono, ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
          />

          {tipoPipeline === "prospectos" && (
            <>
              <select
                value={filtroCalificacion}
                onChange={(e) => setFiltroCalificacion(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-800 outline-none focus:border-emerald-600"
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-800 outline-none focus:border-emerald-600"
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-800 outline-none focus:border-emerald-600"
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
                className={`flex w-72 sm:w-[275px] lg:w-[290px] xl:w-[300px] shrink-0 flex-col rounded-2xl border p-3 transition-all duration-200 ${
                  estaHover
                    ? "border-emerald-500 bg-emerald-50/60 shadow-lg ring-2 ring-emerald-500/30 scale-[1.01]"
                    : esGanado
                    ? "border-emerald-200 bg-emerald-50/30 shadow-2xs"
                    : esPerdido
                    ? "border-rose-200 bg-rose-50/30 shadow-2xs"
                    : "border-slate-200/80 bg-slate-50/50 shadow-2xs"
                }`}
              >
                {/* Encabezado */}
                <div className="mb-2.5 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className={`font-titular text-xs font-bold uppercase tracking-wider ${
                          esGanado
                            ? "text-emerald-800"
                            : esPerdido
                            ? "text-rose-800"
                            : "text-slate-900"
                        }`}
                      >
                        {esGanado && "🏆 "}
                        {esPerdido && "❌ "}
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{etapa.descripcion}</p>
                    </div>
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold ${
                        esGanado
                          ? "bg-emerald-200 text-emerald-900"
                          : esPerdido
                          ? "bg-rose-200 text-rose-900"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {prospectosEtapa.length}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between text-[10px] font-mono">
                    <span className="text-slate-400 uppercase font-bold text-[9px]">Total:</span>
                    <span className="font-bold text-slate-800">{formatoPesos(totalValorCampana)}</span>
                  </div>
                </div>

                {/* Tarjetas de Prospectos */}
                <div className="flex flex-1 flex-col gap-2.5 min-h-[200px]">
                  {prospectosEtapa.length === 0 && (
                    <div
                      className={`flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs transition ${
                        estaHover
                          ? "border-emerald-500 text-emerald-700 font-semibold bg-white/80"
                          : "border-slate-300/70 text-slate-400 bg-white/30"
                      }`}
                    >
                      {estaHover ? "¡Suelta aquí!" : "Sin prospectos"}
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
                        className={`group relative cursor-grab active:cursor-grabbing rounded-xl border bg-white p-3 shadow-2xs transition-all duration-150 space-y-2 ${
                          siendoArrastrado
                            ? "opacity-40 border-emerald-500 shadow-none scale-95"
                            : "border-slate-200/80 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md"
                        }`}
                      >
                        {/* Encabezado Nombre + Badge + Teléfono e ID */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span
                              className="text-slate-300 group-hover:text-emerald-600 select-none font-bold text-xs pt-0.5 shrink-0"
                              title="Arrastrar para mover"
                            >
                              ⋮⋮
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="font-titular text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors block truncate leading-tight"
                                title={p.nombreCompleto}
                              >
                                {p.nombreCompleto}
                              </Link>
                              <div className="flex items-center gap-2 mt-0.5">
                                {p.telefono ? (
                                  <a
                                    href={`tel:${p.telefono}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-mono text-[11px] font-semibold text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    📞 {p.telefono}
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Sin teléfono</span>
                                )}
                                <span className="font-mono text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {p.id}
                                </span>
                              </div>
                            </div>
                          </div>

                          <CalificacionProspectoBadge calificacion={p.calificacion} />
                        </div>

                        {/* Origen y Ciudad */}
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 font-medium">
                            🌱 {ORIGEN_POR_ID[p.origen] || p.origen}
                          </span>
                          {p.ciudad && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 text-slate-600 border border-slate-200/60 px-2 py-0.5 font-medium truncate max-w-[130px]">
                              📍 {p.ciudad}
                            </span>
                          )}
                        </div>

                        {/* Fila de Valor y Acción */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Valor</span>
                            <span className="font-mono text-xs font-extrabold text-slate-900">
                              {p.valorCampana ? formatoPesos(p.valorCampana) : "$0"}
                            </span>
                          </div>

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
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                          >
                            🔍 Inspección
                          </button>
                        </div>

                        {/* Pie de Tarjeta: Asesor Avatar */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          {p.asesorNombre ? (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600" title={`Asesor: ${p.asesorNombre}`}>
                              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[8px] font-bold text-white">
                                {inicialesAsesor}
                              </span>
                              <span className="truncate max-w-[100px]">{p.asesorNombre}</span>
                            </span>
                          ) : (
                            <span className="italic text-slate-300">Sin asesor</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pie de Columna */}
                <div className="mt-2.5 border-t border-slate-200/80 pt-1.5 text-center text-[10px] text-slate-500 font-mono">
                  Total: <span className="font-bold text-slate-800">{formatoPesos(totalValorCampana)}</span>
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
                className={`flex w-72 sm:w-[275px] lg:w-[290px] xl:w-[300px] shrink-0 flex-col rounded-2xl border p-3 transition-all duration-200 ${
                  estaHover
                    ? "border-emerald-500 bg-emerald-50/60 shadow-lg ring-2 ring-emerald-500/30 scale-[1.01]"
                    : esGanado
                    ? "border-emerald-200 bg-emerald-50/30 shadow-2xs"
                    : esPerdido
                    ? "border-rose-200 bg-rose-50/30 shadow-2xs"
                    : "border-slate-200/80 bg-slate-50/50 shadow-2xs"
                }`}
              >
                {/* Encabezado de Columna */}
                <div className="mb-2.5 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className={`font-titular text-xs font-bold uppercase tracking-wider ${
                          esGanado
                            ? "text-emerald-800"
                            : esPerdido
                            ? "text-rose-800"
                            : "text-slate-900"
                        }`}
                      >
                        {esGanado && "🏆 "}
                        {esPerdido && "❌ "}
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{etapa.descripcion}</p>
                    </div>
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold ${
                        esGanado
                          ? "bg-emerald-200 text-emerald-900"
                          : esPerdido
                          ? "bg-rose-200 text-rose-900"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {expedientesEtapa.length}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between text-[10px] font-mono">
                    <span className="font-bold text-slate-800">{formatoPesos(totalMonto)}</span>
                    <span className="text-slate-400">
                      Pond: {formatoPesos(montoPonderado)} ({Math.round(prob * 100)}%)
                    </span>
                  </div>
                </div>

                {/* Tarjetas de Expedientes */}
                <div className="flex flex-1 flex-col gap-2.5 min-h-[200px]">
                  {expedientesEtapa.length === 0 && (
                    <div
                      className={`flex flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs transition ${
                        estaHover
                          ? "border-emerald-500 text-emerald-700 font-semibold bg-white/80"
                          : "border-slate-300/70 text-slate-400 bg-white/30"
                      }`}
                    >
                      {estaHover ? "¡Suelta aquí!" : "Sin expedientes"}
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
                    const etiquetaTipo = exp.tipoNegocio ? labelTipoNegocio(exp.tipoNegocio) : "Traspaso / Compra";

                    return (
                      <div
                        key={exp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, exp.id)}
                        onDragEnd={handleDragEnd}
                        className={`group relative cursor-grab active:cursor-grabbing rounded-xl border bg-white p-3 shadow-2xs transition-all duration-150 space-y-2 ${
                          siendoArrastrado
                            ? "opacity-40 border-emerald-500 shadow-none scale-95"
                            : "border-slate-200/80 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md"
                        }`}
                      >
                        {/* Encabezado Nombre + Teléfono e ID */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span
                              className="text-slate-300 group-hover:text-emerald-600 select-none font-bold text-xs pt-0.5 shrink-0"
                              title="Arrastrar para mover"
                            >
                              ⋮⋮
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/expediente/${exp.id}`}
                                className="font-titular text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors block truncate leading-tight"
                                title={exp.nombreCompleto}
                              >
                                {exp.nombreCompleto}
                              </Link>
                              <div className="flex items-center gap-2 mt-0.5">
                                {exp.telefono ? (
                                  <a
                                    href={`tel:${exp.telefono}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-mono text-[11px] font-semibold text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    📞 {exp.telefono}
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Sin teléfono</span>
                                )}
                                <span className="font-mono text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {exp.id}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Tipo de Negocio y Fraccionamiento en línea compacta de badges */}
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 font-semibold"
                            title={etiquetaTipo}
                          >
                            🏷️ {etiquetaTipo}
                          </span>
                          {exp.fraccionamiento && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-slate-50 text-slate-600 border border-slate-200/60 px-2 py-0.5 font-medium truncate max-w-[140px]"
                              title={exp.fraccionamiento}
                            >
                              📍 {exp.fraccionamiento}
                            </span>
                          )}
                        </div>

                        {/* Fila de Monto y Botón de Acción */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">Monto</span>
                            <span className="font-mono text-xs font-extrabold text-slate-900">
                              {formatoPesos(exp.valorEstimado)}
                            </span>
                          </div>

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
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                          >
                            🔍 Inspección
                          </button>
                        </div>

                        {/* Pie de Tarjeta: Asesor Avatar + Fecha */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          {exp.asesorNombre ? (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600" title={`Asesor: ${exp.asesorNombre}`}>
                              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[8px] font-bold text-white">
                                {inicialesAsesor}
                              </span>
                              <span className="truncate max-w-[100px]">{exp.asesorNombre}</span>
                            </span>
                          ) : (
                            <span className="italic text-slate-300">Sin asesor</span>
                          )}

                          {exp.ultimoMovimiento && (
                            <span className="font-mono text-[9px] text-slate-400">
                              ⏱️ {exp.ultimoMovimiento}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pie de Columna */}
                <div className="mt-2.5 border-t border-slate-200/80 pt-1.5 text-center text-[10px] text-slate-500 font-mono">
                  Total ({expedientesEtapa.length}):{" "}
                  <span className="font-bold text-slate-800">{formatoPesos(totalMonto)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal de Configuración / Agendamiento de Inspección Técnica */}
      {modalInspeccion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-slate-200 text-slate-900 my-8">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
                  🔍 Inspección Técnica en Sitio
                </span>
                <h3 className="font-titular text-base font-bold text-slate-900">
                  Programar Inspección para {modalInspeccion.clienteNombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalInspeccion(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Responsable asignado */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Técnico / Asesor Responsable:
                </label>
                <select
                  value={inspeccionPerfilId}
                  onChange={(e) => setInspeccionPerfilId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800 focus:border-emerald-600"
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Fecha de Visita
                  </label>
                  <input
                    type="date"
                    value={inspeccionFecha}
                    onChange={(e) => setInspeccionFecha(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={inspeccionHoraInicio}
                    onChange={(e) => setInspeccionHoraInicio(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    value={inspeccionHoraFin}
                    onChange={(e) => setInspeccionHoraFin(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Instrucciones / Notas para el cliente o técnico:
                </label>
                <textarea
                  rows={3}
                  value={inspeccionNotas}
                  onChange={(e) => setInspeccionNotas(e.target.value)}
                  placeholder="Ej. Realizar levantamiento topográfico de la losa y verificar nivelación de drenajes."
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 outline-none focus:border-emerald-600"
                />
              </div>

              {/* Opción WhatsApp */}
              <label className="flex items-center gap-2 cursor-pointer bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/80 text-emerald-950 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={inspeccionNotificarWsp}
                  onChange={(e) => setInspeccionNotificarWsp(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-600 h-4 w-4"
                />
                <span>Enviar confirmación automática por WhatsApp al cliente</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalInspeccion(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarInspeccion}
                disabled={guardandoInspeccion}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
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
