"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
} from "@/app/actions/conversaciones";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import type {
  ConversacionDetalle,
  ConversacionResumen,
} from "@/lib/types";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";

const INPUT =
  "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

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

/** Bandeja de conversaciones de WhatsApp (lista + hilo + responder). */
export function Conversaciones() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [filtro, setFiltro] = useState<"abiertas" | "terminadas">("abiertas");
  const [subFiltro, setSubFiltro] = useState<"todas" | "mias" | "ia" | "nuevas">("todas");
  const [usuario, setUsuario] = useState<{ id: string; nombre: string; email: string; rol: "admin" | "asesor" | "operaciones" } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
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
  const finRef = useRef<HTMLDivElement | null>(null);

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

  const refrescar = useCallback(async (telefono: string | null) => {
    try {
      const lista = await listarConversaciones();
      setConversaciones(lista);
      if (telefono) {
        const d = await obtenerConversacion(telefono);
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
        setSel(tel);
      }
    }

    void refrescar(preseleccion);
    listarPlantillasWhatsApp()
      .then((r) => setPlantillas(r.plantillas.filter((p) => p.estado === "APPROVED")))
      .catch(() => setPlantillas([]));
    
    listarAsesoresActivos()
      .then((r) => setAsesores(r))
      .catch(() => setAsesores([]));

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

  return (
    <div className="flex flex-col gap-3">
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

      <div className="grid h-[calc(100vh-220px)] grid-cols-1 gap-3 sm:grid-cols-[320px_1fr]">
        {/* Lista de conversaciones */}
        <div className={`overflow-y-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil flex flex-col p-2 shadow-sm ${
          sel ? "hidden sm:flex" : "flex"
        }`}>
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
              conversacionesFiltradas.map((c) => (
                <button
                  key={c.telefono}
                  type="button"
                  onClick={() => abrir(c.telefono)}
                  className={`flex w-full flex-col items-start border-b border-carbon/5 px-3 py-2.5 text-left transition hover:bg-crema/40 rounded-lg ${
                    sel === c.telefono ? "bg-sauce/10 border-l-4 border-l-sauce" : ""
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate font-titular font-semibold text-verde-profundo text-sm">
                      {c.nombre}
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
                      <span className="bg-sauce/10 text-verde-profundo border border-sauce/20 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-medium">
                        📁 {c.expedienteId}
                      </span>
                    )}
                    {c.prospectoId && (
                      <span className="bg-cielo/10 text-cielo border border-cielo/20 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-medium">
                        👤 {c.prospectoId}
                      </span>
                    )}
                  </span>

                  <span className="flex w-full items-center justify-between gap-2 mt-2">
                    <span className="font-mono text-[9px] text-carbon/40">
                      {c.telefono} · {horaCorta(c.ultimaFecha)}
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
              ))
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 bg-crema/40 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {/* Botón de volver para celular */}
                    <button
                      type="button"
                      onClick={() => setSel(null)}
                      className="sm:hidden mr-1 text-sauce hover:text-verde-profundo text-sm font-semibold flex items-center"
                    >
                      ← Volver
                    </button>
                    <p className="truncate font-titular font-medium text-verde-profundo text-base">
                      {detalle.nombre}
                    </p>
                  </div>
                  
                  {/* Enlaces y metadatos */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-carbon/50 mt-1">
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

                  {/* Dropdown de Asignación */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-carbon/60 font-bold uppercase tracking-wider">Atiende:</span>
                      <select
                        value={detalle.mensajes.slice().reverse().find((m) => m.agente)?.agente ?? ""}
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
                        className="bg-white border border-carbon/15 rounded px-1.5 py-0.5 text-[10px] text-carbon/70 focus:outline-none focus:border-sauce cursor-pointer focus:ring-1 focus:ring-sauce font-medium"
                      >
                        <option value="">— sin asignar —</option>
                        <option value="IA">🤖 Agente IA (Sofía)</option>
                        {asesores.map((as) => (
                          <option key={as.id} value={as.nombre}>
                            {as.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    {usuario && (detalle.mensajes.slice().reverse().find((m) => m.agente)?.agente !== usuario.nombre) && (
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
                        className="bg-[#2D4A2B] hover:bg-[#5C7A52] text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm transition disabled:opacity-50 flex items-center gap-1 uppercase"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Tomar chat
                      </button>
                    )}
                  </div>
                </div>

                {/* Botones de acción del encabezado */}
                <div className="flex items-center gap-2">
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
                    className={`text-xs px-2.5 py-1 rounded-md font-semibold transition border ${
                      detalle.finalizado
                        ? "bg-sauce text-crema border-sauce hover:bg-verde-profundo"
                        : "bg-white text-carbon/70 border-carbon/20 hover:bg-carbon/5"
                    }`}
                  >
                    {detalle.finalizado ? "Reabrir Chat" : "Terminar Chat"}
                  </button>

                  <button
                    type="button"
                    onClick={borrarConversacion}
                    disabled={enviando}
                    title="Borrar esta conversación (para volver a probar)"
                    className="text-xs text-rojo/85 border border-rojo/20 bg-rojo/5 px-2.5 py-1 rounded-md transition hover:bg-rojo hover:text-white disabled:opacity-50"
                  >
                    Borrar
                  </button>
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

                {detalle.ventanaAbierta ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      rows={2}
                      placeholder="Escribe un mensaje…"
                      className={INPUT}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void enviarTexto();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={enviarTexto}
                      disabled={enviando || !texto.trim()}
                      className="shrink-0 rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
                    >
                      {enviando ? "…" : "Enviar"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="rounded-md border border-dorado/30 bg-dorado/5 px-3 py-2 text-xs text-carbon/70">
                      Fuera de la ventana de 24 h. Solo puedes contactar con una{" "}
                      <strong>plantilla aprobada</strong>.
                    </p>
                    <select
                      value={plantillaSel}
                      onChange={(e) => {
                        setPlantillaSel(e.target.value);
                        setParams([]);
                      }}
                      className={INPUT}
                    >
                      <option value="">— elige plantilla aprobada —</option>
                      {plantillas.map((p) => (
                        <option key={`${p.nombre}-${p.idioma}`} value={p.nombre}>
                          {p.nombre} ({p.idioma})
                        </option>
                      ))}
                    </select>
                    {plantillas.length === 0 && (
                      <p className="text-xs text-carbon/50">
                        No hay plantillas aprobadas o falta configurar el token /
                        WABA_ID.
                      </p>
                    )}
                    {plantilla && (
                      <p className="whitespace-pre-line rounded-md bg-crema/40 p-2 text-xs text-carbon/60">
                        {plantilla.cuerpo}
                      </p>
                    )}
                    {plantilla &&
                      Array.from({ length: plantilla.parametros }).map((_, i) => (
                        <input
                          key={i}
                          type="text"
                          value={params[i] ?? ""}
                          onChange={(e) => {
                            const arr = [...params];
                            arr[i] = e.target.value;
                            setParams(arr);
                          }}
                          placeholder={`Valor para {{${i + 1}}}`}
                          className={INPUT}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={enviarPlantilla}
                      disabled={enviando || !plantillaSel}
                      className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
                    >
                      {enviando ? "Enviando…" : "Enviar plantilla"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
