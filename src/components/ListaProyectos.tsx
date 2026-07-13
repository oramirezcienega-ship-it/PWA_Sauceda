"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProyectoConsejo, crearProyecto } from "@/app/actions/consejo";

interface ListaProyectosProps {
  proyectosIniciales: ProyectoConsejo[];
}

export function ListaProyectos({ proyectosIniciales }: ListaProyectosProps) {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<ProyectoConsejo[]>(proyectosIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "borrador" | "cerrado">("todos");
  
  // Modal de nuevo proyecto
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoContexto, setNuevoContexto] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");

  // Filtrar en el cliente para respuesta instantánea
  const proyectosFiltrados = proyectos.filter((p) => {
    const coincideBusqueda = p.name.toLowerCase().includes(busqueda.toLowerCase());
    const coincideStatus = statusFiltro === "todos" || p.status === statusFiltro;
    return coincideBusqueda && coincideStatus;
  });

  const handleCrearProyecto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevoContexto.trim()) {
      setErrorMsg("Por favor completa todos los campos.");
      return;
    }

    setErrorMsg("");
    startTransition(async () => {
      try {
        const nuevoProj = await crearProyecto(nuevoNombre.trim(), nuevoContexto.trim());
        setProyectos((prev) => [nuevoProj, ...prev]);
        setModalAbierto(false);
        setNuevoNombre("");
        setNuevoContexto("");
        router.push(`/consejo/${nuevoProj.id}`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Error al crear el proyecto.");
      }
    });
  };

  const formatearFecha = (fechaStr: string) => {
    const d = new Date(fechaStr);
    return d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Controles de búsqueda y filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-carbon/40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar proyecto por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-carbon/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as any)}
            className="bg-white border border-carbon/10 rounded-lg px-3 py-2 text-sm text-carbon/80 focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all"
          >
            <option value="todos">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="cerrado">Cerrado</option>
          </select>

          <button
            onClick={() => setModalAbierto(true)}
            className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
          >
            <span>+</span> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Grid de Proyectos */}
      {proyectosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-white border border-carbon/5 rounded-xl">
          <p className="text-carbon/50 text-sm">No se encontraron proyectos del consejo.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {proyectosFiltrados.map((p) => (
            <Link
              key={p.id}
              href={`/consejo/${p.id}`}
              className="group block bg-white border border-carbon/10 rounded-xl p-5 hover:border-[#E05A2B]/40 hover:shadow-md transition-all relative overflow-hidden"
            >
              {/* Decoración naranja en hover */}
              <div className="absolute left-0 top-0 bottom-0 w-0 group-hover:w-1 bg-[#E05A2B] transition-all" />

              <div className="flex items-start justify-between gap-3 mb-3">
                <span className="text-[11px] font-mono text-carbon/40">
                  {formatearFecha(p.created_at)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                    p.status === "borrador"
                      ? "bg-[#E05A2B]/10 text-[#E05A2B]"
                      : "bg-carbon/10 text-carbon/70"
                  }`}
                >
                  {p.status}
                </span>
              </div>

              <h3 className="font-titular text-lg font-bold text-carbon group-hover:text-[#E05A2B] transition-colors mb-2 line-clamp-1">
                {p.name}
              </h3>

              <p className="text-xs text-carbon/60 line-clamp-2 mb-4 font-cuerpo min-h-[2rem]">
                {p.ultima_pregunta ? (
                  <>
                    <strong className="text-carbon/80">Última consulta:</strong> "{p.ultima_pregunta}"
                  </>
                ) : (
                  <span className="italic text-carbon/40">Sin consultas realizadas aún.</span>
                )}
              </p>

              <div className="border-t border-carbon/5 pt-3 flex items-center justify-between text-xs text-carbon/50">
                <span>Alternativas analizadas</span>
                <span className="bg-carbon/5 px-2 py-0.5 rounded-full font-semibold text-carbon">
                  {p.alternativas_count || 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal: Nuevo Proyecto */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Fondo oscuro */}
          <div
            className="fixed inset-0 bg-carbon/50 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setModalAbierto(false)}
          />

          {/* Caja del Modal */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 overflow-hidden border border-carbon/10 transform transition-all z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-carbon/5 pb-3 mb-4">
              <h2 className="font-titular text-xl font-bold text-carbon flex items-center gap-2">
                💼 Crear Nuevo Proyecto
              </h2>
              <button
                type="button"
                onClick={() => !isPending && setModalAbierto(false)}
                className="text-carbon/40 hover:text-carbon p-1"
                disabled={isPending}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearProyecto} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-carbon/70 uppercase">
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Adquisición Casa Sauceda 405"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  disabled={isPending}
                  className="w-full border border-carbon/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all disabled:opacity-50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-carbon/70 uppercase flex justify-between">
                  <span>Contexto Estratégico</span>
                  <span className="text-[10px] font-normal text-carbon/40 lowercase">
                    Se inyectará en los prompts de IA
                  </span>
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Describe la situación general, la propiedad, precios, restricciones, monto del adeudo de INFONAVIT, presupuesto de remodelación, etc."
                  value={nuevoContexto}
                  onChange={(e) => setNuevoContexto(e.target.value)}
                  disabled={isPending}
                  className="w-full border border-carbon/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all disabled:opacity-50 font-cuerpo resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-carbon/5">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={isPending}
                  className="px-4 py-2 border border-carbon/10 hover:bg-carbon/5 rounded-lg text-sm text-carbon/70 font-semibold transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creando...
                    </>
                  ) : (
                    "Crear Proyecto"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
