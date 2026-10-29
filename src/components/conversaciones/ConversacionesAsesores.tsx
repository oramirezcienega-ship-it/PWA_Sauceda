"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  enviarMensajeAsesorAction,
  listarConversacionesAsesores,
  obtenerConversacionAsesor,
  type MensajeAsesor,
  type ResumenConversacionAsesor,
} from "@/app/actions/conversaciones-asesores";
import { formatearTelefonoLegible } from "@/lib/telefono";
import Link from "next/link";

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return d.toLocaleString("es-MX", mismoDia ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function EstadoMensaje({ estado }: { estado: string }) {
  if (estado.startsWith("error")) {
    return <span className="text-red-500 font-semibold" title={estado}>⚠️ error</span>;
  }
  if (estado === "leido") {
    return <span className="text-sky-600 font-bold">✓✓</span>;
  }
  if (estado === "entregado") {
    return <span className="text-carbon/50 font-bold">✓✓</span>;
  }
  return <span className="text-carbon/40">✓</span>;
}

export function ConversacionesAsesores({ asesorInicial }: { asesorInicial?: string | null }) {
  const [lista, setLista] = useState<ResumenConversacionAsesor[]>([]);
  const [sel, setSel] = useState<string | null>(asesorInicial || null);
  const [mensajes, setMensajes] = useState<MensajeAsesor[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  const cargarLista = useCallback(async () => {
    try {
      const r = await listarConversacionesAsesores();
      setLista(r);
      // Si no hay seleccionado, preseleccionar a Gerardo o el primero de la lista
      setSel((prev) => {
        if (prev) return prev;
        const gerardo = r.find((a) => a.nombre.toLowerCase().includes("gerardo"));
        return gerardo?.asesorId || r[0]?.asesorId || null;
      });
    } catch {
      /* se reintenta */
    }
  }, []);

  const cargarHilo = useCallback(async (id: string) => {
    try {
      const r = await obtenerConversacionAsesor(id);
      setMensajes(r.mensajes);
    } catch {
      /* se reintenta */
    }
  }, []);

  useEffect(() => {
    void cargarLista();
    const t = setInterval(cargarLista, 15000);
    return () => clearInterval(t);
  }, [cargarLista]);

  useEffect(() => {
    if (!sel) return;
    setAviso(null);
    void cargarHilo(sel);
    const t = setInterval(() => cargarHilo(sel), 8000);
    return () => clearInterval(t);
  }, [sel, cargarHilo]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length, sel]);

  async function enviar() {
    if (!sel || !texto.trim() || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await enviarMensajeAsesorAction(sel, texto);
      if (!r.ok) {
        return setAviso({ ok: false, texto: r.error || "No se pudo enviar el mensaje por Evolution API." });
      }
      setTexto("");
      setAviso({ ok: true, texto: "Mensaje enviado a su WhatsApp vía Evolution API." });
      await Promise.all([cargarHilo(sel), cargarLista()]);
    } finally {
      setEnviando(false);
    }
  }

  const actual = lista.find((a) => a.asesorId === sel) || null;
  const q = busqueda.trim().toLowerCase();
  const filtrada = q
    ? lista.filter((a) => `${a.nombre} ${a.rol} ${a.telefono}`.toLowerCase().includes(q))
    : lista;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[320px_1fr] gap-3 min-h-[70vh]">
      {/* Panel Izquierdo: Lista de Asesores */}
      <div className={`rounded-xl border border-carbon/10 bg-white shadow-sm flex flex-col ${sel ? "hidden sm:flex" : "flex"}`}>
        <div className="p-2.5 border-b border-carbon/10">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar asesor…"
            className="w-full rounded border border-carbon/15 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sauce/30"
          />
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-carbon/50">
            <span>Canal Evolution API (WhatsApp)</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Línea Rescate
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtrada.length === 0 ? (
            <p className="p-4 text-center text-sm text-carbon/40">No hay asesores configurados.</p>
          ) : (
            filtrada.map((a) => {
              const esGerardo = a.nombre.toLowerCase().includes("gerardo");
              return (
                <button
                  key={a.asesorId}
                  type="button"
                  onClick={() => setSel(a.asesorId)}
                  className={`w-full text-left px-3 py-2.5 border-b border-carbon/5 hover:bg-crema/40 transition ${
                    sel === a.asesorId ? "bg-sauce/10 border-l-4 border-l-sauce" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-sm text-carbon truncate">{a.nombre}</span>
                      {esGerardo && (
                        <span className="rounded bg-sky-100 text-sky-800 text-[9.5px] font-bold px-1.5 py-0.2 shrink-0">
                          Seguridad
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-carbon/40 shrink-0">{hora(a.ultimoAt)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11.5px] text-carbon/60 truncate">
                      {a.ultimoAt ? (
                        <>
                          {a.ultimaDireccion === "out" ? "Enviado: " : "Él: "}
                          {a.ultimoTexto.replace(/^[*\s]+|[*]+/g, "").slice(0, 45)}…
                        </>
                      ) : (
                        <span className="text-carbon/40 capitalize">{a.rol} · Sin mensajes aún</span>
                      )}
                    </span>
                    {a.ultimaDireccion === "in" && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-emerald-500" title="Respuesta nueva del asesor" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Panel Derecho: Historial del Chat con el Asesor */}
      <div className={`rounded-xl border border-carbon/10 bg-white shadow-sm flex flex-col ${sel ? "flex" : "hidden sm:flex"}`}>
        {!sel || !actual ? (
          <div className="flex-1 flex items-center justify-center text-sm text-carbon/40 p-6">
            Selecciona un asesor para ver el historial de leads y mensajes por WhatsApp.
          </div>
        ) : (
          <>
            {/* Cabecera del Asesor */}
            <div className="px-3.5 py-2.5 border-b border-carbon/10 flex items-center gap-2.5 bg-crema/20">
              <button
                type="button"
                onClick={() => setSel(null)}
                className="sm:hidden text-carbon/60 hover:text-carbon px-1 text-base"
                title="Volver a la lista"
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-carbon text-sm sm:text-base truncate">{actual.nombre}</p>
                  <span className="rounded-full bg-sauce/15 text-verde-profundo text-[10px] font-bold px-2 py-0.5 capitalize">
                    {actual.rol}
                  </span>
                </div>
                <p className="text-[11px] text-carbon/55 flex items-center gap-2 mt-0.5">
                  <span>📱 {actual.telefonoWhatsapp ? formatearTelefonoLegible(actual.telefonoWhatsapp) : "Sin teléfono"}</span>
                  {actual.telefonoWhatsapp && (
                    <a
                      href={`https://wa.me/${actual.telefonoWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      Abrir WhatsApp ↗
                    </a>
                  )}
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 text-[10.5px] font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Evolution API Activa
                </span>
                <span className="text-[10px] text-carbon/40 mt-0.5">Instancia: linea-rescate</span>
              </div>
            </div>

            {/* Mensajes del Chat */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#efeae2]/40 max-h-[62vh]">
              {mensajes.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-carbon/50">No hay mensajes registrados con {actual.nombre}.</p>
                  <p className="text-xs text-carbon/40 mt-1">
                    Cuando entre un lead de seguridad, aquí se reflejará el pase automático con su ficha completa.
                  </p>
                </div>
              ) : (
                mensajes.map((m) => {
                  const esFichaLead = m.texto.includes("NUEVO LEAD ASIGNADO");
                  const esOut = m.direccion === "out";

                  return (
                    <div key={m.id} className={`flex ${esOut ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] sm:max-w-[78%] rounded-xl px-3.5 py-2.5 text-[13px] shadow-sm break-words whitespace-pre-wrap ${
                          esOut ? "bg-[#d9fdd3] text-carbon" : "bg-white text-carbon"
                        } ${esFichaLead ? "border-l-4 border-l-emerald-600" : ""}`}
                      >
                        {esFichaLead && (
                          <div className="mb-1.5 pb-1 border-b border-carbon/10 flex items-center justify-between">
                            <span className="font-bold text-emerald-900 text-xs flex items-center gap-1">
                              🚀 Ficha de Lead Automática
                            </span>
                            {m.expedienteId && (
                              <Link
                                href={`/expedientes/${m.expedienteId}`}
                                className="text-[11px] font-semibold text-emerald-700 hover:underline"
                              >
                                Ver expediente →
                              </Link>
                            )}
                          </div>
                        )}

                        <div className="leading-relaxed">{m.texto}</div>

                        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-carbon/45">
                          {m.agente && <span>{m.agente}</span>}
                          <span>{hora(m.createdAt)}</span>
                          {esOut && <EstadoMensaje estado={m.estado} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={finRef} />
            </div>

            {/* Input para responder o enviar mensaje al asesor */}
            <div className="border-t border-carbon/10 p-2.5 space-y-1.5 bg-white">
              {aviso && (
                <p
                  className={`text-[11px] rounded px-2.5 py-1 ${
                    aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                  }`}
                >
                  {aviso.texto}
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  rows={2}
                  disabled={!actual.telefonoWhatsapp}
                  placeholder={
                    actual.telefonoWhatsapp
                      ? `Escribir mensaje a ${actual.nombre} por WhatsApp… (Shift+Enter para salto de línea)`
                      : "Este asesor no tiene WhatsApp configurado"
                  }
                  className="flex-1 rounded-lg border border-carbon/15 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sauce/30"
                />
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando || !texto.trim() || !actual.telefonoWhatsapp}
                  className="self-end rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white px-4 py-2 text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {enviando ? (
                    <span>Enviando…</span>
                  ) : (
                    <>
                      <span>Enviar</span>
                      <span>📲</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
