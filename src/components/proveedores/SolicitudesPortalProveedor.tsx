"use client";

import { useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { responderSolicitudPortal, type SolicitudPortal } from "@/app/actions/portal-precios-proveedor";

const inputCls =
  "w-full min-w-0 rounded-lg border border-carbon/20 bg-white px-3 py-2.5 text-sm text-carbon outline-none focus:border-sauce";

function fechaHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ESTADO_RESPONDIDA: Partial<Record<SolicitudPortal["estado"], { texto: string; clase: string }>> = {
  aceptada: { texto: "✅ La aceptaste", clase: "bg-emerald-50 text-emerald-800" },
  rechazada: { texto: "Respondiste que no puedes", clase: "bg-slate-100 text-carbon/70" },
  requiere_visita: { texto: "🔎 Pediste revisar en sitio", clase: "bg-sky-50 text-sky-800" },
  vencida: { texto: "⌛ Venció el plazo para responder", clase: "bg-slate-100 text-carbon/60" },
  cancelada: { texto: "La tomó otro proveedor o se canceló", clase: "bg-slate-100 text-carbon/60" },
};

/** Solicitudes de servicio que SAUCEDA le envió al proveedor: ¿lo puedes tomar? */
export function SolicitudesPortalProveedor({
  token,
  iniciales,
  solicitudFoco,
}: {
  token: string;
  iniciales: SolicitudPortal[];
  solicitudFoco?: string;
}) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const copia = [...iniciales];
    copia.sort((a, b) => {
      const aEsFoco = Boolean(solicitudFoco && (a.folio === solicitudFoco || a.envioId === solicitudFoco));
      const bEsFoco = Boolean(solicitudFoco && (b.folio === solicitudFoco || b.envioId === solicitudFoco));
      if (aEsFoco && !bEsFoco) return -1;
      if (!aEsFoco && bEsFoco) return 1;
      const aPend = a.estado === "enviada" || a.estado === "vista";
      const bPend = b.estado === "enviada" || b.estado === "vista";
      if (aPend && !bPend) return -1;
      if (!aPend && bPend) return 1;
      return 0;
    });
    return copia;
  });

  if (solicitudes.length === 0) return null;
  const pendientes = solicitudes.filter((s) => s.estado === "enviada" || s.estado === "vista");

  return (
    <section className="mt-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-titular text-lg font-bold text-verde-profundo">
          🛠️ Servicios que te ofrecemos{" "}
          {pendientes.length > 0 && <span className="text-sauce">({pendientes.length} por responder)</span>}
        </h2>
        {solicitudFoco && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            Enfocado en {solicitudFoco}
          </span>
        )}
      </div>
      {solicitudes.map((s) => {
        const esFoco = Boolean(solicitudFoco && (s.folio === solicitudFoco || s.envioId === solicitudFoco));
        return (
          <TarjetaSolicitudPortal
            key={s.envioId}
            token={token}
            s={s}
            foco={esFoco}
            onRespondida={(nueva) => setSolicitudes((prev) => prev.map((x) => (x.envioId === nueva.envioId ? nueva : x)))}
          />
        );
      })}
    </section>
  );
}

