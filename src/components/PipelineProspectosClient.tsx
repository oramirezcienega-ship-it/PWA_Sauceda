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

interface Perfil {
  id: string;
  nombre: string;
  rol: string;
}

interface PipelineProspectosClientProps {
  prospectosIniciales: Prospecto[];
  expedientesIniciales?: Expediente[];
  perfiles: Perfil[];
}

export function PipelineProspectosClient({
  prospectosIniciales,
  expedientesIniciales = [],
  perfiles,
}: PipelineProspectosClientProps) {
  const router = useRouter();

  // Selector de Modo: Pipeline por Prospectos vs Pipeline por Expedientes
  const [tipoPipeline, setTipoPipeline] = useState<"prospectos" | "expedientes">("prospectos");

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

  // Etapas para Prospectos
  const ETAPAS_PROSPECTO: { id: EstatusProspecto; nombre: string; descripcion: string }[] = [
    { id: "lead", nombre: "Lead", descripcion: "Captado recientemente" },
    { id: "mql", nombre: "MQL", descripcion: "En conversación" },
    { id: "sql", nombre: "SQL", descripcion: "Calificado / Expediente" },
    { id: "cliente", nombre: "Cliente", descripcion: "Firmado / Ganado" },
    { id: "sin_contacto", nombre: "Sin contacto", descripcion: "Pendiente comunicación" },
    { id: "no_viable", nombre: "No viable", descripcion: "Descartado" },
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

  function obtenerTimestampExpediente(exp: Expediente): number {
    if (exp.createdAt) {
      const t = new Date(exp.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (exp.ultimoMovimiento) {
      const t = new Date(exp.ultimoMovimiento).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    const numId = parseInt(exp.id.replace(/\D/g, ""), 10);
    return isNaN(numId) ? 0 : numId;
  }

  // Aplicar filtros a Expedientes
  const expedientesFiltrados = useMemo(() => {
    return expedientes.filter((e) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincide =
          e.nombreCompleto.toLowerCase().includes(q) ||
          e.fraccionamiento.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.telefono.toLowerCase().includes(q);
        if (!coincide) return false;
      }
      if (filtroAsesor !== "todos") {
        if (filtroAsesor === "sin_asignar" && e.asesorId) return false;
        if (filtroAsesor !== "sin_asignar" && e.asesorId !== filtroAsesor) return false;
      }
      return true;
    });
  }, [expedientes, busqueda, filtroAsesor]);

  // Handlers de Drag and Drop
  function handleDragStart(e: DragEvent<HTMLElement>, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setArrastrandoId(id);
  }

  function handleDragEnd() {
    setArrastrandoId(null);
    setColumnaDestinoHover(null);
  }

  function handleDragOver(e: DragEvent<HTMLElement>, etapaId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (columnaDestinoHover !== etapaId) {
      setColumnaDestinoHover(etapaId);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLElement>, etapaId: string) {
    e.preventDefault();
    if (columnaDestinoHover === etapaId) {
      setColumnaDestinoHover(null);
    }
  }

  // Drop para Prospectos
  async function handleDropProspecto(e: DragEvent<HTMLElement>, nuevaEtapa: EstatusProspecto) {
    e.preventDefault();
    setColumnaDestinoHover(null);

    const targetId = e.dataTransfer.getData("text/plain") || arrastrandoId;
    if (!targetId) return;

    const obj = prospectos.find((p) => p.id === targetId);
    if (!obj || obj.estatus === nuevaEtapa) {
      setArrastrandoId(null);
      return;
    }

    const previo = prospectos;
    setProspectos((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, estatus: nuevaEtapa } : p)),
    );
    setArrastrandoId(null);

    try {
      setGuardando(true);
      await cambiarEstatusMasivo([targetId], nuevaEtapa);
      router.refresh();
    } catch (err) {
      console.error("Error al actualizar la etapa del prospecto:", err);
      setProspectos(previo);
    } finally {
      setGuardando(false);
    }
  }

  // Drop para Expedientes
  async function handleDropExpediente(e: DragEvent<HTMLElement>, nuevaEtapa: EtapaId) {
    e.preventDefault();
    setColumnaDestinoHover(null);

    const targetId = e.dataTransfer.getData("text/plain") || arrastrandoId;
    if (!targetId) return;

    const obj = expedientes.find((exp) => exp.id === targetId);
    if (!obj || obj.etapa === nuevaEtapa) {
      setArrastrandoId(null);
      return;
    }

    const previo = expedientes;
    setExpedientes((prev) =>
      prev.map((exp) => (exp.id === targetId ? { ...exp, etapa: nuevaEtapa } : exp)),
    );
    setArrastrandoId(null);

    try {
      setGuardando(true);
      await moverEtapa(targetId, nuevaEtapa);
      router.refresh();
    } catch (err) {
      console.error("Error al mover la etapa del expediente:", err);
      setExpedientes(previo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Selector de Modo de Pipeline: Prospectos vs Expedientes */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-carbon/10 shadow-xs">
        <div>
          <h1 className="font-titular text-2xl font-bold text-verde-profundo flex items-center gap-2">
            📊 Pipeline Comercial
          </h1>
          <p className="text-xs text-carbon/60">
            Conmuta entre el embudo de <strong className="text-verde-profundo font-semibold">Prospectos</strong> y el flujo operativo de <strong className="text-verde-profundo font-semibold">Expedientes</strong>. Arrastra las tarjetas para avanzar de etapa.
          </p>
        </div>

        {/* Píldoras conmutadoras del Pipeline */}
        <div className="inline-flex shrink-0 rounded-xl border border-carbon/15 bg-crema/40 p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setTipoPipeline("prospectos")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              tipoPipeline === "prospectos"
                ? "bg-verde-profundo text-crema shadow-xs scale-102"
                : "text-carbon/70 hover:text-verde-profundo"
            }`}
          >
            👤 Pipeline de Prospectos
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-mono">
              {prospectosFiltrados.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTipoPipeline("expedientes")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              tipoPipeline === "expedientes"
                ? "bg-verde-profundo text-crema shadow-xs scale-102"
                : "text-carbon/70 hover:text-verde-profundo"
            }`}
          >
            📁 Pipeline de Expedientes
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-mono">
              {expedientesFiltrados.length}
            </span>
          </button>
        </div>
      </div>

      {/* Control de Búsqueda y Filtros */}
      <div className="rounded-xl border border-carbon/10 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder={
                tipoPipeline === "prospectos"
                  ? "🔍 Buscar por nombre, teléfono, ciudad..."
                  : "🔍 Buscar por cliente, fraccionamiento, folio..."
              }
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-carbon/15 bg-crema/30 px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce focus:bg-white transition"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-carbon/40 hover:text-carbon"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro Calificación (Solo Prospectos) */}
          {tipoPipeline === "prospectos" && (
            <select
              value={filtroCalificacion}
              onChange={(e) => setFiltroCalificacion(e.target.value)}
              className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="todos">Todas las Calificaciones</option>
              <option value="caliente">🔥 Caliente</option>
              <option value="templado">⚡ Templado</option>
              <option value="frio">❄️ Frío</option>
              <option value="descalificado">❌ Descalificado</option>
            </select>
          )}

          {/* Filtro Origen (Solo Prospectos) */}
          {tipoPipeline === "prospectos" && (
            <select
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
            >
              <option value="todos">Todos los Orígenes</option>
              {ORIGENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          )}

          {/* Filtro Asesor */}
          <select
            value={filtroAsesor}
            onChange={(e) => setFiltroAsesor(e.target.value)}
            className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1.5 text-xs font-medium text-verde-profundo outline-none focus:border-sauce"
          >
            <option value="todos">Todos los Asesores</option>
            <option value="sin_asignar">Sin Asesor Asignado</option>
            {perfiles
              .filter((p) => p.rol === "asesor")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>

          {(busqueda || filtroCalificacion !== "todos" || filtroOrigen !== "todos" || filtroAsesor !== "todos") && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                setFiltroCalificacion("todos");
                setFiltroOrigen("todos");
                setFiltroAsesor("todos");
              }}
              className="text-xs font-medium text-rojo hover:underline"
            >
              Limpiar filtros
            </button>
          )}

          {guardando && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-sauce/10 border border-sauce/30 px-3 py-1 text-xs font-semibold text-verde-profundo animate-pulse">
              <span className="h-2 w-2 rounded-full bg-sauce animate-ping" />
              Guardando cambios...
            </span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PIPELINE DE PROSPECTOS */}
      {/* ========================================================================= */}
      {tipoPipeline === "prospectos" && (
        <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-8 pt-1 min-h-[calc(100vh-280px)]">
          {ETAPAS_PROSPECTO.map((etapa) => {
            const prospectosEtapa = prospectosFiltrados
              .filter((p) => {
                if (etapa.id === "lead") return p.estatus === "lead" || p.estatus === "nuevo";
                if (etapa.id === "mql") return p.estatus === "mql" || p.estatus === "en_conversacion";
                if (etapa.id === "sql") return p.estatus === "sql" || p.estatus === "expediente_abierto";
                return p.estatus === etapa.id;
              })
              .sort((a, b) => obtenerTimestampProspecto(b) - obtenerTimestampProspecto(a));

            const totalValorCampana = prospectosEtapa.reduce(
              (acc, p) => acc + (Number(p.valorCampana) || 0),
              0,
            );

            const estaHover = columnaDestinoHover === etapa.id;

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => handleDragOver(e, etapa.id)}
                onDragLeave={(e) => handleDragLeave(e, etapa.id)}
                onDrop={(e) => handleDropProspecto(e, etapa.id)}
                className={`flex w-80 shrink-0 flex-col rounded-2xl border p-3.5 transition-all duration-200 ${
                  estaHover
                    ? "border-sauce bg-sauce/10 shadow-lg ring-2 ring-sauce/30 scale-[1.01]"
                    : "border-carbon/10 bg-white/80 shadow-sm"
                }`}
              >
                {/* Encabezado */}
                <div className="mb-3 border-b border-carbon/10 pb-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-carbon/50">{etapa.descripcion}</p>
                    </div>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-verde-profundo/10 px-2 font-mono text-xs font-bold text-verde-profundo">
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
                          <div className="flex items-start gap-1.5">
                            <span className="text-carbon/30 group-hover:text-sauce select-none font-bold text-xs pt-0.5" title="Arrastrar para mover">
                              ⋮⋮
                            </span>
                            <div>
                              <Link
                                href={`/prospectos/${p.id}`}
                                className="font-titular text-sm font-bold text-verde-profundo group-hover:text-sauce transition-colors block"
                              >
                                {p.nombreCompleto}
                              </Link>
                              <span className="font-mono text-[10px] text-carbon/40">
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

                        {p.telefono && (
                          <div className="mt-1 text-xs text-carbon/70 font-mono">
                            📞 {p.telefono}
                          </div>
                        )}

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
        <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-8 pt-1 min-h-[calc(100vh-280px)]">
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

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => handleDragOver(e, etapa.id)}
                onDragLeave={(e) => handleDragLeave(e, etapa.id)}
                onDrop={(e) => handleDropExpediente(e, etapa.id)}
                className={`flex w-80 shrink-0 flex-col rounded-2xl border p-3.5 transition-all duration-200 ${
                  estaHover
                    ? "border-sauce bg-sauce/10 shadow-lg ring-2 ring-sauce/30 scale-[1.01]"
                    : "border-carbon/10 bg-white/80 shadow-sm"
                }`}
              >
                {/* Encabezado */}
                <div className="mb-3 border-b border-carbon/10 pb-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                        {etapa.nombre}
                      </h2>
                      <p className="text-[10px] text-carbon/50">{etapa.descripcion}</p>
                    </div>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-verde-profundo/10 px-2 font-mono text-xs font-bold text-verde-profundo">
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
                        {/* Drag Handle & Name & Badge */}
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span className="text-carbon/30 group-hover:text-sauce select-none font-bold text-xs pt-0.5 shrink-0" title="Arrastrar para mover">
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
                              <span className="font-mono text-[10px] text-carbon/40 block">
                                {exp.id}
                              </span>
                            </div>
                          </div>

                          <span
                            className="shrink-0 max-w-[110px] truncate rounded-md bg-sauce/10 border border-sauce/20 px-2 py-0.5 text-[10px] font-semibold text-verde-profundo"
                            title={etiquetaTipo}
                          >
                            {etiquetaTipo}
                          </span>
                        </div>

                        {/* Fraccionamiento */}
                        <div className="mt-2 text-xs text-carbon/70 truncate" title={exp.fraccionamiento || "Sin fraccionamiento"}>
                          📍 {exp.fraccionamiento || "Sin fraccionamiento"}
                        </div>

                        {/* Monto destacado estilo HubSpot */}
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-crema/60 px-2.5 py-1 border border-carbon/5">
                          <span className="text-[10px] font-semibold uppercase text-carbon/50">Monto Estimado</span>
                          <span className="font-mono text-xs font-bold text-verde-profundo">
                            {formatoPesos(exp.valorEstimado)}
                          </span>
                        </div>

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
                  Total ({expedientesEtapa.length}): <span className="font-bold text-carbon/80">{formatoPesos(totalMonto)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
