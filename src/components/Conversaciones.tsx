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
} from "@/app/actions/conversaciones";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import { enviarDocumentoConversacion, type DocumentoVenta } from "@/app/actions/documentos";
import { obtenerProveedorIA, guardarProveedorIA } from "@/app/actions/expedientes";
import { DocumentosVentas } from "./DocumentosVentas";
import { RespuestasRapidasEditor } from "./RespuestasRapidasEditor";
import type {
  ConversacionDetalle,
  ConversacionResumen,
} from "@/lib/types";
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

function CanalBadge({ telefono, size = "sm" }: { telefono: string; size?: "sm" | "xs" }) {
  const canal = canalDe(telefono);
  if (canal === "messenger") return (
    <span title="Facebook Messenger" className={`shrink-0 rounded font-bold ${size === "xs" ? "text-[8px] px-1 py-0.5" : "text-[9px] px-1.5 py-0.5"} bg-blue-100 text-blue-700 border border-blue-200`}>
      Messenger
    </span>
  );
  if (canal === "instagram") return (
    <span title="Instagram DM" className={`shrink-0 rounded font-bold ${size === "xs" ? "text-[8px] px-1 py-0.5" : "text-[9px] px-1.5 py-0.5"} bg-pink-100 text-pink-700 border border-pink-200`}>
      Instagram
    </span>
  );
  return (
    <span title="WhatsApp" className={`shrink-0 rounded font-bold ${size === "xs" ? "text-[8px] px-1 py-0.5" : "text-[9px] px-1.5 py-0.5"} bg-green-100 text-green-700 border border-green-200`}>
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
function renderizarContenidoMensaje(texto: string) {
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
          <div className="max-w-[120px] bg-transparent">
            <a
              href={`/api/conversaciones/media?mediaId=${mediaId}`}
              target="_blank"
              rel="noreferrer"
              className="block hover:scale-105 transition-transform"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/conversaciones/media?mediaId=${mediaId}`}
                alt="Sticker"
                className="h-28 w-28 object-contain"
                loading="lazy"
              />
            </a>
          </div>
        );
      }
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
  const [plantillas, setPlantillas] = useState<PlantillaWhatsApp[]>([]);
  const [texto, setTexto] = useState("");
  const [plantillaSel, setPlantillaSel] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
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
      if (!c.finalizado) {
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
      return c.finalizado;
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

  async function handleEnviarArchivoDirecto(file: File) {
    if (!sel) return;
    setEnviandoArchivoDirecto(true);
    setMostrarAdjuntar(false);
    setAviso(null);

    try {
      const fd = new FormData();
      fd.append("telefono", sel);
      fd.append("archivo", file);

      const r = await enviarArchivoDirectoConversacion(fd);
      setEnviandoArchivoDirecto(false);

      if (!r.ok) {
        setAviso(r.error ?? "No se pudo enviar el archivo.");
      } else {
        await refrescar(sel);
      }
    } catch (err: any) {
      setAviso(err.message || "Error al enviar el archivo.");
      setEnviandoArchivoDirecto(false);
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
              Abiertas ({conversaciones.filter((c) => !c.finalizado).length})
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
              Terminadas ({conversaciones.filter((c) => c.finalizado).length})
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
                Todas ({conversaciones.filter((c) => !c.finalizado).length})
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
                  if (c.finalizado) return false;
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
                De la IA ({conversaciones.filter((c) => !c.finalizado && c.atiende?.toLowerCase() === "ia").length})
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
                Nuevas ({conversaciones.filter((c) => !c.finalizado && (!c.atiende || c.atiende === "")).length})
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
                  </span>

                  <span className="flex w-full items-center justify-between gap-2 mt-2">
                    <span className="flex items-center gap-1 font-mono text-[9px] text-carbon/40 min-w-0">
                      <CanalBadge telefono={c.telefono} size="xs" />
                      <span className="truncate">{c.telefono} · {horaCorta(c.ultimaFecha)}</span>
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] text-carbon/50">
                  <CanalBadge telefono={detalle.telefono} />
                  <span>{detalle.telefono}</span>
                  {detalle.expedienteId && (
                    <>
                      <span>·</span>
                      <a
                        href={`/expediente/${detalle.expedienteId}`}
                        className="text-sauce hover:underline font-bold flex items-center gap-0.5"
                      >
                        📁 {detalle.expedienteId}
                      </a>
                    </>
                  )}
                  {detalle.prospectoId && (
                    <>
                      <span>·</span>
                      <a
                        href={`/prospectos/${detalle.prospectoId}`}
                        className="text-cielo hover:underline font-bold flex items-center gap-0.5"
                      >
                        👤 {detalle.prospectoId}
                      </a>
                    </>
                  )}
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
                      {renderizarContenidoMensaje(m.texto)}
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
                        {m.direccion === "out" && m.estado === "error" && " · error"}
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
                    <div className="rounded-md border border-dorado/30 bg-dorado/5 px-2.5 py-1.5 text-[10px] text-carbon/70 flex items-start gap-1.5 leading-relaxed">
                      <span className="shrink-0 mt-0.5">⚠️</span>
                      <span>
                        <strong>Ventana de 24h cerrada:</strong> Los mensajes de texto libre podrían no entregarse hasta que el cliente vuelva a escribir.
                      </span>
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
                  <div className="flex items-center justify-between text-[11px] text-carbon/40 px-1">
                    <span>Escribe <strong className="text-sauce">#</strong> para usar respuestas rápidas</span>
                    
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

                  {/* Caja de Texto + Botón de Enviar */}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      value={texto}
                      onChange={handleTextareaChange}
                      rows={2}
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
    </div>
  );
}
