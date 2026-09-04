"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { rolUsuarioActual, obtenerUsuarioActual } from "@/app/actions/usuarios";
import {
  listarConversaciones,
  obtenerConversacion,
  responderConversacion,
  responderConPlantilla,
  eliminarConversacion,
  probarIA,
  finalizarConversacion,
  asignarAgente,
  listarAsesoresActivos,
  listarRespuestasRapidas,
  type RespuestaRapidaDB,
  eliminarMensajeIndividual,
  editarMensajeIndividual,
  enviarStickerConversacion,
  enviarArchivoDirectoConversacion,
  actualizarTipoNegocioConversacion,
  corregirOrtografiaMensaje,
} from "@/app/actions/conversaciones";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import { obtenerUltimosDocumentosDeProspecto } from "@/app/actions/cotizaciones";
import { enviarDocumentoConversacion, type DocumentoVenta } from "@/app/actions/documentos";
import { formatearTelefonoLegible, obtenerTelLink } from "@/lib/telefono";
import { obtenerProveedorIA, guardarProveedorIA } from "@/app/actions/expedientes";
import { DocumentosVentas } from "./DocumentosVentas";
import { RespuestasRapidasEditor } from "./RespuestasRapidasEditor";
import { ModalCalculadoraImpermeabilizacion } from "./ModalCalculadoraImpermeabilizacion";
import type {
  ConversacionDetalle,
  ConversacionResumen,
} from "@/lib/types";
import { labelTipoNegocio } from "@/lib/types";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";

type TabPrincipal = "bandeja" | "documentos" | "respuestas";

const INPUT =
  "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

type CanalMensajeria = "messenger" | "instagram" | "whatsapp";

function canalDe(telefono: string): CanalMensajeria {
  if (telefono.startsWith("messenger:")) return "messenger";
  if (telefono.startsWith("instagram:")) return "instagram";
  return "whatsapp";
}

function CanalBadge({ telefono, size = "sm" }: { telefono: string; size?: "sm" | "xs" | "md" }) {
  const canal = canalDe(telefono);
  const sizeClasses = size === "xs" ? "text-[8px] px-1 py-0.5" : size === "md" ? "text-xs px-2 py-0.5" : "text-[9px] px-1.5 py-0.5";
  if (canal === "messenger") return (
    <span title="Facebook Messenger" className={`shrink-0 rounded font-bold ${sizeClasses} bg-blue-100 text-blue-700 border border-blue-200`}>
      Messenger
    </span>
  );
  if (canal === "instagram") return (
    <span title="Instagram DM" className={`shrink-0 rounded font-bold ${sizeClasses} bg-pink-100 text-pink-700 border border-pink-200`}>
      Instagram
    </span>
  );
  return (
    <span title="WhatsApp" className={`shrink-0 rounded font-bold ${sizeClasses} bg-green-100 text-green-700 border border-green-200`}>
      WhatsApp
    </span>
  );
}

