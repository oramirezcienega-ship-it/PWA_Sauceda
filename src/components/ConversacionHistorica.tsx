"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerConversacion, eliminarMensajeIndividual, editarMensajeIndividual } from "@/app/actions/conversaciones";
import { obtenerTelLink } from "@/lib/telefono";
import type { ConversacionDetalle } from "@/lib/types";

export function ConversacionHistorica({ telefono }: { telefono: string }) {
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fotoAmpliada, setFotoAmpliada] = useState<{
    url: string;
    caption?: string;
    rotacion?: number;
  } | null>(null);

  useEffect(() => {
    if (!fotoAmpliada) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFotoAmpliada(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fotoAmpliada]);

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
                      if (m.texto.startsWith("[reacción:") || m.texto.startsWith("[reaccion:") || m.texto.startsWith("[reaction:")) {
                        const match = m.texto.match(/^\[(?:reacción|reaccion|reaction):\s*([^\]]+)\]/i);
                        if (match) {
                          const emoji = match[1]?.trim();
                          if (emoji === "quitada" || emoji === "eliminada" || !emoji) {
                            return <span className="text-xs italic opacity-70">⚪ Reacción eliminada</span>;
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                              <span className="text-base leading-none">{emoji}</span> Reaccionó con {emoji}
                            </span>
                          );
                        }
                      }
                      if (m.texto.toLowerCase().includes("tipo reaction") || m.texto.toLowerCase().includes("tipo reacción") || m.texto.toLowerCase().includes("tipo reaccion")) {
                        return (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <span className="text-base leading-none">👍</span> Reacción de WhatsApp
                          </span>
                        );
                      }
                      if (m.texto.startsWith("[plantilla:") || m.texto.startsWith("[Plantilla:")) {
                        const match = m.texto.match(/^\[[pP]lantilla:\s*([^\]]+)\]\s*([\s\S]*)$/);
                        if (match) {
                          const nombrePlantilla = match[1].trim();
                          let cleanParams = match[2] ? match[2].trim() : "";
                          let campana = "";
                          const campMatch = cleanParams.match(/\[(?:Campaña|campaña|Campana|campana):\s*([^\]]+)\]/);
                          if (campMatch) {
                            campana = campMatch[1].trim();
                            cleanParams = cleanParams.replace(campMatch[0], "").trim();
                          }
                          const params = cleanParams ? cleanParams.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean) : [];
                          return (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider select-none">
                                <span className={esCliente ? "text-carbon/60" : "text-crema/70"}>
                                  📝 Plantilla: {nombrePlantilla}
                                </span>
                                {campana && (
                                  <span className={`px-1.5 py-0.5 rounded font-semibold ${esCliente ? "bg-amber-100 text-amber-800" : "bg-amber-400/20 text-amber-200"}`}>
                                    📢 {campana}
                                  </span>
                                )}
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
                                <span className={`text-xs italic ${esCliente ? "text-carbon/40" : "text-crema/40"}`}>(sin variables)</span>
                              )}
                            </div>
                          );
                        }
                      }
                      if (m.texto.startsWith("[image:")) {
                        const match = m.texto.match(/^\[image:([^\]]+)\]\s*([\s\S]*)$/);
                        if (match) {
                          const mediaId = match[1];
                          const caption = match[2]?.trim();
                          const mediaUrl = mediaId.startsWith("http") ? mediaId : `/api/conversaciones/media?mediaId=${mediaId}`;
                          
                          let plantillaAnidada: React.ReactNode = null;
                          if (caption && (caption.startsWith("[plantilla:") || caption.startsWith("[Plantilla:"))) {
                            const pMatch = caption.match(/^\[[pP]lantilla:\s*([^\]]+)\]\s*([\s\S]*)$/);
                            if (pMatch) {
                              const nombreP = pMatch[1].trim();
                              let pRest = pMatch[2] ? pMatch[2].trim() : "";
                              let camp = "";
                              const cMatch = pRest.match(/\[(?:Campaña|campaña|Campana|campana):\s*([^\]]+)\]/);
                              if (cMatch) {
                                camp = cMatch[1].trim();
                                pRest = pRest.replace(cMatch[0], "").trim();
                              }
                              const pParams = pRest ? pRest.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean) : [];
                              plantillaAnidada = (
                                <div className="space-y-1 mt-1.5 pt-1.5 border-t border-black/10">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider select-none">
                                    <span className={esCliente ? "text-carbon/60" : "text-crema/70"}>
                                      📝 Plantilla: {nombreP}
                                    </span>
                                    {camp && (
                                      <span className={`px-1.5 py-0.5 rounded font-semibold ${esCliente ? "bg-amber-100 text-amber-800" : "bg-amber-400/20 text-amber-200"}`}>
                                        📢 {camp}
                                      </span>
                                    )}
                                  </div>
                                  {pParams.length > 0 && (
                                    <div className="space-y-0.5 text-xs">
                                      {pParams.map((val, i) => (
                                        <p key={i} className={`leading-normal ${esCliente ? "text-carbon/80" : "text-crema/90"}`}>
                                          <span className={`font-mono font-bold text-[9px] ${esCliente ? "text-carbon/40" : "text-crema/40"}`}>{"{{"}{i + 1}{"}}"}</span> {val}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          }

                          return (
                            <div className="space-y-1.5 max-w-[240px]">
                              <button
                                type="button"
                                onClick={() => setFotoAmpliada({ url: mediaUrl, caption, rotacion: 0 })}
                                className="block w-full text-left overflow-hidden rounded-lg border border-carbon/10 bg-black/5 hover:opacity-95 active:scale-[0.99] transition cursor-pointer relative group focus:outline-none"
                                title="Toca para ampliar foto"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={mediaUrl}
                                  alt={caption || "Imagen de WhatsApp"}
                                  className="max-h-[180px] w-full object-contain mx-auto"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-carbon/0 group-hover:bg-carbon/15 transition-colors flex items-center justify-center pointer-events-none">
                                  <span className="opacity-0 group-hover:opacity-100 bg-carbon/80 text-white text-[10px] px-2 py-0.5 rounded-full font-medium transition-opacity shadow-md">
                                    🔍 Ampliar
                                  </span>
                                </div>
                              </button>
                              {plantillaAnidada ? (
                                plantillaAnidada
                              ) : caption ? (
                                <p className={`text-xs whitespace-pre-line ${esCliente ? "text-carbon/80" : "text-crema/90"}`}>{caption}</p>
                              ) : null}
                            </div>
                          );
                        }
                      }

                      if (m.texto.startsWith("[audio:")) {
                        const match = m.texto.match(/^\[audio:([^\]]+)\]\s*(.*)$/);
                        if (match) {
                          const mediaId = match[1];
                          const resto = match[2];
                          return (
                            <div className="space-y-1.5 min-w-[200px]">
                              <audio
                                src={`/api/conversaciones/audio?mediaId=${mediaId}`}
                                controls
                                className="h-8 w-full max-w-[220px] outline-none"
                                preload="metadata"
                              />
                              {resto && resto !== "(mensaje de tipo audio)" && (
                                <p className={`text-[11px] italic mt-1 ${esCliente ? "text-carbon/80" : "text-crema/90"}`}>
                                  "{resto}"
                                </p>
                              )}
                            </div>
                          );
                        }
                      }

                      if (m.texto.startsWith("[sticker:")) {
                        const match = m.texto.match(/^\[sticker:([^\]]+)\]/);
                        if (match) {
                          const mediaId = match[1];
                          const mediaUrl = `/api/conversaciones/media?mediaId=${mediaId}`;
                          return (
                            <button
                              type="button"
                              onClick={() => setFotoAmpliada({ url: mediaUrl, caption: "Sticker", rotacion: 0 })}
                              className="block cursor-pointer focus:outline-none"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={mediaUrl}
                                alt="Sticker"
                                className="h-24 w-24 object-contain"
                                loading="lazy"
                              />
                            </button>
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

      {/* Modal Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de imagen"
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 16px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
          }}
        >
          {/* Barra superior */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full px-4 py-2 flex items-center justify-between gap-2 z-20 shrink-0"
          >
            <button
              type="button"
              onClick={() => setFotoAmpliada(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white font-semibold text-sm backdrop-blur-md transition active:scale-95 shadow-lg cursor-pointer"
            >
              <span className="text-base font-bold leading-none">←</span>
              <span>Volver a la conversación</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFotoAmpliada((prev) =>
                    prev ? { ...prev, rotacion: ((prev.rotacion || 0) + 90) % 360 } : null
                  )
                }
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 cursor-pointer text-sm"
                title="Rotar 90°"
              >
                🔄
              </button>

              <a
                href={`${fotoAmpliada.url}&download=1`}
                download
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition active:scale-95 text-sm"
                title="Descargar imagen"
              >
                ⬇️
              </a>

              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-red-600 text-white font-bold text-lg flex items-center justify-center backdrop-blur-md transition active:scale-95 shadow-lg cursor-pointer"
                title="Cerrar foto"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Área central */}
          <div
            onClick={() => setFotoAmpliada(null)}
            className="flex-1 w-full flex items-center justify-center p-3 min-h-0 overflow-auto cursor-zoom-out"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-full max-h-full flex items-center justify-center cursor-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoAmpliada.url}
                alt={fotoAmpliada.caption || "Foto ampliada"}
                className="max-h-[74vh] max-w-[94vw] object-contain rounded-xl shadow-2xl transition-transform duration-200"
                style={{
                  transform: `rotate(${fotoAmpliada.rotacion || 0}deg)`,
                }}
              />
            </div>
          </div>

          {/* Pie */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full px-4 py-2 flex flex-col items-center gap-1 z-20 shrink-0"
          >
            {fotoAmpliada.caption && (
              <div className="max-w-xl px-4 py-2 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md text-white/90 text-sm font-medium text-center shadow-lg">
                {fotoAmpliada.caption}
              </div>
            )}
            <p className="text-[11px] text-white/50 text-center tracking-wide">
              Toca fuera de la foto o pulsa &ldquo;Volver a la conversación&rdquo; para regresar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
