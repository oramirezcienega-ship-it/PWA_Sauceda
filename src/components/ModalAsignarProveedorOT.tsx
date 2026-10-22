"use client";

import { useEffect, useState } from "react";
import { asignarProveedorOrdenTrabajo } from "@/app/actions/ordenes-trabajo";
import { listarProveedoresMin } from "@/app/actions/proveedores";
import {
  compararProveedoresServicio,
  listarProductosParaOferta,
  type OpcionProveedorServicio,
} from "@/app/actions/proveedor-productos";
import type { OrdenTrabajo } from "@/app/actions/ordenes-trabajo";
import { formatoPesos } from "@/lib/formato";
import { MEDIDAS_TARIFA, formatoEscalon } from "@/lib/tarifas-capacidad";

interface ModalAsignarProveedorOTProps {
  orden: OrdenTrabajo | null;
  onCerrar: () => void;
  onAsignado: (ordenId: string, datos: { proveedorId: string | null; proveedorNombre: string | null; costoProveedor: number | null }) => void;
}

type ProductoCatalogo = Awaited<ReturnType<typeof listarProductosParaOferta>>[number];

const inputCls =
  "w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white";

export function ModalAsignarProveedorOT({ orden, onCerrar, onAsignado }: ModalAsignarProveedorOTProps) {
  const [proveedorId, setProveedorId] = useState("");
  const [proveedoresOpciones, setProveedoresOpciones] = useState<{ id: string; nombre: string }[]>([]);
  const [costoProveedor, setCostoProveedor] = useState("");
  const [proveedorConcepto, setProveedorConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Servicio del catálogo y cantidad/capacidad para comparar proveedores
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [comparativa, setComparativa] = useState<{ precioVenta: number | null; opciones: OpcionProveedorServicio[] } | null>(null);
  const [cargandoComparativa, setCargandoComparativa] = useState(false);

  useEffect(() => {
    if (!orden) return;
    setProveedorId(orden.proveedorId || "");
    setCostoProveedor(orden.costoProveedor ? String(orden.costoProveedor) : "");
    setProveedorConcepto(orden.proveedorConcepto || "");
    setCantidad(orden.cantidadServicio ? String(orden.cantidadServicio) : "");
    setError(null);
    listarProveedoresMin().then(setProveedoresOpciones).catch(() => setProveedoresOpciones([]));
    listarProductosParaOferta()
      .then((lista) => {
        setProductos(lista);
        // Servicio de la orden; si no tiene, el único del catálogo con su mismo modelo de negocio.
        const delNegocio = lista.filter((p) => p.tipoNegocio && p.tipoNegocio === orden.tipoNegocio);
        setProductoId(orden.productoId || (delNegocio.length === 1 ? delNegocio[0].id : ""));
      })
      .catch(() => setProductos([]));
  }, [orden]);

  const producto = productos.find((p) => p.id === productoId) || null;
  const capacidades = producto?.tarifasCapacidad.map((t) => t.hastaLitros) ?? [];

  useEffect(() => {
    if (!productoId) {
      setComparativa(null);
      return;
    }
    let vigente = true;
    setCargandoComparativa(true);
    compararProveedoresServicio(productoId, cantidad ? Number(cantidad) : null)
      .then((r) => vigente && setComparativa(r))
      .catch(() => vigente && setComparativa(null))
      .finally(() => vigente && setCargandoComparativa(false));
    return () => {
      vigente = false;
    };
  }, [productoId, cantidad]);

  if (!orden) return null;

  const etiquetaCantidad = producto
    ? capacidades.length > 0
      ? `Capacidad (${MEDIDAS_TARIFA[producto.tarifaMedida].etiqueta.toLowerCase()})`
      : `Cantidad (${producto.unidad})`
    : "Cantidad";

  function conceptoSugerido(): string {
    if (!producto) return "";
    const cant = Number(cantidad || 0);
    if (!(cant > 0)) return producto.nombre;
    return capacidades.length > 0
      ? `${producto.nombre} — ${formatoEscalon(cant, producto.tarifaMedida)}`
      : `${producto.nombre} — ${cant} ${producto.unidad}`;
  }

  function usarOpcion(o: OpcionProveedorServicio) {
    setProveedorId(o.proveedorId);
    if (o.costo !== null) setCostoProveedor(String(o.costo));
    setProveedorConcepto(conceptoSugerido());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const costoNum = costoProveedor ? parseFloat(costoProveedor) : null;
      const res = await asignarProveedorOrdenTrabajo(orden!.id, {
        proveedorId: proveedorId || null,
        costoProveedor: costoNum,
        proveedorConcepto: proveedorConcepto.trim() || null,
        productoId: productoId || null,
        cantidadServicio: cantidad ? Number(cantidad) : null,
      });
      if (!res.ok) {
        setError(res.error || "No se pudo asignar el proveedor.");
        setGuardando(false);
        return;
      }
      const proveedorNombre = proveedoresOpciones.find((p) => p.id === proveedorId)?.nombre || null;
      onAsignado(orden!.id, { proveedorId: proveedorId || null, proveedorNombre, costoProveedor: costoNum });
      onCerrar();
    } catch (err: any) {
      setError(err?.message || "Error al asignar el proveedor.");
    } finally {
      setGuardando(false);
    }
  }

  const precioVenta = comparativa?.precioVenta ?? null;
  const costoActual = costoProveedor ? Number(costoProveedor) : null;
  const margen = (costo: number | null) =>
    precioVenta !== null && precioVenta > 0 && costo !== null
      ? { monto: precioVenta - costo, pct: Math.round(((precioVenta - costo) / precioVenta) * 100) }
      : null;
  const margenActual = margen(costoActual);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sauce/15 text-lg text-sauce border border-sauce/20">
              🧾
            </span>
            <div>
              <h3 className="font-titular text-base font-bold text-verde-profundo">Proveedor de la Orden</h3>
              <p className="text-xs text-carbon/60">
                Orden: <span className="font-mono font-bold text-sauce">{orden.folio}</span>
              </p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} className="text-carbon/40 hover:text-carbon text-lg font-bold p-1">
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-cuerpo">
          {/* Comparativa por servicio del catálogo */}
          <div className="space-y-3 rounded-xl border border-sauce/25 bg-sauce/5 p-3.5">
            <div>
              <div className="font-semibold text-verde-profundo">Comparar proveedores del catálogo</div>
              <p className="text-[11px] text-carbon/55">
                Elige el servicio y la capacidad: verás el costo de cada proveedor y tu margen.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">Servicio</label>
                <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={inputCls}>
                  <option value="">-- Sin servicio del catálogo --</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">{etiquetaCantidad}</label>
                {capacidades.length > 0 ? (
                  <select value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={inputCls}>
                    <option value="">-- Elige --</option>
                    {capacidades.map((h) => (
                      <option key={h} value={h}>
                        Hasta {formatoEscalon(h, producto!.tarifaMedida)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    disabled={!productoId}
                    className={inputCls}
                    placeholder="0"
                  />
                )}
              </div>
            </div>

            {productoId && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-carbon/60">
                  <span>
                    Precio de venta SAUCEDA:{" "}
                    <b className="text-carbon">{precioVenta !== null ? formatoPesos(precioVenta) : "sin precio para esta capacidad"}</b>
                  </span>
                  {cargandoComparativa && <span className="text-sauce">Calculando…</span>}
                </div>
                {comparativa && comparativa.opciones.length === 0 && (
                  <div className="rounded-lg border border-dashed border-carbon/20 bg-white p-3 text-center text-carbon/50">
                    Ningún proveedor tiene registrado este servicio.
                  </div>
                )}
                {comparativa?.opciones.map((o) => {
                  const m = margen(o.costo);
                  const elegido = proveedorId === o.proveedorId;
                  return (
                    <div
                      key={o.ofertaId}
                      className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border bg-white px-3 py-2 ${
                        elegido ? "border-sauce ring-1 ring-sauce" : "border-carbon/10"
                      } ${!o.proveedorActivo ? "opacity-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-carbon">
                          {o.preferido && "⭐ "}
                          {o.proveedorNombre}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5 text-[10px]">
                          {o.tieneEstandar && (
                            <span className={o.cumpleEstandar ? "text-emerald-700" : "text-amber-700"}>
                              {o.cumpleEstandar ? "✓ estándar" : "⚠ sin confirmar estándar"}
                            </span>
                          )}
                          {o.vigenciaVencida && <span className="font-bold text-rojo">· precio vencido</span>}
                          {o.pendienteRevision && <span className="text-amber-700">· cambios sin aprobar</span>}
                          {o.zonas && <span className="text-carbon/50">· {o.zonas}</span>}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        {o.costo !== null ? (
                          <>
                            <div className="text-sm font-bold text-carbon">{formatoPesos(o.costo)}</div>
                            {m && (
                              <div className={`text-[10px] ${m.monto >= 0 ? "text-emerald-700" : "text-rojo"}`}>
                                margen {formatoPesos(m.monto)} · {m.pct}%
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-carbon/40">{cantidad ? "no cotiza esta capacidad" : "elige capacidad"}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => usarOpcion(o)}
                        disabled={!o.proveedorActivo}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                          elegido ? "bg-sauce text-white" : "border border-sauce/40 text-sauce hover:bg-sauce hover:text-white"
                        } disabled:opacity-40`}
                      >
                        {elegido ? "✓ Elegido" : "Usar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">Proveedor</label>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={inputCls}>
                <option value="">-- Sin proveedor --</option>
                {proveedoresOpciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">Costo Pactado con el Proveedor</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costoProveedor}
                onChange={(e) => setCostoProveedor(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} font-mono text-sm`}
              />
              {margenActual && (
                <div className={`mt-1 text-[10.5px] font-semibold ${margenActual.monto >= 0 ? "text-emerald-700" : "text-rojo"}`}>
                  Margen: {formatoPesos(margenActual.monto)} ({margenActual.pct}%)
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-carbon/80 mb-1">Producto / Trabajo Encargado (opcional)</label>
            <input
              type="text"
              value={proveedorConcepto}
              onChange={(e) => setProveedorConcepto(e.target.value)}
              placeholder="Si se deja vacío se toma de los conceptos de la cotización"
              className={inputCls}
            />
          </div>

          <p className="text-[10px] text-carbon/50 bg-carbon/5 rounded-lg p-2">
            Al marcar esta orden como <strong>Completada</strong>, se generará automáticamente la remisión de
            este costo a nombre del proveedor, con folio interno consecutivo.
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-5 py-2 text-xs font-bold transition shadow-md disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
