"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { borradorSofia } from "@/app/actions/conversaciones";

/**
 * "Que responda Sofía": Sofía lee el hilo y propone una respuesta.
 * El asesor la edita, la regenera con una indicación y decide si la manda.
 */
export function ModalBorradorSofia({
  telefono,
  onEnviar,
  onUsarEnCaja,
  onSofiaSola,
  onCerrar,
}: {
  telefono: string;
  /** Envía el texto como mensaje del asesor. Devuelve true si salió. */
  onEnviar: (texto: string) => Promise<boolean>;
  /** Pasa el texto al cuadro de escritura del chat. */
  onUsarEnCaja: (texto: string) => void;
  /** Comportamiento anterior: Sofía responde y envía ella misma (con links y fotos). */
  onSofiaSola: (indicacion: string) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [indicacion, setIndicacion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const generar = useCallback(
    async (ind: string) => {
      const version = ++versionRef.current;
      setGenerando(true);
      setError(null);
      try {
        const r = await borradorSofia(telefono, ind.trim() || null);
        if (version !== versionRef.current) return;
        if (r.ok && r.texto) setTexto(r.texto);
        else setError(r.error ?? "Sofía no pudo proponer respuesta.");
      } catch (err: any) {
        if (version === versionRef.current) setError(err?.message || "Sofía no pudo proponer respuesta.");
      } finally {
        if (version === versionRef.current) setGenerando(false);
      }
    },
    [telefono],
  );

  useEffect(() => {
    void generar("");
  }, [generar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enviando, onCerrar]);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      if (await onEnviar(texto.trim())) onCerrar();
    } finally {
      setEnviando(false);
    }
  };

  const tieneMarcadores = /\[LINK_[A-Z_]+\]/.test(texto);
  const ocupado = generando || enviando;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-carbon/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => !enviando && onCerrar()}
    >
      <div
        className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-carbon/10 flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-carbon/10 flex items-center justify-between bg-violet-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl p-1.5 bg-violet-100 rounded-lg shrink-0">✨</span>
            <div>
              <h3 className="font-titular text-sm sm:text-base font-bold text-violet-900">Propuesta de Sofía</h3>
              <p className="text-[11px] text-carbon/50">Revísala, edítala o pídele otra versión. No se envía hasta que tú decidas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="text-carbon/40 hover:text-carbon p-1.5 rounded-lg hover:bg-carbon/5 transition text-lg leading-none cursor-pointer"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="relative">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={generando}
              rows={8}
              placeholder={generando ? "" : "Escribe o ajusta la respuesta…"}
              className="w-full rounded-lg border border-carbon/15 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-slate-50 resize-y"
            />
            {generando && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-violet-800 font-semibold">
                ⏳ Sofía está leyendo la conversación…
              </div>
            )}
          </div>

          {tieneMarcadores && (
            <p className="text-[11px] rounded bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5">
              La propuesta trae un marcador de link ({texto.match(/\[LINK_[A-Z_]+\]/)?.[0]}). Al enviarla tú no se
              convierte en link real: quítalo, o usa &quot;Que Sofía la mande ella&quot; para que genere el link.
            </p>
          )}

          {error && (
            <p className="text-[11px] rounded bg-rojo/10 text-rojo px-2 py-1.5">{error}</p>
          )}

          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
            <label className="block text-[11px] font-bold text-violet-900">Indicación para Sofía (opcional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={indicacion}
                onChange={(e) => setIndicacion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !ocupado) void generar(indicacion);
                }}
                placeholder="Ej. dile que la visita es gratis y pregúntale si el sábado puede"
                className="flex-1 min-w-0 rounded border border-carbon/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <button
                type="button"
                onClick={() => void generar(indicacion)}
                disabled={ocupado}
                className="shrink-0 rounded bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                ↻ Otra propuesta
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-carbon/10 flex flex-wrap items-center justify-between gap-2 bg-crema/20 shrink-0">
          <button
            type="button"
            onClick={() => onSofiaSola(indicacion)}
            disabled={ocupado}
            title="Sofía genera y envía la respuesta ella misma (con links de cotización y fotos) y queda encendida."
            className="text-[11px] text-violet-800 underline hover:text-violet-950 disabled:opacity-50 cursor-pointer"
          >
            Que Sofía la mande ella
          </button>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => onUsarEnCaja(texto)}
              disabled={ocupado || !texto.trim()}
              className="rounded border border-carbon/20 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Pasar al chat
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={ocupado || !texto.trim()}
              className="rounded bg-verde-profundo hover:opacity-90 text-white px-4 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
