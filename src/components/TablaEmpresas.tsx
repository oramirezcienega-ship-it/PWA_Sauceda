"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import type { Empresa } from "@/lib/types";
import { ModalCrearEmpresa } from "./ModalCrearEmpresa";

interface TablaEmpresasProps {
  empresasIniciales: Empresa[];
  asesores: { id: string; nombre: string }[];
  industriasDisponibles: string[];
}

export function TablaEmpresas({
  empresasIniciales,
  asesores,
  industriasDisponibles,
}: TablaEmpresasProps) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>(empresasIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [filtroIndustria, setFiltroIndustria] = useState("todas");
  const [filtroOwner, setFiltroOwner] = useState("todos");
  const [modalAbierto, setModalAbierto] = useState(false);

  // Filtrado reactivo en el cliente
  const empresasFiltradas = useMemo(() => {
    return empresas.filter((emp) => {
      // Filtro de texto
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincideNombre = emp.name.toLowerCase().includes(q);
        const coincideTelefono = (emp.phone || "").toLowerCase().includes(q);
        const coincideWeb = (emp.website || "").toLowerCase().includes(q);
        if (!coincideNombre && !coincideTelefono && !coincideWeb) return false;
      }

      // Filtro de industria
      if (filtroIndustria !== "todas" && emp.industry !== filtroIndustria) {
        return false;
      }

      // Filtro de propietario
      if (filtroOwner !== "todos") {
        if (filtroOwner === "sin_asignar") {
          if (emp.ownerId) return false;
        } else if (emp.ownerId !== filtroOwner) {
          return false;
        }
      }

      return true;
    });
  }, [empresas, busqueda, filtroIndustria, filtroOwner]);

  function handleEmpresaCreada(nueva: Empresa) {
    setEmpresas((prev) => [nueva, ...prev]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros y Acciones */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Buscador */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/40 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Buscar empresa por nombre, teléfono o web..."
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

          {/* Filtro Industria */}
          <select
            value={filtroIndustria}
            onChange={(e) => setFiltroIndustria(e.target.value)}
            className="rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs text-carbon outline-none transition focus:border-sauce"
          >
            <option value="todas">Todas las industrias</option>
            {industriasDisponibles.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>

          {/* Filtro Propietario */}
          <select
            value={filtroOwner}
            onChange={(e) => setFiltroOwner(e.target.value)}
            className="rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs text-carbon outline-none transition focus:border-sauce"
          >
            <option value="todos">Todos los propietarios</option>
            <option value="sin_asignar">Sin asignar</option>
            {asesores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Botón de Alta Rápida */}
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-verde-profundo transition shrink-0"
        >
          <span>🏢</span>
          <span>+ Nueva Empresa</span>
        </button>
      </div>

      {/* Métricas rápidas */}
      <div className="flex items-center justify-between text-xs text-carbon/60 px-1">
        <span>
          Mostrando <strong className="text-carbon font-semibold">{empresasFiltradas.length}</strong> de{" "}
          <strong className="text-carbon font-semibold">{empresas.length}</strong> empresa(s)
        </span>
        {(busqueda || filtroIndustria !== "todas" || filtroOwner !== "todos") && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroIndustria("todas");
              setFiltroOwner("todos");
            }}
            className="text-sauce font-medium hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla de Empresas */}
      {empresasFiltradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 bg-white p-12 text-center">
          <div className="text-4xl mb-3">🏢</div>
          <h3 className="font-titular text-base font-bold text-verde-profundo">
            No se encontraron empresas
          </h3>
          <p className="mt-1 text-xs text-carbon/60 max-w-sm mx-auto">
            {empresas.length === 0
              ? "Aún no tienes cuentas corporativas registradas. Haz clic en '+ Nueva Empresa' para comenzar a vincular prospectos y negocios."
              : "No hay empresas que coincidan con los filtros aplicados."}
          </p>
          {empresas.length === 0 && (
            <button
              onClick={() => setModalAbierto(true)}
              className="mt-4 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white hover:bg-verde-profundo transition"
            >
              + Registrar la primera empresa
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-carbon/10 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-carbon/10 bg-carbon/5 text-carbon/70 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Industria</th>
                  <th className="py-3 px-4">Propietario</th>
                  <th className="py-3 px-4 text-center">Prospectos</th>
                  <th className="py-3 px-4 text-center">Negocios (Deals)</th>
                  <th className="py-3 px-4 text-right">Monto Total</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/10">
                {empresasFiltradas.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-sauce/5 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <Link
                        href={`/empresas/${emp.id}`}
                        className="font-bold text-carbon group-hover:text-sauce transition block text-sm"
                      >
                        {emp.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-carbon/50 text-[11px]">
                        {emp.website && (
                          <a
                            href={emp.website.startsWith("http") ? emp.website : `https://${emp.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-sauce hover:underline inline-flex items-center gap-0.5"
                          >
                            🌐 {emp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        )}
                        {emp.phone && (
                          <span className="inline-flex items-center gap-0.5">
                            📞 {emp.phone}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {emp.industry ? (
                        <span className="inline-block rounded-full bg-verde-profundo/10 border border-verde-profundo/20 px-2.5 py-0.5 text-[11px] font-medium text-verde-profundo">
                          {emp.industry}
                        </span>
                      ) : (
                        <span className="text-carbon/40 italic">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {emp.ownerNombre ? (
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sauce text-[10px] font-bold text-white uppercase">
                            {emp.ownerNombre.charAt(0)}
                          </span>
                          <span className="font-medium text-carbon/80">
                            {emp.ownerNombre}
                          </span>
                        </div>
                      ) : (
                        <span className="text-carbon/40 italic">Sin asignar</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-200">
                        👤 {emp.prospectosCount ?? 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
                        📁 {emp.negociosCount ?? 0}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-semibold text-verde-profundo">
                      {emp.valorTotalNegocios && emp.valorTotalNegocios > 0
                        ? formatoPesos(emp.valorTotalNegocios)
                        : "$0"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/empresas/${emp.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-white border border-carbon/20 px-2.5 py-1 text-xs font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition shadow-2xs"
                      >
                        <span>Ver 360°</span>
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

      {/* Modal para Crear Empresa */}
      <ModalCrearEmpresa
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onCreada={handleEmpresaCreada}
        asesores={asesores}
      />
    </div>
  );
}
