"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listarConversaciones,
  obtenerConversacion,
  responderConversacion,
  responderConPlantilla,
  eliminarConversacion,
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

/** Bandeja de conversaciones de WhatsApp (lista + hilo + responder). */
export function Conversaciones() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaWhatsApp[]>([]);
  const [texto, setTexto] = useState("");
  const [plantillaSel, setPlantillaSel] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

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

  // Carga inicial + plantillas aprobadas.
  useEffect(() => {
    void refrescar(null);
    listarPlantillasWhatsApp()
      .then((r) => setPlantillas(r.plantillas.filter((p) => p.estado === "APPROVED")))
      .catch(() => setPlantillas([]));
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

  return (
    <div className="grid h-[calc(100vh-180px)] grid-cols-1 gap-3 sm:grid-cols-[320px_1fr]">
      {/* Lista de conversaciones */}
      <div className="overflow-y-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
        {conversaciones.length === 0 ? (
          <p className="p-6 text-center text-sm text-carbon/40">
            Aún no hay conversaciones. Aparecerán cuando un cliente te escriba por
            WhatsApp.
          </p>
        ) : (
          conversaciones.map((c) => (
            <button
              key={c.telefono}
              type="button"
              onClick={() => abrir(c.telefono)}
              className={`flex w-full flex-col items-start border-b border-carbon/5 px-3 py-2.5 text-left transition hover:bg-crema/40 ${
                sel === c.telefono ? "bg-sauce/5" : ""
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate font-titular font-medium text-verde-profundo">
                  {c.nombre}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                    c.ventanaAbierta
                      ? "bg-sauce/15 text-verde-profundo"
                      : "bg-carbon/10 text-carbon/50"
                  }`}
                  title={
                    c.ventanaAbierta
                      ? "Ventana de 24 h abierta (puedes responder con texto)"
                      : "Fuera de la ventana de 24 h (solo plantilla)"
                  }
                >
                  {c.ventanaAbierta ? "24h" : "cerrada"}
                </span>
              </span>
              <span className="mt-0.5 w-full truncate text-xs text-carbon/50">
                {c.ultimoTexto || "—"}
              </span>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-carbon/30">
                  {c.telefono} · {horaCorta(c.ultimaFecha)}
                </span>
                <span className="shrink-0 text-[10px] text-sauce">
                  {c.atiende ? `Atiende: ${c.atiende}` : "Sin atender"}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Hilo + responder */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-carbon/10 bg-white">
        {!sel ? (
          <p className="m-auto p-6 text-center text-sm text-carbon/40">
            Selecciona una conversación para ver el historial y responder.
          </p>
        ) : !detalle ? (
          <p className="m-auto p-6 text-sm text-carbon/50">Cargando…</p>
        ) : (
          <>
            {/* Encabezado del hilo */}
            <div className="flex items-center justify-between gap-2 border-b border-carbon/10 bg-crema/40 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-titular font-medium text-verde-profundo">
                  {detalle.nombre}
                </p>
                <p className="font-mono text-[11px] text-carbon/40">
                  {detalle.telefono}
                  {detalle.expedienteId && ` · ${detalle.expedienteId}`}
                  {(() => {
                    const a = detalle.mensajes
                      .slice()
                      .reverse()
                      .find((m) => m.direccion === "out" && m.agente)?.agente;
                    return a ? ` · Atiende: ${a}` : "";
                  })()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {detalle.expedienteId && (
                  <a
                    href={`/expediente/${detalle.expedienteId}`}
                    className="text-xs text-sauce hover:text-verde-profundo"
                  >
                    Ver expediente →
                  </a>
                )}
                <button
                  type="button"
                  onClick={borrarConversacion}
                  disabled={enviando}
                  title="Borrar esta conversación (para volver a probar)"
                  className="text-xs text-rojo/70 transition hover:text-rojo disabled:opacity-50"
                >
                  Borrar
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 scrollbar-sutil">
              {detalle.mensajes.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                      m.direccion === "out"
                        ? "bg-sauce text-crema"
                        : "bg-crema/70 text-carbon"
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
            <div className="border-t border-carbon/10 p-3">
              {aviso && (
                <p className="mb-2 rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-xs text-rojo">
                  {aviso}
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
  );
}
