import Link from "next/link";
import type { Expediente } from "@/lib/types";
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
          {expediente.cliente}
        </h3>
        <span className="shrink-0 font-mono text-[10px] text-carbon/40">
          {expediente.id}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-carbon/60">
        {expediente.fraccionamiento}
      </p>

      <p className="mt-2 line-clamp-2 text-xs text-carbon/80">
        {expediente.situacion}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2">
        <span className="text-[10px] uppercase tracking-wide text-carbon/40">
          Valor estimado
        </span>
        <span className="font-mono text-sm font-medium text-sauce">
          {formatoPesos(expediente.valorEstimado)}
        </span>
      </div>
    </Link>
  );
}
