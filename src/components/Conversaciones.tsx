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
} from "@/app/actions/conversaciones";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import { enviarDocumentoConversacion, type DocumentoVenta } from "@/app/actions/documentos";
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
  const finRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      .then((rol) => setEsAdmin(rol === "admin"))
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-carbon/10 bg-white px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={ejecutarPruebaIA}
            disabled={probandoIA}
            className="shrink-0 rounded-md border border-sauce/40 px-3 py-1.5 text-xs font-semibold text-verde-profundo transition hover:bg-sauce/10 disabled:opacity-50"
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
                const pendiente = !c.finalizado && c.ultimaDireccion === "in";
                return (
                <button
                  key={c.telefono}
                  type="button"
                  onClick={() => abrir(c.telefono)}
                  className={`flex w-full flex-col items-start border-b border-carbon/5 px-3 py-2.5 text-left transition rounded-lg ${
                    sel === c.telefono
                      ? "bg-sauce/10 border-l-4 border-l-sauce"
                      : pendiente
                      ? "bg-dorado/8 border-l-4 border-l-dorado hover:bg-dorado/15"
                      : "hover:bg-crema/40"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {pendiente && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-dorado animate-pulse" title="Mensaje sin responder" />
                      )}
                      <span className={`truncate font-titular font-semibold text-sm ${pendiente ? "text-carbon" : "text-verde-profundo"}`}>
                        {c.nombre}
                      </span>
                    </span>
                    <Countdown24h
                      ultimoInboundFecha={c.ultimoInboundFecha}
                      ventanaAbierta={c.ventanaAbierta}
                    />
                  </span>
                  <span className="mt-0.5 w-full truncate text-xs text-carbon/50 font-normal">
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
                      {!c.atiende || c.atiende === "" ? (
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
                      onClick={async () => {
                        setEnviando(true);
                        const res = await finalizarConversacion(detalle.telefono, !detalle.finalizado);
                        setEnviando(false);
                        if (!res.ok) {
                          setAviso(res.error ?? "Error al cambiar estado.");
                        } else {
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
                    className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                        m.direccion === "out"
                          ? "bg-sauce text-crema"
                          : "bg-white border border-carbon/5 text-carbon"
                      }`}
                    >
                      {m.texto}
                      <span
                        className={`mt-1 block text-right text-[10px] ${
                          m.direccion === "out" ? "text-crema/70" : "text-carbon/40"
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
                    {/* Botón adjuntar documento */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setMostrarAdjuntar(!mostrarAdjuntar)}
                        disabled={enviandoDoc}
                        title="Adjuntar documento"
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-md border border-carbon/20 bg-white text-lg hover:bg-sauce/10 hover:border-sauce/40 transition disabled:opacity-50"
                      >
                        {enviandoDoc ? <span className="text-sm animate-pulse">⏳</span> : "📎"}
                      </button>
                      {/* Modal de selección de documentos */}
                      {mostrarAdjuntar && (
                        <div className="absolute right-0 bottom-full mb-2 z-50 w-80 max-h-96 overflow-y-auto rounded-xl border border-carbon/15 bg-white shadow-xl">
                          <div className="sticky top-0 bg-white border-b border-carbon/10 px-3 py-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-verde-profundo">Enviar documento</span>
                            <button
                              type="button"
                              onClick={() => setMostrarAdjuntar(false)}
                              className="text-carbon/40 hover:text-carbon text-sm"
                            >✕</button>
                          </div>
                          <div className="p-2">
                            <DocumentosVentas
                              modoSelector
                              onSeleccionar={(doc) => enviarDocumento(doc)}
                            />
                          </div>
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
