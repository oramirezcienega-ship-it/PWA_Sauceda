"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import type { DocumentoProveedor, Proveedor } from "@/lib/types";
import { actualizarProveedor, eliminarDocumentoProveedor } from "@/app/actions/proveedores";
import { ModalRegistrarDocumentoProveedor } from "./ModalRegistrarDocumentoProveedor";

interface DetalleProveedorProps {
  proveedorInicial: Proveedor;
  documentosIniciales: DocumentoProveedor[];
}

export function DetalleProveedor({ proveedorInicial, documentosIniciales }: DetalleProveedorProps) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState<Proveedor>(proveedorInicial);
  const [documentos, setDocumentos] = useState<DocumentoProveedor[]>(documentosIniciales);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [documentoEnEdicion, setDocumentoEnEdicion] = useState<DocumentoProveedor | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const montoTotal = documentos.reduce((acc, d) => acc + d.monto, 0);

  function handleDocumentoRegistrado(doc: DocumentoProveedor) {
    setDocumentos((prev) => {
      const existe = prev.some((d) => d.id === doc.id);
      return existe ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev];
    });
    router.refresh();
  }

  function handleEditarDocumento(doc: DocumentoProveedor) {
    setDocumentoEnEdicion(doc);
    setModalAbierto(true);
  }

  async function handleEliminarDocumento(id: string) {
    if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) return;
    try {
      await eliminarDocumentoProveedor(id);
      setDocumentos((prev) => prev.filter((d) => d.id !== id));
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "No se pudo eliminar el documento.");
    }
  }

  async function handleToggleActivo() {
    setActualizando(true);
    try {
      await actualizarProveedor(proveedor.id, { activo: !proveedor.activo });
      setProveedor((prev) => ({ ...prev, activo: !prev.activo }));
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "No se pudo actualizar el estatus del proveedor.");
    } finally {
      setActualizando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-verde-profundo to-sauce p-6 rounded-2xl text-white shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-crema/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Proveedor
            </span>
            {proveedor.categoria && (
              <span className="font-mono text-xs bg-white/15 px-2 py-0.5 rounded">{proveedor.categoria}</span>
            )}
            {!proveedor.activo && (
              <span className="font-mono text-xs bg-rojo/30 px-2 py-0.5 rounded">Inactivo</span>
            )}
          </div>
          <h2 className="font-titular text-2xl font-semibold text-crema mt-1">{proveedor.nombre}</h2>
          {proveedor.razonSocial && <p className="text-xs text-crema/80 mt-0.5">{proveedor.razonSocial}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-crema/80 flex-wrap">
            {proveedor.contactoNombre && <span>👤 {proveedor.contactoNombre}</span>}
            {proveedor.telefono && <span>📞 {proveedor.telefono}</span>}
            {proveedor.email && <span>✉️ {proveedor.email}</span>}
            {proveedor.rfc && <span className="font-mono">RFC: {proveedor.rfc}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleActivo}
            disabled={actualizando}
            className="rounded-xl bg-crema/15 hover:bg-crema/25 border border-crema/30 px-3.5 py-2.5 text-xs font-bold text-crema transition shadow-xs disabled:opacity-50"
          >
            {proveedor.activo ? "Marcar Inactivo" : "Marcar Activo"}
          </button>
          <div className="bg-white/10 px-4 py-3 rounded-xl border border-white/10 text-right">
            <div className="text-xs text-crema/70 uppercase font-semibold">Total Pagado a este Proveedor</div>
            <div className="font-mono text-2xl font-bold text-dorado">{formatoPesos(montoTotal)}</div>
            <div className="text-[10px] text-crema/60 mt-1 uppercase font-semibold">
              {documentos.length} documento(s) registrado(s)
            </div>
          </div>
        </div>
      </div>

      {proveedor.notas && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-carbon/80">
          <span className="font-bold uppercase text-[10px] text-amber-700">Notas: </span>
          {proveedor.notas}
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-carbon/10 shadow-sm font-cuerpo">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div>
            <h3 className="font-titular text-lg font-bold text-verde-profundo">Facturas y Remisiones</h3>
            <p className="text-xs text-carbon/60 mt-0.5">
              Historial de documentos entregados por este proveedor, ligados a órdenes de trabajo/cotizaciones.
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
            <span>📄</span> + Registrar Documento
          </button>
        </div>

        {documentos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-xs text-carbon/60">
              Este proveedor aún no tiene facturas ni remisiones registradas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-carbon/10 bg-carbon/5 text-carbon/70 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Folio Interno</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Orden de Trabajo</th>
                  <th className="py-3 px-4">Concepto</th>
                  <th className="py-3 px-4 text-right">Monto</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/10">
                {documentos.map((d) => (
                  <tr key={d.id} className="hover:bg-sauce/5 transition-colors">
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          d.tipo === "factura"
                            ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                            : "bg-amber-100 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {d.tipo}
                      </span>
                      {d.origen === "automatico" && (
                        <span className="ml-1.5 inline-block rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700" title="Generado automáticamente al concluir la orden de trabajo">
                          ⚡ auto
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-carbon/80">{d.folio || "—"}</div>
                      {d.tipo === "factura" && d.folioProveedor && (
                        <div className="text-[10px] text-carbon/50">Folio proveedor: {d.folioProveedor}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-carbon/70">{new Date(d.fecha).toLocaleDateString("es-MX")}</td>
                    <td className="py-3 px-4">
                      {d.ordenTrabajoId ? (
                        <span className="font-mono text-carbon/70">{d.ordenTrabajoFolio || d.ordenTrabajoId}</span>
                      ) : d.cotizacionId ? (
                        <Link href={`/construccion/${d.cotizacionId}`} className="text-sauce font-semibold hover:underline">
                          {d.cotizacionId}
                        </Link>
                      ) : (
                        <span className="text-carbon/40 italic">Sin vincular</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-carbon/70 max-w-[220px] truncate" title={d.concepto}>
                      {d.concepto || "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-rojo">{formatoPesos(d.monto)}</td>
                    <td className="py-3 px-4 text-right">
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
                          onClick={() => handleEditarDocumento(d)}
                          className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleEliminarDocumento(d.id)}
                          className="rounded-md bg-white border border-rojo/30 px-2 py-1 text-[11px] font-semibold text-rojo hover:bg-rojo/5 transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalRegistrarDocumentoProveedor
        abierto={modalAbierto}
        onCerrar={() => {
          setModalAbierto(false);
          setDocumentoEnEdicion(null);
        }}
        onRegistrado={handleDocumentoRegistrado}
        proveedorId={proveedor.id}
        proveedorNombre={proveedor.nombre}
        documentoExistente={documentoEnEdicion}
      />
    </div>
  );
}
