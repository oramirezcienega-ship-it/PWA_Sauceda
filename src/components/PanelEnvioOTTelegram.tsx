"use client";

import { useEffect, useState } from "react";
import {
  obtenerEstadoEnvioOTTelegramAction,
  enviarOTPorTelegramAction,
  type EstadoEnvioOTTelegram,
  type ResultadoEnvioOT,
} from "@/app/actions/ordenes-telegram";

/**
 * Envía por Telegram a uno o varios asesores un resumen de la orden de trabajo
 * (cliente, fechas, asesor, cobranza) junto con los documentos listos para imprimir en PDF.
 * Diseño compacto y colapsable para optimizar el espacio vertical en pantalla.
 */
export function PanelEnvioOTTelegram({ ordenId }: { ordenId: string }) {
  const [estado, setEstado] = useState<EstadoEnvioOTTelegram | null>(null);
  const [asesores, setAsesores] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioOT | null>(null);
  const [verMensaje, setVerMensaje] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [colapsado, setColapsado] = useState(true);

  const cargar = async () => {
    const e = await obtenerEstadoEnvioOTTelegramAction(ordenId);
    setEstado(e);
    setAsesores((prev) => (prev.length ? prev : e.destinatarios.filter((d) => d.preseleccionado && d.tieneTelegram).map((d) => d.id)));
    setDocs((prev) => (prev.length ? prev : e.documentos.map((d) => d.clave)));
  };

  useEffect(() => {
    cargar();
  }, [ordenId]);

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const copiar = async (enlace: string, nombre: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setAviso(`Enlace de ${nombre} copiado. Compártelo para que vincule su Telegram.`);
    } catch {
      window.prompt("Copia este enlace:", enlace);
    }
  };

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    setAviso(null);
    const r = await enviarOTPorTelegramAction(ordenId, asesores, docs);
    setResultado(r);
    setEnviando(false);
    // Si estaba colapsado y terminó, o si se envió con éxito, mantener feedback visible
    if (r.ok && colapsado) {
      setAviso(`Enviado con éxito a ${asesores.length} asesor(es) por Telegram.`);
    }
  };

  if (!estado) {
    return (
      <div className="rounded-xl border border-carbon/10 bg-white p-3 text-xs text-carbon/40 flex items-center gap-2">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"></span>
        <span>Cargando despacho por Telegram…</span>
      </div>
    );
  }

  if (!estado.ok) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rojo">
        {estado.error}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200/90 bg-gradient-to-r from-sky-50/80 via-white to-blue-50/40 p-3.5 shadow-2xs space-y-3 font-cuerpo text-xs transition-all">
      {/* Barra de Encabezado Compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setColapsado(!colapsado)}
          className="flex items-center gap-2.5 text-left cursor-pointer group min-w-0"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-600 text-white text-sm shadow-2xs shrink-0 group-hover:bg-sky-700 transition">
            ✈️
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-titular font-bold text-sky-950 text-xs sm:text-sm group-hover:text-sky-700 transition">
                Enviar a asesores por Telegram
              </span>
              <span className="rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.2 shrink-0">
                {asesores.length} asesor{asesores.length !== 1 ? "es" : ""} · {docs.length} doc{docs.length !== 1 ? "s" : ""}
              </span>
            </div>
            {colapsado && (
              <p className="text-[11px] text-sky-900/60 font-cuerpo truncate max-w-sm sm:max-w-md">
                Resumen de orden y PDFs listos para imprimir
              </p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {colapsado && asesores.length > 0 && (
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="rounded-xl bg-[#229ED9] hover:bg-[#1e8bc0] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{enviando ? "⏳" : "✈️"}</span>
              <span>{enviando ? "Enviando…" : `Enviar (${asesores.length})`}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setColapsado(!colapsado)}
            className="rounded-lg border border-sky-300 bg-white hover:bg-sky-50 text-sky-900 text-xs font-semibold px-2.5 py-1.5 transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <span>{colapsado ? "Desplegar ▼" : "Contraer ▲"}</span>
          </button>
        </div>
      </div>

      {aviso && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800 flex items-center gap-1.5">
          <span>✓</span> {aviso}
        </div>
      )}

      {/* Contenido Desplegable */}
      {!colapsado && (
        <div className="space-y-3 pt-2 border-t border-sky-100 animate-in fade-in duration-100">
          <p className="text-xs text-sky-900/80 font-cuerpo">
            Manda a uno o varios asesores un resumen de la orden (cliente, dirección, fecha de instalación, cobranza) con los documentos en PDF listos para imprimir.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Asesores */}
            <div className="rounded-xl border border-carbon/10 bg-white p-3 space-y-1.5 max-h-56 overflow-y-auto shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-carbon/50">Asesores Destinatarios</p>
              {estado.destinatarios.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <label className={`flex items-center gap-2 ${d.tieneTelegram ? "cursor-pointer" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      disabled={!d.tieneTelegram}
                      checked={asesores.includes(d.id)}
                      onChange={() => alternar(asesores, setAsesores, d.id)}
                      className="rounded text-sauce"
                    />
                    <span className="font-semibold text-carbon/80">{d.nombre}</span>
                    <span className="text-carbon/40">{d.rol}</span>
                    {d.preseleccionado && (
                      <span className="rounded-full bg-sauce/15 px-1.5 py-0.2 text-[9px] font-bold text-verde-profundo">
                        Asignado
                      </span>
                    )}
                  </label>
                  {!d.tieneTelegram &&
                    (d.enlaceVinculacion ? (
                      <button
                        type="button"
                        onClick={() => copiar(d.enlaceVinculacion!, d.nombre)}
                        className="shrink-0 text-[10px] font-bold text-sauce hover:underline"
                      >
                        🔗 Vincular
                      </button>
                    ) : (
                      <span className="text-[10px] text-carbon/40">Sin Telegram</span>
                    ))}
                </div>
              ))}
            </div>

            {/* Documentos */}
            <div className="rounded-xl border border-carbon/10 bg-white p-3 space-y-1.5 max-h-56 overflow-y-auto shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-carbon/50">Documentos en PDF</p>
              {estado.documentos.length === 0 ? (
                <p className="text-xs text-carbon/40 italic">
                  Esta orden aún no tiene documentos generados (cotización, póliza, recibos). Se enviará solo el resumen.
                </p>
              ) : (
                estado.documentos.map((d) => (
                  <label key={d.clave} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={docs.includes(d.clave)}
                        onChange={() => alternar(docs, setDocs, d.clave)}
                        className="rounded text-sauce"
                      />
                      <span className="font-semibold text-carbon/80">📄 {d.nombre}</span>
                    </span>
                    <span className="text-carbon/40">{d.detalle}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || asesores.length === 0}
              className="rounded-xl bg-[#229ED9] hover:bg-[#1e8bc0] px-4 py-2 text-xs font-bold text-white shadow-2xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{enviando ? "⏳" : "✈️"}</span>
              <span>
                {enviando
                  ? "Enviando…"
                  : `Enviar por Telegram${asesores.length ? ` (${asesores.length} asesor${asesores.length > 1 ? "es" : ""})` : ""}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVerMensaje((v) => !v)}
              className="text-xs font-semibold text-sauce hover:underline"
            >
              {verMensaje ? "Ocultar vista previa" : "Ver mensaje que recibirán"}
            </button>
          </div>

          {resultado && (
            <div
              className={`rounded-lg border p-3 text-xs space-y-1 ${
                resultado.ok ? "border-green-200 bg-green-50 text-green-800" : "border-rose-200 bg-rose-50 text-rojo"
              }`}
            >
              {resultado.enviados.map((e) => (
                <div key={e.nombre}>
                  {e.ok ? "✅" : "⚠️"} <strong>{e.nombre}</strong>
                  {e.ok ? ` · resumen y ${e.documentos} documento(s)` : ` · ${e.error}`}
                  {e.ok && e.error ? ` (${e.error})` : ""}
                </div>
              ))}
              {!resultado.ok && resultado.error && <div>{resultado.error}</div>}
              {resultado.noGenerados && resultado.noGenerados.length > 0 && (
                <div className="text-rojo space-y-0.5">
                  <div>⛔ No se pudieron generar y NO se enviaron:</div>
                  {resultado.noGenerados.map((d) => (
                    <div key={d} className="pl-4 font-mono text-[10px]">• {d}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {verMensaje && estado.html && (
            <div
              className="max-w-md whitespace-pre-wrap rounded-xl border border-carbon/10 bg-white p-4 text-xs leading-relaxed shadow-sm"
              dangerouslySetInnerHTML={{ __html: estado.html }}
            />
          )}
        </div>
      )}
    </div>
  );
}
