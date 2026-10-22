"use client";

import { AccionesDocumento } from "@/components/AccionesDocumento";

export function BotonImprimirGarantia() {
  return (
    <AccionesDocumento className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-5 py-2.5 text-xs font-bold transition print:hidden shadow-md flex items-center gap-1.5" />
  );
}
