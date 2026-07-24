"use client";

import { useState, useEffect } from "react";
import { 
  obtenerTareasExpediente, 
  actualizarEstadoTarea, 
  instanciarFlujoEnExpediente 
} from "@/app/actions/bpm";
import { formatoFecha } from "@/lib/formato";

interface WidgetBpmTareasProps {
  expedienteId: string;
  tipoNegocio: string;
}

export function WidgetBpmTareas({ expedienteId, tipoNegocio }: WidgetBpmTareasProps) {
  const [tareas, setTareas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

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

  async function handleCompletar(tareaId: string) {
    if (procesandoId) return;
    setProcesandoId(tareaId);
    try {
      await actualizarEstadoTarea(tareaId, "completada");
      await cargarTareas();
    } catch (err) {
      console.error("Error al completar la tarea:", err);
      alert("Hubo un error al actualizar la tarea.");
    } finally {
      setProcesandoId(null);
    }
  }

  async function handleInicializar() {
    setCargando(true);
    try {
      await instanciarFlujoEnExpediente(expedienteId, tipoNegocio);
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
                    onClick={() => handleCompletar(t.id)}
                    className="h-5 w-5 rounded border-2 border-indigo-400 hover:border-indigo-600 focus:outline-none flex items-center justify-center transition-all bg-white"
                  >
                    {procesandoId === t.id && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600"></div>
                    )}
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
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.responsableId
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    Responsable: {t.responsableNombre || "Por asignar"}
                  </span>
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
    </div>
  );
}
