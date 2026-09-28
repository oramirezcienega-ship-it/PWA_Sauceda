"use client";

import { useEffect, useState } from "react";
import { asignarProveedorOrdenTrabajo } from "@/app/actions/ordenes-trabajo";
import { listarProveedoresMin } from "@/app/actions/proveedores";
import type { OrdenTrabajo } from "@/app/actions/ordenes-trabajo";

interface ModalAsignarProveedorOTProps {
  orden: OrdenTrabajo | null;
  onCerrar: () => void;
  onAsignado: (ordenId: string, datos: { proveedorId: string | null; proveedorNombre: string | null; costoProveedor: number | null }) => void;
}

export function ModalAsignarProveedorOT({ orden, onCerrar, onAsignado }: ModalAsignarProveedorOTProps) {
  const [proveedorId, setProveedorId] = useState("");
  const [proveedoresOpciones, setProveedoresOpciones] = useState<{ id: string; nombre: string }[]>([]);
  const [costoProveedor, setCostoProveedor] = useState("");
  const [proveedorConcepto, setProveedorConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orden) return;
    setProveedorId(orden.proveedorId || "");
    setCostoProveedor(orden.costoProveedor ? String(orden.costoProveedor) : "");
    setProveedorConcepto(orden.proveedorConcepto || "");
    setError(null);
    listarProveedoresMin().then(setProveedoresOpciones).catch(() => setProveedoresOpciones([]));
  }, [orden]);

  if (!orden) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
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
          <div>
            <label className="block font-semibold text-carbon/80 mb-1">Proveedor</label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
            >
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
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm font-mono text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-carbon/80 mb-1">
              Producto / Trabajo Encargado (opcional)
            </label>
            <input
              type="text"
              value={proveedorConcepto}
              onChange={(e) => setProveedorConcepto(e.target.value)}
              placeholder="Si se deja vacío se toma de los conceptos de la cotización"
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
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
