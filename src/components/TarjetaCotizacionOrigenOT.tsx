"use client";

import { useState } from "react";

interface Props {
  cotizacionId: string | null;
  cotizacionToken?: string;
  totalCotizado?: number;
}

/**
 * Cotización de la que parte la orden de trabajo: permite verla, imprimirla
 * y descargarla en PDF (usa el PDF público de la cotización).
 */
export function TarjetaCotizacionOrigenOT({ cotizacionId, cotizacionToken, totalCotizado }: Props) {
  const [previa, setPrevia] = useState(false);

  if (!cotizacionId) return null;

  // Misma vista de impresión de la cotización (portal), aunque ya esté aceptada
  const urlDocumento = cotizacionToken ? `/cotizacion/${cotizacionToken}?vista=documento` : null;
  const urlImprimir = cotizacionToken ? `/cotizacion/${cotizacionToken}?vista=documento&imprimir=1` : null;
  const urlPdf = urlDocumento;

  return (
    <section className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-titular text-sm font-bold text-verde-profundo flex items-center gap-2">
          <span>📋</span> Cotización de origen
        </h3>
        <span className="text-xs text-carbon/70">
          Folio: <strong className="font-mono text-verde-profundo">{cotizacionId}</strong>
          {typeof totalCotizado === "number" && totalCotizado > 0 && (
            <>
              {" · "}Total:{" "}
              <strong className="font-mono">
                {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(totalCotizado)}
              </strong>
            </>
          )}
        </span>
      </div>

      {!urlPdf ? (
        <p className="text-xs text-carbon/50">No se encontró el enlace de esta cotización.</p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <a
              href={urlImprimir || undefined}
              target="_blank"
              rel="noreferrer"
              className="bg-verde-profundo text-crema px-3 py-1.5 rounded-lg font-bold"
              title='Abre la cotización y el diálogo de impresión; elige "Guardar como PDF" para descargarla'
            >
              🖨️ Imprimir / Guardar PDF
            </a>
            <button
              type="button"
              onClick={() => setPrevia((v) => !v)}
              className="bg-white hover:bg-slate-50 border border-carbon/20 text-carbon px-3 py-1.5 rounded-lg font-bold"
            >
              {previa ? "🙈 Ocultar vista previa" : "👁️ Vista previa"}
            </button>
            {urlDocumento && (
              <a
                href={urlDocumento}
                target="_blank"
                rel="noreferrer"
                className="bg-white hover:bg-slate-50 border border-carbon/20 text-carbon px-3 py-1.5 rounded-lg font-bold"
              >
                🌐 Abrir en pestaña
              </a>
            )}
          </div>

          {previa && (
            <iframe
              src={urlPdf}
              title={`Cotización ${cotizacionId}`}
              className="w-full h-[75vh] rounded-xl border border-carbon/15 bg-slate-100"
            />
          )}
        </div>
      )}
    </section>
  );
}
