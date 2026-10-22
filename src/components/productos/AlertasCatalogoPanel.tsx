"use client";

import { useEffect, useMemo, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import {
  obtenerAlertasCatalogo,
  type AlertaCatalogo,
  type MargenProveedor,
  type SeveridadAlerta,
} from "@/app/actions/alertas-catalogo";

const CLAVE_UMBRAL = "sauceda.alertas.margenMinimo";

const ESTILO: Record<SeveridadAlerta, { punto: string; fila: string; titulo: string }> = {
  alta: { punto: "🔴", fila: "border-l-rojo bg-rojo/5", titulo: "Urgente" },
  media: { punto: "🟠", fila: "border-l-amber-400 bg-amber-50/50", titulo: "Atender pronto" },
  baja: { punto: "🟡", fila: "border-l-yellow-300 bg-yellow-50/40", titulo: "Ordenar el catálogo" },
};

/**
 * Alertas del catálogo de servicios y proveedores. `onAbrirProducto` abre la ficha del
 * producto para corregir lo que se marca.
 */
export function AlertasCatalogoPanel({ onAbrirProducto }: { onAbrirProducto: (productoId: string) => void }) {
  const [datos, setDatos] = useState<{ alertas: AlertaCatalogo[]; margenes: MargenProveedor[] } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [umbral, setUmbral] = useState(25);

  useEffect(() => {
    try {
      const guardado = Number(localStorage.getItem(CLAVE_UMBRAL));
      if (guardado > 0 && guardado < 100) setUmbral(guardado);
    } catch {}
    obtenerAlertasCatalogo()
      .then(setDatos)
      .catch(() => setDatos({ alertas: [], margenes: [] }));
  }, []);

  const todas = useMemo(() => {
    if (!datos) return [];
    const deMargen: AlertaCatalogo[] = datos.margenes
      .filter((m) => m.pct < umbral)
      .map((m) => ({
        clave: `margen-${m.productoId}-${m.proveedorNombre}-${m.concepto}`,
        severidad: "alta" as const,
        tipo: m.pct < 0 ? "Margen negativo" : "Margen bajo",
        productoId: m.productoId,
        productoNombre: m.productoNombre,
        proveedorNombre: m.proveedorNombre,
        detalle: `${m.concepto}: costo ${formatoPesos(m.costo)} vs venta ${formatoPesos(m.venta)} → ${m.pct}% (mínimo ${umbral}%).`,
      }));
    const orden: Record<SeveridadAlerta, number> = { alta: 0, media: 1, baja: 2 };
    return [...deMargen, ...datos.alertas].sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  }, [datos, umbral]);

  const conteo = (s: SeveridadAlerta) => todas.filter((a) => a.severidad === s).length;

  function cambiarUmbral(v: number) {
    setUmbral(v);
    try {
      localStorage.setItem(CLAVE_UMBRAL, String(v));
    } catch {}
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white shadow-xs">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-3.5 text-left"
      >
        <div>
          <div className="font-titular text-sm font-bold text-verde-profundo">🚨 Alertas del catálogo y proveedores</div>
          <p className="text-[11px] text-carbon/55">
            Márgenes bajos, precios vencidos, capacidades sin cotizar o sin precio, cambios sin aprobar y estándar.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          {datos === null ? (
            <span className="text-carbon/40">Revisando…</span>
          ) : todas.length === 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">✓ Todo en orden</span>
          ) : (
            (["alta", "media", "baja"] as SeveridadAlerta[]).map(
              (s) =>
                conteo(s) > 0 && (
                  <span key={s} className="rounded-full bg-slate-100 px-2.5 py-1 text-carbon/75">
                    {ESTILO[s].punto} {conteo(s)}
                  </span>
                )
            )
          )}
          <span className="text-carbon/40">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && datos && (
        <div className="space-y-3 border-t border-carbon/10 p-3.5">
          <label className="flex items-center gap-2 text-[11px] text-carbon/70">
            Margen mínimo aceptable:
            <input
              type="number"
              min={1}
              max={95}
              value={umbral}
              onChange={(e) => cambiarUmbral(Math.min(95, Math.max(1, Number(e.target.value) || 1)))}
              className="w-16 rounded-md border border-carbon/20 px-2 py-1 font-mono"
            />
            %
          </label>

          {todas.length === 0 ? (
            <p className="py-4 text-center text-xs text-carbon/50">No hay alertas. 🎉</p>
          ) : (
            (["alta", "media", "baja"] as SeveridadAlerta[]).map((s) => {
              const lista = todas.filter((a) => a.severidad === s);
              if (lista.length === 0) return null;
              return (
                <div key={s} className="space-y-1.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">
                    {ESTILO[s].punto} {ESTILO[s].titulo} ({lista.length})
                  </div>
                  {lista.map((a) => (
                    <div
                      key={a.clave}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 px-3 py-2 text-xs ${ESTILO[s].fila}`}
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-carbon">{a.tipo}</span>
                        <span className="text-carbon/60">
                          {" · "}
                          {a.productoNombre}
                          {a.proveedorNombre ? ` · ${a.proveedorNombre}` : ""}
                        </span>
                        <div className="text-[11px] text-carbon/70">{a.detalle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAbrirProducto(a.productoId)}
                        className="shrink-0 rounded-md border border-carbon/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-carbon/75 hover:border-sauce hover:text-sauce"
                      >
                        Abrir ficha
                      </button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
