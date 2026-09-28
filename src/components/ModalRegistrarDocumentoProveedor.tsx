"use client";

import { useEffect, useState } from "react";
import {
  registrarDocumentoProveedor,
  subirArchivoDocumentoProveedor,
  listarCotizacionesMinParaProveedor,
  listarProveedoresMin,
} from "@/app/actions/proveedores";
import type { DatosDocumentoProveedor, DocumentoProveedor, TipoDocumentoProveedor } from "@/lib/types";

interface ModalRegistrarDocumentoProveedorProps {
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: (documento: DocumentoProveedor) => void;
  /** Si se fija, no se muestra el selector de proveedor. */
  proveedorId?: string;
  proveedorNombre?: string;
  /** Si se fija, no se muestra el selector de cotización (orden de trabajo). */
  cotizacionId?: string;
  expedienteId?: string | null;
}

export function ModalRegistrarDocumentoProveedor({
  abierto,
  onCerrar,
  onRegistrado,
  proveedorId,
  proveedorNombre,
  cotizacionId,
  expedienteId,
}: ModalRegistrarDocumentoProveedorProps) {
  const [proveedorSel, setProveedorSel] = useState(proveedorId || "");
  const [proveedoresOpciones, setProveedoresOpciones] = useState<{ id: string; nombre: string }[]>([]);
  const [cotizacionSel, setCotizacionSel] = useState(cotizacionId || "");
  const [cotizacionesOpciones, setCotizacionesOpciones] = useState<
    { id: string; prospectoNombre: string; estatus: string }[]
  >([]);
  const [tipo, setTipo] = useState<TipoDocumentoProveedor>("remision");
  const [folio, setFolio] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setProveedorSel(proveedorId || "");
    setCotizacionSel(cotizacionId || "");
    setError(null);

    if (!proveedorId) {
      listarProveedoresMin().then(setProveedoresOpciones).catch(() => setProveedoresOpciones([]));
    }
    if (!cotizacionId) {
      listarCotizacionesMinParaProveedor().then(setCotizacionesOpciones).catch(() => setCotizacionesOpciones([]));
    }
  }, [abierto, proveedorId, cotizacionId]);

  if (!abierto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const provFinal = proveedorId || proveedorSel;
    if (!provFinal) {
      setError("Selecciona el proveedor que emitió el documento.");
      return;
    }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresa un monto válido mayor a cero.");
      return;
    }

    setGuardando(true);
    try {
      let archivoUrl: string | undefined;
      let archivoNombre: string | undefined;

      if (archivo) {
        const formData = new FormData();
        formData.append("archivo", archivo);
        const res = await subirArchivoDocumentoProveedor(formData);
        if (!res.ok) {
          setError(res.error || "No se pudo subir el archivo adjunto.");
          setGuardando(false);
          return;
        }
        archivoUrl = res.url;
        archivoNombre = res.nombre;
      }

      const datos: DatosDocumentoProveedor = {
        proveedorId: provFinal,
        cotizacionId: cotizacionId || cotizacionSel || null,
        expedienteId: expedienteId || null,
        tipo,
        folio: folio.trim(),
        concepto: concepto.trim(),
        fecha,
        monto: montoNum,
        archivoUrl: archivoUrl || null,
        archivoNombre: archivoNombre || null,
        notas: notas.trim(),
      };

      const nuevo = await registrarDocumentoProveedor(datos);
      onRegistrado(nuevo);
      onCerrar();
      // Reset para el siguiente registro
      setFolio("");
      setConcepto("");
      setMonto("");
      setNotas("");
      setArchivo(null);
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al registrar el documento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all border border-carbon/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sauce/15 text-lg">📄</span>
            <div>
              <h2 className="font-titular text-lg font-bold text-verde-profundo">
                Registrar Factura / Remisión de Proveedor
              </h2>
              <p className="text-xs text-carbon/60">
                {proveedorNombre ? `Proveedor: ${proveedorNombre}` : "Captura el costo entregado por el proveedor."}
                {cotizacionId ? ` · Orden de trabajo: ${cotizacionId}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-lg p-1 text-carbon/40 hover:bg-carbon/5 hover:text-carbon"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rojo/10 p-3 text-xs text-rojo border border-rojo/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!proveedorId && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Proveedor <span className="text-rojo">*</span>
              </label>
              <select
                value={proveedorSel}
                onChange={(e) => setProveedorSel(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Selecciona un proveedor</option>
                {proveedoresOpciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!cotizacionId && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Orden de Trabajo / Cotización relacionada
              </label>
              <select
                value={cotizacionSel}
                onChange={(e) => setCotizacionSel(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Sin vincular a una orden específica</option>
                {cotizacionesOpciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.prospectoNombre || "Sin cliente"} ({c.estatus})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Tipo de Documento</label>
              <div className="flex rounded-lg border border-carbon/20 overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTipo("remision")}
                  className={`flex-1 px-3 py-2 transition ${
                    tipo === "remision" ? "bg-sauce text-white" : "bg-white text-carbon/60 hover:bg-carbon/5"
                  }`}
                >
                  Remisión
                </button>
                <button
                  type="button"
                  onClick={() => setTipo("factura")}
                  className={`flex-1 px-3 py-2 transition border-l border-carbon/20 ${
                    tipo === "factura" ? "bg-sauce text-white" : "bg-white text-carbon/60 hover:bg-carbon/5"
                  }`}
                >
                  Factura
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Folio</label>
              <input
                type="text"
                placeholder="Folio del documento (opcional)"
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Fecha <span className="text-rojo">*</span>
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Monto <span className="text-rojo">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Concepto / Trabajo Realizado</label>
            <input
              type="text"
              placeholder="Ej. Suministro de lámina galvanizada, mano de obra herrería, etc."
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Adjuntar Factura / Remisión (PDF o imagen, opcional)
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none transition focus:border-sauce file:mr-3 file:rounded file:border-0 file:bg-sauce/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-sauce"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Notas</label>
            <textarea
              rows={2}
              placeholder="Notas adicionales (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce resize-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-carbon/10">
            <button
              type="button"
              disabled={guardando}
              onClick={onCerrar}
              className="rounded-lg border border-carbon/20 px-4 py-2 text-xs font-medium text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-sauce px-5 py-2 text-xs font-medium text-white shadow-xs hover:bg-verde-profundo transition disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Registrar Documento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