function TarjetaSolicitudPortal({
  token,
  s,
  foco,
  onRespondida,
}: {
  token: string;
  s: SolicitudPortal;
  foco?: boolean;
  onRespondida: (s: SolicitudPortal) => void;
}) {
  const pendiente = s.estado === "enviada" || s.estado === "vista";
  const [abierta, setAbierta] = useState(foco ? true : pendiente);
  const [modo, setModo] = useState<null | "aceptada" | "rechazada" | "requiere_visita">(null);
  const [fechas, setFechas] = useState<string[]>(["", "", ""]);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const respondida = ESTADO_RESPONDIDA[s.estado];

  async function responder() {
    if (!modo) return;
    setEnviando(true);
    setMensaje(null);
    const res = await responderSolicitudPortal(token, s.envioId, {
      tipo: modo,
      fechas: fechas.filter((f) => f.trim()),
      comentario,
    });
    setEnviando(false);
    if (!res.ok) return setMensaje({ tipo: "error", texto: res.mensaje || "No se pudo enviar tu respuesta." });
    setMensaje({
      tipo: "ok",
      texto:
        modo === "aceptada"
          ? "¡Gracias! Confirmamos con el cliente y te avisamos la fecha elegida."
          : "Gracias por avisarnos.",
    });
    if (res.solicitud) onRespondida(res.solicitud);
    setModo(null);
  }

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
        foco
          ? "border-emerald-500 ring-4 ring-emerald-500/20 shadow-lg"
          : pendiente
          ? s.urgente
            ? "border-rojo/40"
            : "border-sauce/40"
          : "border-carbon/10"
      }`}
    >
      {foco && (
        <div className="bg-emerald-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white flex items-center justify-between">
          <span>🎯 Servicio que te estamos consultando</span>
          <span className="font-mono">{s.folio}</span>
        </div>
      )}
      <button type="button" onClick={() => setAbierta((x) => !x)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase text-carbon/50">
            <span className="font-mono">{s.folio}</span>
            {s.urgente && <span className="rounded bg-rojo/10 px-1.5 text-rojo">Urgente</span>}
          </div>
          <div className="font-titular text-base font-bold text-verde-profundo">
            {s.productoNombre}
            {s.cantidad ? ` · ${s.cantidad.toLocaleString("es-MX")} ${s.unidad}` : ""}
          </div>
          <div className="text-sm text-carbon/70">{s.zona}</div>
          {pendiente && s.fechaLimite && (
            <div className="mt-0.5 text-[12px] font-semibold text-sauce">Responde antes del {fechaHora(s.fechaLimite)}</div>
          )}
          {respondida && (
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[12px] font-semibold ${respondida.clase}`}>{respondida.texto}</span>
          )}
        </div>
        <span className="shrink-0 text-carbon/40">{abierta ? "▲" : "▼"}</span>
      </button>

      {abierta && (
        <div className="space-y-4 border-t border-carbon/10 p-4 text-sm">
          {s.descripcion && <p className="whitespace-pre-line text-carbon/80">{s.descripcion}</p>}
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {s.fechasSugeridas && (
              <div>
                <dt className="text-[11px] font-bold uppercase text-carbon/50">Cuándo le conviene al cliente</dt>
                <dd>{s.fechasSugeridas}</dd>
              </div>
            )}
            {s.costoReferencia !== null && (
              <div>
                <dt className="text-[11px] font-bold uppercase text-carbon/50">Tu costo según tu lista de precios</dt>
                <dd className="font-mono font-bold">{formatoPesos(s.costoReferencia)}</dd>
              </div>
            )}
          </dl>
          {s.fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {s.fotos.map((f, i) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.titulo || `Foto ${i + 1}`} className="aspect-square w-full rounded-lg border object-cover" />
                </a>
              ))}
            </div>
          )}

          {s.estado === "aceptada" && (
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
              Propusiste: {s.fechasPropuestas.join(" · ")}
              {s.fechaAcordada ? (
                <p className="mt-1 font-bold">📅 Fecha confirmada con el cliente: {s.fechaAcordada}</p>
              ) : (
                <p className="mt-1">Estamos confirmando la fecha con el cliente.</p>
              )}
            </div>
          )}

          {pendiente && !modo && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => setModo("aceptada")} className="rounded-xl bg-sauce py-3 font-bold text-white hover:bg-verde-profundo">
                ✅ Sí, lo tomo
              </button>
              <button
                type="button"
                onClick={() => setModo("requiere_visita")}
                className="rounded-xl border border-sky-300 py-3 font-bold text-sky-800 hover:bg-sky-50"
              >
                🔎 Necesito verlo
              </button>
              <button
                type="button"
                onClick={() => setModo("rechazada")}
                className="rounded-xl border border-carbon/20 py-3 font-bold text-carbon/70 hover:bg-slate-50"
              >
                No puedo
              </button>
            </div>
          )}

          {pendiente && modo && (
            <div className="space-y-3 rounded-xl border border-carbon/10 bg-slate-50 p-3">
              {modo === "aceptada" && (
                <div className="space-y-2">
                  <p className="font-semibold">¿Qué días y horarios puedes? (al menos uno)</p>
                  {s.fechasSugeridas && (
                    <button
                      type="button"
                      onClick={() => setFechas((prev) => [s.fechasSugeridas, prev[1], prev[2]])}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1.5"
                    >
                      <span>⚡</span>
                      <span>Aceptar horario propuesto por el cliente: <b>{s.fechasSugeridas}</b></span>
                    </button>
                  )}
                  {fechas.map((f, i) => (
                    <input
                      key={i}
                      value={f}
                      onChange={(e) => setFechas((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                      className={inputCls}
                      placeholder={i === 0 ? "Ej. lunes 20 de 9 a 12" : "Otra opción (opcional)"}
                    />
                  ))}
                </div>
              )}
              <div>
                <p className="mb-1 font-semibold">
                  {modo === "requiere_visita" ? "¿Qué necesitas revisar en sitio?" : "Comentario (opcional)"}
                </p>
                <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo(null)} className="flex-1 rounded-xl border border-carbon/20 py-2.5 font-semibold text-carbon/70">
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={responder}
                  disabled={enviando}
                  className="flex-1 rounded-xl bg-sauce py-2.5 font-bold text-white hover:bg-verde-profundo disabled:opacity-50"
                >
                  {enviando ? "Enviando…" : "Enviar respuesta"}
                </button>
              </div>
            </div>
          )}

          {mensaje && (
            <div className={`rounded-lg p-3 ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-rojo"}`}>
              {mensaje.texto}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
