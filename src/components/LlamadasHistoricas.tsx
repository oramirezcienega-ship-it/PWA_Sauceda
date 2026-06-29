"use client";

import { useEffect, useState } from "react";
import { obtenerLlamadasPorTelefono, type LlamadaConmutadorApp } from "@/app/actions/llamadas";

export function LlamadasHistoricas({ telefono }: { telefono: string }) {
  const [llamadas, setLlamadas] = useState<LlamadaConmutadorApp[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!telefono) {
        setCargando(false);
        return;
      }
      try {
        const res = await obtenerLlamadasPorTelefono(telefono);
        setLlamadas(res);
      } catch (err) {
        console.error("Error al cargar llamadas del lead:", err);
      } finally {
        setCargando(false);
      }
    }
    void cargar();
  }, [telefono]);

  if (cargando) {
    return (
      <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm mb-6 animate-pulse">
        <div className="h-5 w-48 bg-carbon/10 rounded mb-4"></div>
        <div className="h-28 bg-carbon/5 rounded"></div>
      </div>
    );
  }

  const lista = llamadas || [];

  // Formato de fecha
  function formatearFecha(isoString: string): string {
    const f = new Date(isoString);
    return f.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
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
        <span className="rounded-full bg-sauce/15 px-2 py-0.5 text-[10px] font-semibold text-verde-profundo border border-sauce/20">
          Atendida
        </span>
      );
    }
    if (["ringing", "in-progress"].includes(est)) {
      return (
        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800 border border-yellow-200 animate-pulse">
          Activa
        </span>
      );
    }
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 border border-red-200">
        Perdida
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm mb-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg font-titular font-semibold text-verde-profundo">
          📞 Historial de Llamadas
        </span>
        <span className="font-mono text-xs text-carbon/40">
          ({telefono})
        </span>
      </div>

      {lista.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
          <p className="text-sm text-carbon/40">No hay llamadas telefónicas registradas con este contacto.</p>
        </div>
      ) : (
        <div className="divide-y divide-carbon/10 max-h-[400px] overflow-y-auto pr-1 scrollbar-sutil">
          {lista.map((ll) => (
            <div key={ll.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Meta info de la llamada */}
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-bold uppercase text-[9px] ${
                    ll.tipo === "saliente"
                      ? "bg-blue-50 text-blue-700 border border-blue-100"
                      : "bg-purple-50 text-purple-700 border border-purple-100"
                  }`}>
                    {ll.tipo}
                  </span>
                  
                  <span className="font-mono text-carbon/60">
                    {formatearFecha(ll.created_at)}
                  </span>

                  <span className="text-carbon/40">·</span>

                  <span className="text-carbon/70">
                    Duración: <strong className="font-mono">{formatearDuracion(ll.duracion)}</strong>
                  </span>
                </div>

                {/* Estatus e información del agente */}
                <div className="flex items-center gap-2">
                  {ll.agente_nombre && (
                    <span className="text-carbon/60 text-[11px]">
                      Agente: <strong className="font-semibold text-carbon">{ll.agente_nombre}</strong>
                    </span>
                  )}
                  {renderBadgeEstado(ll.estado)}
                </div>
              </div>

              {/* Reproductor de audio de la llamada */}
              {ll.grabacion_url && (
                <div className="mt-2.5 bg-slate-50 p-2 rounded-lg border border-carbon/5 flex flex-col gap-1.5">
                  <span className="text-[10px] text-carbon/50 font-bold uppercase tracking-wider block">
                    Grabación oficial:
                  </span>
                  <audio
                    controls
                    src={obtenerUrlAudio(ll.grabacion_url)}
                    className="w-full max-w-lg h-9 outline-none bg-white rounded border border-carbon/10"
                    preload="none"
                  />
                </div>
              )}

              {/* Acordeón de resumen de IA si aplica */}
              {ll.resumen_ia && (
                <details className="mt-2 text-xs text-carbon/70 bg-crema/10 p-2.5 rounded-lg border border-carbon/5">
                  <summary className="font-bold text-[11px] text-verde-profundo cursor-pointer hover:text-sauce outline-none select-none">
                    📝 Resumen de la conversación (IA)
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed border-t border-carbon/5 pt-1.5 text-carbon/80">
                    {ll.resumen_ia}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
