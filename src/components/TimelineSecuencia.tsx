"use client";

import { useEffect, useState } from "react";
import {
  obtenerTrazabilidadLead,
  cambiarEstadoEnrollment,
  listarSecuencias,
  enrolarLead,
} from "@/app/actions/secuencias";

interface TimelineSecuenciaProps {
  phoneOrId: string;
  // Datos opcionales para permitir enrolamiento desde el expediente/prospecto
  datosEnrolamiento?: {
    phone: string;
    nombre: string;
    email?: string;
    prospectoId?: string;
    expedienteId?: string;
  };
}

export function TimelineSecuencia({ phoneOrId, datosEnrolamiento }: TimelineSecuenciaProps) {
  const [loading, setLoading] = useState(true);
  const [trazabilidad, setTrazabilidad] = useState<any>(null);
  const [exiting, setExiting] = useState(false);

  // Estado para el panel de enrolamiento
  const [mostrarEnrolar, setMostrarEnrolar] = useState(false);
  const [secuencias, setSecuencias] = useState<any[]>([]);
  const [secuenciaSeleccionada, setSecuenciaSeleccionada] = useState("");
  const [enrollando, setEnrollando] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (!phoneOrId) return;
      setLoading(true);
      try {
        const res = await obtenerTrazabilidadLead(phoneOrId);
        setTrazabilidad(res);
      } catch (err) {
        console.error("Error al cargar trazabilidad:", err);
      } finally {
        setLoading(false);
      }
    }
    void cargar();
  }, [phoneOrId]);

  const handleSalir = async () => {
    if (!window.confirm("¿Seguro que deseas sacar a este lead de la secuencia manualmente?")) {
      return;
    }
    setExiting(true);
    try {
      await cambiarEstadoEnrollment(trazabilidad.enrollment.id, "salido");
      const res = await obtenerTrazabilidadLead(phoneOrId);
      setTrazabilidad(res);
    } catch (err) {
      console.error("Error al salir de la secuencia:", err);
      alert("Ocurrió un error al detener la secuencia.");
    } finally {
      setExiting(false);
    }
  };

  const handleAbrirEnrolar = async () => {
    setMostrarEnrolar(true);
    if (secuencias.length === 0) {
      try {
        const lista = await listarSecuencias();
        setSecuencias(lista.filter((s: any) => s.status === "activa"));
      } catch (err) {
        console.error("Error al cargar secuencias:", err);
      }
    }
  };

  const handleEnrolar = async () => {
    if (!secuenciaSeleccionada || !datosEnrolamiento) return;
    setEnrollando(true);
    try {
      await enrolarLead({
        sequenceId: secuenciaSeleccionada,
        phone: datosEnrolamiento.phone,
        nombre: datosEnrolamiento.nombre,
        email: datosEnrolamiento.email,
        prospectoId: datosEnrolamiento.prospectoId,
        expedienteId: datosEnrolamiento.expedienteId,
      });
      setMostrarEnrolar(false);
      setSecuenciaSeleccionada("");
      // Recargar trazabilidad
      const res = await obtenerTrazabilidadLead(phoneOrId);
      setTrazabilidad(res);
    } catch (err: any) {
      alert(`Error al enrolar: ${err.message}`);
    } finally {
      setEnrollando(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-carbon/10 bg-white p-6 text-center shadow-sm">
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sauce border-t-transparent"></div>
        </div>
        <p className="text-xs text-carbon/40 font-medium">Buscando historial de secuencia…</p>
      </div>
    );
  }

  const enrollment = trazabilidad?.enrollment;
  const enrollmentActivo = enrollment?.status === "activo";
  const hayEnrollment = !!enrollment;

  // Si no hay enrollment alguno y no hay datos para enrolar, no mostrar nada
  if (!hayEnrollment && !datosEnrolamiento) {
    return null;
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-carbon/5 pb-3">
        <div>
          <h4 className="font-titular text-base font-bold text-verde-profundo">
            Línea de tiempo de la secuencia
          </h4>
          <p className="text-[11px] text-carbon/50 mt-0.5">
            {hayEnrollment
              ? <>Secuencia: <span className="font-semibold text-sauce">{enrollment.sequence?.nombre || "Automatización"}</span></>
              : <span className="italic">Sin secuencia activa</span>
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hayEnrollment && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                enrollmentActivo
                  ? "bg-emerald-100 text-emerald-800"
                  : enrollment.status === "completado"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {enrollment.status.toUpperCase()}
            </span>
          )}
          {enrollmentActivo && (
            <button
              onClick={handleSalir}
              disabled={exiting}
              className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-50"
              title="Detener secuencia manualmente"
            >
              {exiting ? "Deteniendo..." : "Detener Secuencia"}
            </button>
          )}
          {/* Botón Enrolar: visible cuando no hay enrollment activo y hay datos de enrolamiento */}
          {!enrollmentActivo && datosEnrolamiento && (
            <button
              onClick={handleAbrirEnrolar}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
            >
              + Enrolar en secuencia
            </button>
          )}
        </div>
      </div>

      {/* Panel de selección de secuencia */}
      {mostrarEnrolar && datosEnrolamiento && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800">Selecciona la secuencia:</p>
          <select
            value={secuenciaSeleccionada}
            onChange={(e) => setSecuenciaSeleccionada(e.target.value)}
            className="w-full rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs text-carbon focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            <option value="">— Elige una secuencia —</option>
            {secuencias.map((s: any) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleEnrolar}
              disabled={!secuenciaSeleccionada || enrollando}
              className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              {enrollando ? "Enrolando..." : "Confirmar enrolamiento"}
            </button>
            <button
              onClick={() => { setMostrarEnrolar(false); setSecuenciaSeleccionada(""); }}
              className="rounded border border-carbon/20 px-3 py-1 text-[10px] font-medium text-carbon/60 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Timeline de acciones ejecutadas */}
      {hayEnrollment && (
        <div>
          {trazabilidad.historial.length === 0 ? (
            <p className="text-center text-xs text-carbon/40 py-6 italic">
              No se han ejecutado acciones todavía en esta secuencia.
            </p>
          ) : (
            <div className="relative border-l-2 border-carbon/10 pl-4 ml-2 space-y-5 py-2">
              {trazabilidad.historial.map((ac: any) => {
                // Determina el color del círculo de acuerdo al estado
                let circuloColor = "bg-carbon/30";
                if (ac.status === "enviado" || ac.status === "llamada_completada" || ac.status === "sms_enviado") {
                  circuloColor = "bg-emerald-500";
                } else if (ac.status === "entregado") {
                  circuloColor = "bg-blue-500";
                } else if (ac.status === "respondido") {
                  circuloColor = "bg-teal-500 font-bold border-teal-200";
                } else if (ac.status === "fallido") {
                  circuloColor = "bg-rojo";
                } else if (ac.status === "llamada_agendada") {
                  circuloColor = "bg-amber-500";
                }

                let badgeStyle = "bg-carbon/5 text-carbon/60";
                let labelEstado = ac.status.toUpperCase();
                if (ac.status === "enviado") {
                  badgeStyle = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                  labelEstado = "ENVIADO";
                } else if (ac.status === "entregado") {
                  badgeStyle = "bg-blue-50 text-blue-700 border border-blue-100";
                  labelEstado = "RECIBIDO";
                } else if (ac.status === "respondido") {
                  badgeStyle = "bg-teal-50 text-teal-700 border border-teal-100";
                  labelEstado = "LEÍDO / RESPONDIDO";
                } else if (ac.status === "fallido") {
                  badgeStyle = "bg-rojo/5 text-rojo border border-rojo/10";
                  labelEstado = "FALLIDO";
                } else if (ac.status === "llamada_agendada") {
                  badgeStyle = "bg-amber-50 text-amber-700 border border-amber-100";
                  labelEstado = "AGENDADA";
                } else if (ac.status === "llamada_completada") {
                  badgeStyle = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                  labelEstado = "COMPLETADA";
                }

                return (
                  <div key={ac.id} className="relative">
                    <span className={`absolute -left-[23px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white ${circuloColor}`} />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-carbon">
                          {ac.canal === "whatsapp" ? "💬 WhatsApp" : ac.canal === "email" ? "✉️ Correo" : ac.canal === "sms" ? "📱 SMS" : "📞 Llamada"}
                        </span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badgeStyle}`}>
                          {labelEstado}
                        </span>
                        <span className="text-[10px] text-carbon/40 font-mono">
                          {new Date(ac.enviado_at).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-carbon/75 bg-carbon/5 px-2.5 py-2 rounded-lg border border-carbon/5 leading-relaxed">
                        {ac.contenido_enviado}
                      </p>
                      {(ac.error_detail || ac.error_detalle) ? (
                        <p className="text-[10px] text-rojo bg-rojo/5 px-2 py-1 rounded border border-rojo/10">
                          Error: {ac.error_detail || ac.error_detalle}
                        </p>
                      ) : null}
                      {ac.notas_asesor && (
                        <p className="text-[10px] text-carbon/50 italic px-1">
                          Nota Asesor: "{ac.notas_asesor}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
