"use client";

import { useState, useEffect } from "react";
import { 
  obtenerTareasExpediente, 
  actualizarEstadoTarea, 
  instanciarFlujoEnExpediente 
} from "@/app/actions/bpm";
import { crearActividadManual } from "@/app/actions/actividades";
import { formatoFecha } from "@/lib/formato";

interface WidgetBpmTareasProps {
  expedienteId: string;
  tipoNegocio?: string | null;
}

export function WidgetBpmTareas({ expedienteId, tipoNegocio }: WidgetBpmTareasProps) {
  const [tareas, setTareas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  // Modal para captura de resultados por parte del operador
  const [tareaSelModal, setTareaSelModal] = useState<any | null>(null);
  const [resultadoTipo, setResultadoTipo] = useState<"agendado" | "reintentar" | "frio" | "completado">("completado");
  const [observacionesModal, setObservacionesModal] = useState("");
  const [fechaAgendada, setFechaAgendada] = useState(new Date().toISOString().slice(0, 10));
  const [horaAgendada, setHoraAgendada] = useState("10:00");
  const [guardandoModal, setGuardandoModal] = useState(false);

  async function cargarTareas() {
    setCargando(true);
    try {
      const res = await obtenerTareasExpediente(expedienteId);
      setTareas(res);
    } catch (err) {
      console.error("Error al cargar tareas BPM:", err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (expedienteId) {
      cargarTareas();
    }
  }, [expedienteId]);

  function handleAbrirModalCompletar(tarea: any) {
    setTareaSelModal(tarea);
    setObservacionesModal("");
    const esLlamadaOVisita = tarea.titulo?.toLowerCase().includes("contactar") || tarea.titulo?.toLowerCase().includes("visita");
    setResultadoTipo(esLlamadaOVisita ? "agendado" : "completado");
  }

  async function handleGuardarResultadoModal() {
    if (!tareaSelModal) return;
    setGuardandoModal(true);
    try {
      // 1. Registrar la actividad detallada capturada por el operador
      let tipoAct = "tarea";
      let tituloBitacora = `Tarea "${tareaSelModal.titulo}" completada`;

      if (resultadoTipo === "agendado") {
        tipoAct = "inspeccion";
        tituloBitacora = `🟢 Cita / Visita Agendada: ${fechaAgendada} a las ${horaAgendada} hrs`;
      } else if (resultadoTipo === "reintentar") {
        tipoAct = "llamada";
        tituloBitacora = `🟡 Reintento de Llamada Programado: ${fechaAgendada} a las ${horaAgendada} hrs`;
      } else if (resultadoTipo === "frio") {
        tipoAct = "nota";
        tituloBitacora = `🔴 Cliente Descartado / Prospecto Frío`;
      }

      const detalleFormateado = (resultadoTipo === "agendado" || resultadoTipo === "reintentar")
        ? `Programado para: ${fechaAgendada} a las ${horaAgendada} hrs. ${observacionesModal ? `Observaciones: ${observacionesModal}` : ''}`
        : observacionesModal || undefined;

      await crearActividadManual({
        expedienteId,
        tipo: tipoAct as any,
        titulo: tituloBitacora,
        detalle: detalleFormateado,
      });

      // 2. Si no es reintento, marcar la tarea BPM como completada
      if (resultadoTipo !== "reintentar") {
        await actualizarEstadoTarea(tareaSelModal.id, "completada");
      }

      setTareaSelModal(null);
      await cargarTareas();
    } catch (err: any) {
      console.error("Error al guardar resultado de la tarea:", err);
      alert("Error al registrar resultado: " + err.message);
    } finally {
      setGuardandoModal(false);
    }
  }

  async function handleInicializar() {
    setCargando(true);
    try {
      await instanciarFlujoEnExpediente(expedienteId, tipoNegocio || "");
      await cargarTareas();
    } catch (err) {
      console.error("Error al inicializar el flujo:", err);
      alert("No se pudo inicializar el flujo BPM.");
    } finally {
      setCargando(false);
    }
  }

  if (cargando) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          <span className="text-gray-500 font-medium">Cargando flujo de trabajo (BPM)...</span>
        </div>
      </div>
    );
  }

  if (tareas.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-150">
        <h3 className="text-lg font-bold text-gray-800 mb-2">📋 Flujo de Trabajo (BPM)</h3>
        <p className="text-sm text-gray-500 mb-4">
          Este expediente no tiene tareas operativas asignadas todavía. Puedes inicializar la plantilla de flujos correspondiente para este servicio.
        </p>
        <button
          onClick={handleInicializar}
          className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-md shadow-sm transition"
        >
          🚀 Inicializar Flujo BPM
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6 border border-gray-150">
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <span className="mr-2">📋</span> Flujo de Trabajo Operativo (BPM)
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Automatización de tareas operativas del expediente
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
          {tipoNegocio}
        </span>
      </div>

      <div className="space-y-4">
        {tareas.map((t) => {
          const estaCompletada = t.estado === "completada";
          const estaBloqueada = t.estado === "esperando_condicion";
          const esPendiente = t.estado === "pendiente";

          return (
            <div
              key={t.id}
              className={`p-4 rounded-lg border transition flex items-start space-x-3 ${
                estaCompletada
                  ? "bg-emerald-50/40 border-emerald-100"
                  : estaBloqueada
                  ? "bg-gray-50/50 border-gray-200 opacity-65"
                  : "bg-white border-indigo-100 shadow-sm"
              }`}
            >
              {/* Checkbox / Icon State */}
              <div className="pt-0.5">
                {estaCompletada ? (
                  <div className="h-5 w-5 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-xs">
                    ✓
                  </div>
                ) : estaBloqueada ? (
                  <div className="h-5 w-5 bg-gray-200 text-gray-400 rounded-full flex items-center justify-center text-xs" title="Tarea bloqueada por dependencias">
                    🔒
                  </div>
                ) : (
                  <button
                    disabled={procesandoId !== null}
                    onClick={() => handleAbrirModalCompletar(t)}
                    className="h-5 w-5 rounded border-2 border-sauce hover:bg-sauce hover:text-white focus:outline-none flex items-center justify-center transition-all bg-white font-bold text-xs"
                    title="Registrar resultado y completar tarea"
                  >
                    ✓
                  </button>
                )}
              </div>

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4
                    className={`font-semibold text-sm ${
                      estaCompletada
                        ? "text-emerald-800 line-through"
                        : estaBloqueada
                        ? "text-gray-400"
                        : "text-gray-800"
                    }`}
                  >
                    {t.titulo}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.responsableId
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      Responsable: {t.responsableNombre || "Por asignar"}
                    </span>
                    {esPendiente && (
                      <button
                        type="button"
                        onClick={() => handleAbrirModalCompletar(t)}
                        className="rounded bg-sauce hover:bg-verde-profundo text-white text-[11px] font-bold px-2 py-0.5 transition shadow-2xs"
                      >
                        ✓ Registrar Resultado
                      </button>
                    )}
                  </div>
                </div>

                {t.descripcion && (
                  <p
                    className={`text-xs mt-1 leading-relaxed ${
                      estaCompletada
                        ? "text-emerald-600/70"
                        : estaBloqueada
                        ? "text-gray-300"
                        : "text-gray-500"
                    }`}
                  >
                    {t.descripcion}
                  </p>
                )}

                {/* Expiration and metadata */}
                <div className="flex items-center space-x-3 mt-2 text-3xs font-medium uppercase tracking-wider text-gray-400">
                  {estaCompletada && t.completadaEn && (
                    <span className="text-emerald-600">
                      Completada el {formatoFecha(t.completadaEn)}
                    </span>
                  )}
                  {esPendiente && t.agendadaPara && (
                    <span className={new Date(t.agendadaPara) < new Date() ? "text-rose-500 font-bold" : "text-gray-400"}>
                      Vence el {formatoFecha(t.agendadaPara)}
                    </span>
                  )}
                  {estaBloqueada && (
                    <span className="text-gray-400 italic">
                      Pendiente del paso anterior
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Captura de Resultado de la Tarea */}
      {tareaSelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-carbon/10">
            <div className="flex items-start justify-between border-b border-carbon/5 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sauce block">
                  Captura de Resultado Operativo
                </span>
                <h3 className="font-titular text-base font-bold text-verde-profundo">
                  {tareaSelModal.titulo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTareaSelModal(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tarjetas Interactivas de Resultado (1-Click) */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1.5">
                  1. ¿Cuál fue el resultado de la llamada / operación?
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
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Fija la cita y avanza el BPM</div>
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
                  Bitácora u Observaciones de la Operación:
                </label>
                <textarea
                  rows={3}
                  value={observacionesModal}
                  onChange={(e) => setObservacionesModal(e.target.value)}
                  placeholder="Ej. Se validaron 150m2 de azotea, losa de concreto con fisuras. Cita confirmada con el cliente para presupuesto."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon/5">
              <button
                type="button"
                onClick={() => setTareaSelModal(null)}
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
                {guardandoModal ? "Guardando..." : "💾 Guardar y Finalizar Tarea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
