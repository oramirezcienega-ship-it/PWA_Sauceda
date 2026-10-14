"use client";

import { useEffect, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { formatoEscalon } from "@/lib/tarifas-capacidad";
import { listarOfertasPorProducto } from "@/app/actions/proveedor-productos";
import type { OfertaProveedorProducto } from "@/lib/types";

/**
 * En la ficha del producto: lo que el proveedor capturó (desde su link o desde el CRM)
 * para este servicio. Se muestra el preferido; si no hay, el último actualizado.
 * "Usar en esta ficha" copia costos, proceso, condiciones y fotos al formulario.
 */
export function PanelProveedorEnFicha({
  productoId,
  onUsar,
  onVerProveedores,
}: {
  productoId: string;
  onUsar: (o: OfertaProveedorProducto) => void;
  onVerProveedores: () => void;
}) {
  const [ofertas, setOfertas] = useState<OfertaProveedorProducto[] | null>(null);
  const [usada, setUsada] = useState(false);

  useEffect(() => {
    setOfertas(null);
    listarOfertasPorProducto(productoId)
      .then(setOfertas)
      .catch(() => setOfertas([]));
  }, [productoId]);

  if (ofertas === null) {
    return <div className="rounded-xl border border-carbon/10 bg-slate-50 p-3 text-[11px] text-carbon/50">Cargando proveedor…</div>;
  }

  const activas = ofertas.filter((o) => o.activo);
  const o =
    activas.find((x) => x.preferido) ||
    [...activas].sort((a, b) => (b.actualizadoPorProveedorAt || "").localeCompare(a.actualizadoPorProveedorAt || ""))[0];

  if (!o) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-carbon/20 p-3 text-[11px] text-carbon/60">
        <span>🚚 Ningún proveedor tiene registrado este servicio todavía.</span>
        <button type="button" onClick={onVerProveedores} className="font-bold text-sauce hover:underline">
          Agregar proveedor →
        </button>
      </div>
    );
  }

  const unir = (...p: string[]) => p.map((x) => (x || "").trim()).filter(Boolean).join(" · ");
  const datos: [string, string][] = [
    ["🛡️ Garantía", unir(o.garantiaAnios > 0 ? `${o.garantiaAnios} ${o.garantiaAnios === 1 ? "año" : "años"}` : "", o.garantiaCondiciones)],
    ["⏱️ Tiempo", o.tiempoEjecucion],
    ["💳 Pago", unir(o.anticipoPct > 0 ? `${o.anticipoPct}% anticipo` : "", o.condicionesPago)],
    ["📍 Zonas", o.zonasCobertura],
  ];

  return (
    <div className={`rounded-xl border p-3.5 ${o.pendienteRevision ? "border-amber-300 bg-amber-50/60" : "border-sauce/25 bg-sauce/5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-carbon/50">Lo que carga el proveedor</div>
          <div className="font-titular text-sm font-bold text-verde-profundo">
            🚚 {o.proveedorNombre}
            {o.preferido && <span className="ml-1.5 text-[11px] font-semibold text-amber-700">⭐ preferido</span>}
            {o.pendienteRevision && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">🔔 cambios sin aprobar</span>
            )}
            {o.productoEstandar && (
              <span
                className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  o.cumpleEstandar ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {o.cumpleEstandar ? "✓ cumple estándar" : "⚠ no ha confirmado el estándar"}
              </span>
            )}
          </div>
          {activas.length > 1 && (
            <div className="text-[10.5px] text-carbon/50">+{activas.length - 1} proveedor(es) más en la pestaña Proveedores</div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              onUsar(o);
              setUsada(true);
            }}
            className="rounded-lg bg-sauce px-3 py-1.5 text-[11px] font-bold text-white hover:bg-verde-profundo"
            title="Copia costos, proceso, condiciones y fotos a esta ficha (no se guarda hasta dar Guardar Producto)"
          >
            {usada ? "✓ Copiado a la ficha" : "⬇ Usar en esta ficha"}
          </button>
          <button
            type="button"
            onClick={onVerProveedores}
            className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-[11px] font-semibold text-carbon/70 hover:text-sauce"
          >
            Ver proveedores
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase text-carbon/45">Su costo</div>
          {o.tarifasCapacidad.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {o.tarifasCapacidad.map((t) => (
                <span key={t.hastaLitros} className="rounded-md bg-white px-2 py-1 font-mono text-[11px] ring-1 ring-carbon/10">
                  {formatoEscalon(t.hastaLitros, o.productoTarifaMedida)} <b>{formatoPesos(t.costo)}</b>
                </span>
              ))}
            </div>
          ) : o.costoUnitario > 0 ? (
            <div className="font-mono text-sm font-bold">
              {formatoPesos(o.costoUnitario)}
              <span className="text-[11px] font-normal text-carbon/50">/{o.productoUnidad}</span>
            </div>
          ) : (
            <div className="text-[11px] font-semibold text-amber-700">Sin costo capturado</div>
          )}
          {(o.cantidadMinima > 0 || o.montoMinimo > 0) && (
            <div className="mt-1 text-[11px] text-carbon/60">
              Mínimo {unir(o.cantidadMinima > 0 ? `${o.cantidadMinima} ${o.productoUnidad}` : "", o.montoMinimo > 0 ? formatoPesos(o.montoMinimo) : "")}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase text-carbon/45">Proceso</div>
          {o.descripcionProceso.trim() ? (
            <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-carbon/80">{o.descripcionProceso.trim()}</p>
          ) : (
            <p className="text-[11px] text-carbon/35">Sin describir</p>
          )}
          {o.excepcionesEstandar.trim() && (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              <b>Excepciones al estándar: </b>
              {o.excepcionesEstandar.trim()}
            </p>
          )}
        </div>
        <dl className="space-y-1 text-[11.5px]">
          {datos.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-carbon/50">{k}</dt>
              <dd className={v ? "font-semibold text-carbon" : "text-carbon/30"}>{v || "—"}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-carbon/50">📷 Fotos</dt>
            <dd className="font-semibold text-carbon">{o.fotos.length || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
