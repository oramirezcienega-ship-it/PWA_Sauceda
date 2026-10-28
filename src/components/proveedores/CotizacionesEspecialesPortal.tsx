"use client";

import { useState } from "react";
import { formatoPesos } from "@/lib/formato";
import {
  responderCotizacionEspecialPortal,
  type CotizacionEspecialPortal,
} from "@/app/actions/portal-precios-proveedor";

const inputCls =
  "w-full min-w-0 rounded-lg border border-carbon/20 bg-white px-3 py-2.5 text-sm text-carbon outline-none focus:border-sauce";

function fechaHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Estimaciones que SAUCEDA le pide al proveedor (cotizaciones especiales): responde con un formulario. */
export function CotizacionesEspecialesPortal({ token, iniciales }: { token: string; iniciales: CotizacionEspecialPortal[] }) {
  const [lista, setLista] = useState(iniciales);
  if (lista.length === 0) return null;
  const pendientes = lista.filter((c) => !c.cerrada && ["enviada", "cotizando", "sin_telegram"].includes(c.estado));

  return (
    <section className="mt-5 space-y-3">
      <h2 className="font-titular text-lg font-bold text-verde-profundo">
        💲 Te pedimos una estimación{" "}
        {pendientes.length > 0 && <span className="text-sauce">({pendientes.length} por responder)</span>}
      </h2>
      {lista.map((c) => (
        <TarjetaEstimacion key={c.respuestaId} token={token} c={c} onRespondida={setLista} />
      ))}
    </section>
  );
}

function TarjetaEstimacion({
  token,
  c,
  onRespondida,
}: {
  token: string;
  c: CotizacionEspecialPortal;
  onRespondida: (lista: CotizacionEspecialPortal[]) => void;
}) {
  const pendiente = !c.cerrada && ["enviada", "cotizando", "sin_telegram"].includes(c.estado);
  const [modo, setModo] = useState<"cotizar" | "visita" | null>(null);
  const [precio, setPrecio] = useState(c.precio ? String(c.precio) : "");
  const [tiempo, setTiempo] = useState(c.tiempo);
  const [incluye, setIncluye] = useState(c.incluye);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vencida = !!c.fechaLimite && new Date(c.fechaLimite) < new Date();

  async function responder(tipo: "cotizada" | "requiere_visita" | "rechazada") {
    if (tipo === "rechazada" && !confirm("¿Confirmas que no puedes hacer este trabajo?")) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await responderCotizacionEspecialPortal(token, c.respuestaId, {
        tipo,
        precio: tipo === "cotizada" ? Number(precio.replace(/[^\d.]/g, "")) : null,
        tiempo,
        incluye,
      });
      if (!r.ok) setError(r.mensaje || "No se pudo enviar.");
      else if (r.cotizaciones) onRespondida(r.cotizaciones);
    } catch {
      setError("No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const respuesta =
    c.estado === "cotizada"
      ? { texto: `✅ Cotizaste ${c.precio !== null ? formatoPesos(c.precio) : ""}${c.tiempo ? ` · ${c.tiempo}` : ""}`, clase: "bg-emerald-50 text-emerald-800" }
      : c.estado === "requiere_visita"
      ? { texto: "🔎 Pediste revisar en sitio", clase: "bg-sky-50 text-sky-800" }
      : c.estado === "rechazada"
      ? { texto: "Respondiste que no lo haces", clase: "bg-slate-100 text-carbon/70" }
      : null;

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${pendiente ? "border-amber-300" : "border-carbon/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/45">{c.folio}</div>
          <div className="font-titular text-base font-bold text-verde-profundo">{c.titulo}</div>
          {c.zona && <div className="text-sm text-carbon/60">📍 {c.zona}</div>}
        </div>
        {pendiente && c.fechaLimite && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${vencida ? "bg-rojo/10 text-rojo" : "bg-amber-50 text-amber-800"}`}>
            {vencida ? "Plazo vencido — aún puedes responder" : `Responde antes del ${fechaHora(c.fechaLimite)}`}
          </span>
        )}
      </div>

      {c.descripcion && <p className="mt-2 whitespace-pre-line text-sm text-carbon/80">{c.descripcion}</p>}

      {c.fotos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {c.fotos.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Foto ${i + 1} del trabajo`} className="h-24 w-24 shrink-0 rounded-lg border border-carbon/10 object-cover" />
            </a>
          ))}
        </div>
      )}

      {respuesta && !pendiente && <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${respuesta.clase}`}>{respuesta.texto}</div>}
      {c.cerrada && <p className="mt-2 text-xs text-carbon/50">Esta solicitud ya se cerró.</p>}

      {pendiente && !modo && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModo("cotizar")}
            className="rounded-xl bg-sauce px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo"
          >
            ✍️ Responder estimación
          </button>
          <button
            type="button"
            onClick={() => setModo("visita")}
            className="rounded-xl border border-sky-300 bg-sky-50/60 px-3.5 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
          >
            🔎 Necesito verlo en sitio
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => responder("rechazada")}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-carbon/50 hover:text-rojo"
          >
            No lo hago
          </button>
        </div>
      )}

      {pendiente && modo === "cotizar" && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <label className="mb-1 block text-xs font-semibold text-carbon/70">Tu precio total para SAUCEDA ($) *</label>
              <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} placeholder="Ej. 18000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-carbon/70">¿Cuánto tiempo te toma?</label>
              <input value={tiempo} onChange={(e) => setTiempo(e.target.value)} className={inputCls} placeholder="Ej. 2 días" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-carbon/70">¿Qué incluye y qué no incluye tu precio?</label>
            <textarea
              rows={3}
              value={incluye}
              onChange={(e) => setIncluye(e.target.value)}
              className={inputCls}
              placeholder="Material, mano de obra, refacciones, retiro de escombro…"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setModo(null)} className="mr-auto rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-semibold text-carbon/70 hover:bg-slate-100">
              Cerrar
            </button>
            <button type="button" onClick={() => setModo("visita")} className="text-sm font-semibold text-sky-700 hover:underline">
              🔎 Necesito verlo en sitio
            </button>
            <button type="button" disabled={enviando} onClick={() => responder("rechazada")} className="text-sm font-semibold text-carbon/50 hover:text-rojo">
              No lo hago
            </button>
            <button
              type="button"
              disabled={enviando || !precio.trim()}
              onClick={() => responder("cotizada")}
              className="rounded-xl bg-sauce px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar mi estimación"}
            </button>
          </div>
        </div>
      )}

      {pendiente && modo === "visita" && (
        <div className="mt-3 space-y-3 rounded-xl bg-sky-50/60 p-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-carbon/70">¿Qué necesitas revisar en sitio? *</label>
            <textarea rows={3} value={incluye} onChange={(e) => setIncluye(e.target.value)} className={inputCls} placeholder="Ej. ver el estado de la hidrobomba y la altura de la azotea" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModo("cotizar")} className="rounded-xl border border-carbon/20 px-4 py-2 text-sm font-semibold text-carbon/70">
              Mejor cotizo
            </button>
            <button
              type="button"
              disabled={enviando || !incluye.trim()}
              onClick={() => responder("requiere_visita")}
              className="rounded-xl bg-sky-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Pedir visita"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 rounded-lg bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</div>}
    </div>
  );
}
