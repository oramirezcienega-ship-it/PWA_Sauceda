"use client";

import { useState, useMemo, DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Prospecto, EstatusProspecto, CalificacionProspecto, OrigenAdquisicion } from "@/lib/types";
import { ESTATUS_PROSPECTO_LISTA } from "@/lib/estatus";
import { ORIGENES, ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import { EstatusProspectoBadge } from "./EstatusProspectoBadge";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import { cambiarEstatusMasivo } from "@/app/actions/prospectos";

interface Perfil {
  id: string;
  nombre: string;
  rol: string;
}

interface PipelineProspectosClientProps {
  prospectosIniciales: Prospecto[];
  perfiles: Perfil[];
}

export function PipelineProspectosClient({
  prospectosIniciales,
  perfiles,
}: PipelineProspectosClientProps) {
  const router = useRouter();
  const [prospectos, setProspectos] = useState<Prospecto[]>(prospectosIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCalificacion, setFiltroCalificacion] = useState<string>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<string>("todos");
  const [filtroAsesor, setFiltroAsesor] = useState<string>("todos");

  // Estado para Drag and Drop
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [columnaDestinoHover, setColumnaDestinoHover] = useState<EstatusProspecto | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Lista de etapas ordenadas del embudo
  const ETAPAS_PIPELINE: { id: EstatusProspecto; nombre: string; descripcion: string }[] = [
    { id: "lead", nombre: "Lead", descripcion: "Captado recientemente" },
    { id: "mql", nombre: "MQL", descripcion: "En conversación" },
    { id: "sql", nombre: "SQL", descripcion: "Calificado / Expediente" },
    { id: "cliente", nombre: "Cliente", descripcion: "Firmado / Ganado" },
    { id: "sin_contacto", nombre: "Sin contacto", descripcion: "Pendiente comunicación" },
    { id: "no_viable", nombre: "No viable", descripcion: "Descartado" },
  ];

  // Aplicar filtros
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

  // Manejadores de Drag and Drop (HTML5)
  function handleDragStart(e: DragEvent<HTMLElement>, prospectoId: string) {
    e.dataTransfer.setData("text/plain", prospectoId);
    e.dataTransfer.effectAllowed = "move";
    setArrastrandoId(prospectoId);
  }

  function handleDragEnd() {
    setArrastrandoId(null);
    setColumnaDestinoHover(null);
  }

  function handleDragOver(e: DragEvent<HTMLElement>, etapaId: EstatusProspecto) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (columnaDestinoHover !== etapaId) {
      setColumnaDestinoHover(etapaId);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLElement>, etapaId: EstatusProspecto) {
    e.preventDefault();
    if (columnaDestinoHover === etapaId) {
      setColumnaDestinoHover(null);
    }
  }

  async function handleDrop(e: DragEvent<HTMLElement>, nuevaEtapa: EstatusProspecto) {
    e.preventDefault();
    setColumnaDestinoHover(null);

    const prospectoId = e.dataTransfer.getData("text/plain") || arrastrandoId;
    if (!prospectoId) return;

    const prospectoObj = prospectos.find((p) => p.id === prospectoId);
    if (!prospectoObj || prospectoObj.estatus === nuevaEtapa) {
      setArrastrandoId(null);
      return;
    }

    // Actualización optimista de UI
    const estadoPrevio = prospectos;
    setProspectos((prev) =>
      prev.map((p) => (p.id === prospectoId ? { ...p, estatus: nuevaEtapa } : p)),
    );
    setArrastrandoId(null);

    // Guardar cambio en Supabase
    try {
      setGuardando(true);
      await cambiarEstatusMasivo([prospectoId], nuevaEtapa);
      router.refresh();
    } catch (err) {
      console.error("Error al actualizar la etapa en Supabase:", err);
      // Revertir en caso de error
      setProspectos(estadoPrevio);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Encabezado y Título */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-titular text-2xl font-bold text-verde-profundo flex items-center gap-2">
            📊 Pipeline de Prospectos
          </h1>
          <p className="text-xs text-carbon/60">
            Tablero interactivo de prospectos por etapa comercial. Arrastra las tarjetas para avanzar de etapa.
          </p>
        </div>
        {guardando && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sauce/10 border border-sauce/30 px-3 py-1 text-xs font-semibold text-verde-profundo animate-pulse">
            <span className="h-2 w-2 rounded-full bg-sauce animate-ping" />
            Guardando cambios...
          </span>
        )}
      </div>

      {/* Control de Búsqueda y Filtros */}
      <div className="rounded-xl border border-carbon/10 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, teléfono, ciudad..."
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

          {/* Filtro Calificación */}
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

          {/* Filtro Origen */}
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
        </div>
      </div>

      {/* Tablero Kanban Drag and Drop */}
      <div className="flex gap-4 overflow-x-auto scrollbar-sutil pb-8 pt-1 min-h-[calc(100vh-280px)]">
        {ETAPAS_PIPELINE.map((etapa) => {
          const prospectosEtapa = prospectosFiltrados.filter((p) => {
            if (etapa.id === "lead") return p.estatus === "lead" || p.estatus === "nuevo";
            if (etapa.id === "mql") return p.estatus === "mql" || p.estatus === "en_conversacion";
            if (etapa.id === "sql") return p.estatus === "sql" || p.estatus === "expediente_abierto";
            return p.estatus === etapa.id;
          });

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
              onDrop={(e) => handleDrop(e, etapa.id)}
              className={`flex w-80 shrink-0 flex-col rounded-2xl border p-3.5 transition-all duration-200 ${
                estaHover
                  ? "border-sauce bg-sauce/10 shadow-lg ring-2 ring-sauce/30 scale-[1.01]"
                  : "border-carbon/10 bg-white/80 shadow-sm"
              }`}
            >
              {/* Encabezado de la Columna */}
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

              {/* Zona de Tarjetas Desplegables */}
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
                      {/* Drag Handle & Prospect Name */}
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

                      {/* Origen y Datos de Contacto */}
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

                      {/* Pie de Tarjeta: Asesor y Valor Campaña */}
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
    </div>
  );
}
