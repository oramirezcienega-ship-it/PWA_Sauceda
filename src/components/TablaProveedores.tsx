"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import type { Proveedor } from "@/lib/types";
import { ModalCrearProveedor } from "./ModalCrearProveedor";

interface TablaProveedoresProps {
  proveedoresIniciales: Proveedor[];
  categoriasDisponibles: string[];
}

export function TablaProveedores({ proveedoresIniciales, categoriasDisponibles }: TablaProveedoresProps) {
  const router = useRouter();
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [modalAbierto, setModalAbierto] = useState(false);

  const proveedoresFiltrados = useMemo(() => {
    return proveedores.filter((p) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincideNombre = p.nombre.toLowerCase().includes(q);
        const coincideContacto = (p.contactoNombre || "").toLowerCase().includes(q);
        const coincideTelefono = (p.telefono || "").toLowerCase().includes(q);
        if (!coincideNombre && !coincideContacto && !coincideTelefono) return false;
      }
      if (filtroCategoria !== "todas" && p.categoria !== filtroCategoria) return false;
      return true;
    });
  }, [proveedores, busqueda, filtroCategoria]);

  function handleProveedorCreado(nuevo: Proveedor) {
    setProveedores((prev) => [nuevo, ...prev]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/40 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Buscar proveedor por nombre, contacto o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 pl-9 pr-3 py-2 text-xs text-carbon placeholder:text-carbon/40 outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce bg-carbon/5"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-carbon/40 hover:text-carbon"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs text-carbon outline-none transition focus:border-sauce"
          >
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-verde-profundo transition shrink-0"
        >
          <span>🧾</span>
          <span>+ Nuevo Proveedor</span>
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-carbon/60 px-1">
        <span>
          Mostrando <strong className="text-carbon font-semibold">{proveedoresFiltrados.length}</strong> de{" "}
          <strong className="text-carbon font-semibold">{proveedores.length}</strong> proveedor(es)
        </span>
        {(busqueda || filtroCategoria !== "todas") && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroCategoria("todas");
            }}
            className="text-sauce font-medium hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {proveedoresFiltrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 bg-white p-12 text-center">
          <div className="text-4xl mb-3">🧾</div>
          <h3 className="font-titular text-base font-bold text-verde-profundo">No se encontraron proveedores</h3>
          <p className="mt-1 text-xs text-carbon/60 max-w-sm mx-auto">
            {proveedores.length === 0
              ? "Aún no tienes proveedores registrados. Haz clic en '+ Nuevo Proveedor' para comenzar a registrar sus facturas y remisiones."
              : "No hay proveedores que coincidan con los filtros aplicados."}
          </p>
          {proveedores.length === 0 && (
            <button
              onClick={() => setModalAbierto(true)}
              className="mt-4 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white hover:bg-verde-profundo transition"
            >
              + Registrar el primer proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-carbon/10 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-carbon/10 bg-carbon/5 text-carbon/70 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Contacto</th>
                  <th className="py-3 px-4 text-center">Documentos</th>
                  <th className="py-3 px-4 text-right">Total Pagado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/10">
                {proveedoresFiltrados.map((p) => (
                  <tr key={p.id} className="hover:bg-sauce/5 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/proveedores/${p.id}`}
                          className="font-bold text-carbon group-hover:text-sauce transition text-sm"
                        >
                          {p.nombre}
                        </Link>
                        {!p.activo && (
                          <span className="rounded bg-carbon/10 px-1.5 py-0.2 text-[10px] font-semibold text-carbon/60 border border-carbon/20">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {p.rfc && <div className="mt-0.5 text-carbon/50 text-[11px] font-mono">RFC: {p.rfc}</div>}
                    </td>

                    <td className="py-3 px-4">
                      {p.categoria ? (
                        <span className="inline-block rounded-full bg-verde-profundo/10 border border-verde-profundo/20 px-2.5 py-0.5 text-[11px] font-medium text-verde-profundo">
                          {p.categoria}
                        </span>
                      ) : (
                        <span className="text-carbon/40 italic">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {p.contactoNombre || p.telefono ? (
                        <div>
                          {p.contactoNombre && <div className="font-medium text-carbon/80">{p.contactoNombre}</div>}
                          {p.telefono && <div className="text-carbon/50 text-[11px]">📞 {p.telefono}</div>}
                        </div>
                      ) : (
                        <span className="text-carbon/40 italic">Sin datos</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                        📄 {p.totalDocumentos ?? 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-semibold text-rojo">
                      {p.montoTotal && p.montoTotal > 0 ? formatoPesos(p.montoTotal) : "$0"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/proveedores/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-white border border-carbon/20 px-2.5 py-1 text-xs font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition shadow-2xs"
                      >
                        <span>Ver</span>
                        <span>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalCrearProveedor abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onCreado={handleProveedorCreado} />
    </div>
  );
}
