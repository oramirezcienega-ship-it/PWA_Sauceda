"use client";

export function BotonImprimirGarantia() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-5 py-2.5 text-xs font-bold transition print:hidden shadow-md flex items-center gap-1.5"
    >
      🖨️ Imprimir / Guardar PDF
    </button>
  );
}
