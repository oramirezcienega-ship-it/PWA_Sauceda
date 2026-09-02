"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerConversacion, eliminarMensajeIndividual, editarMensajeIndividual } from "@/app/actions/conversaciones";
import { obtenerTelLink } from "@/lib/telefono";
import type { ConversacionDetalle } from "@/lib/types";

export function ConversacionHistorica({ telefono }: { telefono: string }) {
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);

  async function borrarMensaje(mensajeId: string) {
    const ok = window.confirm("¿Seguro que deseas eliminar este mensaje de forma permanente?");
    if (!ok) return;
    try {
      const r = await eliminarMensajeIndividual(mensajeId);
      if (!r.ok) {
        alert(r.error ?? "No se pudo eliminar el mensaje.");
      } else {
        if (telefono) {
          const res = await obtenerConversacion(telefono);
          setDetalle(res);
        }
      }
    } catch (err: any) {
      alert("Error al eliminar mensaje: " + err.message);
    }
  }

  async function iniciarEdicion(mensajeId: string, textoActual: string) {
    const nuevoTexto = window.prompt("Editar mensaje:", textoActual);
    if (nuevoTexto === null) return;
    if (!nuevoTexto.trim()) {
      alert("El texto no puede estar vacío.");
      return;
    }
    try {
      const r = await editarMensajeIndividual(mensajeId, nuevoTexto.trim());
      if (!r.ok) {
        alert(r.error ?? "No se pudo editar el mensaje.");
      } else {
        if (telefono) {
          const res = await obtenerConversacion(telefono);
          setDetalle(res);
        }
      }
    } catch (err: any) {
      alert("Error al editar mensaje: " + err.message);
    }
  }

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

  const esMessenger = telefono.startsWith("messenger:");
  const esInstagram = telefono.startsWith("instagram:");

  let tituloCanal = "Historial de WhatsApp";
  let txtSinMensajes = "No hay mensajes de WhatsApp registrados con este contacto.";
  let badgeEstilo = "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800";
  let idCanalVisible = telefono;

  if (esMessenger) {
    tituloCanal = "Historial de Messenger";
    txtSinMensajes = "No hay mensajes de Facebook Messenger registrados con este contacto.";
    badgeEstilo = "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800";
    idCanalVisible = `Messenger: ${telefono.slice(10)}`;
  } else if (esInstagram) {
    tituloCanal = "Historial de Instagram DMs";
    txtSinMensajes = "No hay mensajes de Instagram registrados con este contacto.";
    badgeEstilo = "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:text-pink-800";
    idCanalVisible = `Instagram: ${telefono.slice(10)}`;
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm mb-6">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-titular font-semibold text-verde-profundo">
            💬 {tituloCanal}
          </span>
          <span className="font-mono text-xs text-carbon/40">
            ({idCanalVisible})
          </span>
        </div>
        <Link
          href={`/conversaciones?tel=${telefono}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${badgeEstilo}`}
          title="Responder o ver en la bandeja"
        >
          Ir a Bandeja de Entrada →
        </Link>
      </div>

      {detalle?.posibleBloqueo && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span><strong>Alerta:</strong> {detalle.motivoAlerta || "Posible bloqueo o número inactivo."}</span>
          </div>
          <a
            href={obtenerTelLink(telefono)}
            className="bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold px-2 py-0.5 rounded transition shrink-0"
          >
            📞 Llamar
          </a>
        </div>
      )}

      {mensajes.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
          <p className="text-sm text-carbon/40">{txtSinMensajes}</p>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto rounded-lg border border-carbon/5 bg-crema/10 p-3 flex flex-col gap-3 scrollbar-sutil">
          {mensajes.map((m) => {
            const esCliente = m.direccion === "in";
            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[85%] group ${
                  esCliente ? "self-start items-start" : "self-end items-end"
                }`}
              >
                {/* Nombre de agente si aplica */}
                {!esCliente && (
                  <span className="text-[9px] text-carbon/40 font-semibold mb-0.5 mr-1 flex items-center gap-0.5">
                    {m.agente === "IA" ? "🤖 Sofía (IA)" : `👤 ${m.agente || "Sistema"}`}
                  </span>
                )}
                
                {/* Contenedor horizontal para burbuja y botones de acción */}
                <div className={`flex items-center gap-2 ${esCliente ? "flex-row" : "flex-row-reverse"}`}>
                  {/* Burbuja de texto */}
                  <div
                    className={`rounded-lg px-3 py-2 text-xs leading-normal shadow-sm whitespace-pre-wrap ${
                      esCliente
                        ? "bg-white text-carbon border border-carbon/5 rounded-tl-none"
                        : "bg-[#2D4A2B] text-crema rounded-tr-none"
                    }`}
                  >
                    {(() => {
                      if (m.texto.startsWith("[plantilla:") || m.texto.startsWith("[Plantilla:")) {
                        const match = m.texto.match(/^\[[pP]lantilla:\s*([^\]]+)\]\s*(.*)$/);
                        if (match) {
                          const nombrePlantilla = match[1].trim();
                          const paramsString = match[2] ? match[2].trim() : "";
                          const params = paramsString ? paramsString.split(/\s*\|\s*/) : [];
                          return (
                            <div className="space-y-1">
                              <div className={`text-[9px] font-bold uppercase tracking-wider select-none ${esCliente ? "text-carbon/40" : "text-crema/60"}`}>
                                📝 Plantilla: {nombrePlantilla}
                              </div>
                              {params.length > 0 ? (
                                <div className="space-y-0.5 text-xs">
                                  {params.map((val, i) => (
                                    <p key={i} className={`leading-normal ${esCliente ? "text-carbon/80" : "text-crema/90"}`}>
                                      <span className={`font-mono font-bold text-[9px] ${esCliente ? "text-carbon/40" : "text-crema/40"}`}>{"{{"}{i + 1}{"}}"}</span> {val}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span className={`text-xs italic (sin variables) ${esCliente ? "text-carbon/40" : "text-crema/40"}`}></span>
                              )}
                            </div>
                          );
                        }
                      }
                      return m.texto;
                    })()}
                  </div>

                  {/* Botones de acción en hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex gap-1 text-[11px] select-none shrink-0">
                    {!esCliente && (
                      <button
                        type="button"
                        onClick={() => iniciarEdicion(m.id, m.texto)}
                        className="p-1 hover:bg-carbon/5 rounded text-carbon/40 hover:text-sauce transition-colors"
                        title="Editar mensaje"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => borrarMensaje(m.id)}
                      className="p-1 hover:bg-carbon/5 rounded text-carbon/40 hover:text-rojo transition-colors"
                      title="Eliminar mensaje"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Hora y Estado */}
                <span className="text-[9px] text-carbon/40 mt-1 mx-1 font-mono">
                  {new Date(m.fecha).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                  {!esCliente && m.estado && (
                    <span
                      className={`ml-1 text-[8px] font-sans font-semibold uppercase ${
                        m.estado === "error"
                          ? "text-red-700 font-bold bg-red-50 px-1 py-0.5 rounded border border-red-200 cursor-help"
                          : "opacity-75"
                      }`}
                      title={m.errorDetalle || (m.estado === "error" ? "Error al enviar mensaje" : "")}
                    >
                      · {m.estado === "read" ? "leído" : m.estado === "delivered" ? "entregado" : m.estado === "error" ? (m.errorDetalle ? `error: ${m.errorDetalle}` : "error") : "enviado"}
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
