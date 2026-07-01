"use client";

import { useEffect, useState } from "react";
import { obtenerTrazabilidadLead } from "@/app/actions/secuencias";

interface TimelineSecuenciaProps {
  phoneOrId: string;
}

export function TimelineSecuencia({ phoneOrId }: TimelineSecuenciaProps) {
  const [loading, setLoading] = useState(true);
  const [trazabilidad, setTrazabilidad] = useState<any>(null);

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

  if (!trazabilidad || !trazabilidad.enrollment) {
    return null; // No está enrolado en ninguna secuencia
  }

  const { enrollment, historial } = trazabilidad;

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
      {/* Información del enrolamiento */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-carbon/5 pb-3">
        <div>
          <h4 className="font-titular text-base font-bold text-verde-profundo">
            Línea de tiempo de la secuencia
          </h4>
          <p className="text-[11px] text-carbon/50 mt-0.5">
            Secuencia activa: <span className="font-semibold text-sauce">{enrollment.sequence?.nombre || "Automatización"}</span>
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
            enrollment.status === "activo"
              ? "bg-emerald-100 text-emerald-800"
              : enrollment.status === "completado"
              ? "bg-blue-100 text-blue-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {enrollment.status.toUpperCase()}
        </span>
      </div>

      {/* Timeline de acciones ejecutadas */}
      <div>
        {historial.length === 0 ? (
          <p className="text-center text-xs text-carbon/40 py-6 italic">
            No se han ejecutado acciones todavía en esta secuencia.
          </p>
        ) : (
          <div className="relative border-l-2 border-carbon/10 pl-4 ml-2 space-y-5 py-2">
            {historial.map((ac: any) => {
              const esLlamada = ac.canal === "llamada";
              
              // Determina el color del círculo de acuerdo al estado
              let circuloColor = "bg-carbon/30"; // por defecto gris
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

              // Estilo del badge del estado
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
                  {/* Círculo indicador del timeline */}
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
                          hour12: false
                        })}
                      </span>
                    </div>
                    
                    <p className="text-xs text-carbon/75 bg-carbon/5 px-2.5 py-2 rounded-lg border border-carbon/5 leading-relaxed">
                      {ac.contenido_enviado}
                    </p>
                    
                    {ac.error_detail || ac.error_detalle ? (
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
    </div>
  );
}
