"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import {
  listarRemisionesFacturas,
  type RemisionFacturaEnriquecida,
} from "@/app/actions/remisiones";
import { TablaRemisionesFacturas } from "@/components/TablaRemisionesFacturas";
import { ModalDetalleRemision } from "@/components/ModalDetalleRemision";

export default function PaginaRemisionesFacturas() {
  const router = useRouter();
  const [remisiones, setRemisiones] = useState<RemisionFacturaEnriquecida[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState("todas");
  const [filtroLinea, setFiltroLinea] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  // Modal de Detalle
  const [remisionSeleccionada, setRemisionSeleccionada] =
    useState<RemisionFacturaEnriquecida | null>(null);
  const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const lista = await listarRemisionesFacturas();
      setRemisiones(lista);
    } catch (e) {
      console.error("Error al cargar remisiones y facturas:", e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  // Filtrado en memoria
  const remisionesFiltradas = remisiones.filter((r) => {
    // Filtro por tipo
    if (filtroTipo !== "todas" && r.tipo !== filtroTipo) return false;

    // Filtro por línea de negocio
    if (filtroLinea !== "todos") {
      const lineaOt = (r.ordenTipoNegocio || "").toLowerCase();
      if (!lineaOt.includes(filtroLinea.toLowerCase())) return false;
    }

    // Filtro por período
    if (filtroPeriodo !== "todos" && r.fecha) {
      const fechaDoc = new Date(r.fecha);
      const ahora = new Date();
      if (filtroPeriodo === "30dias") {
        const hace30Dias = new Date();
        hace30Dias.setDate(ahora.getDate() - 30);
        if (fechaDoc < hace30Dias) return false;
      } else if (filtroPeriodo === "90dias") {
        const hace90Dias = new Date();
        hace90Dias.setDate(ahora.getDate() - 90);
        if (fechaDoc < hace90Dias) return false;
      } else if (filtroPeriodo === "este_ano") {
        if (fechaDoc.getFullYear() !== ahora.getFullYear()) return false;
      }
    }

    // Filtro por texto de búsqueda
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      const matchFolio = (r.folio || "").toLowerCase().includes(q);
      const matchCliente = (r.clienteNombre || "").toLowerCase().includes(q);
      const matchTelefono = (r.clienteTelefono || "").toLowerCase().includes(q);
      const matchOt = (r.ordenFolio || "").toLowerCase().includes(q);
      const matchTitulo = (r.ordenTitulo || "").toLowerCase().includes(q);
      const matchRfc = (r.datosDocumento?.rfc || "").toLowerCase().includes(q);
      const matchRazon = (r.datosDocumento?.razonSocial || "")
        .toLowerCase()
        .includes(q);

      if (
        !matchFolio &&
        !matchCliente &&
        !matchTelefono &&
        !matchOt &&
        !matchTitulo &&
        !matchRfc &&
        !matchRazon
      ) {
        return false;
      }
    }

    return true;
  });

  // Métricas KPI
  const totalDocumentos = remisiones.length;
  const totalRemisiones = remisiones.filter((r) => r.tipo === "remision").length;
  const totalFacturas = remisiones.filter((r) => r.tipo === "factura").length;
  const montoTotalEmitido = remisiones.reduce(
    (acc, curr) => acc + (curr.montoTotal || 0),
    0
  );
  const saldoTotalPendiente = remisiones.reduce(
    (acc, curr) => acc + (curr.saldoRestante || 0),
    0
  );

  // Exportar a CSV
  const handleExportarCsv = () => {
    if (remisionesFiltradas.length === 0) return;

    const headers = [
      "Folio",
      "Tipo",
      "Fecha",
      "Cliente",
      "RFC / Receptor",
      "Telefono",
      "Orden de Trabajo",
      "Trabajo / Titulo",
      "Linea de Negocio",
      "Subtotal",
      "Servicios Extra",
      "Total",
      "Cobrado",
      "Saldo Restante",
    ];

    const filas = remisionesFiltradas.map((r) => [
      `"${r.folio}"`,
      `"${r.tipo.toUpperCase()}"`,
      `"${r.fecha}"`,
      `"${r.clienteNombre.replace(/"/g, '""')}"`,
      `"${(r.datosDocumento?.rfc || "").replace(/"/g, '""')}"`,
      `"${r.clienteTelefono || ""}"`,
      `"${r.ordenFolio || ""}"`,
      `"${(r.ordenTitulo || "").replace(/"/g, '""')}"`,
      `"${r.ordenTipoNegocio || ""}"`,
      r.montoSubtotal.toFixed(2),
      r.serviciosExtra.toFixed(2),
      r.montoTotal.toFixed(2),
      (r.totalCobrado || 0).toFixed(2),
      (r.saldoRestante || 0).toFixed(2),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...filas.map((f) => f.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `concentrado_remisiones_facturas_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const abrirDetalle = (rem: RemisionFacturaEnriquecida) => {
    setRemisionSeleccionada(rem);
    setModalDetalleAbierto(true);
  };

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Banner Superior de Identidad */}
        <div className="rounded-2xl border border-sauce/30 bg-gradient-to-r from-verde-profundo via-verde-profundo to-emerald-950 p-6 text-crema shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🧾</span>
              <span className="font-mono text-xs uppercase tracking-wider text-dorado font-bold">
                Control Fiscal & Remisiones
              </span>
            </div>
            <h1 className="font-titular text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Remisiones y Facturas
            </h1>
            <p className="text-xs sm:text-sm text-crema/80 font-cuerpo mt-1">
              Concentrado de remisiones de entrega y facturas fiscales emitidas a clientes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportarCsv}
              disabled={remisionesFiltradas.length === 0}
              className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 text-xs transition shadow-2xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              title="Descargar tabla en formato Excel CSV"
            >
              <span>📥</span>
              <span>Exportar Excel</span>
            </button>

            <Link
              href="/ordenes-trabajo"
              className="rounded-xl bg-dorado hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 text-xs transition shadow-md flex items-center gap-2"
            >
              <span>🛠️</span>
              <span>Órdenes de Trabajo</span>
            </Link>
          </div>
        </div>

        {/* Tarjetas KPI de Estado */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Total Documentos
            </div>
            <div className="text-2xl font-mono font-bold text-carbon mt-1 flex items-center gap-1.5">
              <span>📑</span> {totalDocumentos}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Comprobantes emitidos</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Remisiones de Entrega
            </div>
            <div className="text-2xl font-mono font-bold text-sky-700 mt-1 flex items-center gap-1.5">
              <span>📦</span> {totalRemisiones}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Entregas de obra</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Facturas Fiscales
            </div>
            <div className="text-2xl font-mono font-bold text-purple-700 mt-1 flex items-center gap-1.5">
              <span>🏛️</span> {totalFacturas}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">Documentos con CFDI</div>
          </div>

          <div className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
              Monto Total Facturado
            </div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-verde-profundo mt-1">
              {formatMoneda(montoTotalEmitido)}
            </div>
            <div className="text-[10px] text-carbon/40 mt-1">
              {saldoTotalPendiente > 0
                ? `Resta por cobrar: ${formatMoneda(saldoTotalPendiente)}`
                : "Cobranza al día"}
            </div>
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
                placeholder="Folio, cliente, RFC, trabajo..."
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Tipo de Documento
              </label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              >
                <option value="todas">Todos los Documentos</option>
                <option value="remision">📦 Remisiones de Entrega</option>
                <option value="factura">🏛️ Facturas Fiscales</option>
              </select>
            </div>

            {/* Línea de Negocio */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Línea de Negocio
              </label>
              <select
                value={filtroLinea}
                onChange={(e) => setFiltroLinea(e.target.value)}
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

            {/* Período */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
                Período
              </label>
              <select
                value={filtroPeriodo}
                onChange={(e) => setFiltroPeriodo(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              >
                <option value="todos">Todo el Histórico</option>
                <option value="30dias">Últimos 30 días</option>
                <option value="90dias">Últimos 90 días</option>
                <option value="este_ano">Año en curso</option>
              </select>
            </div>
          </div>
        </div>

        {/* Listado Principal de Remisiones y Facturas */}
        <TablaRemisionesFacturas
          remisiones={remisionesFiltradas}
          cargando={cargando}
          alVerDetalle={abrirDetalle}
          alNuevaRemision={() => router.push("/ordenes-trabajo")}
        />
      </div>

      {/* Modal de Detalle */}
      <ModalDetalleRemision
        remision={remisionSeleccionada}
        abierto={modalDetalleAbierto}
        alCerrar={() => {
          setModalDetalleAbierto(false);
          setRemisionSeleccionada(null);
        }}
      />
    </main>
  );
}
