"use client";

import { useState, type ReactNode } from "react";

interface Props {
  titulo: string;
  icono?: string;
  descripcion?: string;
  /** Texto corto a la derecha del título (p. ej. una cantidad). */
  insignia?: string;
  abiertoInicial?: boolean;
  /** Clases del contenedor (por omisión deja un margen superior). */
  className?: string;
  children: ReactNode;
}

/**
 * Sección contraída por defecto. El contenido NO se monta hasta la primera
 * vez que se abre: así los componentes que consultan datos al cargar
 * (historiales, agenda, órdenes, etc.) no hacen sus consultas hasta que se
 * necesitan, y la página abre más rápido. Una vez abierto se conserva
 * montado (no pierde lo capturado al contraerlo).
 */
export function WidgetColapsable({
  titulo,
  icono,
  descripcion,
  insignia,
  abiertoInicial = false,
  className = "mt-6",
  children,
}: Props) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [montado, setMontado] = useState(abiertoInicial);

  const alternar = () => {
    setAbierto((prev) => !prev);
    setMontado(true);
  };

  return (
    <section className={className}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-carbon/10 bg-white px-4 py-3 text-left shadow-xs transition hover:border-sauce/40 hover:bg-slate-50/60"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {icono && <span className="text-lg shrink-0">{icono}</span>}
          <span className="min-w-0">
            <span className="block font-titular text-sm sm:text-base font-semibold text-carbon truncate">{titulo}</span>
            {descripcion && <span className="block text-[11px] text-carbon/50 truncate">{descripcion}</span>}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {insignia && (
            <span className="rounded-full bg-carbon/5 border border-carbon/10 px-2 py-0.5 text-[10px] font-semibold text-carbon/70">
              {insignia}
            </span>
          )}
          <span className="text-[11px] font-semibold text-sauce">{abierto ? "Contraer" : "Expandir"}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`text-sauce transition-transform ${abierto ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div hidden={!abierto} className="mt-2">
        {montado && children}
      </div>
    </section>
  );
}
