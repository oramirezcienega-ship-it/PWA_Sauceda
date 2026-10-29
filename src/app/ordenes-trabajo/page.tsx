"use client";

import { cambiarEstatusOTConContrato } from "@/lib/estatus-ot-cliente";
import { useEffect, useState, useMemo } from "react";
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
import {
  OPCIONES_ESTATUS_OT,
  OPCIONES_LINEAS_NEGOCIO,
  VALORES_CONSTRUCCION,
  VALORES_BIENES_RAICES,
  TODOS_LOS_VALORES_LINEAS,
  TODOS_LOS_ESTATUS,
  parsearFiltrosIniciales,
  persistirFiltrosOT,
  type EstadoFiltrosOT,
  FILTROS_OT_DEFAULT,
} from "@/lib/ordenes-filtros";
import { MultiSelectFiltro, type AtajoRapido } from "@/components/ordenes/MultiSelectFiltro";

export default function PaginaOrdenesTrabajo() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asesores, setAsesores] = useState<Array<{ id: string; nombre: string }>>([]);

  // Estado unificado de filtros con persistencia automática en URL y LocalStorage
  const [filtros, setFiltros] = useState<EstadoFiltrosOT>(FILTROS_OT_DEFAULT);
  const [inicializado, setInicializado] = useState(false);

  const [modalCrear, setModalCrear] = useState(false);

  // 1. Inicialización en cliente: Lee URLSearchParams o LocalStorage (por defecto solo Construcción)
  useEffect(() => {
    const cargados = parsearFiltrosIniciales();
    setFiltros(cargados);
    setInicializado(true);
  }, []);

  // 2. Persistencia reactiva: Guarda en localStorage y sincroniza URL sin recargar
  useEffect(() => {
    if (!inicializado) return;
    persistirFiltrosOT(filtros);
  }, [filtros, inicializado]);

  const handleActualizarEstatus = async (
    ot: OrdenTrabajo,
    nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada"
  ) => {
    try {
      if (!(await cambiarEstatusOTConContrato(ot.id, nuevoEstatus))) return;
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
          tiposNegocio: filtros.lineas.length > 0 ? filtros.lineas : undefined,
          asesoresEjecutoresIds: filtros.asesores.length > 0 ? filtros.asesores : undefined,
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

  // Cargar datos del servidor cuando cambien las líneas de negocio o asesores
  useEffect(() => {
    if (!inicializado) return;
    cargarDatos();
  }, [filtros.lineas, filtros.asesores, inicializado]);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  // Filtrado reactivo en memoria: estatus y búsqueda (0ms latencia)
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      // 1. Filtro de estatus múltiple
      if (filtros.estatuses.length > 0 && filtros.estatuses.length < TODOS_LOS_ESTATUS.length) {
        const st = o.estatus || "pendiente";
        if (!filtros.estatuses.includes(st)) return false;
      }

      // 2. Filtro de búsqueda
      if (filtros.busqueda.trim()) {
        const q = filtros.busqueda.toLowerCase().trim();
        const coincide =
          (o.folio?.toLowerCase() || "").includes(q) ||
          (o.titulo?.toLowerCase() || "").includes(q) ||
          (o.clienteNombre?.toLowerCase() || "").includes(q) ||
          (o.asesorEjecutorNombre?.toLowerCase() || "").includes(q);
        if (!coincide) return false;
      }

      return true;
    });
  }, [ordenes, filtros.estatuses, filtros.busqueda]);

  // Métricas reales del conjunto activo (Líneas seleccionadas)
  const totalOrdenes = ordenes.length;
  const enProceso = ordenes.filter((o) => o.estatus === "en_proceso").length;
  const pendientes = ordenes.filter((o) => o.estatus === "pendiente").length;
  const completadas = ordenes.filter((o) => o.estatus === "completada").length;
  const saldoTotalPendiente = ordenes.reduce(
    (acc, curr) => acc + (curr.saldoRestante || 0),
    0
  );

  // Click interactivo en tarjeta KPI para filtrar rápidamente
  const handleToggleKpiEstatus = (target: "en_proceso" | "pendiente" | "completada") => {
    setFiltros((prev) => {
      if (prev.estatuses.length === 1 && prev.estatuses[0] === target) {
        return { ...prev, estatuses: TODOS_LOS_ESTATUS };
      }
      return { ...prev, estatuses: [target] };
    });
  };

  // Atajos para Líneas de Negocio
  const sonTodasConstruccion =
    filtros.lineas.length === VALORES_CONSTRUCCION.length &&
    VALORES_CONSTRUCCION.every((v) => filtros.lineas.includes(v));

  const sonTodasBienesRaices =
    filtros.lineas.length === VALORES_BIENES_RAICES.length &&
    VALORES_BIENES_RAICES.every((v) => filtros.lineas.includes(v));

  const sonTodasLineas = filtros.lineas.length >= TODOS_LOS_VALORES_LINEAS.length;

  const atajosLineas: AtajoRapido[] = [
    {
      label: "Solo Construcción",
      icono: "🏗️",
      activo: sonTodasConstruccion,
      accion: () => setFiltros((prev) => ({ ...prev, lineas: VALORES_CONSTRUCCION })),
    },
    {
      label: "Solo Bienes Raíces",
      icono: "🏠",
      activo: sonTodasBienesRaices,
      accion: () => setFiltros((prev) => ({ ...prev, lineas: VALORES_BIENES_RAICES })),
    },
    {
      label: "Todas",
      icono: "🌐",
      activo: sonTodasLineas,
      accion: () => setFiltros((prev) => ({ ...prev, lineas: TODOS_LOS_VALORES_LINEAS })),
    },
  ];

  let etiquetaLineas = "Todas las líneas";
  if (sonTodasConstruccion) {
    etiquetaLineas = "🏗️ Construcción (todas)";
  } else if (sonTodasBienesRaices) {
    etiquetaLineas = "🏠 Bienes Raíces (todas)";
  } else if (sonTodasLineas) {
    etiquetaLineas = "🌐 Todas las líneas";
  } else if (filtros.lineas.length === 1) {
    const op = OPCIONES_LINEAS_NEGOCIO.find((o) => o.value === filtros.lineas[0]);
    etiquetaLineas = op ? `${op.icono} ${op.label}` : "1 línea";
  } else if (filtros.lineas.length > 1) {
    etiquetaLineas = `${filtros.lineas.length} líneas`;
  }

  // Atajos para Estado
  const sonActivas =
    filtros.estatuses.length === 2 &&
    filtros.estatuses.includes("en_proceso") &&
    filtros.estatuses.includes("pendiente");

  const esSoloEnProceso =
    filtros.estatuses.length === 1 && filtros.estatuses[0] === "en_proceso";

  const sonTodosEstatus = filtros.estatuses.length >= TODOS_LOS_ESTATUS.length;

  const atajosEstatus: AtajoRapido[] = [
    {
      label: "Activas",
      icono: "⚡",
      activo: sonActivas,
      accion: () => setFiltros((prev) => ({ ...prev, estatuses: ["en_proceso", "pendiente"] })),
    },
    {
      label: "En Proceso",
      icono: "⚙️",
      activo: esSoloEnProceso,
      accion: () => setFiltros((prev) => ({ ...prev, estatuses: ["en_proceso"] })),
    },
    {
      label: "Todos",
      activo: sonTodosEstatus,
      accion: () => setFiltros((prev) => ({ ...prev, estatuses: TODOS_LOS_ESTATUS })),
    },
  ];

  let etiquetaEstatus = "Todos los Estados";
  if (esSoloEnProceso) {
    etiquetaEstatus = "⚙️ En Proceso";
  } else if (sonActivas) {
    etiquetaEstatus = "⚡ Activas (2)";
  } else if (filtros.estatuses.length === 1 && filtros.estatuses[0] === "pendiente") {
    etiquetaEstatus = "⏳ Pendientes";
  } else if (filtros.estatuses.length === 1 && filtros.estatuses[0] === "completada") {
    etiquetaEstatus = "✓ Completadas";
  } else if (filtros.estatuses.length === 1 && filtros.estatuses[0] === "cancelada") {
    etiquetaEstatus = "✕ Canceladas";
  } else if (sonTodosEstatus) {
    etiquetaEstatus = "Todos los Estados";
  } else if (filtros.estatuses.length > 0) {
    etiquetaEstatus = `${filtros.estatuses.length} estados`;
  }

  // Opciones de Asesores para MultiSelect
  const opcionesAsesores = asesores.map((a) => ({
    value: a.id,
    label: a.nombre,
    icono: "👤",
  }));

  const atajosAsesores: AtajoRapido[] = [
    {
      label: "Todos los asesores",
      activo: filtros.asesores.length === 0,
      accion: () => setFiltros((prev) => ({ ...prev, asesores: [] })),
    },
  ];

  let etiquetaAsesores = "Todos los asesores";
  if (filtros.asesores.length === 1) {
    const a = asesores.find((x) => x.id === filtros.asesores[0]);
    etiquetaAsesores = a ? `👤 ${a.nombre}` : "1 asesor";
  } else if (filtros.asesores.length > 1) {
    etiquetaAsesores = `${filtros.asesores.length} asesores`;
  }

  const hayFiltrosPersonalizados =
    !sonTodasConstruccion ||
    !esSoloEnProceso ||
    filtros.asesores.length > 0 ||
    filtros.busqueda.trim() !== "";

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />

      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 xl:px-8 py-6 space-y-6">
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
              className="rounded-xl bg-dorado hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 text-xs transition shadow-md flex items-center gap-2 cursor-pointer"
            >
              <span>+</span> Nueva Orden de Trabajo
            </button>
          </div>
        </div>

        {/* Tarjetas KPI de Estado (Clicables para filtrar con 1 clic) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => handleToggleKpiEstatus("en_proceso")}
            title="Clic para filtrar por órdenes En Ejecución"
            className={`rounded-2xl border bg-white p-4 shadow-2xs text-left transition hover:shadow-xs cursor-pointer ${
              filtros.estatuses.length === 1 && filtros.estatuses[0] === "en_proceso"
                ? "border-blue-500 ring-2 ring-blue-100 bg-blue-50/20"
                : "border-carbon/10 hover:border-blue-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
                En Ejecución
              </div>
              {filtros.estatuses.length === 1 && filtros.estatuses[0] === "en_proceso" && (
                <span className="text-[10px] text-blue-700 font-bold bg-blue-100 rounded-full px-1.5 py-0.2">
                  activo
                </span>
              )}
            </div>
            <div className="text-2xl font-mono font-bold text-blue-700 mt-1 flex items-center gap-1.5">
              <span>⚙️</span> {enProceso}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Cuadrillas activas</div>
          </button>

          <button
            type="button"
            onClick={() => handleToggleKpiEstatus("pendiente")}
            title="Clic para filtrar por órdenes Pendientes"
            className={`rounded-2xl border bg-white p-4 shadow-2xs text-left transition hover:shadow-xs cursor-pointer ${
              filtros.estatuses.length === 1 && filtros.estatuses[0] === "pendiente"
                ? "border-amber-500 ring-2 ring-amber-100 bg-amber-50/20"
                : "border-carbon/10 hover:border-amber-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
                Pendientes
              </div>
              {filtros.estatuses.length === 1 && filtros.estatuses[0] === "pendiente" && (
                <span className="text-[10px] text-amber-700 font-bold bg-amber-100 rounded-full px-1.5 py-0.2">
                  activo
                </span>
              )}
            </div>
            <div className="text-2xl font-mono font-bold text-amber-700 mt-1 flex items-center gap-1.5">
              <span>⏳</span> {pendientes}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Por arrancar obra</div>
          </button>

          <button
            type="button"
            onClick={() => handleToggleKpiEstatus("completada")}
            title="Clic para filtrar por órdenes Completadas"
            className={`rounded-2xl border bg-white p-4 shadow-2xs text-left transition hover:shadow-xs cursor-pointer ${
              filtros.estatuses.length === 1 && filtros.estatuses[0] === "completada"
                ? "border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20"
                : "border-carbon/10 hover:border-emerald-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
                Completadas
              </div>
              {filtros.estatuses.length === 1 && filtros.estatuses[0] === "completada" && (
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 rounded-full px-1.5 py-0.2">
                  activo
                </span>
              )}
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
              <span>✓</span> {completadas}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Concluidas con éxito</div>
          </button>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Saldo por Cobrar
            </div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-verde-profundo mt-1 truncate">
              {formatMoneda(saldoTotalPendiente)}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Liquidaciones pendientes</div>
          </div>
        </div>

        {/* Barra de Filtros Multi-Selección con Persistencia */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-carbon/5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-carbon/70">Filtros Operativos</span>
              {hayFiltrosPersonalizados && (
                <button
                  type="button"
                  onClick={() => setFiltros(FILTROS_OT_DEFAULT)}
                  className="rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 text-[10.5px] font-semibold hover:bg-amber-100 transition cursor-pointer flex items-center gap-1"
                  title="Restablece al filtro predeterminado: Solo Construcción + En Proceso"
                >
                  <span>↺</span> Restablecer a Construcción
                </button>
              )}
            </div>
            <div className="text-[11px] text-carbon/50">
              Mostrando <strong className="text-carbon font-mono">{ordenesFiltradas.length}</strong> de{" "}
              <span className="font-mono">{totalOrdenes}</span> órdenes de la vertical
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-cuerpo">
            {/* Buscador */}
            <div className="sm:col-span-1">
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Buscar
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={filtros.busqueda}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, busqueda: e.target.value }))}
                  placeholder="Folio, cliente o trabajo..."
                  className="w-full rounded-xl border border-carbon/20 pl-3 pr-7 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                />
                {filtros.busqueda && (
                  <button
                    type="button"
                    onClick={() => setFiltros((prev) => ({ ...prev, busqueda: "" }))}
                    className="absolute right-2.5 top-2 text-carbon/40 hover:text-carbon text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Estatus Multi-Select */}
            <div>
              <MultiSelectFiltro
                titulo="Estado"
                iconoPrincipal="⚙️"
                opciones={OPCIONES_ESTATUS_OT}
                seleccionados={filtros.estatuses}
                onChange={(estatuses) => setFiltros((prev) => ({ ...prev, estatuses }))}
                atajos={atajosEstatus}
                etiquetaPersonalizada={etiquetaEstatus}
                placeholderVacio="Sin estados"
              />
            </div>

            {/* Línea de Negocio Multi-Select */}
            <div>
              <MultiSelectFiltro
                titulo="Línea de Negocio"
                iconoPrincipal="🏗️"
                opciones={OPCIONES_LINEAS_NEGOCIO}
                seleccionados={filtros.lineas}
                onChange={(lineas) => setFiltros((prev) => ({ ...prev, lineas }))}
                atajos={atajosLineas}
                etiquetaPersonalizada={etiquetaLineas}
                placeholderVacio="Sin líneas"
              />
            </div>

            {/* Asesor Multi-Select */}
            <div>
              <MultiSelectFiltro
                titulo="Asesor Ejecutor"
                iconoPrincipal="👤"
                opciones={opcionesAsesores}
                seleccionados={filtros.asesores}
                onChange={(asesores) => setFiltros((prev) => ({ ...prev, asesores }))}
                atajos={atajosAsesores}
                etiquetaPersonalizada={etiquetaAsesores}
                placeholderVacio="Todos los asesores"
              />
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
