"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { duplicarCotizacion } from "@/app/actions/cotizaciones";

interface BotonDuplicarCotizacionProps {
  cotizacionId: string;
  prospectoId?: string;
  className?: string;
  texto?: string;
}

export function BotonDuplicarCotizacion({
  cotizacionId,
  prospectoId,
  className = "rounded-md border border-carbon/15 bg-white px-2.5 py-1 text-xs font-semibold text-carbon/70 hover:bg-slate-50 hover:text-carbon transition inline-flex items-center gap-1 shadow-2xs",
  texto = "📋 Duplicar",
}: BotonDuplicarCotizacionProps) {
  const router = useRouter();
  const [duplicando, setDuplicando] = useState(false);

  const handleDuplicar = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setDuplicando(true);
      const nueva = await duplicarCotizacion(cotizacionId, prospectoId);
      router.push(`/construccion/${nueva.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al duplicar la cotización");
    } finally {
      setDuplicando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDuplicar}
      disabled={duplicando}
      className={`${className} disabled:opacity-50`}
      title="Duplicar cotización generando un nuevo folio"
    >
      {duplicando ? (
        <span>⏳ Generando folio...</span>
      ) : (
        <span>{texto}</span>
      )}
    </button>
  );
}
