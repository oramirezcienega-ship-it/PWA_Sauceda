"use client";

import { useEffect, useMemo, useState } from "react";
import {
  enviarLeadTelegramAction,
  previsualizarLeadTelegramAction,
  type PrevisualizacionLeadTelegram,
  type EnvioLeadTelegram,
} from "@/app/actions/leads-telegram";
import { armarHtmlLeadTelegram } from "@/lib/lead-telegram-formato";

interface Props {
  telefono: string;
  /** Asesor que atiende hoy la conversación (se preselecciona si tiene Telegram). */
  atiendeActual?: string;
  alCerrar: () => void;
  alEnviado: (envio: EnvioLeadTelegram | undefined) => void | Promise<void>;
}

const urlFoto = (ref: string) =>
  /^https?:\/\//i.test(ref) ? ref : `/api/conversaciones/media?mediaId=${encodeURIComponent(ref)}&raw=1`;

/**
 * Pasar el lead a un asesor por Telegram: se elige al asesor, se revisa/edita
 * el resumen de la IA y se ve exactamente lo que recibirá antes de enviarlo.
 */
export function ModalPasarLeadTelegram({ telefono, atiendeActual, alCerrar, alEnviado }: Props) {
  const [prev, setPrev] = useState<PrevisualizacionLeadTelegram | null>(null);
  const [asesorId, setAsesorId] = useState("");
  const [resumen, setResumen] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string; avisos?: string[] } | null>(null);

  useEffect(() => {
    let cancelado = false;
    previsualizarLeadTelegramAction(telefono).then((r) => {
      if (cancelado) return;
      setPrev(r);
      setResumen(r.resumen || "");
      const pre = r.asesores?.find((a) => a.nombre === atiendeActual && a.tieneTelegram);
      if (pre) setAsesorId(pre.id);
    });
    return () => {
      cancelado = true;
    };
  }, [telefono, atiendeActual]);

  const asesor = prev?.asesores?.find((a) => a.id === asesorId);
  const html = useMemo(
    () => (prev?.datos ? armarHtmlLeadTelegram(prev.datos, resumen, nota) : ""),
    [prev, resumen, nota]
  );

  const enviar = async () => {
    if (!asesor) return;
    setEnviando(true);
    setResultado(null);
    const r = await enviarLeadTelegramAction({ telefono, asesorId, resumen, nota });
    setEnviando(false);
    if (r.ok) {
      setResultado({
        tipo: "ok",
        texto: `Enviado a ${asesor.nombre} por Telegram. Se le asignó el lead, Sofía quedó en pausa y se registró en la bitácora.`,
        avisos: r.avisos,
      });
      await alEnviado(r.envio);
    } else {
      setResultado({ tipo: "error", texto: r.error || "No se pudo enviar." });
    }
  };

  const sinFolio = prev?.datos && !prev.datos.expedienteId && !prev.datos.prospectoId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-carbon/10 my-8 font-cuerpo">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-3">
          <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
            <span>📨</span> Pasar lead a un asesor por Telegram
          </h3>
          <button type="button" onClick={alCerrar} className="text-carbon/40 hover:text-carbon text-lg font-bold p-1">
            ✕
          </button>
        </div>

        {!prev ? (
          <p className="text-xs text-carbon/50 py-8 text-center">Preparando la ficha y el resumen de la conversación…</p>
        ) : !prev.ok ? (
          <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo">⚠️ {prev.error}</div>
        ) : (
          <div className="space-y-4">
            {/* Asesor */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1 block">Asesor</label>
              <select
                value={asesorId}
                onChange={(e) => setAsesorId(e.target.value)}
                disabled={enviando || resultado?.tipo === "ok"}
                className="w-full rounded-lg border border-carbon/15 bg-white px-2 py-1.5 text-sm focus:outline-none focus:border-sauce"
              >
                <option value="">— Elige al asesor —</option>
                {prev.asesores?.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.tieneTelegram}>
                    {a.nombre}
                    {a.tieneTelegram ? "" : " · sin Telegram vinculado"}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Edición */}
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1 block">
                    Resumen {prev.resumen ? "(sugerido por la IA, puedes editarlo)" : ""}
                  </label>
                  <textarea
                    value={resumen}
                    onChange={(e) => setResumen(e.target.value)}
                    rows={7}
                    disabled={enviando || resultado?.tipo === "ok"}
                    placeholder="• Qué necesita el cliente…"
                    className="w-full rounded-lg border border-carbon/15 px-2 py-1.5 text-[12px] leading-relaxed focus:outline-none focus:border-sauce"
                  />
                  {!prev.resumen && (
                    <p className="text-[10px] text-amber-700">No se pudo generar el resumen automático; escríbelo o déjalo vacío.</p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1 block">
                    Nota para el asesor (opcional)
                  </label>
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={2}
                    disabled={enviando || resultado?.tipo === "ok"}
                    placeholder="Ej. Urge, quiere la obra antes de las lluvias."
                    className="w-full rounded-lg border border-carbon/15 px-2 py-1.5 text-[12px] focus:outline-none focus:border-sauce"
                  />
                </div>
              </div>

              {/* Vista previa */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1">
                  Así lo verá {asesor?.nombre || "el asesor"}
                </div>
                <div className="rounded-xl bg-[#e6ebee] p-2 space-y-1.5">
                  <div
                    className="rounded-lg bg-white p-2.5 text-[12px] leading-relaxed text-carbon whitespace-pre-wrap break-words shadow-sm [&_a]:text-sky-700 [&_a]:underline"
                    // Armado con armarHtmlLeadTelegram: el texto de usuario va escapado; solo contiene <b>, <i> y <a>.
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  <div className="grid grid-cols-2 gap-1">
                    <span className="rounded-md bg-white/70 py-1 text-center text-[11px] font-semibold text-sky-800">
                      ✅ Recibido, lo atiendo
                    </span>
                    <span className="rounded-md bg-white/70 py-1 text-center text-[11px] font-semibold text-sky-800">
                      ❌ No puedo atenderlo
                    </span>
                  </div>
                  <details className="rounded-lg bg-white p-2 shadow-sm">
                    <summary className="cursor-pointer text-[11px] font-semibold text-carbon/80">
                      📄 {prev.nombreArchivo} <span className="text-carbon/40">(ver contenido)</span>
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-carbon/80">
                      {prev.txt}
                    </pre>
                  </details>
                  {(prev.comparativas?.length || 0) > 0 && (
                    <div className="rounded-lg bg-white p-1.5 shadow-sm">
                      <div className="text-[10px] font-semibold text-carbon/60 mb-1">💲 Comparativa de precios enviada al cliente</div>
                      <div className="grid grid-cols-3 gap-1">
                        {prev.comparativas!.map((f) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={f.ref}
                            src={urlFoto(f.ref)}
                            alt={f.caption || "Comparativa"}
                            title={f.caption}
                            className="w-full rounded object-contain border border-carbon/10 bg-carbon/5"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {(prev.fotos?.length || 0) > 0 && (
                    <div className="grid grid-cols-5 gap-1 rounded-lg bg-white p-1.5 shadow-sm">
                      {prev.fotos!.map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={f.numero}
                          src={urlFoto(f.ref)}
                          alt={`Foto ${f.numero}`}
                          title={`Foto ${f.numero}${f.caption ? ` · ${f.caption}` : ""}`}
                          className="aspect-square w-full rounded object-cover border border-carbon/10"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-carbon/10 p-2.5 text-[11px] text-carbon/70 space-y-0.5">
              <div className="font-bold text-carbon/80">Al enviar:</div>
              <div>• Se asigna la conversación y el lead a <strong>{asesor?.nombre || "el asesor"}</strong>.</div>
              <div>• Se pausa a Sofía para este cliente.</div>
              <div>
                • Queda registrado en la bitácora{" "}
                {prev.datos?.expedienteId ? `del ${prev.datos.expedienteId}` : prev.datos?.prospectoId ? `del ${prev.datos.prospectoId}` : ""} y aquí verás si lo revisó.
              </div>
              <div>• Si no confirma en 2 h, se le recuerda y te avisamos por Telegram.</div>
            </div>
            {sinFolio && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                Esta conversación no tiene expediente ni prospecto: se enviará, pero no habrá bitácora donde registrarlo.
              </div>
            )}

            {resultado && (
              <div
                className={`rounded-xl border p-2.5 text-xs font-semibold ${
                  resultado.tipo === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {resultado.texto}
                {resultado.avisos?.map((a) => (
                  <div key={a} className="mt-1 font-normal text-amber-800">
                    ⚠️ {a}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-carbon/10">
              <button type="button" onClick={alCerrar} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-carbon">
                {resultado?.tipo === "ok" ? "Cerrar" : "Cancelar"}
              </button>
              {resultado?.tipo !== "ok" && (
                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando || !asesor}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                >
                  {enviando ? "Enviando…" : asesor ? `Enviar a ${asesor.nombre}` : "Elige un asesor"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
