"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { obtenerProximasCitasEInstalaciones, programarCitaManual, type Cita } from "@/app/actions/agenda";
import { concluirTareaYProgramarSiguiente } from "@/app/actions/bpm";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";

interface ProximasVisitasWidgetProps {
  perfilId?: string | null;
}

export function ProximasVisitasWidget({ perfilId }: ProximasVisitasWidgetProps) {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "instalacion" | "inspeccion" | "llamada">("todos");

  // Modal para captura de retro / resultado de la llamada o cita
  const [citaSelModal, setCitaSelModal] = useState<Cita | null>(null);
  const [resultadoTipo, setResultadoTipo] = useState<"agendado" | "reintentar" | "frio" | "completado">("agendado");
  const [observacionesModal, setObservacionesModal] = useState("");
  const [fechaAgendada, setFechaAgendada] = useState(new Date().toISOString().slice(0, 10));
  const [horaAgendada, setHoraAgendada] = useState("10:00");
  const [guardandoModal, setGuardandoModal] = useState(false);

  const cargarAgenda = useCallback(async () => {
    setCargando(true);
    try {
      let pId = perfilId;
      if (!pId) {
        const u = await obtenerUsuarioActual();
        if (u && u.rol !== "admin") {
          pId = u.id;
        }
      }
      const data = await obtenerProximasCitasEInstalaciones(pId);
      setCitas(data);
    } catch {
      // ignore
    } finally {
      setCargando(false);
    }
  }, [perfilId]);

  useEffect(() => {
    cargarAgenda();
  }, [cargarAgenda]);

  function handleAbrirModalResultado(cita: Cita) {
    setCitaSelModal(cita);
    setObservacionesModal("");
    const esLlamada = cita.tipo_cita === "llamada";
    setResultadoTipo(esLlamada ? "agendado" : "completado");
  }

  async function handleGuardarResultadoModal() {
    if (!citaSelModal) return;
    setGuardandoModal(true);
    try {
      const expedienteId = citaSelModal.expediente_id || null;
      const prospectoId = citaSelModal.prospecto_id || null;

      let tipoAct = "tarea";
      let tituloBitacora = `Cita / Llamada "${citaSelModal.tipo_cita || 'Llamada'}" atendida`;

      if (resultadoTipo === "agendado") {
        tipoAct = "inspeccion";
        tituloBitacora = `🟢 Cita / Visita Agendada: ${fechaAgendada} a las ${horaAgendada} hrs`;

        await programarCitaManual({
          expedienteId,
          prospectoId,
          perfilId: citaSelModal.perfil_id,
          clienteNombre: citaSelModal.cliente_nombre,
          clienteTelefono: citaSelModal.cliente_telefono || "",
          tipoCita: "inspeccion",
          fecha: fechaAgendada,
          horaInicio: horaAgendada,
          horaFin: `${horaAgendada.slice(0, 2)}:30`,
          notas: `Inspección agendada tras llamada. ${observacionesModal}`,
          notificarCliente: true
        });
      } else if (resultadoTipo === "reintentar") {
        tipoAct = "llamada";
        tituloBitacora = `🟡 Reintento de Llamada Programado: ${fechaAgendada} a las ${horaAgendada} hrs`;

        await programarCitaManual({
          expedienteId,
          prospectoId,
          perfilId: citaSelModal.perfil_id,
          clienteNombre: citaSelModal.cliente_nombre,
          clienteTelefono: citaSelModal.cliente_telefono || "",
          tipoCita: "llamada",
          fecha: fechaAgendada,
          horaInicio: horaAgendada,
          horaFin: `${horaAgendada.slice(0, 2)}:15`,
          notas: `Reintento de llamada. ${observacionesModal}`,
        });
      } else if (resultadoTipo === "frio") {
        tipoAct = "nota";
        tituloBitacora = `🔴 Cliente Descartado / Prospecto Frío`;
      }

      await concluirTareaYProgramarSiguiente({
        expedienteId,
        prospectoId,
        citaId: citaSelModal.id,
        resultadoNotas: `${tituloBitacora}. ${observacionesModal ? `Notas: ${observacionesModal}` : ''}`,
        reprogramarSiguiente: false,
      });

      setCitaSelModal(null);
      await cargarAgenda();
    } catch (err: any) {
      console.error("Error al guardar resultado de agenda:", err);
      alert("Error al guardar resultado: " + err.message);
    } finally {
      setGuardandoModal(false);
    }
  }

  const citasFiltradas = citas.filter((c) => {
    if (filtroTipo === "instalacion") return c.tipo_cita === "instalacion";
    if (filtroTipo === "inspeccion") return c.tipo_cita === "inspeccion";
    if (filtroTipo === "llamada") return c.tipo_cita === "llamada";
    return true;
  });

  const totalInstalaciones = citas.filter((c) => c.tipo_cita === "instalacion").length;
  const totalInspecciones = citas.filter((c) => c.tipo_cita === "inspeccion").length;
  const totalLlamadas = citas.filter((c) => c.tipo_cita === "llamada").length;



  return (
    <div className="mb-6 rounded-2xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-titular text-base sm:text-lg font-bold text-carbon flex items-center gap-2">
            <span>🗓️</span> Próximas Citas, Llamadas e Instalaciones
          </h3>
          <p className="text-xs text-carbon/50">
            Agenda del técnico y asesor con llamadas, inspecciones e instalaciones programadas
          </p>
        </div>

        {/* Filtros por tipo de actividad */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold flex-wrap">
          <button
            type="button"
            onClick={() => setFiltroTipo("todos")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "todos" ? "bg-white text-carbon shadow-xs font-bold" : "text-carbon/60 hover:text-carbon"
            }`}
          >
            Todas ({citas.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("instalacion")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "instalacion" ? "bg-emerald-600 text-white shadow-xs font-bold" : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            🛠️ Instalaciones ({totalInstalaciones})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("inspeccion")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "inspeccion" ? "bg-blue-600 text-white shadow-xs font-bold" : "text-blue-700 hover:bg-blue-50"
            }`}
          >
            🔍 Inspecciones ({totalInspecciones})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("llamada")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "llamada" ? "bg-amber-600 text-white shadow-xs font-bold" : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            📞 Llamadas ({totalLlamadas})
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="py-6 text-center text-xs text-carbon/40 animate-pulse">
          Cargando agenda de trabajo...
        </div>
      ) : citasFiltradas.length === 0 ? (
        <div className="py-6 px-4 text-center border border-dashed border-carbon/15 rounded-xl bg-slate-50/50">
          <span className="text-2xl block mb-1">✨</span>
          <p className="text-xs font-bold text-verde-profundo">No tienes citas ni llamadas programadas pendientes.</p>
          <p className="text-[11px] text-carbon/45 mt-0.5">Tus actividades operativas del día están al corriente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {citasFiltradas.map((c) => {
            const esInstalacion = c.tipo_cita === "instalacion";
            const esInspeccion = c.tipo_cita === "inspeccion";
            const esLlamada = c.tipo_cita === "llamada";

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all space-y-2 flex flex-col justify-between ${
                  esInstalacion
                    ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
                    : esInspeccion
                    ? "border-blue-200 bg-blue-50/40 hover:bg-blue-50"
                    : esLlamada
                    ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
                    : "border-carbon/10 bg-slate-50 hover:bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                        esInstalacion
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : esInspeccion
                          ? "bg-blue-100 text-blue-800 border-blue-300"
                          : esLlamada
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-slate-100 text-slate-800 border-slate-300"
                      }`}
                    >
                      {esInstalacion ? "🛠️ Instalación" : esInspeccion ? "🔍 Inspección Técnica" : esLlamada ? "📞 Llamada Programada" : "🛍️ Venta / Cita"}
                    </span>
                    <span className="text-xs font-mono font-bold text-carbon/70">
                      🕒 {c.hora_inicio.slice(0, 5)} - {c.hora_fin.slice(0, 5)}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-carbon leading-snug truncate">{c.cliente_nombre}</p>
                  
                  {c.perfil_nombre && (
                    <p className="text-[11px] font-semibold text-sauce flex items-center gap-1 mt-0.5">
                      <span>👤</span> Responsable: <span className="font-bold">{c.perfil_nombre}</span>
                    </p>
                  )}

                  {c.fraccionamiento && (
                    <p className="text-xs font-semibold text-verde-profundo flex items-center gap-1 mt-0.5">
                      <span>📍</span> {c.fraccionamiento}
                    </p>
                  )}

                  <p className="text-[11px] text-carbon/50 mt-1">
                    📅 {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                  </p>

                  {c.notas && (
                    <p className="text-[11px] text-carbon/60 bg-white/80 p-1.5 rounded-md italic mt-1.5 border border-carbon/5 line-clamp-2">
                      "{c.notas}"
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-carbon/5">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://wa.me/${c.cliente_telefono}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                    >
                      💬 WhatsApp
                    </a>

                    {c.cliente_telefono && (
                      <a
                        href={`tel:${c.cliente_telefono}`}
                        onClick={() => setTimeout(() => handleAbrirModalResultado(c), 500)}
                        className="inline-flex items-center gap-1 rounded-lg border border-sauce/20 bg-sauce/10 px-2 py-1 text-xs font-semibold text-sauce transition hover:bg-sauce hover:text-white"
                      >
                        📞 Llamar
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAbrirModalResultado(c)}
                      className="inline-flex items-center gap-1 rounded-lg bg-sauce hover:bg-verde-profundo text-white px-2.5 py-1 text-xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      ✓ Retro / Concluir
                    </button>

                    {c.expediente_id ? (
                      <Link
                        href={`/expediente/${c.expediente_id}`}
                        className="inline-flex items-center gap-0.5 text-xs font-bold text-sauce hover:underline"
                      >
                        Ver →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Captura de Retro / Resultado Operativo */}
      {citaSelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-carbon/10 text-carbon">
            <div className="flex items-start justify-between border-b border-carbon/5 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sauce block">
                  Captura de Retro / Resultado Operativo
                </span>
                <h3 className="font-titular text-base font-bold text-verde-profundo">
                  {citaSelModal.cliente_nombre} ({citaSelModal.tipo_cita || 'Llamada'})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCitaSelModal(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tarjetas Interactivas de Resultado (1-Click) */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1.5">
                  1. ¿Cuál fue el resultado de la llamada / cita?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResultadoTipo("agendado")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "agendado"
                        ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🟢 Visita Agendada</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Fija fecha/hora de la inspección</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("reintentar")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "reintentar"
                        ? "bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🟡 No Contestó</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Programa reintento de llamada</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("frio")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "frio"
                        ? "bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🔴 Descartar / Frío</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Sin interés o número erróneo</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("completado")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "completado"
                        ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">✅ Finalizar Tarea</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Solo registrar observaciones</div>
                  </button>
                </div>
              </div>

              {/* Si agendó visita o reagendó llamada: Campos de Fecha y Hora */}
              {(resultadoTipo === "agendado" || resultadoTipo === "reintentar") && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-sauce/5 border border-sauce/20 rounded-xl">
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      {resultadoTipo === "agendado" ? "Fecha de Visita Técnica" : "Fecha de Próxima Llamada"}
                    </label>
                    <input
                      type="date"
                      value={fechaAgendada}
                      onChange={(e) => setFechaAgendada(e.target.value)}
                      className="w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Hora Programada
                    </label>
                    <input
                      type="time"
                      value={horaAgendada}
                      onChange={(e) => setHoraAgendada(e.target.value)}
                      className="w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Bitácora de Observaciones */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">
                  Observaciones / Retro de la llamada:
                </label>
                <textarea
                  rows={3}
                  value={observacionesModal}
                  onChange={(e) => setObservacionesModal(e.target.value)}
                  placeholder="Ej. El cliente solicita cotización para 200m2 de losa. Cita confirmada para el viernes 10:00 am."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon/5">
              <button
                type="button"
                onClick={() => setCitaSelModal(null)}
                className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-bold text-carbon/60 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarResultadoModal}
                disabled={guardandoModal}
                className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {guardandoModal ? "Guardando..." : "💾 Guardar y Finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
