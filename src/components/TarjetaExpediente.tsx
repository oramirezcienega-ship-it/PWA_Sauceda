import Link from "next/link";
import { type Expediente, labelTipoNegocio } from "@/lib/types";
import { formatoPesos } from "@/lib/formato";
import { formatearTelefonoLegible, obtenerTelLink } from "@/lib/telefono";

/**
 * Tarjeta resumen de un expediente dentro del tablero.
 * Toda la tarjeta es enlace al detalle del expediente.
 */
export function TarjetaExpediente({ expediente }: { expediente: Expediente }) {
  const inicialesAsesor = expediente.asesorNombre
    ? expediente.asesorNombre
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <Link
      href={`/expediente/${expediente.id}`}
      className="group block rounded-xl border border-carbon/10 bg-white p-3.5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-sauce/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sauce/30"
    >
      {/* Folio e ID */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-titular text-sm font-bold leading-snug text-verde-profundo group-hover:text-sauce transition-colors">
            {expediente.nombreCompleto}
          </h3>
          {expediente.telefono ? (
            <a
              href={`tel:${obtenerTelLink(expediente.telefono)}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-xs font-bold text-verde-profundo hover:text-sauce hover:underline inline-flex items-center gap-1 mt-0.5 transition-colors"
              title={`Llamar a ${expediente.nombreCompleto}`}
            >
              <span>📞 {formatearTelefonoLegible(expediente.telefono)}</span>
            </a>
          ) : (
            <span className="font-mono text-[10px] text-carbon/40 italic block mt-0.5">📞 Sin teléfono</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] font-medium text-carbon/40 bg-carbon/5 px-1.5 py-0.5 rounded">
          {expediente.id}
        </span>
      </div>

      {/* Fraccionamiento y Tipo de negocio */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="text-xs font-medium text-carbon/70">
          📍 {expediente.fraccionamiento || "Sin fraccionamiento"}
        </span>
        <span className="inline-flex items-center rounded-md bg-sauce/10 border border-sauce/20 px-2 py-0.5 text-[10px] font-semibold text-verde-profundo">
          {expediente.tipoNegocio ? labelTipoNegocio(expediente.tipoNegocio) : "Traspaso / Compra"}
        </span>
      </div>

      {/* Monto destacado estilo HubSpot */}
      <div className="mt-3 flex items-center justify-between rounded-lg bg-crema/60 px-2.5 py-1.5 border border-carbon/5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-carbon/50">Monto</span>
        <span className="font-mono text-sm font-bold text-verde-profundo">
          {formatoPesos(expediente.valorEstimado)}
        </span>
      </div>

      {/* Situación corta */}
      {expediente.situacion && (
        <p className="mt-2 line-clamp-2 text-xs text-carbon/60 italic">
          "{expediente.situacion}"
        </p>
      )}

      {/* Pie de tarjeta: Asesor con Avatar + Último movimiento */}
      <div className="mt-3 flex items-center justify-between border-t border-carbon/5 pt-2 text-[11px]">
        {expediente.asesorNombre ? (
          <span className="inline-flex items-center gap-1.5 text-carbon/70 font-medium" title={`Asesor: ${expediente.asesorNombre}`}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-verde-profundo text-[9px] font-bold text-crema">
              {inicialesAsesor}
            </span>
            <span className="truncate max-w-[110px]">{expediente.asesorNombre}</span>
          </span>
        ) : (
          <span className="text-[10px] italic text-carbon/30">👤 Sin asesor</span>
        )}

        <span className="text-carbon/40 text-[10px] font-mono">
          {expediente.ultimoMovimiento ? `⏱️ ${expediente.ultimoMovimiento}` : ""}
        </span>
      </div>
    </Link>
  );
}
