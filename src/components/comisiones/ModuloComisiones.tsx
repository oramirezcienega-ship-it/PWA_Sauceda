"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import type {
  Comision,
  ComisionPago,
  EstatusComision,
  ReglaComision,
  ResumenEstadoCuentaAsesor,
} from "@/lib/types";
import {
  listarComisiones,
  listarPagosComisiones,
  listarReglasComision,
  obtenerResumenEstadoCuenta,
  sincronizarTodasLasRemisionesPendientes,
  eliminarReglaComision,
  guardarTarifaInspeccionGeneral,
  cancelarComision,
} from "@/app/actions/comisiones";
import { ModalAjustarComision } from "./ModalAjustarComision";
import { ModalRegistrarPagoComision } from "./ModalRegistrarPagoComision";
import { ModalReglaComision } from "./ModalReglaComision";
import { ModalEstadoCuentaImprimible } from "./ModalEstadoCuentaImprimible";

interface Props {
  comisionesIniciales: Comision[];
  pagosIniciales: ComisionPago[];
  reglasIniciales: ReglaComision[];
  resumenInicial: {
    general: {
      totalVentas: number;
      totalComisiones: number;
      totalPagado: number;
      saldoPendiente: number;
      comisionesCount: number;
      pendientesCount: number;
      anticiposPendientes: number;
      saldoNeto: number;
    };
    porAsesor: ResumenEstadoCuentaAsesor[];
  };
  asesores: { id: string; nombre: string }[];
}

