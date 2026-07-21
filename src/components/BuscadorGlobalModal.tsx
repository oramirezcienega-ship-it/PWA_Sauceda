"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { buscarGlobal, type ResultadoBusquedaGlobal } from "@/app/actions/busqueda";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function BuscadorGlobalModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusquedaGlobal[]>([]);
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResultados([]);
    }
  }, [isOpen]);

  // Manejo de atajo de teclado Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Búsqueda en tiempo real con debounce
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResultados([]);
      setCargando(false);
      return;
    }

    setCargando(true);
    const timer = setTimeout(() => {
      buscarGlobal(query)
        .then((res) => {
          setResultados(res);
          setCargando(false);
        })
        .catch(() => setCargando(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSeleccionar(url: string) {
    onClose();
    router.push(url);
  }

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 bg-slate-50 gap-3">
          <span className="text-xl">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre, teléfono, folio (EXP-, PROSP-, COT-), fraccionamiento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm font-medium text-carbon outline-none placeholder:text-carbon/40 font-cuerpo"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-carbon/40 hover:text-carbon font-bold px-2 py-1 rounded"
            >
              Borrar
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-carbon/70 font-bold px-2.5 py-1 rounded-lg transition"
          >
            Esc ✕
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1">
          {cargando && (
            <div className="py-8 text-center text-xs text-carbon/50 animate-pulse font-medium">
              Buscando coincidencias en todo el sistema...
            </div>
          )}

          {!cargando && query.trim().length >= 2 && resultados.length === 0 && (
            <div className="py-8 text-center text-xs text-carbon/50 font-medium">
              No se encontraron registros para "{query}".
            </div>
          )}

          {!cargando && !query.trim() && (
            <div className="py-8 text-center space-y-1">
              <p className="text-xs font-bold text-verde-profundo font-titular">Buscador Omnipresente de SAUCEDA</p>
              <p className="text-[11px] text-carbon/50">
                Escribe cualquier teléfono, nombre, dirección o folio para localizar prospectos, expedientes, cotizaciones y citas.
              </p>
            </div>
          )}

          {!cargando &&
            resultados.map((item) => (
              <div
                key={`${item.tipo}-${item.id}`}
                onClick={() => handleSeleccionar(item.url)}
                className="group flex items-center justify-between p-3 rounded-xl hover:bg-sauce/10 border border-transparent hover:border-sauce/20 cursor-pointer transition-all"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-carbon group-hover:text-sauce transition-colors">
                      {item.titulo}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        item.tipo === "expediente"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : item.tipo === "prospecto"
                          ? "bg-blue-100 text-blue-800 border-blue-300"
                          : item.tipo === "cotizacion"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-purple-100 text-purple-800 border-purple-300"
                      }`}
                    >
                      {item.etiqueta}
                    </span>
                  </div>
                  <p className="text-xs text-carbon/60 font-mono">{item.subtitulo}</p>
                </div>

                <span className="text-xs font-bold text-sauce opacity-0 group-hover:opacity-100 transition-opacity">
                  Abrir →
                </span>
              </div>
            ))}
        </div>

        {/* Footer shortcuts */}
        <div className="bg-slate-100 px-4 py-2 text-[10px] text-carbon/50 flex justify-between items-center border-t border-slate-200">
          <span>Tip: Presiona <kbd className="bg-white border px-1 py-0.5 rounded shadow-2xs font-mono">Ctrl+K</kbd> en cualquier parte para abrir el buscador</span>
          <span>SAUCEDA PWA</span>
        </div>
      </div>
    </div>
  );
}
