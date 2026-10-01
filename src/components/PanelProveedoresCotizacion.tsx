"use client";

import { useEffect, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import type { DocumentoProveedor } from "@/lib/types";
import {
  listarDocumentosProveedorPorCotizacion,
  eliminarDocumentoProveedor,
} from "@/app/actions/proveedores";
import { ModalRegistrarDocumentoProveedor } from "./ModalRegistrarDocumentoProveedor";

interface PanelProveedoresCotizacionProps {
  cotizacionId: string;
  expedienteId?: string | null;
  precioFinal: number;
  costoEstimado: number;
}

/**
 * Muestra los costos de proveedores (facturas/remisiones) ligados a esta
 * orden de trabajo/cotización, y una utilidad estimada de referencia
 * (precio al cliente - costo interno estimado - costos de proveedores).
 */
export function PanelProveedoresCotizacion({
  cotizacionId,
  expedienteId,
  precioFinal,
  costoEstimado,
}: PanelProveedoresCotizacionProps) {
  const [documentos, setDocumentos] = useState<DocumentoProveedor[] | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [documentoEnEdicion, setDocumentoEnEdicion] = useState<DocumentoProveedor | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    listarDocumentosProveedorPorCotizacion(cotizacionId)
      .then((docs) => {
        if (activo) setDocumentos(docs);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [cotizacionId]);

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este documento del proveedor?")) return;
    try {
      await eliminarDocumentoProveedor(id);
      setDocumentos((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    } catch (err: any) {
      alert(err?.message || "No se pudo eliminar el documento.");
    }
  }

  function handleRegistrado(doc: DocumentoProveedor) {
    setDocumentos((prev) => {
      if (!prev) return [doc];
      const existe = prev.some((d) => d.id === doc.id);
      return existe ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev];
    });
  }

  function handleEditar(doc: DocumentoProveedor) {
    setDocumentoEnEdicion(doc);
    setModalAbierto(true);
  }

  const totalProveedores = (documentos || []).reduce((acc, d) => acc + d.monto, 0);
  const utilidadEstimada = precioFinal - costoEstimado - totalProveedores;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h3 className="font-titular text-xl font-bold text-verde-profundo">Costos de Proveedores</h3>
          <p className="text-xs text-carbon/60 mt-0.5">
            Facturas y remisiones de proveedores/contratistas relacionadas a esta orden de trabajo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDocumentoEnEdicion(null);
            setModalAbierto(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-verde-profundo transition shrink-0"
        >
          <span>📄</span> + Registrar Costo de Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-slate-50 border border-carbon/10 p-4">
          <div className="text-[10px] font-semibold uppercase text-carbon/50">Precio al Cliente</div>
          <div className="font-mono text-lg font-bold text-carbon mt-1">{formatoPesos(precioFinal)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-carbon/10 p-4">
          <div className="text-[10px] font-semibold uppercase text-carbon/50">Costo Interno + Proveedores</div>
          <div className="font-mono text-lg font-bold text-rojo mt-1">
            {formatoPesos(costoEstimado + totalProveedores)}
          </div>
          <div className="text-[10px] text-carbon/50 mt-1">
            Interno {formatoPesos(costoEstimado)} + Proveedores {formatoPesos(totalProveedores)}
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="text-[10px] font-semibold uppercase text-emerald-700">Utilidad Estimada</div>
          <div className="font-mono text-lg font-bold text-emerald-800 mt-1">
            {formatoPesos(utilidadEstimada)}
          </div>
          <div className="text-[10px] text-emerald-700/70 mt-1">
            Referencia informativa (no sustituye el cierre financiero de venta).
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="py-8 text-center text-xs text-carbon/50">Cargando costos de proveedores...</div>
      ) : (documentos || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-xs text-carbon/60">
            No hay facturas ni remisiones de proveedores registradas para esta orden de trabajo.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-carbon/10 bg-carbon/5 text-carbon/70 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">Proveedor</th>
                <th className="py-3 px-3">Tipo & Folio</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3">Producto / Partida</th>
                <th className="py-3 px-3 text-right">Cantidad</th>
                <th className="py-3 px-3 text-right">Costo Unit.</th>
                <th className="py-3 px-3 text-right">Monto</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon/10">
              {(documentos || []).map((d) => {
                const cant = d.cantidad !== null && d.cantidad !== undefined ? Number(d.cantidad) : null;
                const cUnit =
                  d.costoUnitario !== null && d.costoUnitario !== undefined
                    ? Number(d.costoUnitario)
                    : cant && cant > 0 && d.monto > 0
                    ? Math.round((d.monto / cant) * 100) / 100
                    : null;

                return (
                  <tr key={d.id} className="hover:bg-sauce/5 transition-colors">
                    <td className="py-3 px-3 font-semibold text-carbon">{d.proveedorNombre || "—"}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${
                            d.tipo === "factura"
                              ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                              : "bg-amber-100 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {d.tipo}
                        </span>
                        {d.origen === "automatico" && (
                          <span
                            className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700"
                            title="Generado automáticamente al concluir la orden de trabajo"
                          >
                            ⚡ auto
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-carbon/80 mt-0.5">{d.folio || "—"}</div>
                      {d.tipo === "factura" && d.folioProveedor && (
                        <div className="text-[10px] text-carbon/50">Folio prov: {d.folioProveedor}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-carbon/70">{new Date(d.fecha).toLocaleDateString("es-MX")}</td>
                    <td className="py-3 px-3 max-w-[200px]" title={d.productoNombre || d.concepto}>
                      <div className="font-medium text-carbon line-clamp-1">
                        {d.productoNombre || d.concepto || "—"}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      {cant !== null && cant > 0 ? (
                        <span className="font-semibold text-carbon">
                          {cant} <span className="text-[10px] text-carbon/50">{d.unidad || "m²"}</span>
                        </span>
                      ) : (
                        <span className="text-carbon/40 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      {cUnit !== null && cUnit > 0 ? (
                        <span className="text-emerald-800 font-semibold">
                          ${cUnit.toFixed(2)}
                          <span className="text-[10px] text-carbon/50">/{d.unidad || "m²"}</span>
                        </span>
                      ) : (
                        <span className="text-carbon/40 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-rojo whitespace-nowrap">
                      {formatoPesos(d.monto)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {d.archivoUrl && (
                          <a
                            href={d.archivoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                          >
                            Ver archivo
                          </a>
                        )}
                        <button
                          onClick={() => handleEditar(d)}
                          className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleEliminar(d.id)}
                          className="rounded-md bg-white border border-rojo/30 px-2 py-1 text-[11px] font-semibold text-rojo hover:bg-rojo/5 transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      )}

      <ModalRegistrarDocumentoProveedor
        abierto={modalAbierto}
        onCerrar={() => {
          setModalAbierto(false);
          setDocumentoEnEdicion(null);
        }}
        onRegistrado={handleRegistrado}
        cotizacionId={cotizacionId}
        expedienteId={expedienteId}
        documentoExistente={documentoEnEdicion}
      />
    </div>
  );
}
