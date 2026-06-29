"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerConversacion } from "@/app/actions/conversaciones";
import type { ConversacionDetalle } from "@/lib/types";

export function ConversacionHistorica({ telefono }: { telefono: string }) {
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!telefono) {
        setCargando(false);
        return;
      }
      try {
        const res = await obtenerConversacion(telefono);
        setDetalle(res);
      } catch {
        // silencioso
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
        <div className="h-32 bg-carbon/5 rounded"></div>
      </div>
    );
  }

  const mensajes = detalle?.mensajes || [];

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm mb-6">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-titular font-semibold text-verde-profundo">
            💬 Historial de WhatsApp
          </span>
          <span className="font-mono text-xs text-carbon/40">
            ({telefono})
          </span>
        </div>
        <Link
          href={`/conversaciones?tel=${telefono}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 transition hover:bg-green-100 hover:text-green-800"
          title="Responder o ver en la bandeja"
        >
          Ir a Bandeja de Entrada →
        </Link>
      </div>

      {mensajes.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
          <p className="text-sm text-carbon/40">No hay mensajes de WhatsApp registrados con este contacto.</p>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto rounded-lg border border-carbon/5 bg-crema/10 p-3 flex flex-col gap-3 scrollbar-sutil">
          {mensajes.map((m) => {
            const esCliente = m.direccion === "in";
            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[80%] ${
                  esCliente ? "self-start items-start" : "self-end items-end"
                }`}
              >
                {/* Nombre de agente si aplica */}
                {!esCliente && (
                  <span className="text-[9px] text-carbon/40 font-semibold mb-0.5 mr-1 flex items-center gap-0.5">
                    {m.agente === "IA" ? "🤖 Sofía (IA)" : `👤 ${m.agente || "Sistema"}`}
                  </span>
                )}
                
                {/* Burbuja de texto */}
                <div
                  className={`rounded-lg px-3 py-2 text-xs leading-normal shadow-sm whitespace-pre-wrap ${
                    esCliente
                      ? "bg-white text-carbon border border-carbon/5 rounded-tl-none"
                      : "bg-[#2D4A2B] text-crema rounded-tr-none"
                  }`}
                >
                  {m.texto}
                </div>

                {/* Hora y Estado */}
                <span className="text-[9px] text-carbon/40 mt-1 mx-1 font-mono">
                  {new Date(m.fecha).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                  {!esCliente && m.estado && (
                    <span className="ml-1 text-[8px] font-sans font-semibold uppercase opacity-75">
                      · {m.estado === "read" ? "leído" : m.estado === "delivered" ? "entregado" : "enviado"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
