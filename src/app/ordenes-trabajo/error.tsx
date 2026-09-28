"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";

export default function ErrorOrdenesTrabajo({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en módulo de Órdenes de Trabajo:", error);
  }, [error]);

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />
      <div className="mx-auto max-w-xl px-4 py-16 text-center space-y-4">
        <div className="text-4xl">🛠️</div>
        <h1 className="font-titular text-xl font-bold text-carbon">
          Ocurrió un problema al cargar la orden de trabajo
        </h1>
        <p className="text-xs text-carbon/60 font-cuerpo">
          {error?.message || "Ha ocurrido un detalle inesperado al procesar los datos de la orden."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-4 py-2 text-xs font-bold transition shadow-sm"
          >
            Reintentar
          </button>
          <Link
            href="/ordenes-trabajo"
            className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-100 text-carbon px-4 py-2 text-xs font-semibold transition shadow-2xs"
          >
            Volver al Listado
          </Link>
        </div>
      </div>
    </main>
  );
}