export function coincidenTelefonos(tel1: string, tel2: string): boolean {
  const esSocial = (t: string) => t.startsWith("messenger:") || t.startsWith("instagram:");
  if (esSocial(tel1) || esSocial(tel2)) return tel1 === tel2;
  const t1 = tel1.replace(/\D/g, "");
  const t2 = tel2.replace(/\D/g, "");
  if (!t1 || !t2) return false;
  if (t1.length >= 10 && t2.length >= 10) {
    return t1.slice(-10) === t2.slice(-10);
  }
  return t1 === t2;
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Countdown24h({
  ultimoInboundFecha,
  ventanaAbierta,
}: {
  ultimoInboundFecha: string | null;
  ventanaAbierta: boolean;
}) {
  const [tiempoRestante, setTiempoRestante] = useState<string>("");
  const [colorClass, setColorClass] = useState<string>("bg-carbon/10 text-carbon/50");

  useEffect(() => {
    if (!ventanaAbierta || !ultimoInboundFecha) {
      setTiempoRestante("Expirada");
      setColorClass("bg-carbon/10 text-carbon/50");
      return;
    }

    const MS_24H = 24 * 60 * 60 * 1000;
    const fechaInbound = new Date(ultimoInboundFecha).getTime();

    function calcular() {
      const ahora = Date.now();
      const limite = fechaInbound + MS_24H;
      const diferencia = limite - ahora;

      if (diferencia <= 0) {
        setTiempoRestante("Expirada");
        setColorClass("bg-carbon/10 text-carbon/50");
        return;
      }

      const horas = Math.floor(diferencia / (1000 * 60 * 60));
      const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));

      setTiempoRestante(`${horas}h ${minutos}m`);

      if (horas >= 12) {
        setColorClass("bg-sauce/15 text-verde-profundo border border-sauce/20");
      } else if (horas >= 2) {
        setColorClass("bg-dorado/15 text-carbon/70 border border-dorado/30");
      } else {
        setColorClass("bg-rojo/10 text-rojo border border-rojo/20 animate-pulse font-medium");
      }
    }

    calcular();
    const id = setInterval(calcular, 60000);
    return () => clearInterval(id);
  }, [ultimoInboundFecha, ventanaAbierta]);

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase ${colorClass}`}
      title={
        ultimoInboundFecha
          ? `Último mensaje recibido: ${new Date(ultimoInboundFecha).toLocaleString("es-MX")}`
          : ""
      }
    >
      {tiempoRestante}
    </span>
  );
}

/** Resuelve parámetros {{nombre}}, {{asesor}}, etc. en el texto de una respuesta rápida. */
function resolverParametros(
  texto: string,
  detalle: ConversacionDetalle | null,
  usuario: { nombre: string } | null,
): string {
  let t = texto;
  if (detalle?.nombre) {
    t = t.replace(/\{\{nombre\}\}/g, detalle.nombre.split(" ")[0]);
    t = t.replace(/\{\{nombre_completo\}\}/g, detalle.nombre);
  }
  if (usuario?.nombre) {
    t = t.replace(/\{\{asesor\}\}/g, usuario.nombre);
  }
  // {{fraccionamiento}} requiere datos del expediente — se deja sin resolver si no hay info
  return t;
}

/** Renderiza el texto del mensaje, soportando reproductores de audio para audios de WhatsApp */
function renderizarContenidoMensaje(texto: string, plantillas: PlantillaWhatsApp[] = []) {
  if (texto) {
    if (texto.startsWith("[audio:")) {
      const match = texto.match(/^\[audio:([^\]]+)\]\s*(.*)$/);
      if (match) {
        const mediaId = match[1];
        const resto = match[2];
        return (
          <div className="space-y-1.5 min-w-[220px]">
            <div className="flex items-center gap-1.5 text-[10px] text-carbon/40 font-semibold select-none">
              <span>🎙️ Mensaje de voz de WhatsApp</span>
            </div>
            <audio
              src={`/api/conversaciones/audio?mediaId=${mediaId}`}
              controls
              className="h-8 w-full max-w-[250px] outline-none"
              preload="metadata"
            />
            {resto && resto !== "(mensaje de tipo audio)" && (
              <p className="text-[11px] italic bg-carbon/5 p-2 rounded-lg border border-carbon/5 mt-1 text-carbon/80 leading-relaxed font-normal">
                "{resto}"
              </p>
            )}
          </div>
        );
      }
    }

    if (texto.startsWith("[image:")) {
      const match = texto.match(/^\[image:([^\]]+)\]\s*(.*)$/);
      if (match) {
        const mediaId = match[1];
        const caption = match[2];
        return (
          <div className="space-y-1 max-w-[280px]">
            <div className="overflow-hidden rounded-lg border border-carbon/10 bg-carbon/5 shadow-sm">
              <a
                href={`/api/conversaciones/media?mediaId=${mediaId}`}
                target="_blank"
                rel="noreferrer"
                className="block hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/conversaciones/media?mediaId=${mediaId}`}
                  alt={caption || "Imagen de WhatsApp"}
                  className="max-h-[220px] w-full object-contain mx-auto"
                  loading="lazy"
                />
              </a>
            </div>
            {caption && <p className="text-xs text-carbon/80 font-normal mt-1 leading-normal">{caption}</p>}
          </div>
        );
      }
    }

    if (texto.startsWith("[sticker:")) {
      const match = texto.match(/^\[sticker:([^\]]+)\]/);
      if (match) {
        const mediaId = match[1];
        return (
          <div className="relative inline-block my-1">
            <a
              href={`/api/conversaciones/media?mediaId=${mediaId}`}
              target="_blank"
              rel="noreferrer"
              className="block group transition-transform duration-200 hover:scale-105"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/conversaciones/media?mediaId=${mediaId}`}
                alt="Sticker"
                className="h-28 w-28 object-contain drop-shadow-sm"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                  const p = (e.target as HTMLElement).parentElement;
                  if (p && !p.querySelector(".sticker-fallback")) {
                    const d = document.createElement("div");
                    d.className = "sticker-fallback flex items-center gap-1.5 p-2 bg-carbon/5 rounded-lg text-xs text-carbon/60";
                    d.innerHTML = "<span>🎭</span> <span>Sticker</span>";
                    p.appendChild(d);
                  }
                }}
              />
            </a>
          </div>
        );
      }
    }

    if (texto.startsWith("[contact:")) {
      const match = texto.match(/^\[contact:([^|\]]*)\|?([^|\]]*)\|?([^|\]]*)\]/);
      if (match) {
        const nombre = match[1]?.trim() || "Contacto";
        const telefono = match[2]?.trim();
        const email = match[3]?.trim();
        return (
          <div className="min-w-[220px] max-w-[280px] rounded-xl border border-carbon/15 bg-white/95 p-3 shadow-sm space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-verde-profundo/10 text-verde-profundo font-bold text-base">
                👤
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs text-carbon truncate">{nombre}</p>
                {telefono && (
                  <p className="text-[11px] font-mono text-carbon/70 truncate">{formatearTelefonoLegible(telefono)}</p>
                )}
                {email && (
                  <p className="text-[10px] text-carbon/50 truncate">{email}</p>
                )}
              </div>
            </div>
            {telefono && (
              <div className="flex gap-1.5 pt-1.5 border-t border-carbon/10">
                <a
                  href={`tel:${obtenerTelLink(telefono)}`}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-verde-profundo/10 hover:bg-verde-profundo/20 text-verde-profundo text-[11px] font-medium transition"
                >
                  <span>📞 Llamar</span>
                </a>
                <a
                  href={`https://wa.me/${telefono.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-verde-chile/10 hover:bg-verde-chile/20 text-verde-profundo text-[11px] font-medium transition"
                >
                  <span>💬 WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        );
      }
    }

    if (texto.startsWith("[location:")) {
      const match = texto.match(/^\[location:([^|\]]+)\|?([^|\]]*)\|?([^|\]]*)\]/);
      if (match) {
        const coords = match[1]?.trim();
        const name = match[2]?.trim();
        const address = match[3]?.trim();
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
        return (
          <div className="min-w-[220px] max-w-[280px] rounded-xl border border-carbon/15 bg-white/95 p-3 shadow-sm space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 font-bold text-base">
                📍
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs text-carbon truncate">
                  {name || "Ubicación compartida"}
                </p>
                {address && (
                  <p className="text-[11px] text-carbon/70 line-clamp-2 leading-tight mt-0.5">
                    {address}
                  </p>
                )}
                {!address && !name && (
                  <p className="text-[11px] font-mono text-carbon/60">{coords}</p>
                )}
              </div>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 text-[11px] font-medium transition"
            >
              <span>🗺️ Ver en Google Maps</span>
            </a>
          </div>
        );
      }
    }

    if (texto.startsWith("[opción:") || texto.startsWith("[botón:")) {
      const match = texto.match(/^\[(opción|botón):\s*([^\]]+)\]/i);
      if (match) {
        const valor = match[2];
        return (
          <div className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-verde-profundo/10 border border-verde-profundo/20 text-verde-profundo text-xs font-medium">
            <span>🔘</span>
            <span>{valor}</span>
          </div>
        );
      }
    }

    // Compatibilidad y estilo visual para mensajes de tipo especial previos ya guardados
    if (texto.toLowerCase().includes("tipo contacts") || texto.toLowerCase().includes("tipo contacto")) {
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs shadow-sm max-w-[260px]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-base">
            📇
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-carbon text-[12px]">Contacto compartido</p>
            <p className="text-[10px] text-carbon/60">Tarjeta de contacto de WhatsApp</p>
          </div>
        </div>
      );
    }

    if (texto.toLowerCase().includes("tipo location") || texto.toLowerCase().includes("tipo ubicación") || texto.toLowerCase().includes("tipo ubicacion")) {
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs shadow-sm max-w-[260px]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-base">
            📍
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-carbon text-[12px]">Ubicación compartida</p>
            <p className="text-[10px] text-carbon/60">Ubicación enviada por WhatsApp</p>
          </div>
        </div>
      );
    }

    if (texto.toLowerCase().includes("tipo sticker")) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-carbon/10 bg-carbon/5 p-2 text-xs text-carbon/70 max-w-[200px]">
          <span className="text-base">🎭</span>
          <span className="font-medium">Sticker de WhatsApp</span>
        </div>
      );
    }

    if (texto.startsWith("[reacción:") || texto.startsWith("[reaccion:") || texto.startsWith("[reaction:")) {
      const match = texto.match(/^\[(?:reacción|reaccion|reaction):\s*([^\]]+)\]/i);
      if (match) {
        const emoji = match[1]?.trim();
        if (emoji === "quitada" || emoji === "eliminada" || !emoji) {
          return (
            <div className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-carbon/5 border border-carbon/10 text-carbon/60 text-xs italic">
              <span>⚪</span>
              <span>Reacción eliminada</span>
            </div>
          );
        }
        return (
          <div className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-white/95 border border-carbon/15 shadow-sm text-carbon">
            <span className="text-xl leading-none select-none">{emoji}</span>
            <span className="text-xs font-medium text-carbon/80">Reaccionó con {emoji}</span>
          </div>
        );
      }
    }

    if (texto.toLowerCase().includes("tipo reaction") || texto.toLowerCase().includes("tipo reacción") || texto.toLowerCase().includes("tipo reaccion")) {
      return (
        <div className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs">
          <span className="text-base select-none">👍</span>
          <span className="font-medium">Reacción de WhatsApp (emoji)</span>
        </div>
      );
    }

    const matchTipoGenerico = texto.match(/^[\({]mensaje de tipo ([a-zA-Z0-9_-]+)[\)}]$/i);
    if (matchTipoGenerico) {
      const tipo = matchTipoGenerico[1];
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-carbon/5 border border-carbon/10 text-carbon/60 text-xs italic">
          <span>📎</span>
          <span>Mensaje adjunto ({tipo})</span>
        </div>
      );
    }

    if (texto.startsWith("[video:")) {
      const match = texto.match(/^\[video:([^\]]+)\]\s*(.*)$/);
      if (match) {
        const mediaId = match[1];
        const caption = match[2];
        return (
          <div className="space-y-1 max-w-[280px]">
            <div className="overflow-hidden rounded-lg border border-carbon/10 bg-carbon/5 shadow-sm">
              <video
                src={`/api/conversaciones/media?mediaId=${mediaId}`}
                controls
                className="max-h-[220px] w-full object-contain mx-auto"
                preload="metadata"
              />
            </div>
            {caption && <p className="text-xs text-carbon/80 font-normal mt-1 leading-normal">{caption}</p>}
          </div>
        );
      }
    }

    if (texto.startsWith("[document:")) {
      const match = texto.match(/^\[document:([^\]]+)\]\s*(.*)$/);
      if (match) {
        const mediaId = match[1];
        const filename = match[2] || "documento.bin";
        return (
          <div className="min-w-[220px] max-w-[280px]">
            <a
              href={`/api/conversaciones/media?mediaId=${mediaId}`}
              download={filename}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-carbon/15 bg-crema/40 p-2.5 text-xs font-semibold text-verde-profundo hover:bg-crema hover:border-sauce transition shadow-sm"
            >
              <span className="text-2xl shrink-0 select-none">📄</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-carbon font-medium text-[12px]">{filename}</p>
                <p className="text-[10px] text-carbon/40 font-normal">Descargar documento</p>
              </div>
            </a>
          </div>
        );
      }
    }

    // Renderizar plantilla de WhatsApp con variables
    if (texto.startsWith("[plantilla:") || texto.startsWith("[Plantilla:")) {
      const match = texto.match(/^\[[pP]lantilla:\s*([^\]]+)\]\s*(.*)$/);
      if (match) {
        const nombrePlantilla = match[1].trim();
        const paramsString = match[2] ? match[2].trim() : "";
        const params = paramsString ? paramsString.split(/\s*\|\s*/) : [];
        
        const plantillaObj = plantillas.find(
          (p) => p.nombre.toLowerCase() === nombrePlantilla.toLowerCase()
        );
        
        if (plantillaObj && plantillaObj.cuerpo) {
          let textoRenderizado = plantillaObj.cuerpo;
          params.forEach((val, i) => {
            textoRenderizado = textoRenderizado.replace(
              new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, "g"),
              val
            );
          });
          
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-verde-profundo/60 select-none">
                <span>📝 Plantilla: {plantillaObj.nombre}</span>
              </div>
              <span className="whitespace-pre-line leading-relaxed">{textoRenderizado}</span>
            </div>
          );
        } else {
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-carbon/40 select-none">
                <span>📝 Plantilla: {nombrePlantilla}</span>
              </div>
              {params.length > 0 ? (
                <div className="space-y-0.5 text-xs">
                  {params.map((val, i) => (
                    <p key={i} className="text-carbon/80 leading-normal">
                      <span className="font-mono font-bold text-[9px] text-carbon/40">{"{{"}{i + 1}{"}}"}</span> {val}
                    </p>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-carbon/40 italic">(sin variables)</span>
              )}
            </div>
          );
        }
      }
    }
  }
  return <span>{texto}</span>;
}

