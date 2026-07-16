"use client";

import { useState } from "react";
import type { LlamadaConmutadorApp } from "@/app/actions/llamadas";
import Link from "next/link";

export function TablaLlamadas({ inicial }: { inicial: LlamadaConmutadorApp[] }) {
  const [llamadas] = useState<LlamadaConmutadorApp[]>(inicial);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState<string>("");
  const [llamadaSeleccionada, setLlamadaSeleccionada] = useState<LlamadaConmutadorApp | null>(null);

  // Filtrado de llamadas
  const llamadasFiltradas = llamadas.filter((ll) => {
    const cumpleTipo = filtroTipo === "todos" ? true : ll.tipo === filtroTipo;
    
    let cumpleEstado = true;
    if (filtroEstado !== "todos") {
      if (filtroEstado === "atendidas") {
        cumpleEstado = ll.estado === "completed" || ll.estado === "answered";
      } else if (filtroEstado === "perdidas") {
        cumpleEstado = !["completed", "answered"].includes(ll.estado.toLowerCase());
      }
    }

    const texto = busqueda.toLowerCase();
    const cumpleBusqueda =
      !texto ||
      ll.cliente_telefono.includes(texto) ||
      (ll.prospecto_nombre && ll.prospecto_nombre.toLowerCase().includes(texto)) ||
      (ll.agente_nombre && ll.agente_nombre.toLowerCase().includes(texto)) ||
      ll.twilio_call_sid.toLowerCase().includes(texto);

    return cumpleTipo && cumpleEstado && cumpleBusqueda;
  });

  // Formato de fecha
  function formatearFecha(isoString: string): string {
    const f = new Date(isoString);
    return f.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // Formato de duración
  function formatearDuracion(segundos: number | null): string {
    if (segundos === null || segundos === undefined) return "--";
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  // Obtener URL de audio usando el proxy para grabaciones de Twilio
  function obtenerUrlAudio(url: string | null) {
    if (!url) return "";
    if (url.startsWith("https://api.twilio.com/")) {
      return `/api/conmutador/grabacion?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  // Badge de Estado
  function renderBadgeEstado(estado: string) {
    const est = estado.toLowerCase();
    if (est === "completed" || est === "answered") {
      return (
        <span className="rounded-full bg-sauce/15 px-2.5 py-0.5 text-xs font-semibold text-verde-profundo border border-sauce/20">
          Atendida
        </span>
      );
    }
    if (["ringing", "in-progress"].includes(est)) {
      return (
        <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 border border-yellow-200 animate-pulse">
          Activa
        </span>
      );
    }
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 border border-red-200">
        Perdida ({estado})
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controles de Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
            Buscar cliente, agente o prospecto
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej: +5255..., Juan..."
            className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
          />
        </div>

        <div className="w-40">
          <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
            Tipo
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none"
          >
            <option value="todos">Todos</option>
            <option value="entrante">Entrantes</option>
            <option value="saliente">Salientes</option>
          </select>
        </div>

        <div className="w-40">
          <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
            Estado
          </label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none"
          >
            <option value="todos">Todos</option>
            <option value="atendidas">Atendidas</option>
            <option value="perdidas">Perdidas / Sin responder</option>
          </select>
        </div>
      </div>

      {/* Tabla para Escritorio */}
      <div className="hidden md:block max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil shadow-sm">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
            <tr className="border-b border-carbon/10 bg-crema/90 text-left">
              <Th>Fecha / Hora</Th>
              <Th>Cliente</Th>
              <Th>Asesor asignado</Th>
              <Th>Duración</Th>
              <Th>Estado</Th>
              <Th>Grabación</Th>
              <Th>Auditoría</Th>
            </tr>
          </thead>
          <tbody>
            {llamadasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-carbon/50 font-cuerpo">
                  No se encontraron llamadas con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              llamadasFiltradas.map((ll) => (
                <tr key={ll.id} className="border-b border-carbon/5 hover:bg-carbon/5 transition">
                  <td className="px-3 py-3 font-mono text-xs text-carbon/70">
                    {formatearFecha(ll.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-verde-profundo block">{ll.cliente_telefono}</span>
                    {ll.prospecto_id && (
                      <Link
                        href={`/prospectos/${ll.prospecto_id}`}
                        className="text-xs text-sauce hover:underline font-medium"
                      >
                        👤 {ll.prospecto_nombre || ll.prospecto_id}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3 text-carbon/70 font-medium">
                    {ll.agente_nombre ? `👨‍💼 ${ll.agente_nombre}` : "Ninguno (Voice Bot)"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {formatearDuracion(ll.duracion)}
                  </td>
                  <td className="px-3 py-3">
                    {renderBadgeEstado(ll.estado)}
                  </td>
                  <td className="px-3 py-3">
                    {ll.grabacion_url ? (
                      <audio src={obtenerUrlAudio(ll.grabacion_url)} controls className="h-8 max-w-[200px] outline-none" />
                    ) : (
                      <span className="text-xs text-carbon/30">Sin grabación</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {(ll.transcripcion || ll.resumen_ia) ? (
                      <button
                        type="button"
                        onClick={() => setLlamadaSeleccionada(ll)}
                        className="rounded-lg bg-verde-profundo px-3 py-1 text-xs font-semibold text-crema hover:bg-sauce transition shadow-sm"
                      >
                        Reporte IA
                      </button>
                    ) : (
                      <span className="text-xs text-carbon/30">Sin reporte</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Tarjetas para Móviles */}
      <div className="space-y-3 md:hidden">
        {llamadasFiltradas.length === 0 ? (
          <div className="rounded-xl border border-carbon/10 bg-white p-8 text-center text-carbon/50">
            No se encontraron llamadas.
          </div>
        ) : (
          llamadasFiltradas.map((ll) => (
            <div
              key={ll.id}
              className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between border-b border-carbon/5 pb-2">
                <span className="font-mono text-xs text-carbon/50">{formatearFecha(ll.created_at)}</span>
                {renderBadgeEstado(ll.estado)}
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block">Cliente</span>
                <span className="font-semibold text-verde-profundo text-sm block">{ll.cliente_telefono}</span>
                {ll.prospecto_id && (
                  <Link
                    href={`/prospectos/${ll.prospecto_id}`}
                    className="text-xs text-sauce hover:underline font-semibold"
                  >
                    👤 {ll.prospecto_nombre || ll.prospecto_id}
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block">Duración</span>
                  <span className="font-mono font-medium">{formatearDuracion(ll.duracion)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block">Asesor</span>
                  <span className="font-medium text-carbon/80">{ll.agente_nombre || "Voice Bot"}</span>
                </div>
              </div>

              {ll.grabacion_url && (
                <div className="pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block mb-1">Grabación</span>
                  <audio src={obtenerUrlAudio(ll.grabacion_url)} controls className="h-8 w-full outline-none" />
                </div>
              )}

              {(ll.transcripcion || ll.resumen_ia) && (
                <div className="pt-2 border-t border-carbon/5">
                  <button
                    type="button"
                    onClick={() => setLlamadaSeleccionada(ll)}
                    className="w-full rounded-lg bg-verde-profundo py-1.5 text-center text-xs font-semibold text-crema hover:bg-sauce transition"
                  >
                    Ver Reporte de IA y Transcripción
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de Reporte de IA */}
      {llamadaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-dorado/30 bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto scrollbar-sutil">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3">
              <div>
                <h3 className="font-titular text-xl font-semibold text-verde-profundo">
                  Auditoría de Llamada IA
                </h3>
                <p className="text-xs text-carbon/50 mt-0.5">
                  ID: {llamadaSeleccionada.twilio_call_sid}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLlamadaSeleccionada(null)}
                className="rounded-full p-1.5 hover:bg-carbon/5 text-carbon/60 transition"
              >
                ✕
              </button>
            </div>

            {/* Resumen */}
            {llamadaSeleccionada.resumen_ia && (
              <div className="rounded-xl bg-sauce/5 border border-sauce/10 p-4 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-sauce font-bold block">Resumen del Asistente</span>
                <p className="text-sm text-verde-profundo leading-relaxed font-cuerpo">
                  {llamadaSeleccionada.resumen_ia}
                </p>
              </div>
            )}

            {/* Datos perfilados estructurados */}
            {llamadaSeleccionada.datos_perfilados && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-carbon/10 p-4 bg-crema/20">
                <div className="col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block">Datos Perfilados</span>
                </div>
                <div>
                  <span className="text-xs text-carbon/50 block">Nombre</span>
                  <span className="text-sm font-semibold text-verde-profundo">
                    {llamadaSeleccionada.datos_perfilados.nombre || "--"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-carbon/50 block">Correo</span>
                  <span className="text-sm font-semibold text-verde-profundo break-all">
                    {llamadaSeleccionada.datos_perfilados.correo || "--"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-carbon/50 block">Tipo Crédito</span>
                  <span className="text-sm font-semibold text-verde-profundo">
                    {llamadaSeleccionada.datos_perfilados.tipoCredito || "--"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-carbon/50 block">Presupuesto Estimado</span>
                  <span className="text-sm font-semibold text-verde-profundo font-mono">
                    {llamadaSeleccionada.datos_perfilados.valorEstimado
                      ? `$${Number(llamadaSeleccionada.datos_perfilados.valorEstimado).toLocaleString()} MXN`
                      : "--"}
                  </span>
                </div>
              </div>
            )}

            {/* Transcripción */}
            {llamadaSeleccionada.transcripcion && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-bold block">Transcripción de la Conversación</span>
                <div className="rounded-xl border border-carbon/15 p-4 bg-carbon/5 text-sm text-carbon/80 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed scrollbar-sutil">
                  {llamadaSeleccionada.transcripcion}
                </div>
              </div>
            )}

            {/* Cierre */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setLlamadaSeleccionada(null)}
                className="rounded-lg bg-carbon/10 hover:bg-carbon/25 text-carbon px-4 py-2 text-sm font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-carbon/50">
      {children}
    </th>
  );
}
