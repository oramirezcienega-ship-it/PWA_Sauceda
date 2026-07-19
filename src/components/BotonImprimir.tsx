"use client";

export function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition print:hidden shadow-sm self-start sm:self-center"
    >
      🖨️ Imprimir / Guardar PDF
    </button>
  );
}