/** Bandeja de conversaciones de WhatsApp (lista + hilo + responder). */
export function Conversaciones() {
  const [tab, setTab] = useState<TabPrincipal>("bandeja");
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [filtro, setFiltro] = useState<"abiertas" | "terminadas">("abiertas");
  const [subFiltro, setSubFiltro] = useState<"todas" | "mias" | "ia" | "nuevas">("todas");
  const [usuario, setUsuario] = useState<{ id: string; nombre: string; email: string; rol: "admin" | "asesor" | "operaciones" } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [soloTel, setSoloTel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [documentosCliente, setDocumentosCliente] = useState<{
    cotizacionToken: string;
    tieneRemision: boolean;
    tieneGarantia: boolean;
  } | null>(null);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [plantillas, setPlantillas] = useState<PlantillaWhatsApp[]>([]);
  const [texto, setTexto] = useState("");
  const [plantillaSel, setPlantillaSel] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cambiandoTipoNegocio, setCambiandoTipoNegocio] = useState(false);

  // Cargar documentos del prospecto seleccionado
  useEffect(() => {
    if (!detalle?.prospectoId) {
      setDocumentosCliente(null);
      return;
    }
    setCargandoDocs(true);
    obtenerUltimosDocumentosDeProspecto(detalle.prospectoId)
      .then((docs) => setDocumentosCliente(docs))
      .catch((err) => {
        console.error("Error al cargar documentos del prospecto:", err);
        setDocumentosCliente(null);
      })
      .finally(() => setCargandoDocs(false));
  }, [detalle?.prospectoId]);
  const [estadoIA, setEstadoIA] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probandoIA, setProbandoIA] = useState(false);
  const [proveedorIA, setProveedorIA] = useState("anthropic");
  const [cambiandoProveedor, setCambiandoProveedor] = useState(false);
  const [asesores, setAsesores] = useState<{ id: string; nombre: string }[]>([]);
  const [asignando, setAsignando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [mostrarAtajos, setMostrarAtajos] = useState(false);
  const [filtroAtajos, setFiltroAtajos] = useState("");
  const [indiceAtajoSeleccionado, setIndiceAtajoSeleccionado] = useState(0);
  const [mostrarDropdownMenu, setMostrarDropdownMenu] = useState(false);
  const [respuestasRapidas, setRespuestasRapidas] = useState<RespuestaRapidaDB[]>([]);
  const [mostrarAdjuntar, setMostrarAdjuntar] = useState(false);
  const [enviandoDoc, setEnviandoDoc] = useState(false);
  const [enviandoArchivoDirecto, setEnviandoArchivoDirecto] = useState(false);
  const [mostrarStickers, setMostrarStickers] = useState(false);
  const [enviandoSticker, setEnviandoSticker] = useState(false);
  const [corrigiendoOrtografia, setCorrigiendoOrtografia] = useState(false);
  const [exitoOrtografia, setExitoOrtografia] = useState(false);
  const [mostrarCalculadora, setMostrarCalculadora] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Registro local de conversaciones leídas (para quitar 'Pendiente de Respuesta')
  const [leidasHasta, setLeidasHasta] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const guardadas = localStorage.getItem("sauceda_chats_leidos");
        if (guardadas) setLeidasHasta(JSON.parse(guardadas));
      } catch {}
    }
  }, []);

  function marcarComoLeida(telefono: string, fechaInbound?: string | null) {
    const marca = fechaInbound || new Date().toISOString();
    setLeidasHasta((prev) => {
      const nuevo = { ...prev, [telefono]: marca };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("sauceda_chats_leidos", JSON.stringify(nuevo));
        } catch {}
      }
      return nuevo;
    });
  }

  async function ejecutarPruebaIA() {
    setProbandoIA(true);
    setEstadoIA(null);
    try {
      setEstadoIA(await probarIA());
    } catch {
      setEstadoIA({ ok: false, mensaje: "No se pudo ejecutar la prueba." });
    }
    setProbandoIA(false);
  }

  async function cambiarProveedor(nuevoProveedor: string) {
    setCambiandoProveedor(true);
    try {
      const ok = await guardarProveedorIA(nuevoProveedor);
      if (ok) {
        setProveedorIA(nuevoProveedor);
        setEstadoIA({ ok: true, mensaje: `Proveedor cambiado a ${nuevoProveedor} con éxito.` });
      } else {
        setEstadoIA({ ok: false, mensaje: "Error al guardar el nuevo proveedor." });
      }
    } catch {
      setEstadoIA({ ok: false, mensaje: "Excepción al cambiar el proveedor." });
    }
    setCambiandoProveedor(false);
  }

  const refrescar = useCallback(async (telefonoPreseleccionado: string | null) => {
    try {
      const lista = await listarConversaciones();
      setConversaciones(lista);
      if (telefonoPreseleccionado) {
        const coincidencia = lista.find((c) => coincidenTelefonos(c.telefono, telefonoPreseleccionado));
        const telReal = coincidencia ? coincidencia.telefono : telefonoPreseleccionado;
        setSel(telReal);
        const d = await obtenerConversacion(telReal);
        setDetalle(d);
      }
    } catch {
      // silencioso: el sondeo reintenta
    }
  }, []);

  // Carga inicial + plantillas aprobadas + asesores + rol.
  useEffect(() => {
    let preseleccion: string | null = null;
    if (typeof window !== "undefined") {
      const queryParams = new URLSearchParams(window.location.search);
      const tel = queryParams.get("tel") || queryParams.get("telefono");
      if (tel) {
        preseleccion = tel;
        setSoloTel(tel);
      }
    }

    void refrescar(preseleccion);
    listarPlantillasWhatsApp()
      .then((r) => setPlantillas(r.plantillas.filter((p) => p.estado === "APPROVED")))
      .catch(() => setPlantillas([]));
    
    listarAsesoresActivos()
      .then((r) => setAsesores(r))
      .catch(() => setAsesores([]));

    listarRespuestasRapidas()
      .then((r) => setRespuestasRapidas(r))
      .catch(() => setRespuestasRapidas([]));

    rolUsuarioActual()
      .then((rol) => {
        setEsAdmin(rol === "admin");
        if (rol === "admin") {
          obtenerProveedorIA()
            .then((prov) => setProveedorIA(prov))
            .catch(() => {});
        }
      })
      .catch(() => setEsAdmin(false));

    obtenerUsuarioActual()
      .then((u) => setUsuario(u))
      .catch(() => setUsuario(null));
  }, [refrescar]);

  // Sondeo cada 15 s (lista + hilo abierto).
  useEffect(() => {
    const id = setInterval(() => void refrescar(sel), 15000);
    return () => clearInterval(id);
  }, [refrescar, sel]);

  // Autoscroll al final cuando cambian los mensajes.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detalle?.mensajes.length, sel]);

  async function abrir(telefono: string) {
    setSel(telefono);
    setDetalle(null);
    setAviso(null);
    setTexto("");
    setPlantillaSel("");
    setParams([]);
    const d = await obtenerConversacion(telefono);
    setDetalle(d);
    marcarComoLeida(telefono, d?.ultimoInboundFecha);
  }

  async function enviarTexto() {
    if (!sel || !texto.trim()) return;
    setEnviando(true);
    setAviso(null);
    const r = await responderConversacion(sel, texto.trim());
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.error ?? "No se pudo enviar.");
    } else {
      setTexto("");
      marcarComoLeida(sel, new Date().toISOString());
    }
    await refrescar(sel);
  }

  async function borrarConversacion() {
    if (!sel) return;
    const ok = window.confirm(
      "¿Borrar toda esta conversación? Se eliminarán los mensajes de este número " +
        "(no se borra el expediente). Útil para volver a probar desde cero.",
    );
    if (!ok) return;
    setEnviando(true);
    setAviso(null);
    const r = await eliminarConversacion(sel);
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.error ?? "No se pudo borrar.");
      return;
    }
    setSel(null);
    setDetalle(null);
    await refrescar(null);
  }

  async function borrarMensaje(mensajeId: string) {
    const ok = window.confirm("¿Seguro que deseas eliminar este mensaje de forma permanente?");
    if (!ok) return;
    setEnviando(true);
    setAviso(null);
    const r = await eliminarMensajeIndividual(mensajeId);
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.error ?? "No se pudo eliminar el mensaje.");
    } else {
      if (sel) await refrescar(sel);
    }
  }

  async function iniciarEdicion(mensajeId: string, textoActual: string) {
    const nuevoTexto = window.prompt("Editar mensaje:", textoActual);
    if (nuevoTexto === null) return;
    if (!nuevoTexto.trim()) {
      alert("El texto no puede estar vacío.");
      return;
    }
    setEnviando(true);
    setAviso(null);
    const r = await editarMensajeIndividual(mensajeId, nuevoTexto.trim());
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.error ?? "No se pudo editar el mensaje.");
    } else {
      if (sel) await refrescar(sel);
    }
  }

  function aplicarPlantillaEntrega() {
    if (!detalle) return;
    const nombreCliente = detalle.nombre || "Cliente";
    
    let links = "";
    if (documentosCliente?.cotizacionToken) {
      const base = typeof window !== "undefined" ? window.location.origin : "https://crm.saucedamx.com";
      
      if (documentosCliente.tieneRemision) {
        links += `\n📄 Recibo / Remisión de Venta:\n${base}/cotizacion/remision/${documentosCliente.cotizacionToken}\n`;
      }
      if (documentosCliente.tieneGarantia) {
        links += `\n📜 Carta de Garantía:\n${base}/cotizacion/garantia/${documentosCliente.cotizacionToken}\n`;
      }
    }

    if (!links) {
      alert("Atención: Este cliente aún no tiene una Remisión o Carta de Garantía generada para su última cotización.");
      return;
    }

    const mensaje = `¡Hola ${nombreCliente}! Gracias por elegirnos como SAUCEDA Construye.

Te compartimos los enlaces para descargar y consultar tus documentos oficiales de la obra:
${links}
Agradecemos mucho tu preferencia. Te invitamos, por favor, a compartirnos tus comentarios y seguirnos en nuestras redes sociales oficiales:
📘 Facebook: https://www.facebook.com/profile.php?id=61589957630232&locale=es_LA
🎵 TikTok: https://www.tiktok.com/@saucedamxbr
📸 Instagram: https://www.instagram.com/saucedamx_/

¡Quedamos a tus órdenes!`;

    setTexto(mensaje);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  function aplicarPlantillaSatisfaccion() {
    if (!detalle) return;
    const nombreCliente = detalle.nombre || "Cliente";

    const mensaje = `¡Hola ${nombreCliente}! En SAUCEDA Construye nos importa mucho tu opinión para seguir mejorando nuestro servicio.

Te invitamos a calificar brevemente tu experiencia con nosotros en los siguientes aspectos:
1. Calidad del Servicio / Atención: ⭐⭐⭐⭐⭐
2. Profesionalismo en la Instalación: ⭐⭐⭐⭐⭐
3. Tiempo de Respuesta / Entrega: ⭐⭐⭐⭐⭐

Puedes responder a este mensaje indicándonos tu puntuación (ej. 5/5) o dejarnos cualquier comentario adicional sobre tu experiencia.

¡Agradecemos enormemente tu tiempo!`;

    setTexto(mensaje);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  async function handleCorregirOrtografia() {
    if (!texto.trim() || corrigiendoOrtografia) return;
    setCorrigiendoOrtografia(true);
    setAviso(null);
    setExitoOrtografia(false);
    try {
      const res = await corregirOrtografiaMensaje(texto);
      if (res.ok && res.textoCorregido) {
        setTexto(res.textoCorregido);
        setExitoOrtografia(true);
        setTimeout(() => setExitoOrtografia(false), 3000);
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      } else if (res.error) {
        setAviso(res.error);
      }
    } catch (err: any) {
      setAviso(err.message || "Error al revisar ortografía.");
    } finally {
      setCorrigiendoOrtografia(false);
    }
  }

  const plantilla = plantillas.find((p) => p.nombre === plantillaSel);

  async function enviarPlantilla() {
    if (!sel || !plantillaSel) return;
    setEnviando(true);
    setAviso(null);
    const r = await responderConPlantilla(
      sel,
      plantillaSel,
      plantilla?.idioma ?? "es_MX",
      params,
    );
    setEnviando(false);
    if (!r.ok) setAviso(r.error ?? "No se pudo enviar la plantilla.");
    else {
      setPlantillaSel("");
      setParams([]);
    }
    await refrescar(sel);
  }

  const conversacionesFiltradas = conversaciones.filter((c) => {
    if (soloTel) {
      return coincidenTelefonos(c.telefono, soloTel);
    }

    if (sel && coincidenTelefonos(c.telefono, sel)) return true;

    if (filtro === "abiertas") {
      if (!c.finalizado && c.ventanaAbierta) {
        if (subFiltro === "mias") {
          const nomUser = usuario?.nombre?.toLowerCase() || "";
          const emailUser = usuario?.email?.toLowerCase() || "";
          const atiende = c.atiende?.toLowerCase() || "";
          return atiende !== "" && atiende !== "ia" && (atiende.includes(nomUser) || nomUser.includes(atiende) || atiende.includes(emailUser) || emailUser.includes(atiende));
        }
        if (subFiltro === "ia") {
          return c.atiende?.toLowerCase() === "ia";
        }
        if (subFiltro === "nuevas") {
          return c.atiende === "" || !c.atiende;
        }
        return true; // "todas"
      }
      return false;
    } else {
      return c.finalizado || !c.ventanaAbierta;
    }
  }).sort((a, b) => {
    // Pendientes (último mensaje entrante sin responder) siempre primero
    const aPendiente = !a.finalizado && a.ultimaDireccion === "in" ? 0 : 1;
    const bPendiente = !b.finalizado && b.ultimaDireccion === "in" ? 0 : 1;
    if (aPendiente !== bPendiente) return aPendiente - bPendiente;
    // Dentro de cada grupo, más reciente primero
    return b.ultimaFecha.localeCompare(a.ultimaFecha);
  });

  const filteredAtajos = respuestasRapidas.filter((r) =>
    r.atajo.toLowerCase().includes(filtroAtajos.toLowerCase()) ||
    r.titulo.toLowerCase().includes(filtroAtajos.toLowerCase())
  );

  function insertarRespuesta(textoRespuesta: string) {
    const textoResuelto = resolverParametros(textoRespuesta, detalle, usuario);
    if (!textareaRef.current) {
      setTexto(textoResuelto);
      setMostrarAtajos(false);
      setMostrarDropdownMenu(false);
      return;
    }
    const cursor = textareaRef.current.selectionStart || 0;
    const textBeforeCursor = texto.slice(0, cursor);
    const textAfterCursor = texto.slice(cursor);
    
    const lastHashIndex = textBeforeCursor.lastIndexOf("#");
    if (lastHashIndex !== -1) {
      const nuevoTexto = textBeforeCursor.slice(0, lastHashIndex) + textoResuelto + textAfterCursor;
      setTexto(nuevoTexto);
      setMostrarAtajos(false);
      setMostrarDropdownMenu(false);
      setTimeout(() => {
        if (textareaRef.current) {
          const nuevaPos = lastHashIndex + textoResuelto.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nuevaPos, nuevaPos);
        }
      }, 0);
    } else {
      const nuevoTexto = textBeforeCursor + textoResuelto + textAfterCursor;
      setTexto(nuevoTexto);
      setMostrarDropdownMenu(false);
      setTimeout(() => {
        if (textareaRef.current) {
          const nuevaPos = cursor + textoResuelto.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nuevaPos, nuevaPos);
        }
      }, 0);
    }
  }

  async function enviarDocumento(doc: DocumentoVenta) {
    if (!sel) return;
    setEnviandoDoc(true);
    setMostrarAdjuntar(false);
    const r = await enviarDocumentoConversacion(sel, doc.id);
    setEnviandoDoc(false);
    if (!r.ok) {
      setAviso(r.error ?? "No se pudo enviar el documento.");
    } else {
      await refrescar(sel);
    }
  }

  async function handleEnviarSticker(file: File) {
    if (!sel || !file) return;

    if (!file.name.toLowerCase().endsWith(".webp")) {
      setAviso("WhatsApp requiere que los stickers estén en formato WebP (.webp)");
      return;
    }

    setEnviandoSticker(true);
    setMostrarStickers(false);
    setAviso(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        if (!base64) {
          setAviso("No se pudo leer el archivo de sticker.");
          setEnviandoSticker(false);
          return;
        }

        const r = await enviarStickerConversacion(sel, base64, file.name, file.type || "image/webp");
        setEnviandoSticker(false);

        if (!r.ok) {
          setAviso(r.error ?? "No se pudo enviar el sticker.");
        } else {
          await refrescar(sel);
        }
      };
      reader.onerror = () => {
        setAviso("Error al leer el archivo de sticker.");
        setEnviandoSticker(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setAviso(err.message || "Error al enviar el sticker.");
      setEnviandoSticker(false);
    }
  }

  async function handleEnviarArchivoDirecto(file: File, caption?: string): Promise<boolean> {
    if (!sel) return false;
    setEnviandoArchivoDirecto(true);
    setMostrarAdjuntar(false);
    setAviso(null);

    try {
      const fd = new FormData();
      fd.append("telefono", sel);
      fd.append("archivo", file);
      if (caption) fd.append("caption", caption);

      const r = await enviarArchivoDirectoConversacion(fd);
      setEnviandoArchivoDirecto(false);

      if (!r.ok) {
        setAviso(r.error ?? "No se pudo enviar el archivo.");
        return false;
      } else {
        await refrescar(sel);
        return true;
      }
    } catch (err: any) {
      setAviso(err.message || "Error al enviar el archivo.");
      setEnviandoArchivoDirecto(false);
      return false;
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTexto(val);

    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursor);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1] || "";

    if (lastWord.startsWith("#")) {
      const query = lastWord.slice(1);
      setFiltroAtajos(query);
      setIndiceAtajoSeleccionado(0);
      setMostrarAtajos(true);
    } else {
      setMostrarAtajos(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mostrarAtajos && filteredAtajos.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceAtajoSeleccionado((prev) => (prev + 1) % filteredAtajos.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceAtajoSeleccionado((prev) => (prev - 1 + filteredAtajos.length) % filteredAtajos.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertarRespuesta(filteredAtajos[indiceAtajoSeleccionado].texto);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMostrarAtajos(false);
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void enviarTexto();
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Navegación de tabs */}
      <div className="flex items-center gap-1 border-b border-carbon/10 pb-0">
        {(["bandeja", "documentos", "respuestas"] as TabPrincipal[]).map((t) => {
          const labels: Record<TabPrincipal, string> = {
            bandeja: "💬 Bandeja",
            documentos: "📂 Documentos",
            respuestas: "⚡ Respuestas Rápidas",
          };
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition ${
                tab === t
                  ? "border-sauce text-verde-profundo bg-sauce/5"
                  : "border-transparent text-carbon/50 hover:text-carbon hover:bg-carbon/5"
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Tab: Documentos */}
      {tab === "documentos" && (
        <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm">
          <DocumentosVentas />
        </div>
      )}

      {/* Tab: Respuestas Rápidas */}
      {tab === "respuestas" && (
        <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm">
          <RespuestasRapidasEditor />
        </div>
      )}

      {/* Tab: Bandeja (contenido original) */}
      {tab === "bandeja" && <>

      {/* Diagnóstico del agente de IA */}
      {esAdmin && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-carbon/10 bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-carbon/60">Proveedor de IA (Sofía):</span>
            <select
              value={proveedorIA}
              disabled={cambiandoProveedor}
              onChange={(e) => cambiarProveedor(e.target.value)}
              className="rounded-lg border border-carbon/15 bg-slate-50 text-xs font-semibold text-verde-profundo px-2.5 py-1.5 transition outline-none focus:border-sauce focus:ring-1 focus:ring-sauce/30 disabled:opacity-50 cursor-pointer"
            >
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="kimi">Kimi K3 (Moonshot)</option>
              <option value="ollama">Local (Ollama)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={ejecutarPruebaIA}
            disabled={probandoIA}
            className="shrink-0 rounded-lg border border-sauce/40 px-3.5 py-1.5 text-xs font-semibold text-verde-profundo transition hover:bg-sauce/10 disabled:opacity-50"
          >
            {probandoIA ? "Probando…" : "Probar IA"}
          </button>
          {estadoIA ? (
            <span
              className={`text-xs font-medium ${estadoIA.ok ? "text-verde-profundo" : "text-rojo"}`}
            >
              {estadoIA.ok ? "✓ " : "✕ "}
              {estadoIA.mensaje}
            </span>
          ) : (
            <span className="text-xs text-carbon/40 font-medium">
              Verifica que el agente de IA esté activo (key, modelo y crédito).
            </span>
          )}
        </div>
      )}

      <div className="grid h-[calc(100dvh-180px)] sm:h-[calc(100vh-220px)] grid-cols-1 gap-3 sm:grid-cols-[320px_1fr]">
        {/* Lista de conversaciones */}
        <div className={`overflow-y-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil flex flex-col p-2 shadow-sm ${
          sel ? "hidden sm:flex" : "flex"
        }`}>
          {soloTel && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-sauce/15 border border-sauce/30 p-2 text-xs text-verde-profundo font-medium shrink-0">
              <span>Chat filtrado</span>
              <button
                type="button"
                onClick={() => {
                  setSoloTel(null);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("tel");
                    url.searchParams.delete("telefono");
                    window.history.pushState({}, "", url.pathname + url.search);
                  }
                }}
                className="font-bold underline hover:text-sauce"
              >
                Mostrar todos
              </button>
            </div>
          )}

          {/* Tabs de Filtro */}
          <div className="flex border border-carbon/10 mb-2 bg-crema/40 p-1 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setFiltro("abiertas")}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${
                filtro === "abiertas"
                  ? "bg-white text-verde-profundo shadow-sm border border-carbon/5 font-bold"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Abiertas ({conversaciones.filter((c) => !c.finalizado && c.ventanaAbierta).length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro("terminadas")}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${
                filtro === "terminadas"
                  ? "bg-white text-verde-profundo shadow-sm border border-carbon/5 font-bold"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Terminadas ({conversaciones.filter((c) => c.finalizado || !c.ventanaAbierta).length})
            </button>
          </div>

          {filtro === "abiertas" && (
            <div className="mb-2 flex flex-wrap gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setSubFiltro("todas")}
                className={`flex-1 text-center py-1 px-1.5 text-[9px] font-bold rounded transition ${
                  subFiltro === "todas"
                    ? "bg-[#2D4A2B] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Todas ({conversaciones.filter((c) => !c.finalizado && c.ventanaAbierta).length})
              </button>
              <button
                type="button"
                onClick={() => setSubFiltro("mias")}
                className={`flex-1 text-center py-1 px-1.5 text-[9px] font-bold rounded transition ${
                  subFiltro === "mias"
                    ? "bg-[#2D4A2B] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Mías ({conversaciones.filter((c) => {
                  if (c.finalizado || !c.ventanaAbierta) return false;
                  const nomUser = usuario?.nombre?.toLowerCase() || "";
                  const emailUser = usuario?.email?.toLowerCase() || "";
                  const atiende = c.atiende?.toLowerCase() || "";
                  return atiende !== "" && atiende !== "ia" && (atiende.includes(nomUser) || nomUser.includes(atiende) || atiende.includes(emailUser) || emailUser.includes(atiende));
                }).length})
              </button>
              <button
                type="button"
                onClick={() => setSubFiltro("ia")}
                className={`flex-1 text-center py-1 px-1.5 text-[9px] font-bold rounded transition ${
                  subFiltro === "ia"
                    ? "bg-[#2D4A2B] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                De la IA ({conversaciones.filter((c) => !c.finalizado && c.ventanaAbierta && c.atiende?.toLowerCase() === "ia").length})
              </button>
              <button
                type="button"
                onClick={() => setSubFiltro("nuevas")}
                className={`flex-1 text-center py-1 px-1.5 text-[9px] font-bold rounded transition ${
                  subFiltro === "nuevas"
                    ? "bg-[#2D4A2B] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Nuevas ({conversaciones.filter((c) => !c.finalizado && c.ventanaAbierta && (!c.atiende || c.atiende === "")).length})
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1">
            {conversacionesFiltradas.length === 0 ? (
              <p className="p-6 text-center text-sm text-carbon/40">
                No hay conversaciones en esta pestaña.
              </p>
            ) : (
              conversacionesFiltradas.map((c) => {
                const fechaLeida = leidasHasta[c.telefono];
                const leidaReciente = fechaLeida && (!c.ultimoInboundFecha || fechaLeida >= c.ultimoInboundFecha);
                const pendiente = !c.finalizado && c.ultimaDireccion === "in" && !leidaReciente;
                return (
                <button
                  key={c.telefono}
                  type="button"
                  onClick={() => abrir(c.telefono)}
                  className={`flex w-full flex-col items-start px-3 py-2.5 text-left transition rounded-lg ${
                    sel === c.telefono
                      ? "bg-sauce/10 border-l-4 border-l-sauce"
                      : pendiente
                      ? "bg-red-50 border-l-4 border-l-red-500 hover:bg-red-100 shadow-sm"
                      : "border-b border-carbon/5 hover:bg-crema/40"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {pendiente && (
                        <span className="shrink-0 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" title="Pendiente de respuesta" />
                      )}
                      <span className={`truncate font-titular font-semibold text-sm ${pendiente ? "text-red-700" : "text-verde-profundo"}`}>
                        {c.nombre}
                      </span>
                    </span>
                    <Countdown24h
                      ultimoInboundFecha={c.ultimoInboundFecha}
                      ventanaAbierta={c.ventanaAbierta}
                    />
                  </span>
                  {pendiente && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      ● Pendiente de respuesta
                    </span>
                  )}
                  <span className={`mt-0.5 w-full truncate text-xs font-normal ${pendiente ? "text-red-600 font-medium" : "text-carbon/50"}`}>
                    {c.ultimoTexto || "—"}
                  </span>
                  
                  {/* Badges de expediente / prospecto */}
                  <span className="flex flex-wrap gap-1 mt-1.5">
                    {c.expedienteId && (
                      <Link
                        href={`/expediente/${c.expedienteId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-sauce/10 text-verde-profundo border border-sauce/20 hover:bg-sauce/20 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-medium transition cursor-pointer"
                        title="Ver detalle del expediente"
                      >
                        📁 {c.expedienteId}
                      </Link>
                    )}
                    {c.prospectoId && (
                      <Link
                        href={`/prospectos/${c.prospectoId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-cielo/10 text-cielo border border-cielo/20 hover:bg-cielo/20 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-medium transition cursor-pointer"
                        title="Ver detalle del prospecto"
                      >
                        👤 {c.prospectoId}
                      </Link>
                    )}
                    {c.tipoNegocio && (
                      <span
                        className="bg-amber-50 text-amber-900 border border-amber-200/80 rounded-md px-1.5 py-0.5 text-[9px] font-semibold truncate max-w-[150px]"
                        title={`Tipo de negocio: ${labelTipoNegocio(c.tipoNegocio)}`}
                      >
                        🏷️ {labelTipoNegocio(c.tipoNegocio)}
                      </span>
                    )}
                  </span>

                  <span className="flex w-full items-center justify-between gap-2 mt-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <CanalBadge telefono={c.telefono} size="sm" />
                      <span className="font-mono text-xs font-bold text-carbon truncate">
                        {formatearTelefonoLegible(c.telefono)}
                      </span>
                      <span className="font-mono text-[10px] text-carbon/50 shrink-0">
                        · {horaCorta(c.ultimaFecha)}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {c.ultimaDireccion === "out" ? (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[8px] px-1 rounded font-bold uppercase tracking-wider">
                          ✓ {c.atiende ? `RESPONDIDO (${c.atiende})` : "RESPONDIDO"}
                        </span>
                      ) : !c.atiende || c.atiende === "" ? (
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[8px] px-1 rounded font-bold uppercase tracking-wider">
                          NUEVA / SIN ATENDER
                        </span>
                      ) : c.atiende.toLowerCase() === "ia" ? (
                        <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[8px] px-1 rounded font-bold uppercase tracking-wider">
                          🤖 ATIENDE IA
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-800 border border-green-200 text-[8px] px-1 rounded font-bold uppercase tracking-wider">
                          👤 {c.atiende}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
              })
            )}
          </div>
        </div>

        {/* Hilo + responder */}
        <div className={`flex flex-col overflow-hidden rounded-xl border border-carbon/10 bg-white shadow-sm ${
          sel ? "flex" : "hidden sm:flex"
        }`}>
          {!sel ? (
            <p className="m-auto p-6 text-center text-sm text-carbon/40">
              Selecciona una conversación para ver el historial y responder.
            </p>
          ) : !detalle ? (
            <p className="m-auto p-6 text-sm text-carbon/50 animate-pulse">Cargando…</p>
          ) : (
            <>
              {/* Encabezado del hilo */}
              <div className="flex flex-col gap-1.5 border-b border-carbon/10 bg-crema/40 px-3 py-2 shrink-0">
                {/* Fila 1: Nombre + 24h Countdown */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Botón de volver para celular */}
                    <button
                      type="button"
                      onClick={() => setSel(null)}
                      className="sm:hidden mr-1 text-sauce hover:text-verde-profundo text-sm font-semibold flex items-center shrink-0"
                    >
                      ← Volver
                    </button>
                    <p className="truncate font-titular font-medium text-verde-profundo text-sm sm:text-base">
                      {detalle.nombre}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-semibold text-[8px] uppercase tracking-wider text-carbon/40 hidden xs:inline">24h:</span>
                    <Countdown24h
                      ultimoInboundFecha={detalle.ultimoInboundFecha}
                      ventanaAbierta={detalle.ventanaAbierta}
                    />
                  </div>
                </div>

                {/* Fila 2: Enlaces y metadatos */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <CanalBadge telefono={detalle.telefono} size="md" />
                    <span className="font-mono text-sm sm:text-base font-bold text-carbon tracking-tight">
                      {formatearTelefonoLegible(detalle.telefono)}
                    </span>
                  </div>
                  {detalle.expedienteId && (
                    <>
                      <span className="text-carbon/30 text-xs font-mono">·</span>
                      <a
                        href={`/expediente/${detalle.expedienteId}`}
                        className="text-sauce hover:underline font-bold text-xs font-mono flex items-center gap-0.5"
                      >
                        📁 {detalle.expedienteId}
                      </a>
                    </>
                  )}
                  {detalle.prospectoId && (
                    <>
                      <span className="text-carbon/30 text-xs font-mono">·</span>
                      <a
                        href={`/prospectos/${detalle.prospectoId}`}
                        className="text-cielo hover:underline font-bold text-xs font-mono flex items-center gap-0.5"
                      >
                        👤 {detalle.prospectoId}
                      </a>
                    </>
                  )}

                  {/* Tipo de Negocio / Servicio clasificado por Sofía */}
                  <span className="text-carbon/30 text-xs font-mono">·</span>
                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs border ${
                        detalle.tipoNegocio
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : "bg-slate-100 text-carbon/50 border-carbon/15"
                      }`}
                      title={
                        detalle.tipoNegocio
                          ? `Tipo de negocio detectado por Sofía: ${detalle.tipoNegocio}`
                          : "Sofía aún no ha clasificado el tipo de negocio"
                      }
                    >
                      <span>🏷️</span>
                      <span>{detalle.tipoNegocio ? labelTipoNegocio(detalle.tipoNegocio) : "Sin clasificar"}</span>
                    </span>

                    {/* Selector interactivo para cambiar tipo de negocio si el asesor lo requiere */}
                    <select
                      value={detalle.tipoNegocio ?? ""}
                      disabled={cambiandoTipoNegocio}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        setCambiandoTipoNegocio(true);
                        const res = await actualizarTipoNegocioConversacion(detalle.telefono, val);
                        setCambiandoTipoNegocio(false);
                        if (!res.ok) {
                          setAviso(res.error ?? "No se pudo actualizar el tipo de negocio.");
                        } else {
                          await refrescar(detalle.telefono);
                        }
                      }}
                      className="bg-white border border-carbon/15 hover:border-sauce rounded px-1.5 py-0.5 text-[10px] text-carbon/70 hover:text-carbon focus:outline-none cursor-pointer"
                      title="Cambiar tipo de negocio de esta conversación"
                    >
                      <option value="">Cambiar...</option>
                      <option value="construccion-impermeabilizacion">Impermeabilización</option>
                      <option value="construccion-piso-estampado">Piso Estampado</option>
                      <option value="construccion-mantenimiento-postventa">Mantenimiento Postventa</option>
                      <option value="construccion-remodelacion">Remodelación</option>
                      <option value="construccion">Construcción General</option>
                      <option value="traspaso_compra">Traspaso / Compra</option>
                      <option value="promocion_venta">Promoción Venta</option>
                      <option value="solo_tramite">Solo Trámite</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>

                {/* Fila 3: Asignación y Acciones combinados */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] bg-white/60 p-1 rounded border border-carbon/5">
                  <div className="flex items-center gap-1">
                    <span className="font-bold uppercase tracking-wider text-carbon/40 text-[8px]">Atiende:</span>
                    <select
                      value={detalle.atiende ?? ""}
                      onChange={async (e) => {
                        const nuevoAgente = e.target.value;
                        setAsignando(true);
                        const res = await asignarAgente(detalle.telefono, nuevoAgente);
                        setAsignando(false);
                        if (!res.ok) {
                          setAviso(res.error ?? "No se pudo reasignar.");
                        } else {
                          await refrescar(detalle.telefono);
                        }
                      }}
                      disabled={asignando || enviando}
                      className="bg-white border border-carbon/15 rounded px-1 py-0.5 text-[10px] text-carbon/70 focus:outline-none focus:border-sauce cursor-pointer font-medium"
                    >
                      <option value="">— sin asignar —</option>
                      <option value="IA">🤖 Agente IA (Sofía)</option>
                      {asesores.map((as) => (
                        <option key={as.id} value={as.nombre}>
                          {as.nombre}
                        </option>
                      ))}
                    </select>

                    {usuario && (detalle.atiende !== usuario.nombre) && (
                      <button
                        type="button"
                        onClick={async () => {
                          setAsignando(true);
                          const res = await asignarAgente(detalle.telefono, usuario.nombre);
                          setAsignando(false);
                          if (!res.ok) {
                            setAviso(res.error ?? "No se pudo tomar la conversación.");
                          } else {
                            await refrescar(detalle.telefono);
                          }
                        }}
                        disabled={asignando || enviando}
                        className="bg-[#2D4A2B] hover:bg-[#5C7A52] text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm transition disabled:opacity-50 flex items-center gap-0.5 uppercase shrink-0"
                      >
                        Tomar
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => marcarComoLeida(detalle.telefono, detalle.ultimoInboundFecha)}
                      className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-600 hover:text-white text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded transition flex items-center gap-0.5 cursor-pointer"
                      title="Quitar distintivo de respuesta pendiente"
                    >
                      ✓ Leída
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const seVaACerrar = !detalle.finalizado;
                        setEnviando(true);
                        const res = await finalizarConversacion(detalle.telefono, seVaACerrar);
                        setEnviando(false);
                        if (!res.ok) {
                          setAviso(res.error ?? "Error al cambiar estado.");
                        } else if (seVaACerrar) {
                          // Al CERRAR: quitar la selección para que desaparezca de "Abiertas"
                          setSel(null);
                          setDetalle(null);
                          await refrescar(null);
                        } else {
                          // Al REABRIR: mantener seleccionada para seguir viendo el chat
                          await refrescar(detalle.telefono);
                        }
                      }}
                      disabled={enviando}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition border ${
                        detalle.finalizado
                          ? "bg-sauce text-crema border-sauce hover:bg-verde-profundo"
                          : "bg-white text-carbon/70 border-carbon/20 hover:bg-carbon/5"
                      }`}
                    >
                      {detalle.finalizado ? "Reabrir" : "Terminar"}
                    </button>

                    <button
                      type="button"
                      onClick={borrarConversacion}
                      disabled={enviando}
                      className="text-[9px] text-rojo/85 border border-rojo/20 bg-rojo/5 px-1.5 py-0.5 rounded transition hover:bg-rojo hover:text-white disabled:opacity-50 font-semibold"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </div>

              {/* Banner de alerta si se detecta posible bloqueo o fallo recurrente */}
              {detalle.posibleBloqueo && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-950 px-4 py-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                      <span className="font-bold">Alerta de Entrega:</span>{" "}
                      <span>{detalle.motivoAlerta || "Posible bloqueo o número inactivo (mensajes no entregados por WhatsApp)."}</span>
                    </div>
                  </div>
                  <a
                    href={obtenerTelLink(detalle.telefono)}
                    className="bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold px-2.5 py-1 rounded shadow-xs transition shrink-0 flex items-center gap-1"
                    title="Llamar directamente al cliente por teléfono convencional"
                  >
                    📞 Contactar por Llamada
                  </a>
                </div>
              )}

              {/* Mensajes */}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 bg-crema/10 scrollbar-sutil">
                {detalle.mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`flex group items-center gap-2 ${m.direccion === "out" ? "justify-end" : "justify-start"}`}
                  >
                    {/* Botones de acción en hover para borrar/editar */}
                    {m.direccion === "out" && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex gap-1 text-[10px] select-none shrink-0 order-first">
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(m.id, m.texto)}
                          className="p-1 hover:bg-carbon/5 rounded text-carbon/40 hover:text-sauce transition-colors"
                          title="Editar mensaje"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => borrarMensaje(m.id)}
                          className="p-1 hover:bg-carbon/5 rounded text-carbon/40 hover:text-rojo transition-colors"
                          title="Eliminar mensaje"
                        >
                          🗑️
                        </button>
                      </div>
                    )}

                    {m.direccion === "in" && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex text-[10px] select-none shrink-0 order-last">
                        <button
                          type="button"
                          onClick={() => borrarMensaje(m.id)}
                          className="p-1 hover:bg-carbon/5 rounded text-carbon/40 hover:text-rojo transition-colors"
                          title="Eliminar mensaje"
                        >
                          🗑️
                        </button>
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                        m.texto.startsWith("[sticker:")
                          ? "bg-transparent text-carbon border-none shadow-none !p-0"
                          : m.direccion === "out"
                          ? "bg-sauce text-crema whitespace-pre-line"
                          : "bg-white border border-carbon/5 text-carbon"
                      }`}
                    >
                      {renderizarContenidoMensaje(m.texto, plantillas)}
                      <span
                        className={`mt-1 block text-right text-[10px] ${
                          m.texto.startsWith("[sticker:")
                            ? "text-carbon/40 font-medium"
                            : m.direccion === "out"
                            ? "text-crema/70"
                            : "text-carbon/40"
                        }`}
                      >
                        {m.direccion === "out" && m.agente && `${m.agente} · `}
                        {horaCorta(m.fecha)}
                        {m.direccion === "out" && m.estado === "error" && (
                          <span
                            className="inline-flex items-center gap-1 ml-1 text-[9px] font-bold text-red-200 bg-red-950/75 px-1.5 py-0.5 rounded border border-red-400/40 cursor-help"
                            title={m.errorDetalle ? `Error de Meta: ${m.errorDetalle}` : "Error de entrega en WhatsApp"}
                          >
                            <span>⚠️ error:</span>
                            <span className="truncate max-w-[130px] font-normal">{m.errorDetalle || "falló"}</span>
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={finRef} />
              </div>

              {/* Responder */}
              <div className="border-t border-carbon/10 p-3 bg-white">
                {aviso && (
                  <p className="mb-2 rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-xs text-rojo">
                    {aviso}
                  </p>
                )}

                {/* Banner de chat finalizado */}
                {detalle.finalizado && (
                  <p className="mb-2 rounded-md border border-sauce/30 bg-sauce/5 px-3 py-1.5 text-[11px] text-verde-profundo font-medium">
                    ℹ️ Este chat está finalizado. Si envías un mensaje se reabrirá automáticamente.
                  </p>
                )}

                <div className="space-y-1.5 relative">
                  {/* Advertencia de ventana de 24h expirada (solo WhatsApp) */}
                  {!detalle.ventanaAbierta && canalDe(detalle.telefono) === "whatsapp" && (
                    <div className="rounded-xl border border-sauce/20 bg-sauce/5 p-4 space-y-3">
                      <div className="flex items-start gap-1.5 text-xs text-verde-profundo font-semibold leading-relaxed">
                        <span className="shrink-0">⚠️</span>
                        <div>
                          <p><strong>Ventana de 24h cerrada:</strong> Para reactivar este chat, debes enviar una plantilla aprobada por Meta.</p>
                        </div>
                      </div>
                      
                      {plantillas.length === 0 ? (
                        <p className="text-xs text-carbon/50">No hay plantillas de WhatsApp aprobadas disponibles en este momento.</p>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-carbon/60 uppercase tracking-wider mb-1">Seleccionar Plantilla:</label>
                            <select
                              value={plantillaSel}
                              onChange={(e) => {
                                const selectedName = e.target.value;
                                setPlantillaSel(selectedName);
                                const p = plantillas.find((x) => x.nombre === selectedName);
                                if (p && p.parametros > 0) {
                                  const newParams = Array(p.parametros).fill("");
                                  if (detalle?.nombre) {
                                    newParams[0] = detalle.nombre.split(" ")[0];
                                  }
                                  if (selectedName.includes("cotizacion")) {
                                    if (p.parametros >= 2) newParams[1] = "Servicio de Construcción";
                                    if (p.parametros >= 3) newParams[2] = "Cotización";
                                  }
                                  setParams(newParams);
                                } else {
                                  setParams([]);
                                }
                              }}
                              className="w-full bg-white border border-carbon/15 rounded-lg px-3 py-2 text-xs text-carbon/80 focus:outline-none focus:border-sauce cursor-pointer font-medium"
                            >
                              <option value="">— selecciona una plantilla —</option>
                              {plantillas.map((p) => {
                                const snippet = p.cuerpo
                                  ? ` - "${p.cuerpo.replace(/\n/g, " ").substring(0, 50)}${p.cuerpo.length > 50 ? "..." : ""}"`
                                  : "";
                                return (
                                  <option key={p.nombre} value={p.nombre}>
                                    {p.nombre} ({p.categoria}){snippet}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {plantilla && (
                            <div className="bg-white p-3 rounded-lg border border-carbon/10 space-y-2">
                              <p className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">Vista previa de la plantilla:</p>
                              <p className="text-xs text-carbon/75 whitespace-pre-line font-mono">{plantilla.cuerpo}</p>
                              
                              {plantilla.parametros > 0 && (
                                <div className="pt-2 border-t border-carbon/5 space-y-2">
                                  <p className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">Variables del mensaje:</p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {Array.from({ length: plantilla.parametros }).map((_, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-carbon/50 font-bold">{"{{"}{i + 1}{"}}"}</span>
                                        <input
                                          type="text"
                                          placeholder={`Ingresar valor para la variable ${i + 1}`}
                                          value={params[i] || ""}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setParams((prev) => {
                                              const copy = [...prev];
                                              copy[i] = val;
                                              return copy;
                                            });
                                          }}
                                          className="flex-1 bg-carbon/5 border border-carbon/15 rounded-md px-2 py-1 text-xs text-carbon outline-none focus:border-sauce"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <div className="pt-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={enviarPlantilla}
                                  disabled={enviando || (plantilla.parametros > 0 && params.filter(Boolean).length < plantilla.parametros)}
                                  className="rounded-md bg-sauce hover:bg-verde-profundo text-crema text-xs font-bold px-3 py-1.5 transition disabled:opacity-50"
                                >
                                  {enviando ? "Enviando..." : "⚡ Enviar Plantilla"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tarjeta Flotante de Atajos (#) */}
                  {mostrarAtajos && filteredAtajos.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-2 z-50 w-80 max-h-60 overflow-y-auto rounded-lg border border-carbon/10 bg-white p-1 shadow-lg scrollbar-sutil">
                      <div className="bg-crema/40 px-2 py-1 text-[10px] font-bold text-verde-profundo border-b border-carbon/5 flex items-center justify-between">
                        <span>Atajos disponibles</span>
                        <span className="font-normal text-carbon/40">Usa ↑↓ y Enter</span>
                      </div>
                      {filteredAtajos.map((r, idx) => (
                        <button
                          key={r.atajo}
                          type="button"
                          onClick={() => insertarRespuesta(r.texto)}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs transition flex flex-col ${
                            idx === indiceAtajoSeleccionado
                              ? "bg-sauce/15 text-verde-profundo"
                              : "hover:bg-carbon/5 text-carbon"
                          }`}
                        >
                          <span className="font-semibold flex items-center gap-1">
                            <span className="text-[10px] bg-sauce/20 text-verde-profundo px-1 py-0.5 rounded">#{r.atajo}</span>
                            {r.titulo}
                          </span>
                          <span className="text-[10px] text-carbon/50 truncate w-full mt-0.5">{r.texto}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Fila de controles superiores (Atajos e información & Respuestas Rápidas) */}
                  <div className="flex flex-wrap items-center justify-between gap-y-1.5 text-[11px] text-carbon/40 px-1">
                    <span>Escribe <strong className="text-sauce">#</strong> para respuestas rápidas</span>
                    
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {/* Botón Calculadora Rápida de Impermeabilización */}
                      <button
                        type="button"
                        onClick={() => setMostrarCalculadora(true)}
                        title="Calcular costos y generar comparativa de impermeabilización (Acrílico, Estándar, Premium)"
                        className="flex items-center gap-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 px-2 py-1 text-[11px] font-bold transition shadow-xs cursor-pointer"
                      >
                        <span>🧮</span>
                        <span>Cotizador Impermeabilización</span>
                      </button>
                      {detalle?.prospectoId && (
                        <button
                          type="button"
                          onClick={aplicarPlantillaEntrega}
                          disabled={cargandoDocs}
                          title="Escribir mensaje con remisión y garantía"
                          className="flex items-center gap-1 rounded bg-white hover:bg-slate-50 border border-carbon/15 px-2 py-1 text-[11px] font-semibold text-carbon/70 transition shadow-sm"
                        >
                          📄 {cargandoDocs ? "Cargando..." : "Plantilla de Entrega"}
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={aplicarPlantillaSatisfaccion}
                        title="Escribir encuesta de satisfacción"
                        className="flex items-center gap-1 rounded bg-white hover:bg-slate-50 border border-carbon/15 px-2 py-1 text-[11px] font-semibold text-carbon/70 transition shadow-sm"
                      >
                        ⭐ Encuesta Satisfacción
                      </button>

                      {/* Botón Corregir Ortografía con IA */}
                      <button
                        type="button"
                        onClick={handleCorregirOrtografia}
                        disabled={corrigiendoOrtografia || !texto.trim()}
                        title={
                          !texto.trim()
                            ? "Escribe un mensaje para revisar su ortografía"
                            : "Revisar y corregir ortografía, acentos y signos con IA"
                        }
                        className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition shadow-sm ${
                          corrigiendoOrtografia
                            ? "bg-amber-50 text-amber-800 border-amber-300 animate-pulse cursor-wait"
                            : exitoOrtografia
                            ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                            : !texto.trim()
                            ? "bg-white text-carbon/30 border-carbon/10 cursor-not-allowed opacity-60"
                            : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 cursor-pointer"
                        }`}
                      >
                        <span>{corrigiendoOrtografia ? "⏳" : exitoOrtografia ? "✅" : "✨"}</span>
                        <span>
                          {corrigiendoOrtografia
                            ? "Corrigiendo..."
                            : exitoOrtografia
                            ? "¡Corregido!"
                            : "Corregir Ortografía"}
                        </span>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMostrarDropdownMenu(!mostrarDropdownMenu)}
                          className="flex items-center gap-1.5 rounded bg-crema hover:bg-crema/80 border border-carbon/15 px-2 py-1 text-[11px] font-semibold text-verde-profundo transition shadow-sm"
                        >
                          ⚡ Respuestas Rápidas
                        </button>
                      
                      {/* Menú Dropdown de Respuestas Rápidas */}
                      {mostrarDropdownMenu && (
                        <div className="absolute right-0 bottom-full mb-1.5 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border border-carbon/10 bg-white py-1.5 shadow-lg scrollbar-sutil">
                          <div className="px-3 py-1 text-[10px] font-bold text-verde-profundo border-b border-carbon/5 uppercase tracking-wider">
                            Catálogo de Respuestas
                          </div>
                          
                          {/* Agrupación por Categorías */}
                          {["General", "Productos", "FAQs", "Seguimiento", "Otro"].map((cat) => {
                            const list = respuestasRapidas.filter((r) => r.categoria === cat);
                            if (list.length === 0) return null;
                            return (
                              <div key={cat} className="mt-1.5">
                                <div className="px-3 py-0.5 text-[9px] font-bold text-carbon/30 bg-carbon/5 uppercase">
                                  {cat}
                                  </div>
                                {list.map((r) => (
                                  <button
                                    key={r.atajo}
                                    type="button"
                                    onClick={() => insertarRespuesta(r.texto)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-carbon/5 text-carbon flex flex-col transition"
                                  >
                                    <span className="font-semibold text-verde-profundo">{r.titulo}</span>
                                    <span className="text-[10px] text-carbon/50 line-clamp-2 mt-0.5">{r.texto}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                  {/* Caja de Texto + Botón de Enviar */}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      value={texto}
                      onChange={handleTextareaChange}
                      rows={2}
                      spellCheck={true}
                      lang="es"
                      placeholder={
                        (detalle.ventanaAbierta || canalDe(detalle.telefono) !== "whatsapp")
                          ? "Escribe un mensaje o usa #..."
                          : "Ventana cerrada - No puedes enviar mensajes"
                      }
                      className={`${INPUT} disabled:bg-slate-50 disabled:text-carbon/40`}
                      onKeyDown={handleKeyDown}
                      disabled={!detalle.ventanaAbierta && canalDe(detalle.telefono) === "whatsapp"}
                    />
                    {/* Botón adjuntar documento/archivo */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setMostrarAdjuntar(!mostrarAdjuntar)}
                        disabled={enviandoDoc || enviandoArchivoDirecto}
                        title="Adjuntar archivo o documento"
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-md border border-carbon/20 bg-white text-lg hover:bg-sauce/10 hover:border-sauce/40 transition disabled:opacity-50"
                      >
                        {enviandoDoc || enviandoArchivoDirecto ? <span className="text-sm animate-pulse">⏳</span> : "📎"}
                      </button>
                      {/* Modal de selección de documentos y archivos locales */}
                      {mostrarAdjuntar && (
                        <div className="absolute right-0 bottom-full mb-2 z-50 w-80 max-h-[420px] overflow-y-auto rounded-xl border border-carbon/15 bg-white shadow-xl">
                          <div className="sticky top-0 bg-white border-b border-carbon/10 px-3 py-2 flex items-center justify-between z-10">
                            <span className="text-xs font-bold text-verde-profundo flex items-center gap-1">📎 Adjuntar Archivo</span>
                            <button
                              type="button"
                              onClick={() => setMostrarAdjuntar(false)}
                              className="text-carbon/40 hover:text-carbon text-sm"
                            >✕</button>
                          </div>
                          <div className="p-3 space-y-3">
                            {/* Botón de carga directa desde la computadora */}
                            <label
                              htmlFor="direct-file-upload"
                              className="flex items-center gap-3 border-2 border-dashed border-sauce/40 bg-sauce/5 rounded-lg p-3 cursor-pointer hover:bg-sauce/15 hover:border-sauce transition group"
                            >
                              <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">💻</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-verde-profundo leading-snug">Elegir de mi computadora</p>
                                <p className="text-[10px] text-carbon/60 leading-tight">PDF, Word, Excel, Imágenes, Videos, etc.</p>
                              </div>
                              <input
                                type="file"
                                id="direct-file-upload"
                                className="hidden"
                                disabled={enviandoArchivoDirecto}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleEnviarArchivoDirecto(f);
                                }}
                              />
                            </label>

                            <div className="relative flex py-0.5 items-center">
                              <div className="flex-grow border-t border-carbon/10"></div>
                              <span className="flex-shrink mx-2 text-[9px] uppercase font-bold text-carbon/40 tracking-wider">o seleccionar del CRM</span>
                              <div className="flex-grow border-t border-carbon/10"></div>
                            </div>

                            <DocumentosVentas
                              modoSelector
                              onSeleccionar={(doc) => enviarDocumento(doc)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Botón enviar sticker */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setMostrarStickers(!mostrarStickers)}
                        disabled={enviandoSticker || (!detalle.ventanaAbierta && canalDe(detalle.telefono) === "whatsapp")}
                        title="Enviar sticker"
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-md border border-carbon/20 bg-white text-lg hover:bg-sauce/10 hover:border-sauce/40 transition disabled:opacity-50"
                      >
                        {enviandoSticker ? <span className="text-sm animate-pulse">⏳</span> : "🏷️"}
                      </button>
                      {/* Modal de selección de stickers */}
                      {mostrarStickers && (
                        <div className="absolute right-0 bottom-full mb-2 z-50 w-72 rounded-xl border border-carbon/15 bg-white shadow-xl p-3 space-y-3">
                          <div className="flex items-center justify-between border-b border-carbon/10 pb-1.5">
                            <span className="text-xs font-bold text-verde-profundo flex items-center gap-1">🏷️ Enviar Sticker</span>
                            <button
                              type="button"
                              onClick={() => setMostrarStickers(false)}
                              className="text-carbon/40 hover:text-carbon text-xs"
                            >✕</button>
                          </div>
                          
                          <div className="text-[10px] text-carbon/60 leading-normal space-y-1.5">
                            <p><strong>Requisitos de WhatsApp:</strong></p>
                            <ul className="list-disc pl-3.5 space-y-0.5">
                              <li>Formato WebP (.webp) únicamente.</li>
                              <li>Dimensiones exactas: 512x512 px.</li>
                              <li>Fondo transparente y menor a 100 KB.</li>
                            </ul>
                          </div>

                          <label
                            htmlFor="sticker-file"
                            className="flex flex-col items-center justify-center border-2 border-dashed border-carbon/20 rounded-lg p-4 cursor-pointer hover:border-sauce hover:bg-sauce/5 transition group"
                          >
                            <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">🖼️</span>
                            <span className="text-xs font-semibold text-carbon/80 group-hover:text-sauce">Elegir WebP</span>
                            <input
                              type="file"
                              id="sticker-file"
                              accept="image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleEnviarSticker(f);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={enviarTexto}
                      disabled={enviando || !texto.trim() || (!detalle.ventanaAbierta && canalDe(detalle.telefono) === "whatsapp")}
                      className="shrink-0 rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
                    >
                      {enviando ? "…" : "Enviar"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </> /* fin tab bandeja */}

      {/* Modal de Calculadora de Impermeabilización */}
      <ModalCalculadoraImpermeabilizacion
        abierto={mostrarCalculadora}
        onCerrar={() => setMostrarCalculadora(false)}
        nombreCliente={detalle?.nombre || "Cliente"}
        onEnviarImagenDirecta={handleEnviarArchivoDirecto}
        onInsertarTexto={(textoCotizacion) => {
          setTexto((prev) => {
            if (!prev.trim()) return textoCotizacion;
            return `${prev}\n\n${textoCotizacion}`;
          });
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        }}
      />
    </div>
  );
}
