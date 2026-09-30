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
 */
export function PanelEnvioOTTelegram({ ordenId }: { ordenId: string }) {
  const [estado, setEstado] = useState<EstadoEnvioOTTelegram | null>(null);
  const [asesores, setAsesores] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioOT | null>(null);
  const [verMensaje, setVerMensaje] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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
  };

  if (!estado) return <div className="rounded-2xl border border-carbon/10 bg-white p-5 text-xs text-carbon/50">Cargando envío por Telegram…</div>;
  if (!estado.ok) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xs text-rojo">{estado.error}</div>;

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5 shadow-xs space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-lg">✈️</span>
          <span className="font-titular font-bold text-sky-950 text-sm">Enviar a asesores por Telegram</span>
        </div>
        <p className="text-xs text-sky-900/80 font-cuerpo mt-1">
          Manda a uno o varios asesores un resumen de la orden (cliente, dirección, fecha de instalación, cobranza) con los documentos en PDF listos para imprimir.
        </p>
      </div>

      {aviso && <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">{aviso}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Asesores */}
        <div className="rounded-xl border border-carbon/10 bg-white p-3 space-y-1.5 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase text-carbon/50">Asesores</p>
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
                {d.preseleccionado && <span className="rounded-full bg-sauce/15 px-1.5 py-0.5 text-[9px] font-bold text-verde-profundo">Asignado</span>}
              </label>
              {!d.tieneTelegram &&
                (d.enlaceVinculacion ? (
                  <button type="button" onClick={() => copiar(d.enlaceVinculacion!, d.nombre)} className="shrink-0 text-[10px] font-bold text-sauce hover:underline">
                    🔗 Vincular
                  </button>
                ) : (
                  <span className="text-[10px] text-carbon/40">Sin Telegram</span>
                ))}
            </div>
          ))}
        </div>

        {/* Documentos */}
        <div className="rounded-xl border border-carbon/10 bg-white p-3 space-y-1.5 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase text-carbon/50">Documentos en PDF</p>
          {estado.documentos.length === 0 ? (
            <p className="text-xs text-carbon/40 italic">Esta orden aún no tiene documentos generados (cotización, póliza, recibos). Se enviará solo el resumen.</p>
          ) : (
            estado.documentos.map((d) => (
              <label key={d.clave} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={docs.includes(d.clave)} onChange={() => alternar(docs, setDocs, d.clave)} className="rounded text-sauce" />
                  <span className="font-semibold text-carbon/80">📄 {d.nombre}</span>
                </span>
                <span className="text-carbon/40">{d.detalle}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || asesores.length === 0}
          className="rounded-xl bg-[#229ED9] px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? "Enviando…" : `✈️ Enviar por Telegram${asesores.length ? ` (${asesores.length} asesor${asesores.length > 1 ? "es" : ""})` : ""}`}
        </button>
        <button type="button" onClick={() => setVerMensaje((v) => !v)} className="text-xs font-semibold text-sauce hover:underline">
          {verMensaje ? "Ocultar vista previa" : "Ver mensaje que recibirán"}
        </button>
      </div>

      {resultado && (
        <div className={`rounded-lg border p-3 text-xs space-y-1 ${resultado.ok ? "border-green-200 bg-green-50 text-green-800" : "border-rose-200 bg-rose-50 text-rojo"}`}>
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
          {resultado.enFormatoAlterno && resultado.enFormatoAlterno.length > 0 && (
            <div className="text-amber-800 space-y-0.5">
              <div>⚠️ Estos documentos se enviaron en formato alterno (no idéntico al que se imprime) porque no se pudieron generar desde su página:</div>
              {resultado.enFormatoAlterno.map((d) => (
                <div key={d} className="pl-4 font-mono text-[10px]">• {d}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {verMensaje && estado.html && (
        <div className="max-w-md whitespace-pre-wrap rounded-xl border border-carbon/10 bg-white p-4 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: estado.html }} />
      )}
    </div>
  );
}