export function ModuloComisiones({
  comisionesIniciales,
  pagosIniciales,
  reglasIniciales,
  resumenInicial,
  asesores,
}: Props) {
  const [pestana, setPestana] = useState<"desglose" | "pagos" | "reglas" | "asesores">("desglose");
  const [comisiones, setComisiones] = useState<Comision[]>(comisionesIniciales);
  const [pagos, setPagos] = useState<ComisionPago[]>(pagosIniciales);
  const [reglas, setReglas] = useState<ReglaComision[]>(reglasIniciales);
  const [resumen, setResumen] = useState(resumenInicial);

  // Filtros
  const [filtroAsesor, setFiltroAsesor] = useState<string>("todos");
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusComision | "todas">("todas");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("historico");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "venta" | "inspeccion">("todas");

  // Modales
  const [comisionParaAjustar, setComisionParaAjustar] = useState<Comision | null>(null);
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const [pagoAsesorId, setPagoAsesorId] = useState<string | undefined>(undefined);
  const [pagoComisionId, setPagoComisionId] = useState<string | undefined>(undefined);
  const [reglaParaEditar, setReglaParaEditar] = useState<ReglaComision | null | "nueva">(null);
  const [modalImprimirAbierto, setModalImprimirAbierto] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeAlerta, setMensajeAlerta] = useState<{ tipo: "ok" | "error"; texto: string } | null>(
    null
  );

  // Tarifa fija de inspecciones técnicas
  const reglaInspInicial = reglasIniciales.find((r) => r.tipo === "inspeccion" && r.clave === "general");
  const [tarifaInspeccion, setTarifaInspeccion] = useState<number>(reglaInspInicial?.montoFijo || 150);
  const [guardandoTarifa, setGuardandoTarifa] = useState(false);

  useEffect(() => {
    const r = reglas.find((item) => item.tipo === "inspeccion" && item.clave === "general");
    if (r && r.montoFijo !== undefined) {
      setTarifaInspeccion(r.montoFijo);
    }
  }, [reglas]);

  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  const formatearFechaISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
  };

  // Manejar cambio de selector de período
  const handleCambioPeriodo = (p: string) => {
    setFiltroPeriodo(p);
    const hoy = new Date();
    if (p === "mes_actual") {
      const inicio = formatearFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      const fin = formatearFechaISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
      setFechaDesde(inicio);
      setFechaHasta(fin);
      recargarDatos({ fDesde: inicio, fHasta: fin });
    } else if (p === "mes_anterior") {
      const inicio = formatearFechaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
      const fin = formatearFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0));
      setFechaDesde(inicio);
      setFechaHasta(fin);
      recargarDatos({ fDesde: inicio, fHasta: fin });
    } else if (p === "anio_actual") {
      const inicio = `${hoy.getFullYear()}-01-01`;
      const fin = `${hoy.getFullYear()}-12-31`;
      setFechaDesde(inicio);
      setFechaHasta(fin);
      recargarDatos({ fDesde: inicio, fHasta: fin });
    } else if (p === "historico") {
      setFechaDesde("");
      setFechaHasta("");
      recargarDatos({ fDesde: "", fHasta: "" });
    }
  };

  const recargarDatos = (overrides?: {
    asesor?: string;
    estatus?: EstatusComision | "todas";
    fDesde?: string;
    fHasta?: string;
    q?: string;
  }) => {
    startTransition(async () => {
      try {
        const asId = overrides?.asesor !== undefined ? overrides.asesor : filtroAsesor;
        const est = overrides?.estatus !== undefined ? overrides.estatus : filtroEstatus;
        const fd = overrides?.fDesde !== undefined ? overrides.fDesde : fechaDesde;
        const fh = overrides?.fHasta !== undefined ? overrides.fHasta : fechaHasta;
        const b = overrides?.q !== undefined ? overrides.q : busqueda;

        const [nuevasComisiones, nuevosPagos, nuevasReglas, nuevoResumen] = await Promise.all([
          listarComisiones({
            asesorId: asId,
            estatus: est,
            fechaDesde: fd || undefined,
            fechaHasta: fh || undefined,
            busqueda: b || undefined,
          }).catch((err) => {
            console.error("Error al cargar comisiones:", err);
            return [];
          }),
          listarPagosComisiones(asId).catch((err) => {
            console.error("Error al cargar pagos:", err);
            return [];
          }),
          listarReglasComision().catch((err) => {
            console.error("Error al cargar reglas:", err);
            return [];
          }),
          obtenerResumenEstadoCuenta({
            asesorId: asId,
            fechaDesde: fd || undefined,
            fechaHasta: fh || undefined,
          }).catch((err) => {
            console.error("Error al cargar resumen:", err);
            return {
              general: {
                totalVentas: 0,
                totalComisiones: 0,
                totalPagado: 0,
                saldoPendiente: 0,
                comisionesCount: 0,
                pendientesCount: 0,
                anticiposPendientes: 0,
                saldoNeto: 0,
              },
              porAsesor: [],
            };
          }),
        ]);

        if (nuevasComisiones) setComisiones(nuevasComisiones);
        if (nuevosPagos) setPagos(nuevosPagos);
        if (nuevasReglas) setReglas(nuevasReglas);
        if (nuevoResumen) setResumen(nuevoResumen);
      } catch (err: any) {
        console.error("Error al recargar datos:", err);
      }
    });
  };

  // Cargar datos frescos al montar en el cliente
  useEffect(() => {
    recargarDatos();
  }, []);

  const handleCancelarComision = async (c: Comision) => {
    const motivo = window.prompt(
      `¿Cancelar la comisión ${c.remisionFolio || "de inspección"} de ${c.asesorNombre} por ${formatoMoneda(c.montoComision)}?\n\nEscribe el motivo (ej. "Reasignada a otro asesor"):`
    );
    if (motivo === null) return;
    const res = await cancelarComision({ comisionId: c.id, motivo });
    if (res.ok) {
      setMensajeAlerta({ tipo: "ok", texto: "Comisión cancelada." });
      recargarDatos();
    } else {
      setMensajeAlerta({ tipo: "error", texto: res.error || "No se pudo cancelar la comisión." });
    }
  };

  const handleSincronizarRemisiones = async () => {
    try {
      setSincronizando(true);
      setMensajeAlerta(null);
      const res = await sincronizarTodasLasRemisionesPendientes();
      if (res.ok) {
        setMensajeAlerta({
          tipo: "ok",
          texto: `¡Sincronización completada! ${res.creadas} comisión(es) y/o inspección(es) procesada(s) exitosamente.`,
        });
        setFiltroPeriodo("historico");
        setFechaDesde("");
        setFechaHasta("");
        recargarDatos({ fDesde: "", fHasta: "" });
      } else {
        setMensajeAlerta({
          tipo: "error",
          texto: res.error || "No se pudieron sincronizar las remisiones.",
        });
      }
    } catch (err: any) {
      setMensajeAlerta({ tipo: "error", texto: err.message || "Error al sincronizar." });
    } finally {
      setSincronizando(false);
    }
  };

  // Exportar a Excel (CSV con formato)
  const handleExportarCSV = () => {
    if (comisionesFiltradas.length === 0) {
      alert("No hay registros disponibles para exportar con los filtros actuales.");
      return;
    }

    const encabezados = [
      "Folio Documento",
      "Tipo",
      "Fecha",
      "Asesor",
      "Cliente",
      "Empresa",
      "Servicio",
      "Monto Venta",
      "Costo Proveedor",
      "Comisión Bancaria",
      "Base Comisionable",
      "Porcentaje Comisión",
      "Comisión Generada",
      "Monto Pagado",
      "Saldo Pendiente",
      "Estatus",
      "Es Ajuste Manual",
      "Motivo Ajuste",
      "Notas",
    ];

    const filas = comisionesFiltradas.map((c) => [
      `"${c.remisionFolio || ""}"`,
      `"${c.remisionTipo || ""}"`,
      `"${c.fecha || ""}"`,
      `"${c.asesorNombre.replace(/"/g, '""')}"`,
      `"${c.clienteNombre.replace(/"/g, '""')}"`,
      `"${(c.clienteEmpresa || "").replace(/"/g, '""')}"`,
      `"${(c.servicioTipo || "").replace(/"/g, '""')}"`,
      c.montoVenta.toFixed(2),
      c.costoProveedor.toFixed(2),
      c.comisionBancaria.toFixed(2),
      c.baseComisionable.toFixed(2),
      `${c.porcentajeComision}%`,
      c.montoComision.toFixed(2),
      c.montoPagado.toFixed(2),
      c.saldoPendiente.toFixed(2),
      `"${c.estatus}"`,
      c.esAjusteManual ? "SÍ" : "NO",
      `"${(c.motivoAjuste || "").replace(/"/g, '""')}"`,
      `"${(c.notas || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "\uFEFF" + [encabezados.join(","), ...filas.map((f) => f.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const nombreArchivo = `comisiones_sauceda_${filtroAsesor}_${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", nombreArchivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const comisionesFiltradas = useMemo(() => {
    let lista = comisiones;
    // Filtro defensivo por asesor en el cliente: el servidor ya filtra por
    // asesor_id, pero se refuerza aquí para que la lista mostrada nunca
    // contradiga el selector, incluso si algún registro llega con datos
    // desincronizados (p. ej. una inspección reasignada de asesor).
    if (filtroAsesor !== "todos") {
      lista = lista.filter((c) => c.asesorId === filtroAsesor);
    }
    if (filtroTipo === "inspeccion") {
      lista = lista.filter((c) => c.tipoComision === "inspeccion");
    } else if (filtroTipo === "venta") {
      lista = lista.filter((c) => c.tipoComision !== "inspeccion");
    }
    return lista;
  }, [comisiones, filtroTipo, filtroAsesor]);

  const asesorSeleccionadoNombre = useMemo(() => {
    if (filtroAsesor === "todos") return "Todos los Asesores";
    return asesores.find((a) => a.id === filtroAsesor)?.nombre || "Asesor";
  }, [filtroAsesor, asesores]);

  const asesorSeleccionadoTelefono = useMemo(() => {
    if (filtroAsesor === "todos") return null;
    return comisiones.find((c) => c.asesorId === filtroAsesor)?.asesorTelefono || null;
  }, [filtroAsesor, comisiones]);

  const textoPeriodo = useMemo(() => {
    if (filtroPeriodo === "mes_actual") return "Mes Actual";
    if (filtroPeriodo === "mes_anterior") return "Mes Anterior";
    if (filtroPeriodo === "anio_actual") return "Año Actual";
    if (filtroPeriodo === "historico") return "Histórico Completo";
    return `${fechaDesde || "Inicio"} a ${fechaHasta || "Presente"}`;
  }, [filtroPeriodo, fechaDesde, fechaHasta]);

  return (
    <div className="space-y-6">
      {/* Alerta de notificación flotante */}
      {mensajeAlerta && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-md animate-in fade-in duration-200 ${
            mensajeAlerta.tipo === "ok"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <span>{mensajeAlerta.texto}</span>
          <button
            type="button"
            onClick={() => setMensajeAlerta(null)}
            className="text-carbon/50 hover:text-carbon p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-carbon/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-sauce font-semibold">
              Módulo Financiero y Comercial
            </span>
            <span className="bg-verde-profundo/10 text-verde-profundo text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Ventas · Remisiones · Facturas
            </span>
          </div>
          <h1 className="font-titular text-2xl sm:text-3xl font-bold tracking-tight text-carbon mt-1">
            Comisiones de Asesores
          </h1>
          <p className="text-xs text-carbon/60 mt-0.5">
            Gestión de comisiones parametrizables, liquidaciones, estados de cuenta y balances por asesor.
          </p>
        </div>

        {/* Acciones Globales */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSincronizarRemisiones}
            disabled={sincronizando}
            className="bg-slate-100 hover:bg-slate-200 text-carbon text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center gap-1.5 border border-carbon/10 disabled:opacity-50"
            title="Sincronizar remisiones de ventas e inspecciones técnicas ejecutadas para registrar comisiones faltantes"
          >
            <span className={sincronizando ? "animate-spin" : ""}>🔄</span>
            <span>{sincronizando ? "Sincronizando..." : "Sincronizar Comisiones e Inspecciones"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPagoAsesorId(filtroAsesor !== "todos" ? filtroAsesor : undefined);
              setPagoComisionId(undefined);
              setModalPagoAbierto(true);
            }}
            className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold px-4 py-2 rounded-xl transition shadow-md flex items-center gap-1.5"
          >
            <span>💳</span>
            <span>+ Registrar Pago / Liquidación</span>
          </button>
        </div>
      </div>

      {/* TARJETAS DE BALANCE / KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-carbon/10 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <span className="text-[11px] font-bold uppercase tracking-wider text-carbon/50 block">
            Ventas Comisionables
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-carbon mt-1 block">
            {formatoMoneda(resumen.general.totalVentas)}
          </span>
          <span className="text-[11px] text-carbon/60 mt-1 block">
            En {resumen.general.comisionesCount} ventas emitidas
          </span>
        </div>

        <div className="bg-white border border-carbon/10 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <span className="text-[11px] font-bold uppercase tracking-wider text-carbon/50 block">
            Comisiones Devengadas
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-blue-900 mt-1 block">
            {formatoMoneda(resumen.general.totalComisiones)}
          </span>
          <span className="text-[11px] text-blue-700/70 mt-1 block font-medium">
            Generadas según parámetros
          </span>
        </div>

        <div className="bg-white border border-emerald-100 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md bg-emerald-50/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
            Comisiones Pagadas
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-emerald-700 mt-1 block">
            {formatoMoneda(resumen.general.totalPagado)}
          </span>
          <span className="text-[11px] text-emerald-700/70 mt-1 block font-medium">
            Dispersadas a los asesores
          </span>
        </div>

        <div
          className={`rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md border ${
            resumen.general.saldoPendiente > 0
              ? "bg-amber-50/80 border-amber-300"
              : "bg-white border-carbon/10"
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">
            Balance Pendiente por Liquidar
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-amber-950 mt-1 block">
            {formatoMoneda(resumen.general.saldoPendiente)}
          </span>
          <span className="text-[11px] text-amber-900/80 mt-1 block font-medium">
            {resumen.general.pendientesCount} comisión(es) por liquidar
          </span>
          {resumen.general.anticiposPendientes > 0 && (
            <span className="text-[11px] text-blue-800 mt-1.5 pt-1.5 border-t border-amber-300/60 block font-semibold">
              💰 Anticipos a favor de SAUCEDA: {formatoMoneda(resumen.general.anticiposPendientes)}
              <span className="block font-mono font-bold text-blue-900">
                Saldo neto: {formatoMoneda(resumen.general.saldoNeto)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Pestañas de Navegación del Módulo */}
      <div className="flex border-b border-carbon/15 space-x-1 sm:space-x-4 overflow-x-auto text-xs font-bold">
        <button
          type="button"
          onClick={() => setPestana("desglose")}
          className={`py-3 px-3 sm:px-4 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            pestana === "desglose"
              ? "border-verde-profundo text-verde-profundo font-extrabold"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>📋</span>
          <span>Estado de Cuenta / Desglose</span>
          <span className="bg-slate-100 text-carbon/70 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {comisiones.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPestana("pagos")}
          className={`py-3 px-3 sm:px-4 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            pestana === "pagos"
              ? "border-verde-profundo text-verde-profundo font-extrabold"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>💵</span>
          <span>Historial de Pagos</span>
          <span className="bg-slate-100 text-carbon/70 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {pagos.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPestana("reglas")}
          className={`py-3 px-3 sm:px-4 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            pestana === "reglas"
              ? "border-verde-profundo text-verde-profundo font-extrabold"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>⚙️</span>
          <span>Parametrización y Reglas</span>
          <span className="bg-slate-100 text-carbon/70 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {reglas.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPestana("asesores")}
          className={`py-3 px-3 sm:px-4 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            pestana === "asesores"
              ? "border-verde-profundo text-verde-profundo font-extrabold"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>👥</span>
          <span>Resumen por Asesores</span>
          <span className="bg-slate-100 text-carbon/70 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
            {resumen.porAsesor.length}
          </span>
        </button>
      </div>

      {/* CONTENIDO SEGÚN LA PESTAÑA */}
      {pestana === "desglose" && (
        <div className="space-y-4">
          {/* Barra de Filtros y Herramientas */}
          <div className="bg-white border border-carbon/10 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Asesor */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60 mb-1">
                  Filtrar por Asesor
                </label>
                <select
                  value={filtroAsesor}
                  onChange={(e) => {
                    setFiltroAsesor(e.target.value);
                    recargarDatos({ asesor: e.target.value });
                  }}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 bg-white text-xs focus:border-verde-profundo outline-none"
                >
                  <option value="todos">Todos los Asesores</option>
                  {asesores.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Período */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60 mb-1">
                  Período de Ventas
                </label>
                <select
                  value={filtroPeriodo}
                  onChange={(e) => handleCambioPeriodo(e.target.value)}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 bg-white text-xs focus:border-verde-profundo outline-none"
                >
                  <option value="historico">Todo el Histórico</option>
                  <option value="mes_actual">Este Mes (Actual)</option>
                  <option value="mes_anterior">Mes Anterior</option>
                  <option value="anio_actual">Este Año (Completo)</option>
                  <option value="personalizado">Rango Personalizado</option>
                </select>
              </div>

              {/* Estatus */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60 mb-1">
                  Estatus de Pago
                </label>
                <select
                  value={filtroEstatus}
                  onChange={(e) => {
                    const val = e.target.value as EstatusComision | "todas";
                    setFiltroEstatus(val);
                    recargarDatos({ estatus: val });
                  }}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 bg-white text-xs focus:border-verde-profundo outline-none"
                >
                  <option value="todas">Todas las comisiones</option>
                  <option value="pendiente">Pendientes de Pago</option>
                  <option value="parcial">Con Pago Parcial</option>
                  <option value="pagada">Pagadas / Finiquitadas</option>
                  <option value="cancelada">Canceladas</option>
                </select>
              </div>

              {/* Tipo de comisión */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60 mb-1">
                  Tipo de Comisión
                </label>
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value as "todas" | "venta" | "inspeccion")}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 bg-white text-xs focus:border-verde-profundo outline-none"
                >
                  <option value="todas">Todas</option>
                  <option value="venta">Ventas / Instalación</option>
                  <option value="inspeccion">Inspección</option>
                </select>
              </div>

              {/* Búsqueda rápida */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60 mb-1">
                  Búsqueda Rápida
                </label>
                <input
                  type="text"
                  placeholder="Folio, cliente, empresa, servicio..."
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    recargarDatos({ q: e.target.value });
                  }}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo outline-none"
                />
              </div>
            </div>

            {/* Fechas personalizadas si aplica */}
            {filtroPeriodo === "personalizado" && (
              <div className="pt-2 border-t border-carbon/5 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-carbon/70">Rango de fechas:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="border border-carbon/20 rounded-lg px-2 py-1 text-xs outline-none"
                  />
                  <span>al</span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="border border-carbon/20 rounded-lg px-2 py-1 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => recargarDatos({ fDesde: fechaDesde, fHasta: fechaHasta })}
                    className="bg-verde-profundo text-crema px-3 py-1 rounded-lg text-xs font-semibold hover:bg-verde-profundo/90 transition"
                  >
                    Filtrar
                  </button>
                </div>
              </div>
            )}

            {/* Botones de Exportación y Envío */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-carbon/5">
              <span className="text-xs text-carbon/60">
                Mostrando <strong>{comisionesFiltradas.length}</strong> comisiones en el desglose
                {isPending && <span className="ml-2 text-dorado animate-pulse">Cargando...</span>}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportarCSV}
                  className="bg-slate-100 hover:bg-slate-200 text-carbon border border-carbon/15 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                  title="Descargar archivo Excel / CSV"
                >
                  <span>📥</span>
                  <span>Exportar Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalImprimirAbierto(true)}
                  className="bg-dorado/90 hover:bg-dorado text-verde-profundo px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                  title="Generar vista membretada para impresión o PDF"
                >
                  <span>🖨️</span>
                  <span>Estado de Cuenta Imprimible</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE MOVIMIENTOS */}
          <div className="bg-white border border-carbon/10 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-carbon/10 text-carbon/70 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Folio / Fecha</th>
                    <th className="py-3 px-4">Asesor</th>
                    <th className="py-3 px-4">Cliente / Empresa</th>
                    <th className="py-3 px-4">Servicio</th>
                    <th className="py-3 px-4 text-right">Venta</th>
                    <th className="py-3 px-4 text-right">Base Comisionable</th>
                    <th className="py-3 px-4 text-center">% Com.</th>
                    <th className="py-3 px-4 text-right">Comisión</th>
                    <th className="py-3 px-4 text-right">Pagado</th>
                    <th className="py-3 px-4 text-right">Saldo Pend.</th>
                    <th className="py-3 px-4 text-center">Estatus</th>
                    <th className="py-3 px-2 text-center sticky right-0 z-10 bg-slate-50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {comisionesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-carbon/50">
                        <div className="max-w-sm mx-auto space-y-2">
                          <span className="text-3xl block">📑</span>
                          <p className="font-semibold text-sm">No se encontraron comisiones</p>
                          <p className="text-xs">
                            No hay comisiones registradas con los filtros seleccionados o faltan remisiones por sincronizar.
                          </p>
                          <button
                            type="button"
                            onClick={handleSincronizarRemisiones}
                            className="bg-verde-profundo text-crema px-3 py-1.5 rounded-xl text-xs font-bold mt-2"
                          >
                            Sincronizar Remisiones Ahora
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    comisionesFiltradas.map((c) => (
                      <tr key={c.id} className={`hover:bg-slate-50/70 transition ${c.tipoComision === "inspeccion" ? "bg-amber-50/20" : ""}`}>
                        {/* Folio / Fecha */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-verde-profundo">
                              {c.remisionFolio || (c.tipoComision === "inspeccion" ? "INSP" : "S/F")}
                            </span>
                            <span
                              className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                                c.tipoComision === "inspeccion" || c.remisionTipo === "inspeccion"
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : c.remisionTipo === "factura"
                                  ? "bg-purple-100 text-purple-800"
                                  : c.remisionTipo === "recibo"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {c.tipoComision === "inspeccion" || c.remisionTipo === "inspeccion"
                                ? "🔍 INSP"
                                : c.remisionTipo === "factura"
                                ? "FAC"
                                : c.remisionTipo === "recibo"
                                ? "REC"
                                : "REM"}
                            </span>
                          </div>
                          <span className="text-[10px] text-carbon/50 block font-sans">
                            {new Date(c.fecha).toLocaleDateString("es-MX")}
                          </span>
                        </td>

                        {/* Asesor */}
                        <td className="py-3 px-4 font-semibold text-carbon">
                          {c.asesorNombre}
                        </td>

                        {/* Cliente / Empresa */}
                        <td className="py-3 px-4 max-w-[180px]">
                          <span className="font-medium text-carbon truncate block" title={c.clienteNombre}>
                            {c.clienteNombre}
                          </span>
                          {c.expedienteId && (
                            <a
                              href={`/expediente/${c.expedienteId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-verde-profundo hover:underline font-bold block truncate"
                              title="Abrir expediente en nueva pestaña"
                            >
                              📁 Expediente #{c.expedienteId.slice(0, 8)}...
                            </a>
                          )}
                          {c.clienteEmpresa && (
                            <span className="text-[10px] text-carbon/60 block truncate" title={c.clienteEmpresa}>
                              🏢 {c.clienteEmpresa}
                            </span>
                          )}
                        </td>

                        {/* Servicio */}
                        <td className="py-3 px-4 capitalize text-carbon/80 whitespace-nowrap">
                          {c.tipoComision === "inspeccion"
                            ? "🔍 Inspección Técnica"
                            : (c.servicioTipo?.replace(/_/g, " ") || "Construcción")}
                        </td>

                        {/* Venta */}
                        <td className="py-3 px-4 text-right font-mono font-medium text-carbon whitespace-nowrap">
                          {c.tipoComision === "inspeccion" ? (
                            <span className="text-[11px] text-carbon/40 italic">Tarifa Fija</span>
                          ) : (
                            formatoMoneda(c.montoVenta)
                          )}
                        </td>

                        {/* Base Comisionable = Venta - Costo Proveedor - Comisión Bancaria */}
                        <td className="py-3 px-4 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                          {formatoMoneda(c.baseComisionable)}
                          {c.tipoComision !== "inspeccion" && (c.costoProveedor > 0 || c.comisionBancaria > 0) && (
                            <span
                              className="block text-[9px] text-carbon/40 font-normal cursor-help"
                              title={`Venta ${formatoMoneda(c.montoVenta)} − Proveedor ${formatoMoneda(c.costoProveedor)} − Banco ${formatoMoneda(c.comisionBancaria)}`}
                            >
                              −{formatoMoneda(c.costoProveedor + c.comisionBancaria)}
                            </span>
                          )}
                        </td>

                        {/* % Comisión */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {c.tipoComision === "inspeccion" ? (
                            <span className="font-mono font-bold text-amber-800 text-[10px] bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                              FIJA
                            </span>
                          ) : (
                            <span className="font-mono font-semibold">{c.porcentajeComision}%</span>
                          )}
                          {c.esAjusteManual && (
                            <span
                              className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-bold block mt-0.5 cursor-help"
                              title={`Ajuste manual: ${c.motivoAjuste || "Sin motivo especificado"}`}
                            >
                              manual
                            </span>
                          )}
                        </td>

                        {/* Monto Comisión */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-900 whitespace-nowrap">
                          {formatoMoneda(c.montoComision)}
                        </td>

                        {/* Monto Pagado */}
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 whitespace-nowrap">
                          {formatoMoneda(c.montoPagado)}
                        </td>

                        {/* Saldo Pendiente */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-950 whitespace-nowrap">
                          {formatoMoneda(c.saldoPendiente)}
                        </td>

                        {/* Estatus */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.estatus === "pagada"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : c.estatus === "parcial"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : c.estatus === "cancelada"
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                            }`}
                          >
                            {c.estatus}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="py-3 px-2 text-center whitespace-nowrap sticky right-0 z-10 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setComisionParaAjustar(c)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-carbon/70 hover:text-carbon transition text-xs"
                              title="Ajustar porcentaje o monto de esta comisión"
                            >
                              ✏️
                            </button>

                            {c.saldoPendiente > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPagoAsesorId(c.asesorId);
                                  setPagoComisionId(c.id);
                                  setModalPagoAbierto(true);
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition text-xs font-semibold"
                                title="Registrar pago o abono a esta comisión"
                              >
                                💳
                              </button>
                            )}

                            {c.estatus !== "cancelada" && c.montoPagado <= 0 && (
                              <button
                                type="button"
                                onClick={() => handleCancelarComision(c)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition text-xs"
                                title="Cancelar esta comisión (deja de contar en el balance)"
                              >
                                🗑️
                              </button>
                            )}

                            {c.expedienteId && (
                              <a
                                href={`/expediente/${c.expedienteId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-verde-profundo hover:text-sauce transition text-xs font-bold"
                                title="Abrir expediente en nueva pestaña"
                              >
                                📁
                              </a>
                            )}

                            {c.cotizacionToken && (
                              <a
                                href={`/cotizacion/remision/${c.cotizacionToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-carbon/60 hover:text-carbon transition text-xs"
                                title="Ver documento oficial de remisión / factura"
                              >
                                📄
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA: HISTORIAL DE PAGOS */}
      {pestana === "pagos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-titular text-lg font-bold text-carbon">
              Historial de Pagos y Finiquitos a Asesores
            </h2>
            <button
              type="button"
              onClick={() => {
                setPagoAsesorId(filtroAsesor !== "todos" ? filtroAsesor : undefined);
                setPagoComisionId(undefined);
                setModalPagoAbierto(true);
              }}
              className="bg-verde-profundo text-crema text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <span>+ Nuevo Pago</span>
            </button>
          </div>

          <div className="bg-white border border-carbon/10 rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-carbon/10 text-carbon/70 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fecha Pago</th>
                  <th className="py-3 px-4">Asesor</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4">Referencia / Folio</th>
                  <th className="py-3 px-4">Ventas / Remisiones Cubiertas</th>
                  <th className="py-3 px-4 text-right">Monto Dispersado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/5">
                {pagos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-carbon/50">
                      No hay registros de pagos aplicados todavía.
                    </td>
                  </tr>
                ) : (
                  pagos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-medium">
                        {new Date(p.fechaPago).toLocaleDateString("es-MX")}
                      </td>
                      <td className="py-3 px-4 font-bold text-carbon">
                        {p.asesorNombre}
                      </td>
                      <td className="py-3 px-4 capitalize">
                        {p.metodoPago}
                      </td>
                      <td className="py-3 px-4 font-mono text-carbon/70">
                        {p.referencia || "Sin referencia"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(p.detalles || []).map((d) => (
                            <span
                              key={d.id}
                              className="bg-slate-100 border border-carbon/10 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md"
                            >
                              {d.remisionFolio}: {formatoMoneda(d.montoAplicado)}
                            </span>
                          ))}
                        </div>
                        {p.notas && <p className="text-[10px] text-carbon/50 mt-1">{p.notas}</p>}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800 text-sm">
                        {formatoMoneda(p.monto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: PARAMETRIZACIÓN Y REGLAS */}
      {pestana === "reglas" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-titular text-lg font-bold text-carbon">
                Parámetros y Reglas de Comisiones
              </h2>
              <p className="text-xs text-carbon/60">
                Configure la tarifa fija por inspección técnica ejecutada, porcentajes base por tipo de servicio o excepciones por asesor.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReglaParaEditar("nueva")}
              className="bg-verde-profundo text-crema text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <span>+ Nueva Regla</span>
            </button>
          </div>

          {/* TARJETA DESTACADA: TARIFA FIJA POR INSPECCIÓN TÉCNICA */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-500/10 border-2 border-amber-300 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <h3 className="font-bold text-sm text-carbon flex items-center gap-2">
                      <span>Tarifa Fija por Inspección Técnica en Sitio</span>
                      <span className="bg-amber-200/90 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Generación Automática
                      </span>
                    </h3>
                    <p className="text-xs text-carbon/70 mt-0.5">
                      Esta tarifa se acredita automáticamente al asesor asignado cuando una inspección de un expediente se marca como ejecutada, <strong>independientemente de si la venta se concreta o no</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0 bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-carbon/60 mb-0.5">
                    Tarifa Base General
                  </label>
                  <div className="flex items-center gap-1 font-mono font-bold text-base text-carbon">
                    <span className="text-amber-700">$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={tarifaInspeccion}
                      onChange={(e) => setTarifaInspeccion(parseFloat(e.target.value) || 0)}
                      className="w-24 border border-carbon/20 rounded-lg px-2 py-1 text-sm font-bold text-carbon focus:border-verde-profundo outline-none"
                    />
                    <span className="text-xs text-carbon/50">MXN</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={guardandoTarifa}
                  onClick={async () => {
                    try {
                      setGuardandoTarifa(true);
                      const res = await guardarTarifaInspeccionGeneral(tarifaInspeccion);
                      if (!res.ok) throw new Error(res.error || "No se pudo actualizar");
                      setMensajeAlerta({
                        tipo: "ok",
                        texto: `Tarifa fija de inspección actualizada a ${formatoMoneda(tarifaInspeccion)} MXN exitosamente.`,
                      });
                      recargarDatos();
                    } catch (e: any) {
                      setMensajeAlerta({
                        tipo: "error",
                        texto: e.message || "Error al actualizar tarifa.",
                      });
                    } finally {
                      setGuardandoTarifa(false);
                    }
                  }}
                  className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold px-3.5 py-2.5 rounded-lg transition disabled:opacity-50 shadow-xs"
                >
                  {guardandoTarifa ? "Guardando..." : "Guardar Tarifa"}
                </button>
              </div>
            </div>
          </div>

          {/* Reglas de Inspección */}
          <div className="bg-white border border-carbon/10 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 bg-amber-50/60 border-b border-carbon/10 font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>🔍</span> Reglas de Comisión por Inspecciones Técnicas
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 border-b border-carbon/5 text-carbon/60 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Clave</th>
                    <th className="py-2.5 px-4">Descripción</th>
                    <th className="py-2.5 px-4 text-center">Tarifa Fija ($ MXN)</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                    <th className="py-2.5 px-4">Notas</th>
                    <th className="py-2.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {reglas.filter((r) => r.tipo === "inspeccion").length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-carbon/50">
                        No hay reglas de inspección adicionales. Se usa la tarifa base general.
                      </td>
                    </tr>
                  ) : (
                    reglas
                      .filter((r) => r.tipo === "inspeccion")
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-mono font-bold text-amber-900">
                            {r.clave}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-carbon">
                            {r.etiqueta}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-800 text-sm">
                            {formatoMoneda(r.montoFijo || 0)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                r.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-carbon/60"
                              }`}
                            >
                              {r.activo ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-carbon/60 text-[11px]">
                            {r.notas || "-"}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setReglaParaEditar(r)}
                                className="px-2 py-1 text-xs text-verde-profundo font-semibold hover:underline"
                              >
                                Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reglas por tipo de servicio */}
          <div className="bg-white border border-carbon/10 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-carbon/10 font-bold text-xs uppercase tracking-wider text-carbon/70">
              Reglas por Tipo de Producto o Servicio
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 border-b border-carbon/5 text-carbon/60 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Clave</th>
                    <th className="py-2.5 px-4">Servicio / Descripción</th>
                    <th className="py-2.5 px-4 text-center">Porcentaje (%)</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                    <th className="py-2.5 px-4">Notas</th>
                    <th className="py-2.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {reglas
                    .filter((r) => r.tipo === "servicio" || r.tipo === "global")
                    .map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-mono font-bold text-verde-profundo">
                          {r.clave}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-carbon">
                          {r.etiqueta}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-blue-900 text-sm">
                          {r.porcentaje}%
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-carbon/60"
                            }`}
                          >
                            {r.activo ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-carbon/60 text-[11px]">
                          {r.notas || "-"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setReglaParaEditar(r)}
                              className="px-2 py-1 text-xs text-verde-profundo font-semibold hover:underline"
                            >
                              Editar
                            </button>
                            {r.clave !== "general" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`¿Eliminar la regla "${r.etiqueta}"?`)) {
                                    await eliminarReglaComision(r.id);
                                    recargarDatos();
                                  }
                                }}
                                className="px-2 py-1 text-xs text-red-600 hover:underline"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reglas especiales por asesor o producto */}
          <div className="bg-white border border-carbon/10 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-carbon/10 font-bold text-xs uppercase tracking-wider text-carbon/70 flex items-center justify-between">
              <span>Reglas Particulares por Asesor o Producto de Catálogo</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 border-b border-carbon/5 text-carbon/60 text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Beneficiario / Clave</th>
                    <th className="py-2.5 px-4 text-center">Porcentaje (%)</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                    <th className="py-2.5 px-4">Notas</th>
                    <th className="py-2.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {reglas.filter((r) => r.tipo === "asesor" || r.tipo === "producto").length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-carbon/50">
                        No hay reglas particulares configuradas. Puede crear una para fijar comisiones especiales para un asesor en particular.
                      </td>
                    </tr>
                  ) : (
                    reglas
                      .filter((r) => r.tipo === "asesor" || r.tipo === "producto")
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-mono uppercase text-[10px] font-bold text-sauce">
                            {r.tipo}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-carbon">
                            {r.asesorNombre || r.etiqueta}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-blue-900 text-sm">
                            {r.porcentaje}%
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                r.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-carbon/60"
                              }`}
                            >
                              {r.activo ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-carbon/60 text-[11px]">
                            {r.notas || "-"}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setReglaParaEditar(r)}
                                className="px-2 py-1 text-xs text-verde-profundo font-semibold hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`¿Eliminar la regla "${r.etiqueta}"?`)) {
                                    await eliminarReglaComision(r.id);
                                    recargarDatos();
                                  }
                                }}
                                className="px-2 py-1 text-xs text-red-600 hover:underline"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA: RESUMEN POR ASESORES (BALANCE) */}
      {pestana === "asesores" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-titular text-lg font-bold text-carbon">
              Balance y Estado de Cuenta por Asesor
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resumen.porAsesor.map((a) => (
              <div
                key={a.asesorId}
                className="bg-white border border-carbon/10 rounded-2xl p-5 shadow-xs hover:shadow-md transition space-y-4"
              >
                <div className="flex items-center justify-between border-b border-carbon/10 pb-3">
                  <div>
                    <h3 className="font-titular text-base font-bold text-verde-profundo">
                      {a.asesorNombre}
                    </h3>
                    <span className="text-xs text-carbon/50 font-mono">
                      {a.asesorTelefono || "Teléfono no registrado"}
                    </span>
                  </div>
                  <span className="bg-slate-100 text-carbon/70 text-xs px-2.5 py-1 rounded-full font-bold">
                    {a.comisionesCount} ventas
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-carbon/60">Ventas Totales:</span>
                    <span className="font-mono font-semibold text-carbon">
                      {formatoMoneda(a.totalVentas)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-carbon/60">Comisión Total Devengada:</span>
                    <span className="font-mono font-semibold text-blue-900">
                      {formatoMoneda(a.totalComisiones)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-carbon/60">Comisión Pagada:</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {formatoMoneda(a.totalPagado)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <span className="text-amber-950">Saldo Pendiente:</span>
                    <span className="font-mono text-amber-950 text-sm">
                      {formatoMoneda(a.saldoPendiente)}
                    </span>
                  </div>
                  {a.anticiposPendientes > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-blue-800">💰 Anticipo a favor de SAUCEDA:</span>
                        <span className="font-mono font-semibold text-blue-800">
                          -{formatoMoneda(a.anticiposPendientes)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 font-bold">
                        <span className={a.saldoNeto < 0 ? "text-red-700" : "text-verde-profundo"}>
                          Saldo Neto:
                        </span>
                        <span
                          className={`font-mono text-sm ${
                            a.saldoNeto < 0 ? "text-red-700" : "text-verde-profundo"
                          }`}
                        >
                          {formatoMoneda(a.saldoNeto)}
                        </span>
                      </div>
                      {a.saldoNeto < 0 && (
                        <p className="text-[10px] text-red-600 italic">
                          El asesor le debe a SAUCEDA (anticipo aún no cubierto por comisiones).
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroAsesor(a.asesorId);
                      setPestana("desglose");
                      recargarDatos({ asesor: a.asesorId });
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-carbon py-2 rounded-xl text-xs font-bold transition text-center"
                  >
                    Ver Desglose
                  </button>

                  {a.saldoPendiente > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPagoAsesorId(a.asesorId);
                        setPagoComisionId(undefined);
                        setModalPagoAbierto(true);
                      }}
                      className="flex-1 bg-verde-profundo hover:bg-verde-profundo/90 text-crema py-2 rounded-xl text-xs font-bold transition text-center"
                    >
                      Pagar Saldo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALES */}
      {comisionParaAjustar && (
        <ModalAjustarComision
          comision={comisionParaAjustar}
          alCerrar={() => setComisionParaAjustar(null)}
          alGuardar={() => {
            setComisionParaAjustar(null);
            recargarDatos();
          }}
        />
      )}

      {modalPagoAbierto && (
        <ModalRegistrarPagoComision
          asesores={asesores}
          comisionesPendientes={comisionesFiltradas}
          asesorIdInicial={pagoAsesorId}
          comisionInicialId={pagoComisionId}
          alCerrar={() => setModalPagoAbierto(false)}
          alGuardar={() => {
            setModalPagoAbierto(false);
            recargarDatos();
          }}
        />
      )}

      {reglaParaEditar && (
        <ModalReglaComision
          regla={reglaParaEditar === "nueva" ? null : reglaParaEditar}
          asesores={asesores}
          alCerrar={() => setReglaParaEditar(null)}
          alGuardar={() => {
            setReglaParaEditar(null);
            recargarDatos();
          }}
        />
      )}

      {modalImprimirAbierto && (
        <ModalEstadoCuentaImprimible
          asesorNombre={asesorSeleccionadoNombre}
          asesorTelefono={asesorSeleccionadoTelefono}
          periodoTexto={textoPeriodo}
          comisiones={comisionesFiltradas}
          pagos={pagos}
          alCerrar={() => setModalImprimirAbierto(false)}
        />
      )}
    </div>
  );
}
