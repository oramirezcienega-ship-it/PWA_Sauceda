"use client";

import { useEffect, useState } from "react";
import {
  compartirInspeccionPorTelegramAction,
  previsualizarInspeccionTelegramAction,
  type PrevisualizacionInspeccionTelegram,
} from "@/app/actions/inspecciones-compartir";

interface Props {
  citaId: string;
  /** Ya se había compartido antes: el botón dice "Reenviar". */
  yaCompartida: boolean;
  alCerrar: () => void;
  /** Se llama tras enviar para que la tarjeta muestre el estado actualizado. */
  alEnviado: () => void | Promise<void>;
}

/**
 * Vista previa de lo que recibirá el asesor por Telegram, con confirmación
 * antes de enviar.
 */
export function ModalCompartirInspeccion({ citaId, yaCompartida, alCerrar, alEnviado }: Props) {
  const [prev, setPrev] = useState<PrevisualizacionInspeccionTelegram | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    previsualizarInspeccionTelegramAction(citaId).then((r) => {
      if (!cancelado) setPrev(r);
    });
    return () => {
      cancelado = true;
    };
  }, [citaId]);

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    const r = await compartirInspeccionPorTelegramAction(citaId);
    setEnviando(false);
    const okNombres = r.enviados.filter((e) => e.ok).map((e) => e.nombre);
    if (okNombres.length > 0) {
      let texto = `Enviado por Telegram a ${okNombres.join(", ")}${
        r.fotosEnviadas > 0 ? ` (${r.fotosEnviadas} foto${r.fotosEnviadas === 1 ? "" : "s"})` : ""
      }.`;
      if (r.sinTelegram.length > 0) texto += ` Sin Telegram vinculado: ${r.sinTelegram.join(", ")}.`;
      setResultado({ tipo: "ok", texto });
      await alEnviado();
    } else {
      setResultado({ tipo: "error", texto: r.error || "No se pudo enviar." });
    }
  };

  const destinatarios = prev?.destinatarios || [];
  const alguienConTelegram = destinatarios.some((d) => d.tieneTelegram);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-carbon/10 my-8 font-cuerpo">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-3">
          <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
            <span>✈️</span> Compartir inspección por Telegram
          </h3>
          <button type="button" onClick={alCerrar} className="text-carbon/40 hover:text-carbon text-lg font-bold p-1">
            ✕
          </button>
        </div>

        {!prev ? (
          <p className="text-xs text-carbon/50 py-6 text-center">Preparando la vista previa…</p>
        ) : !prev.ok ? (
          <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo">⚠️ {prev.error}</div>
        ) : (
          <div className="space-y-3">
            {/* Destinatarios */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1">Se enviará a</div>
              <div className="flex flex-wrap gap-1.5">
                {destinatarios.map((d) => (
                  <span
                    key={d.id}
                    className={`text-[11px] rounded-full border px-2 py-0.5 font-semibold ${
                      d.tieneTelegram
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}
                    title={d.tieneTelegram ? "Telegram vinculado" : "Este usuario no tiene Telegram vinculado"}
                  >
                    {d.nombre} {d.tieneTelegram ? "✓" : "· sin Telegram"}
                  </span>
                ))}
              </div>
            </div>

            {/* Vista previa del mensaje */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1">Mensaje</div>
              <div
                className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-[12px] leading-relaxed text-carbon whitespace-pre-wrap break-words [&_a]:text-sky-700 [&_a]:underline"
                // El HTML lo arma el servidor con el texto de usuario escapado; solo contiene <b>, <i> y <a>.
                dangerouslySetInnerHTML={{ __html: prev.html || "" }}
              />
              <p className="text-[10px] text-carbon/50 mt-1">
                Llevará un botón <strong>"👀 Enterado (ya lo leí)"</strong>: cuando el asesor lo pulse, aquí se registra que lo leyó.
              </p>
            </div>

            {/* Fotos */}
            {(prev.fotosUrls?.length || 0) > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1">
                  Fotos que se enviarán ({prev.fotosUrls!.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prev.fotosUrls!.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-carbon/10" />
                  ))}
                </div>
              </div>
            )}
            {(prev.fotosOmitidas || 0) > 0 && (
              <p className="text-[10px] text-amber-700">
                {prev.fotosOmitidas} foto(s) no se enviarán porque no tienen una dirección pública que Telegram acepte.
              </p>
            )}

            {!alguienConTelegram && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                Ninguno de los destinatarios tiene Telegram vinculado. Vincúlalos desde la cabina de coordinación
                (⚙️ Configurar Bot de Telegram → Vincular usuarios).
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
                  disabled={enviando || !alguienConTelegram}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                >
                  {enviando ? "Enviando…" : yaCompartida ? "Reenviar por Telegram" : "Enviar por Telegram"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
