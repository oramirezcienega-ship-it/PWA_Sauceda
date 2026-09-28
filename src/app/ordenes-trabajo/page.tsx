"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import {
  obtenerOrdenesTrabajo,
  actualizarEstatusOrdenTrabajo,
  type OrdenTrabajo,
} from "@/app/actions/ordenes-trabajo";
import { listarAsesoresActivos } from "@/app/actions/usuarios";
import { TablaOrdenesTrabajo } from "@/components/TablaOrdenesTrabajo";
import { ModalCrearOrdenTrabajo } from "@/components/ModalCrearOrdenTrabajo";

export default function PaginaOrdenesTrabajo() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asesores, setAsesores] = useState<Array<{ id: string; nombre: string }>>([]);

  // Filtros
  const [filtroEstatus, setFiltroEstatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [modalCrear, setModalCrear] = useState(false);

  const handleActualizarEstatus = async (
    ot: OrdenTrabajo,
    nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada"
  ) => {
    try {
      await actualizarEstatusOrdenTrabajo(ot.id, nuevoEstatus);
      setOrdenes((prev) =>
        prev.map((o) => (o.id === ot.id ? { ...o, estatus: nuevoEstatus } : o))
      );
    } catch (e) {
      alert("Error al actualizar el estado de la orden.");
    }
  };

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const [lista, listaAsesores] = await Promise.all([
        obtenerOrdenesTrabajo({
          estatus: filtroEstatus !== "todos" ? filtroEstatus : undefined,
          tipoNegocio: filtroTipo !== "todos" ? filtroTipo : undefined,
          asesorEjecutorId: filtroAsesor || undefined,
        }),
        listarAsesoresActivos().catch(() => []),
      ]);
      setOrdenes(lista);
      setAsesores(listaAsesores);
    } catch (e) {
      console.error("Error al cargar ordenes:", e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtroEstatus, filtroTipo, filtroAsesor]);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  // Filtrado en memoria por búsqueda de texto
  const ordenesFiltradas = ordenes.filter((o) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase().trim();
    return (
      (o.folio?.toLowerCase() || "").includes(q) ||
      (o.titulo?.toLowerCase() || "").includes(q) ||
      (o.clienteNombre?.toLowerCase() || "").includes(q) ||
      (o.asesorEjecutorNombre?.toLowerCase() || "").includes(q)
    );
  });

  // Métricas
  const totalOrdenes = ordenes.length;
  const enProceso = ordenes.filter((o) => o.estatus === "en_proceso").length;
  const pendientes = ordenes.filter((o) => o.estatus === "pendiente").length;
  const completadas = ordenes.filter((o) => o.estatus === "completada").length;
  const saldoTotalPendiente = ordenes.reduce(
    (acc, curr) => acc + (curr.saldoRestante || 0),
    0
  );

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Banner Superior de Identidad */}
        <div className="rounded-2xl border border-sauce/30 bg-gradient-to-r from-verde-profundo via-verde-profundo to-emerald-950 p-6 text-crema shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🛠️</span>
              <span className="font-mono text-xs uppercase tracking-wider text-dorado font-bold">
                Control Operativo & Técnico
              </span>
            </div>
            <h1 className="font-titular text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Órdenes de Trabajo & Entrega
            </h1>
            <p className="text-xs sm:text-sm text-crema/80 font-cuerpo mt-1">
              Programación de cuadrillas en sitio, recibos oficiales y pólizas de garantía
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalCrear(true)}
              className="rounded-xl bg-dorado hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 text-xs transition shadow-md flex items-center gap-2"
            >
              <span>+</span> Nueva Orden de Trabajo
            </button>
          </div>
        </div>

        {/* Tarjetas KPI de Estado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              En Ejecución
            </div>
            <div className="text-2xl font-mono font-bold text-blue-700 mt-1 flex items-center gap-1.5">
              <span>⚙️</span> {enProceso}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Cuadrillas activas</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Pendientes
            </div>
            <div className="text-2xl font-mono font-bold text-amber-700 mt-1 flex items-center gap-1.5">
              <span>⏳</span> {pendientes}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Por arrancar obra</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Completadas
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
              <span>✓</span> {completadas}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Concluidas con éxito</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Saldo por Cobrar
            </div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-verde-profundo mt-1">
              {formatMoneda(saldoTotalPendiente)}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Liquidaciones pendientes</div>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-cuerpo">
            {/* Buscador */}
            <div className="sm:col-span-1">
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Buscar
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Folio, cliente o trabajo..."
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce"
              />
            </div>

            {/* Estatus */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Estado
              </label>
              <select
                value={filtroEstatus}
                onChange={(e) => setFiltroEstatus(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              >
                <option value="todos">Todos los Estados</option>
                <option value="en_proceso">⚙️ En Proceso</option>
                <option value="pendiente">⏳ Pendientes</option>
                <option value="completada">✓ Completadas</option>
                <option value="cancelada">✕ Canceladas</option>
              </select>
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Línea de Negocio
              </label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              >
                <option value="todos">Todas las líneas</option>
                <option value="impermeabilizacion">Impermeabilización</option>
                <option value="mantenimiento_cisternas">Cisternas y Aljibes</option>
                <option value="construccion">Construcción</option>
                <option value="herreria">Herrería</option>
                <option value="piso_estampado">Piso Estampado</option>
                <option value="traspaso_compra">Inmobiliaria</option>
              </select>
            </div>

            {/* Asesor */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Asesor Ejecutor
              </label>
              <select
                value={filtroAsesor}
                onChange={(e) => setFiltroAsesor(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              >
                <option value="">Todos los asesores</option>
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>
                    👤 {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Listado Principal de Órdenes (Tabla Resumida y Optimizada) */}
        <TablaOrdenesTrabajo
          ordenes={ordenesFiltradas}
          cargando={cargando}
          asesores={asesores}
          alActualizarEstatus={handleActualizarEstatus}
          alNuevaOrden={() => setModalCrear(true)}
        />
      </div>

      {/* Modal Crear Orden */}
      <ModalCrearOrdenTrabajo
        abierto={modalCrear}
        alCerrar={() => setModalCrear(false)}
        alCrear={(nuevaOT) => {
          setModalCrear(false);
          cargarDatos();
          if (nuevaOT?.id) {
            router.push(`/ordenes-trabajo/${nuevaOT.id}`);
          }
        }}
        asesores={asesores}
      />
    </main>
  );
}
