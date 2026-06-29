import Link from "next/link";
import { type Expediente, labelTipoNegocio } from "@/lib/types";
import { formatoPesos } from "@/lib/formato";

/**
 * Tarjeta resumen de un expediente dentro del tablero.
 * Toda la tarjeta es enlace al detalle del expediente.
 */
export function TarjetaExpediente({ expediente }: { expediente: Expediente }) {
  return (
    <Link
      href={`/expediente/${expediente.id}`}
      className="block rounded-lg border border-carbon/10 bg-white p-3 shadow-sm transition hover:border-dorado hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sauce"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-titular text-base font-semibold leading-tight text-verde-profundo">
          {expediente.nombreCompleto}
        </h3>
        <span className="shrink-0 font-mono text-[10px] text-carbon/40">
          {expediente.id}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <span className="text-xs text-carbon/60">
          {expediente.fraccionamiento}
        </span>
        <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-1.5 py-0.5 text-[9px] font-bold text-sauce leading-none">
          {expediente.tipoNegocio ? labelTipoNegocio(expediente.tipoNegocio) : "Traspaso / Compra"}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-carbon/80">
        {expediente.situacion}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2">
        {expediente.asesorNombre ? (
          <span className="inline-flex items-center gap-1 rounded bg-carbon/5 px-1.5 py-0.5 text-[10px] font-semibold text-carbon/60" title="Asesor asignado">
            <svg className="h-2.5 w-2.5 text-carbon/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {expediente.asesorNombre}
          </span>
        ) : (
          <span className="text-[10px] italic text-carbon/30">Sin asesor</span>
        )}
        <span className="font-mono text-sm font-medium text-sauce">
          {formatoPesos(expediente.valorEstimado)}
        </span>
      </div>
    </Link>
  );
}
