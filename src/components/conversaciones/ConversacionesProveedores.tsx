"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  enviarMensajeProveedorAction,
  reintentarMensajeProveedorAction,
  listarConversacionesProveedores,
  obtenerConversacionProveedor,
  type MensajeProveedor,
  type ResumenConversacionProveedor,
} from "@/app/actions/conversaciones-proveedores";
import { formatearTelefonoLegible } from "@/lib/telefono";

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return d.toLocaleString("es-MX", mismoDia ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Palomitas como en WhatsApp: enviado ✓, entregado ✓✓, leído ✓✓ azul. */
function Estado({
  m,
  onReintentar,
  reintentando,
}: {
  m: MensajeProveedor;
  onReintentar?: (id: string) => void;
  reintentando?: boolean;
}) {
  if (m.direccion !== "out") return null;
  if (m.estado === "pendiente_ventana")
    return (
      <span className="text-amber-700" title="Sale en cuanto el proveedor conteste (ya se le mandó el aviso)">
        ⏳ espera respuesta
      </span>
    );
  if (m.estado.startsWith("error"))
    return (
      <span className="inline-flex items-center gap-1.5 text-rojo" title={m.estado.replace(/^error:/, "")}>
        <span>⚠️ no se envió</span>
        {onReintentar && (
          <button
            type="button"
            disabled={reintentando}
            onClick={(e) => {
              e.stopPropagation();
              onReintentar(m.id);
            }}
            className="underline font-semibold hover:text-rojo/80 disabled:opacity-50 text-[10px]"
          >
            {reintentando ? "Reenviando…" : "Reintentar"}
          </button>
        )}
      </span>
    );
  if (m.leidoAt)
    return (
      <span className="text-sky-600 font-bold" title={`Leído ${hora(m.leidoAt)}`}>
        ✓✓ leído
      </span>
    );
  if (m.entregadoAt)
    return (
      <span className="text-carbon/50 font-bold" title={`Entregado ${hora(m.entregadoAt)}`}>
        ✓✓
      </span>
    );
  return <span className="text-carbon/40">✓</span>;
}

/**
 * Conversaciones con proveedores por la línea oficial: aparte de los clientes y sin Sofía.
 * Se ve todo lo que se les mandó, si les llegó y si lo leyeron, y sus respuestas.
 */
export function ConversacionesProveedores({ proveedorInicial }: { proveedorInicial?: string | null }) {
  const [lista, setLista] = useState<ResumenConversacionProveedor[]>([]);
  const [sel, setSel] = useState<string | null>(proveedorInicial || null);
  const [mensajes, setMensajes] = useState<MensajeProveedor[]>([]);
  const [ventanaAbierta, setVentanaAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [reintentandoId, setReintentandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  const cargarLista = useCallback(async () => {
    try {
      setLista(await listarConversacionesProveedores());
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }, []);

  const cargarHilo = useCallback(async (id: string) => {
    try {
      const r = await obtenerConversacionProveedor(id);
      setMensajes(r.mensajes);
      setVentanaAbierta(r.ventanaAbierta);
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    void cargarLista();
    const t = setInterval(cargarLista, 20000);
    return () => clearInterval(t);
  }, [cargarLista]);

  useEffect(() => {
    if (!sel) return;
    setAviso(null);
    void cargarHilo(sel);
    const t = setInterval(() => cargarHilo(sel), 10000);
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
      const r = await enviarMensajeProveedorAction(sel, texto);
      if (!r.ok) return setAviso({ ok: false, texto: r.error || "No se pudo enviar." });
      setTexto("");
      setAviso(
        r.via === "plantilla"
          ? { ok: true, texto: "Se mandó el aviso (plantilla). Tu mensaje completo sale en cuanto el proveedor conteste." }
          : { ok: true, texto: "Enviado." }
      );
      await Promise.all([cargarHilo(sel), cargarLista()]);
    } finally {
      setEnviando(false);
    }
  }

  async function reintentar(mensajeId: string) {
    if (reintentandoId || !sel) return;
    setReintentandoId(mensajeId);
    setAviso(null);
    try {
      const r = await reintentarMensajeProveedorAction(mensajeId);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.error || "No se pudo reenviar el mensaje." });
      } else {
        setAviso({ ok: true, texto: "Mensaje reenviado exitosamente." });
        await Promise.all([cargarHilo(sel), cargarLista()]);
      }
    } catch (e: any) {
      setAviso({ ok: false, texto: e?.message || "Error al reintentar." });
    } finally {
      setReintentandoId(null);
    }
  }

  const actual = lista.find((p) => p.proveedorId === sel) || null;
  const q = busqueda.trim().toLowerCase();
  const filtrada = q ? lista.filter((p) => `${p.nombre} ${p.categoria}`.toLowerCase().includes(q)) : lista;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[300px_1fr] gap-3 min-h-[70vh]">
      <div className={`rounded-xl border border-carbon/10 bg-white shadow-sm flex flex-col ${sel ? "hidden sm:flex" : "flex"}`}>
        <div className="p-2.5 border-b border-carbon/10">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor…"
            className="w-full rounded border border-carbon/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sauce/30"
          />
          <p className="mt-1.5 text-[10.5px] text-carbon/50">Línea oficial de WhatsApp · Sofía no les contesta</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtrada.length === 0 ? (
            <p className="p-4 text-center text-sm text-carbon/40">No hay proveedores con WhatsApp.</p>
          ) : (
            filtrada.map((p) => (
              <button
                key={p.proveedorId}
                type="button"
                onClick={() => setSel(p.proveedorId)}
                className={`w-full text-left px-3 py-2.5 border-b border-carbon/5 hover:bg-crema/40 ${sel === p.proveedorId ? "bg-sauce/10" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-carbon truncate">{p.nombre}</span>
                  <span className="text-[10px] text-carbon/40 shrink-0">{hora(p.ultimoAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-carbon/55 truncate">
                    {p.ultimoAt ? `${p.ultimaDireccion === "out" ? "Tú: " : ""}${p.ultimoTexto.replace(/^\[Plantilla: [^\]]+\]\s*/, "📨 ")}` : p.categoria || "Sin mensajes"}
                  </span>
                  {p.pendientes > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 text-amber-800 px-1.5 text-[10px] font-bold" title="Mensajes esperando que conteste">
                      ⏳ {p.pendientes}
                    </span>
                  )}
                  {p.ultimaDireccion === "in" && <span className="shrink-0 h-2 w-2 rounded-full bg-emerald-500" title="Su último mensaje está sin responder" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={`rounded-xl border border-carbon/10 bg-white shadow-sm flex flex-col ${sel ? "flex" : "hidden sm:flex"}`}>
        {!sel || !actual ? (
          <div className="flex-1 flex items-center justify-center text-sm text-carbon/40 p-6">Elige un proveedor para ver su conversación.</div>
        ) : (
          <>
            <div className="px-3 py-2.5 border-b border-carbon/10 flex items-center gap-2">
              <button type="button" onClick={() => setSel(null)} className="sm:hidden text-carbon/50 px-1">
                ←
              </button>
              <div className="min-w-0">
                <p className="font-semibold text-carbon truncate">{actual.nombre}</p>
                <p className="text-[11px] text-carbon/50">
                  {actual.telefono ? formatearTelefonoLegible(actual.telefono) : "sin WhatsApp"}
                  {actual.categoria ? ` · ${actual.categoria}` : ""}
                </p>
              </div>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${ventanaAbierta ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                title={
                  ventanaAbierta
                    ? "Escribió en las últimas 24 h: tus mensajes salen completos"
                    : "No ha escrito en 24 h: WhatsApp solo deja mandar el aviso (plantilla); tu mensaje sale completo cuando conteste"
                }
              >
                {ventanaAbierta ? "Conversación abierta" : "Sale con aviso"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#efeae2]/50 max-h-[60vh]">
              {mensajes.length === 0 && <p className="text-center text-sm text-carbon/40 py-6">Aún no hay mensajes con este proveedor.</p>}
              {mensajes.map((m) => (
                <div key={m.id} className={`flex ${m.direccion === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] shadow-sm whitespace-pre-wrap break-words ${
                      m.direccion === "out" ? "bg-[#d9fdd3]" : "bg-white"
                    } ${m.estado === "pendiente_ventana" ? "opacity-70 border border-dashed border-amber-400" : ""}`}
                  >
                    {m.texto.startsWith("[Plantilla:") ? (
                      <>
                        <span className="block text-[10px] font-bold text-carbon/45 mb-0.5">📨 Aviso (plantilla)</span>
                        {m.texto.replace(/^\[Plantilla: [^\]]+\]\s*/, "")}
                      </>
                    ) : (
                      m.texto.replace(/^\[audio:[^\]]+\]\s*/, "🎤 ")
                    )}
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-carbon/45">
                      {m.direccion === "out" && m.agente && <span>{m.agente}</span>}
                      <span>{hora(m.createdAt)}</span>
                      <Estado m={m} onReintentar={reintentar} reintentando={reintentandoId === m.id} />
                    </div>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            <div className="border-t border-carbon/10 p-2.5 space-y-1.5">
              {aviso && <p className={`text-[11px] rounded px-2 py-1 ${aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-rojo/10 text-rojo"}`}>{aviso.texto}</p>}
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
                  disabled={!actual.telefono}
                  placeholder={actual.telefono ? "Escribe al proveedor…" : "Agrega su WhatsApp en la ficha del proveedor"}
                  className="flex-1 rounded border border-carbon/15 px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sauce/30"
                />
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando || !texto.trim() || !actual.telefono}
                  className="self-end rounded bg-verde-profundo text-white px-4 py-2 text-xs font-bold disabled:opacity-50"
                >
                  {enviando ? "…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
