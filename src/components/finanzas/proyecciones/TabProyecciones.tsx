"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { BusinessUnit, Category } from "@/app/actions/finanzas";
import type {
  EscenarioFinanciero,
  IndicadorBaseReal,
  VariacionRealPlan,
  DiagnosticoSofiaProyeccion
} from "@/app/actions/finanzas-proyecciones";
import {
  listarEscenarios,
  obtenerBaseReal,
  marcarEscenarioActivo,
  eliminarEscenario,
  calcularProyeccion,
  obtenerRealVsPlan,
  actualizarSupuesto,
  aplicarATodosLosMeses,
  restaurarAlReal,
  eliminarLinea,
  generarLecturaSofiaProyeccion,
  obtenerInsumosEscenario,
  actualizarFijo,
  agregarConceptoFijo,
  editarConceptoFijo,
  eliminarConceptoFijo
} from "@/app/actions/finanzas-proyecciones";
import type { ResultadoProyeccion, SupuestoMes, FijoPlan } from "@/lib/finanzas/proyeccion";
import { exportarAExcelCSV } from "@/lib/finanzasExport";
import { ModalNuevoEscenario } from "./ModalNuevoEscenario";
import { ModalDuplicarEscenario } from "./ModalDuplicarEscenario";
import { ModalNuevoNegocio } from "./ModalNuevoNegocio";
import { PanelLineaSupuestos } from "./PanelLineaSupuestos";
import { TablaPnlProyectado } from "./TablaPnlProyectado";

import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";

interface TabProyeccionesProps {
  businessUnits: BusinessUnit[];
  categories: Category[];
}

type SubSeccionId = "proyeccion" | "supuestos" | "base_real" | "real_vs_plan" | "sofia";

type VariableSupuesto =
  | "operaciones_manual"
  | "leads"
  | "pct_a_cotizacion"
  | "pct_cierre"
  | "ticket_promedio"
  | "margen_pct"
  | "pct_comision_asesor"
  | "cac"
  | "pct_comision_pasarela";

// Vistas del grid: todas las variables de una línea, una variable de todas las líneas, o gastos fijos
type VistaSupuestos = "linea" | "variable" | "fijos";

const VARIABLES_CATALOGO: Array<{ id: VariableSupuesto; label: string; unidad: string }> = [
  { id: "operaciones_manual", label: "Operaciones (Manual)", unidad: "ops" },
  { id: "leads", label: "Leads Captados (Embudo)", unidad: "leads" },
  { id: "pct_a_cotizacion", label: "% Conversión a Cotización", unidad: "%" },
  { id: "pct_cierre", label: "% Conversión a Cierre", unidad: "%" },
  { id: "ticket_promedio", label: "Ticket Promedio", unidad: "$" },
  { id: "margen_pct", label: "Margen Bruto", unidad: "%" },
  { id: "pct_comision_asesor", label: "% Comisión Asesor", unidad: "%" },
  { id: "cac", label: "Marketing: CAC (costo por cliente)", unidad: "$" },
  { id: "pct_comision_pasarela", label: "% Comisión Pasarela / Tarjeta", unidad: "%" }
];

// Variables que solo aplican a un modelo de línea
const SOLO_EMBUDO: VariableSupuesto[] = ["leads", "pct_a_cotizacion", "pct_cierre"];
const SOLO_MANUAL: VariableSupuesto[] = ["operaciones_manual"];

// Fijos sin unidad de negocio: gastos generales (overhead) de toda la empresa
const GASTOS_GENERALES = "Gastos Generales";

// Los porcentajes se guardan como 0..1 y se muestran como 0..100
const valorParaMostrar = (campo: VariableSupuesto, raw: number | null | undefined): string => {
  if (raw === null || raw === undefined || isNaN(Number(raw))) return "";
  const n = Number(raw);
  const v = campo.includes("pct") && n <= 1 ? n * 100 : n;
  return String(Math.round(v * 100) / 100);
};

const formatMXN = (val: number) => {
  const n = Math.round(val || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-MX")}`;
};

// % de un monto sobre su base, para las relaciones verticales de las tablas
const pctSobre = (valor: number, base: number) =>
  base > 0 ? `${((valor / base) * 100).toFixed(1)}%` : "—";

const formatPct = (val: number) =>
  `${(val || 0).toFixed(1)}%`;

export function TabProyecciones({ businessUnits, categories }: TabProyeccionesProps) {
  // Cuentas del catálogo de Finanzas a las que puede enlazarse un gasto fijo
  const cuentasEgreso = useMemo(
    // Marketing no va en fijos: se calcula por línea con el CAC
    () =>
      categories.filter(
        (c) => c.tipo === "egreso" && c.linea_pnl !== "no_pnl" && c.linea_pnl !== "costo_marketing"
      ),
    [categories]
  );
  // Estado de navegación
  const [seccionActiva, setSeccionActiva] = useState<SubSeccionId>("proyeccion");
  const [vistaAgrupacion, setVistaAgrupacion] = useState<"mes" | "trimestre">("mes");
  const [variableActiva, setVariableActiva] = useState<VariableSupuesto>("operaciones_manual");
  const [vistaSupuestos, setVistaSupuestos] = useState<VistaSupuestos>("linea");
  const [lineaSeleccionadaId, setLineaSeleccionadaId] = useState<string>("");

  // Escenarios
  const [escenarios, setEscenarios] = useState<EscenarioFinanciero[]>([]);
  const [escenarioSeleccionadoId, setEscenarioSeleccionadoId] = useState<string>("");
  const [cargandoEscenarios, setCargandoEscenarios] = useState(true);

  // Datos calculados
  const [proyeccion, setProyeccion] = useState<ResultadoProyeccion | null>(null);
  const [baseReal, setBaseReal] = useState<IndicadorBaseReal[]>([]);
  const [realVsPlan, setRealVsPlan] = useState<VariacionRealPlan[]>([]);
  const [cargandoCalculo, setCargandoCalculo] = useState(false);
  const [insumos, setInsumos] = useState<{ supuestos: SupuestoMes[]; fijos: FijoPlan[] }>({
    supuestos: [],
    fijos: []
  });

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalDuplicar, setModalDuplicar] = useState(false);
  const [modalNuevoNegocio, setModalNuevoNegocio] = useState(false);

  // Diagnóstico Sofía
  const [diagnosticoSofia, setDiagnosticoSofia] = useState<DiagnosticoSofiaProyeccion | null>(null);
  const [cargandoSofia, setCargandoSofia] = useState(false);

  // Feedback de guardado en supuestos
  const [guardandoCelda, setGuardandoCelda] = useState<string | null>(null);

  // 1. Cargar lista de escenarios inicial
  const cargarEscenarios = useCallback(async () => {
    setCargandoEscenarios(true);
    try {
      const lista = await listarEscenarios();
      setEscenarios(lista);
      if (lista.length > 0) {
        // Seleccionar el activo o el primero
        const act = lista.find((e) => e.es_activo) || lista[0];
        setEscenarioSeleccionadoId(act.id);
      }
    } catch (err) {
      console.error("Error al cargar escenarios:", err);
    } finally {
      setCargandoEscenarios(false);
    }
  }, []);

  useEffect(() => {
    cargarEscenarios();
  }, [cargarEscenarios]);

  // 2. Cargar cálculo del escenario seleccionado y base real
  // `silencioso` recalcula sin ocultar el contenido (para ediciones en el grid)
  const cargarDatosEscenario = useCallback(async (escId: string, silencioso = false) => {
    if (!escId) return;
    if (!silencioso) setCargandoCalculo(true);
    try {
      const [resProy, resBase, resComp, resInsumos] = await Promise.all([
        calcularProyeccion(escId),
        obtenerBaseReal(3),
        obtenerRealVsPlan(escId),
        obtenerInsumosEscenario(escId)
      ]);
      setProyeccion(resProy);
      setBaseReal(resBase);
      setRealVsPlan(resComp);
      setInsumos(resInsumos);
    } catch (err) {
      console.error("Error al calcular proyección:", err);
    } finally {
      if (!silencioso) setCargandoCalculo(false);
    }
  }, []);

  useEffect(() => {
    if (escenarioSeleccionadoId) {
      cargarDatosEscenario(escenarioSeleccionadoId);
    }
  }, [escenarioSeleccionadoId, cargarDatosEscenario]);

  const escenarioActual = useMemo(
    () => escenarios.find((e) => e.id === escenarioSeleccionadoId) || null,
    [escenarios, escenarioSeleccionadoId]
  );

  // Handlers de Escenario
  const handleMarcarActivo = async () => {
    if (!escenarioSeleccionadoId) return;
    try {
      await marcarEscenarioActivo(escenarioSeleccionadoId);
      await cargarEscenarios();
    } catch (err: any) {
      alert("Error al marcar como activo: " + err.message);
    }
  };

  const handleEliminarEscenario = async () => {
    if (!escenarioActual) return;
    if (!confirm(`¿Eliminar definitivamente el escenario '${escenarioActual.nombre}'?`)) return;
    try {
      await eliminarEscenario(escenarioActual.id);
      await cargarEscenarios();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  // Handlers de Supuestos en Vivo
  const handleEditarSupuesto = async (
    lineaId: string,
    mes: string,
    campo: VariableSupuesto,
    valorRaw: string
  ) => {
    let valor = parseFloat(valorRaw);
    if (isNaN(valor)) valor = 0;
    // Normalizar porcentajes si aplica
    if (campo.includes("pct")) {
      valor = valor / 100;
    }

    const key = `${lineaId}:${mes}:${campo}`;
    setGuardandoCelda(key);
    try {
      await actualizarSupuesto(lineaId, mes, campo, valor);
      if (escenarioSeleccionadoId) {
        await cargarDatosEscenario(escenarioSeleccionadoId, true);
      }
    } catch (err: any) {
      console.error("Error al actualizar celda:", err);
    } finally {
      setGuardandoCelda(null);
    }
  };

  const handleAplicarATodos = async (
    lineaId: string,
    campo: VariableSupuesto,
    valorActual: number | null
  ) => {
    if (!confirm(`¿Aplicar el valor del primer mes a todos los meses de esta línea?`)) return;
    try {
      await aplicarATodosLosMeses(lineaId, campo, valorActual);
      if (escenarioSeleccionadoId) {
        await cargarDatosEscenario(escenarioSeleccionadoId, true);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleRestaurarReal = async (lineaId: string) => {
    if (!confirm(`¿Restaurar los supuestos de esta línea al promedio real histórico del CRM?`)) return;
    try {
      await restaurarAlReal(lineaId);
      if (escenarioSeleccionadoId) {
        await cargarDatosEscenario(escenarioSeleccionadoId);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleEliminarLinea = async (lineaId: string, nombre: string) => {
    if (!confirm(`¿Eliminar la línea de negocio '${nombre}' de este escenario?`)) return;
    try {
      await eliminarLinea(lineaId);
      if (escenarioSeleccionadoId) {
        await cargarDatosEscenario(escenarioSeleccionadoId);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Supuestos guardados indexados por `linea_id:mes`
  const supuestosMap = useMemo(() => {
    const map = new Map<string, SupuestoMes>();
    insumos.supuestos.forEach((s) => map.set(`${s.linea_id}:${s.mes}`, s));
    return map;
  }, [insumos.supuestos]);

  // Líneas agrupadas por unidad de negocio (respeta el orden del escenario)
  const lineasAgrupadas = useMemo(() => {
    if (!proyeccion) return [];
    const grupos = new Map<string, { nombre: string; lineas: ResultadoProyeccion["por_linea"][string][] }>();
    Object.values(proyeccion.por_linea).forEach((l) => {
      const k = l.business_unit_id || "null";
      const g = grupos.get(k) || { nombre: l.business_unit_nombre, lineas: [] };
      g.lineas.push(l);
      grupos.set(k, g);
    });
    return Array.from(grupos.entries()).map(([buId, g]) => ({ buId, ...g }));
  }, [proyeccion]);

  // Gastos fijos agrupados por concepto + unidad de negocio
  const fijosAgrupados = useMemo(() => {
    const grupos = new Map<
      string,
      {
        concepto: string;
        linea_pnl: string;
        categoria_id: string | null;
        business_unit_id: string | null;
        business_unit_nombre: string;
        por_mes: Record<string, number>;
      }
    >();
    insumos.fijos.forEach((f) => {
      const k = `${f.concepto}|${f.business_unit_id || "null"}`;
      const g = grupos.get(k) || {
        concepto: f.concepto,
        linea_pnl: f.linea_pnl,
        categoria_id: f.categoria_id ?? null,
        business_unit_id: f.business_unit_id,
        business_unit_nombre: f.business_unit_id ? f.business_unit_nombre || "Unidad" : GASTOS_GENERALES,
        por_mes: {}
      };
      g.por_mes[f.mes] = (g.por_mes[f.mes] || 0) + Number(f.monto || 0);
      grupos.set(k, g);
    });
    // Unidades primero (alfabético) y al final los gastos generales de la empresa
    return Array.from(grupos.values()).sort((a, b) => {
      if (!a.business_unit_id !== !b.business_unit_id) return a.business_unit_id ? -1 : 1;
      return (
        a.business_unit_nombre.localeCompare(b.business_unit_nombre) ||
        a.concepto.localeCompare(b.concepto)
      );
    });
  }, [insumos.fijos]);

  // Handlers de Gastos Fijos
  const [nuevoFijo, setNuevoFijo] = useState<{
    concepto: string;
    categoria_id: string;
    business_unit_id: string;
    monto: string;
  } | null>(null);

  const handleEditarFijo = async (
    concepto: string,
    businessUnitId: string | null,
    mes: string | null,
    valorRaw: string
  ) => {
    let monto = parseFloat(valorRaw);
    if (isNaN(monto)) monto = 0;
    if (!escenarioSeleccionadoId) return;
    if (mes === null && !confirm(`¿Aplicar $${monto.toLocaleString("es-MX")} a todos los meses de '${concepto}'?`)) return;

    const key = `fijo:${concepto}:${businessUnitId}:${mes}`;
    setGuardandoCelda(key);
    try {
      await actualizarFijo({
        escenario_id: escenarioSeleccionadoId,
        concepto,
        business_unit_id: businessUnitId,
        mes,
        monto
      });
      await cargarDatosEscenario(escenarioSeleccionadoId, true);
    } catch (err: any) {
      alert("Error al actualizar gasto fijo: " + err.message);
    } finally {
      setGuardandoCelda(null);
    }
  };

  const handleAgregarFijo = async () => {
    if (!nuevoFijo || !escenarioSeleccionadoId || !proyeccion) return;
    if (!nuevoFijo.concepto.trim()) {
      alert("Escribe el nombre del concepto.");
      return;
    }
    if (!nuevoFijo.categoria_id) {
      alert("Elige la cuenta contable del gasto.");
      return;
    }
    try {
      await agregarConceptoFijo({
        escenario_id: escenarioSeleccionadoId,
        concepto: nuevoFijo.concepto,
        categoria_id: nuevoFijo.categoria_id,
        business_unit_id: nuevoFijo.business_unit_id || null,
        monto: parseFloat(nuevoFijo.monto) || 0,
        meses: proyeccion.meses
      });
      setNuevoFijo(null);
      await cargarDatosEscenario(escenarioSeleccionadoId, true);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Edita la etiqueta del concepto (nombre, cuenta o unidad) en todos sus meses
  const handleEditarEtiquetaFijo = async (
    concepto: string,
    businessUnitId: string | null,
    cambios: { concepto?: string; categoria_id?: string; business_unit_id?: string | null }
  ) => {
    if (!escenarioSeleccionadoId) return;
    const key = `fijo:${concepto}:${businessUnitId}:etiqueta`;
    setGuardandoCelda(key);
    try {
      await editarConceptoFijo({
        escenario_id: escenarioSeleccionadoId,
        concepto,
        business_unit_id: businessUnitId,
        cambios
      });
      await cargarDatosEscenario(escenarioSeleccionadoId, true);
    } catch (err: any) {
      alert("Error al editar el concepto: " + err.message);
    } finally {
      setGuardandoCelda(null);
    }
  };

  const handleEliminarFijo = async (concepto: string, businessUnitId: string | null) => {
    if (!escenarioSeleccionadoId) return;
    if (!confirm(`¿Eliminar el gasto fijo '${concepto}' de este escenario?`)) return;
    try {
      await eliminarConceptoFijo({
        escenario_id: escenarioSeleccionadoId,
        concepto,
        business_unit_id: businessUnitId
      });
      await cargarDatosEscenario(escenarioSeleccionadoId, true);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Pedir lectura a Sofía
  const handlePedirLecturaSofia = async () => {
    if (!escenarioSeleccionadoId) return;
    setCargandoSofia(true);
    try {
      const diag = await generarLecturaSofiaProyeccion(escenarioSeleccionadoId);
      setDiagnosticoSofia(diag);
    } catch (err: any) {
      alert("No se pudo obtener la lectura: " + err.message);
    } finally {
      setCargandoSofia(false);
    }
  };

  // Exportar Excel
  const handleExportarExcel = () => {
    if (!proyeccion || !escenarioActual) return;
    const encabezados = ["Unidad", "Línea de Negocio", "Concepto", ...proyeccion.meses, "TOTAL"];
    const filas: Array<Array<string | number>> = [];

    // Llenar P&L
    Object.values(proyeccion.por_linea).forEach((l) => {
      const valoresIngreso = proyeccion.meses.map((m) => l.por_mes[m]?.ingreso_bruto || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Ingreso Bruto", ...valoresIngreso, l.total.ingreso_bruto]);

      const valoresCosto = proyeccion.meses.map((m) => l.por_mes[m]?.costo_directo || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Costo Directo", ...valoresCosto, l.total.costo_directo]);

      const valoresMargen = proyeccion.meses.map((m) => l.por_mes[m]?.margen_bruto || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Margen Bruto", ...valoresMargen, l.total.margen_bruto]);

      const valoresComision = proyeccion.meses.map((m) => l.por_mes[m]?.comision_asesor || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Comisión Asesor", ...valoresComision, l.total.comision_asesor]);

      const valoresMkt = proyeccion.meses.map((m) => l.por_mes[m]?.marketing || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Marketing (Ops × CAC)", ...valoresMkt, l.total.marketing]);

      const valoresPasarela = proyeccion.meses.map((m) => l.por_mes[m]?.comision_pasarela || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Comisión Pasarela", ...valoresPasarela, l.total.comision_pasarela]);

      const valoresContribucion = proyeccion.meses.map((m) => l.por_mes[m]?.contribucion || 0);
      filas.push([l.business_unit_nombre, l.nombre, "Contribución Marginal", ...valoresContribucion, l.total.contribucion]);
    });

    // Fila Consolidada
    const consolidadoOp = proyeccion.meses.map(
      (m) => proyeccion.consolidado.por_mes[m]?.utilidad_operativa || 0
    );
    filas.push(["CONSOLIDADO", "TODAS", "UTILIDAD OPERATIVA", ...consolidadoOp, proyeccion.consolidado.total.utilidad_operativa]);

    exportarAExcelCSV(
      `Proyeccion_Financiera_${escenarioActual.nombre.replace(/\s+/g, "_")}`,
      encabezados,
      filas
    );
  };

  // Preparar datos para gráficos
  const datosGraficoPnl = useMemo(() => {
    if (!proyeccion) return [];
    return proyeccion.meses.map((m) => {
      const mesLabel = new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
        month: "short",
        year: "2-digit"
      });
      const cons = proyeccion.consolidado.por_mes[m];
      return {
        mes: mesLabel,
        ingreso: cons?.ingreso_bruto || 0,
        utilidadOperativa: cons?.utilidad_operativa || 0,
        utilidadAcumulada: cons?.utilidad_acumulada || 0,
        cobroCaja: cons?.cobro_caja || 0,
        salidasCaja: cons?.salidas_caja || 0
      };
    });
  }, [proyeccion]);

  const datosGraficoIngresoPorUnidad = useMemo(() => {
    if (!proyeccion) return [];
    return proyeccion.meses.map((m) => {
      const mesLabel = new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
        month: "short",
        year: "2-digit"
      });
      const row: Record<string, any> = { mes: mesLabel };
      Object.values(proyeccion.por_unidad).forEach((u) => {
        if (u.total.ingreso_bruto === 0) return;
        row[u.business_unit_nombre] = u.por_mes[m]?.ingreso_bruto || 0;
      });
      return row;
    });
  }, [proyeccion]);

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR DE CONTROL DE ESCENARIOS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Selector de Escenario */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔮</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Escenario:
              </span>
            </div>
            <select
              value={escenarioSeleccionadoId}
              onChange={(e) => setEscenarioSeleccionadoId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
            >
              {escenarios.map((esc) => (
                <option key={esc.id} value={esc.id}>
                  {esc.nombre} {esc.es_activo ? "★ (Activo)" : ""} (
                  {esc.periodo_inicio.slice(0, 7)} a {esc.periodo_fin.slice(0, 7)})
                </option>
              ))}
            </select>

            {escenarioActual && (
              <div className="flex items-center gap-1.5">
                {!escenarioActual.es_activo && (
                  <button
                    type="button"
                    onClick={handleMarcarActivo}
                    className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200"
                    title="Marcar como el escenario base activo del CRM"
                  >
                    ★ Activar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalDuplicar(true)}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  📋 Duplicar
                </button>
                <button
                  type="button"
                  onClick={handleEliminarEscenario}
                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {/* Acciones principales & Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle Mes / Trimestre */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setVistaAgrupacion("mes")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  vistaAgrupacion === "mes"
                    ? "bg-white text-slate-800 shadow-2xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setVistaAgrupacion("trimestre")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  vistaAgrupacion === "trimestre"
                    ? "bg-white text-slate-800 shadow-2xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Trimestre
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportarExcel}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs flex items-center gap-1.5"
            >
              <span>📥</span> Exportar Excel
            </button>

            <button
              type="button"
              onClick={() => setModalNuevo(true)}
              className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
            >
              <span>➕</span> Nuevo Escenario
            </button>
          </div>
        </div>

        {/* Sub-navegación de la pestaña Proyecciones */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs font-bold">
          {(
            [
              ["proyeccion", "📊 P&L y Flujo de Caja"],
              ["supuestos", "⚙️ Grid de Supuestos"],
              ["base_real", "🎯 Base Real del CRM"],
              ["real_vs_plan", "⚖️ Real vs. Plan"],
              ["sofia", "🤖 Auditoría de Sofía"]
            ] as const
          ).map(([sec, label]) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSeccionActiva(sec)}
              className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                seccionActiva === sec
                  ? "bg-[#2D4A2B] text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {cargandoCalculo && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">Calculando proyección financiera...</p>
        </div>
      )}

      {/* 2. CONTENIDO SEGÚN SUB-SECCIÓN */}
      {!cargandoCalculo && proyeccion && (
        <>
          {/* ======================================================= */}
          {/* SECCIÓN 1: PROYECCIÓN (KPIS, GRÁFICAS & P&L MENSUAL) */}
          {/* ======================================================= */}
          {seccionActiva === "proyeccion" && (
            <div className="space-y-6">
              {/* Tarjetas KPI Superiores */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Ingreso Bruto
                  </span>
                  <div className="text-lg font-extrabold text-[#2D4A2B] font-mono mt-1">
                    {formatMXN(proyeccion.kpis.ingreso_total)}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {proyeccion.consolidado.total.operaciones.toFixed(1)} ops estimadas
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Margen Bruto
                  </span>
                  <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">
                    {formatMXN(proyeccion.consolidado.total.margen_bruto)}
                  </div>
                  <span className="text-[10px] text-emerald-600">
                    {proyeccion.kpis.ingreso_total > 0
                      ? formatPct(
                          (proyeccion.consolidado.total.margen_bruto / proyeccion.kpis.ingreso_total) * 100
                        )
                      : "0%"} de margen · Contribución {formatMXN(proyeccion.consolidado.total.contribucion)}
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Gastos Fijos
                  </span>
                  <div className="text-lg font-extrabold text-amber-700 font-mono mt-1">
                    {formatMXN(proyeccion.consolidado.total.gastos_fijos)}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Nómina, renta, servicios y opex
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Utilidad Operativa
                  </span>
                  <div className="text-lg font-extrabold text-[#2D4A2B] font-mono mt-1">
                    {formatMXN(proyeccion.kpis.utilidad_operativa_total)}
                  </div>
                  <span className="text-[10px] font-bold text-[#C9A961]">
                    {formatPct(proyeccion.kpis.margen_pct)} Margen Operativo
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Punto de Equilibrio
                  </span>
                  <div className="text-sm font-extrabold text-slate-800 mt-1">
                    {proyeccion.kpis.punto_equilibrio_mes
                      ? new Date(proyeccion.kpis.punto_equilibrio_mes + "T00:00:00").toLocaleDateString(
                          "es-MX",
                          { month: "short", year: "numeric" }
                        )
                      : "No alcanzado"}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Mes con utilidad acum. ≥ $0
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Caja Mínima / Saldo
                  </span>
                  <div className="text-sm font-extrabold font-mono text-slate-800 mt-1">
                    {formatMXN(proyeccion.kpis.caja_minima)}
                  </div>
                  <span className="text-[10px] text-emerald-700">
                    Final: {formatMXN(proyeccion.kpis.saldo_caja_final)}
                  </span>
                </div>
              </div>

              {/* Gráficas Recharts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfica 1: Utilidad Operativa Mensual & Acumulada */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-slate-800">
                      Utilidad Operativa Mensual y Curva Acumulada
                    </h4>
                    <span className="text-[10px] text-slate-400">MXN</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={datosGraficoPnl}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="mes" textAnchor="end" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                        <Tooltip formatter={(value: any) => formatMXN(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar
                          dataKey="utilidadOperativa"
                          name="Utilidad Operativa Mes"
                          fill="#2D4A2B"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey="utilidadAcumulada"
                          name="Utilidad Acumulada"
                          stroke="#C9A961"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gráfica 2: Ingresos por Unidad de Negocio */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-slate-800">
                      Ingreso Proyectado por Unidad de Negocio
                    </h4>
                    <span className="text-[10px] text-slate-400">Barras apiladas</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={datosGraficoIngresoPorUnidad}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v / 1000}k`} />
                        <Tooltip formatter={(value: any) => formatMXN(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {(() => {
                          // Solo unidades con ingreso (Gastos Generales no factura)
                          const conIngreso = Object.values(proyeccion.por_unidad).filter(
                            (u) => u.total.ingreso_bruto !== 0
                          );
                          return conIngreso.map((u, i) => (
                            <Bar
                              key={u.business_unit_nombre}
                              dataKey={u.business_unit_nombre}
                              stackId="a"
                              fill={i === 0 ? "#2D4A2B" : i === 1 ? "#5C7A52" : "#C9A961"}
                              radius={i === conIngreso.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            />
                          ));
                        })()}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Tabla P&L Mensual por Unidad, Línea y Gastos Fijos */}
              <TablaPnlProyectado proyeccion={proyeccion} fijos={insumos.fijos} />

              {/* Bloque de Flujo de Caja */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌊</span>
                    <h4 className="text-xs font-bold text-slate-800">
                      Flujo de Caja Mensual (Cobros según esquema de desfase)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Caja mínima en horizonte: <strong className="text-slate-700">{formatMXN(proyeccion.kpis.caja_minima)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold text-slate-600">
                        <th className="py-2 px-3">Flujo de Dinero</th>
                        {proyeccion.meses.map((m) => (
                          <th key={m} className="py-2 px-3 text-right whitespace-nowrap">
                            {new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
                              month: "short",
                              year: "2-digit"
                            })}
                          </th>
                        ))}
                        <th className="py-2 px-3 text-right bg-slate-100">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-1.5 px-3 text-emerald-700 font-semibold">(+) Cobros a Clientes en Caja</td>
                        {proyeccion.meses.map((m) => (
                          <td key={m} className="py-1.5 px-3 text-right whitespace-nowrap font-mono text-emerald-700">
                            {formatMXN(proyeccion.consolidado.por_mes[m]?.cobro_caja || 0)}
                            <span className="ml-1.5 inline-block w-11" />
                          </td>
                        ))}
                        <td className="py-1.5 px-3 text-right whitespace-nowrap font-mono font-bold text-emerald-800 bg-slate-50">
                          {formatMXN(proyeccion.consolidado.total.cobro_caja)}
                          <span className="ml-1.5 inline-block w-11" />
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3 text-red-600 font-semibold">(-) Salidas de Efectivo (Costos + Fijos)</td>
                        {proyeccion.meses.map((m) => (
                          <td key={m} className="py-1.5 px-3 text-right whitespace-nowrap font-mono text-red-600">
                            <span>-{formatMXN(proyeccion.consolidado.por_mes[m]?.salidas_caja || 0)}</span>
                            <span className="ml-1.5 inline-block w-11 text-left text-[9px] font-normal text-slate-400">
                              {pctSobre(
                                proyeccion.consolidado.por_mes[m]?.salidas_caja || 0,
                                proyeccion.consolidado.por_mes[m]?.cobro_caja || 0
                              )}
                            </span>
                          </td>
                        ))}
                        <td className="py-1.5 px-3 text-right whitespace-nowrap font-mono font-bold text-red-700 bg-slate-50">
                          <span>-{formatMXN(proyeccion.consolidado.total.salidas_caja)}</span>
                          <span className="ml-1.5 inline-block w-11 text-left text-[9px] font-normal text-slate-400">
                            {pctSobre(proyeccion.consolidado.total.salidas_caja, proyeccion.consolidado.total.cobro_caja)}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3 text-slate-800">(=) Flujo Neto del Mes</td>
                        {proyeccion.meses.map((m) => {
                          const fn = proyeccion.consolidado.por_mes[m]?.flujo_neto_caja || 0;
                          return (
                            <td key={m} className={`py-2 px-3 text-right whitespace-nowrap font-mono ${fn >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                              <span>{formatMXN(fn)}</span>
                              <span className="ml-1.5 inline-block w-11 text-left text-[9px] font-normal text-slate-400">
                                {pctSobre(fn, proyeccion.consolidado.por_mes[m]?.cobro_caja || 0)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-right whitespace-nowrap font-mono bg-slate-100 font-extrabold text-[#2D4A2B]">
                          <span>{formatMXN(proyeccion.consolidado.total.flujo_neto_caja)}</span>
                          <span className="ml-1.5 inline-block w-11 text-left text-[9px] font-normal text-slate-400">
                            {pctSobre(proyeccion.consolidado.total.flujo_neto_caja, proyeccion.consolidado.total.cobro_caja)}
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-emerald-50/70 font-extrabold text-emerald-950">
                        <td className="py-2 px-3">Saldo Final Acumulado en Caja</td>
                        {proyeccion.meses.map((m) => (
                          <td key={m} className="py-2 px-3 text-right whitespace-nowrap font-mono">
                            {formatMXN(proyeccion.consolidado.por_mes[m]?.saldo_caja_acumulado || 0)}
                            <span className="ml-1.5 inline-block w-11" />
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right whitespace-nowrap font-mono bg-emerald-100 text-[#2D4A2B]">
                          {formatMXN(proyeccion.kpis.saldo_caja_final)}
                          <span className="ml-1.5 inline-block w-11" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* SECCIÓN 2: GRID EDITABLE DE SUPUESTOS */}
          {/* ======================================================= */}
          {seccionActiva === "supuestos" && (
            <div className="space-y-6">
              {/* Barra de control de variables */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex rounded-xl bg-slate-100 p-0.5">
                    {([
                      { id: "linea", label: "Por línea" },
                      { id: "variable", label: "Por variable" },
                      { id: "fijos", label: "Gastos fijos" }
                    ] as Array<{ id: VistaSupuestos; label: string }>).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVistaSupuestos(v.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          vistaSupuestos === v.id
                            ? "bg-white text-[#2D4A2B] shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {vistaSupuestos === "variable" && (
                    <select
                      value={variableActiva}
                      onChange={(e) => setVariableActiva(e.target.value as VariableSupuesto)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#2D4A2B] focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                    >
                      {VARIABLES_CATALOGO.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} ({v.unidad})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mr-2">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" />
                      Promedio Real CRM
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-[#FEF9C3] border border-blue-400 inline-block" />
                      Supuesto Manual
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalNuevoNegocio(true)}
                    className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
                  >
                    <span>✨</span> + Negocio Nuevo
                  </button>
                </div>
              </div>

              {vistaSupuestos === "linea" ? (
                /* Vista por línea: todas las variables de una línea de negocio a la vez */
                (() => {
                  const todas = lineasAgrupadas.flatMap((g) => g.lineas);
                  const idx = Math.max(0, todas.findIndex((l) => l.linea_id === lineaSeleccionadaId));
                  const seleccionada = todas[idx];
                  if (!seleccionada) {
                    return (
                      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
                        Este escenario no tiene líneas de negocio.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {/* Selector de línea agrupado por unidad */}
                      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                        {lineasAgrupadas.map((grupo) => (
                          <div key={grupo.buId} className="flex items-start gap-3 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#2D4A2B] w-28 pt-1.5 shrink-0">
                              {grupo.nombre}
                            </span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {grupo.lineas.map((l) => {
                                const activa = l.linea_id === seleccionada.linea_id;
                                return (
                                  <button
                                    key={l.linea_id}
                                    type="button"
                                    onClick={() => setLineaSeleccionadaId(l.linea_id)}
                                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition text-left ${
                                      activa
                                        ? "bg-[#2D4A2B] border-[#2D4A2B] text-white"
                                        : "bg-white border-slate-200 text-slate-700 hover:border-[#2D4A2B]"
                                    }`}
                                  >
                                    {l.nombre}
                                    <span
                                      className={`ml-1.5 font-mono font-normal ${
                                        activa
                                          ? "text-white/80"
                                          : l.total.utilidad_bruta > 0
                                          ? "text-emerald-700"
                                          : "text-slate-400"
                                      }`}
                                    >
                                      {formatMXN(l.total.utilidad_bruta)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => setLineaSeleccionadaId(todas[idx - 1].linea_id)}
                            className="text-[11px] font-bold text-slate-600 hover:text-[#2D4A2B] disabled:opacity-30 px-2 py-1"
                          >
                            ← Anterior
                          </button>
                          <span className="text-[10px] text-slate-400">
                            Línea {idx + 1} de {todas.length} · el monto es la utilidad bruta del periodo
                          </span>
                          <button
                            type="button"
                            disabled={idx === todas.length - 1}
                            onClick={() => setLineaSeleccionadaId(todas[idx + 1].linea_id)}
                            className="text-[11px] font-bold text-slate-600 hover:text-[#2D4A2B] disabled:opacity-30 px-2 py-1"
                          >
                            Siguiente →
                          </button>
                        </div>
                      </div>

                      <PanelLineaSupuestos
                        linea={seleccionada}
                        meses={proyeccion.meses}
                        supuestosMap={supuestosMap}
                        guardandoCelda={guardandoCelda}
                        onEditar={handleEditarSupuesto}
                        onCopiarMes1={handleAplicarATodos}
                        onRestaurarReal={handleRestaurarReal}
                        onEliminar={handleEliminarLinea}
                      />
                    </div>
                  );
                })()
              ) : vistaSupuestos === "fijos" ? (
                /* Grid de Gastos Fijos por concepto, agrupado por unidad */
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Gastos Fijos del Escenario</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Gastos recurrentes de cada mes. Cada concepto se enlaza a una cuenta del catálogo de Finanzas para caer en la misma línea del P&L; edita nombre, cuenta, unidad y monto. Se restan de la contribución para llegar a la utilidad operativa.
                      </p>
                    </div>
                    {!nuevoFijo && (
                      <button
                        type="button"
                        onClick={() =>
                          setNuevoFijo({
                            concepto: "",
                            categoria_id:
                              cuentasEgreso.find((c) => c.linea_pnl === "opex_otros")?.id ||
                              cuentasEgreso[0]?.id ||
                              "",
                            business_unit_id: "",
                            monto: ""
                          })
                        }
                        className="rounded-xl bg-[#2D4A2B] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#5C7A52] transition"
                      >
                        + Concepto
                      </button>
                    )}
                  </div>

                  {nuevoFijo && (
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-end gap-2">
                      <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">
                        Concepto
                        <input
                          type="text"
                          value={nuevoFijo.concepto}
                          onChange={(e) => setNuevoFijo({ ...nuevoFijo, concepto: e.target.value })}
                          placeholder="Ej. Contador"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
                        />
                      </label>
                      <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">
                        Cuenta contable
                        <select
                          value={nuevoFijo.categoria_id}
                          onChange={(e) => setNuevoFijo({ ...nuevoFijo, categoria_id: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
                        >
                          {cuentasEgreso.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">
                        Unidad
                        <select
                          value={nuevoFijo.business_unit_id}
                          onChange={(e) => setNuevoFijo({ ...nuevoFijo, business_unit_id: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
                        >
                          <option value="">{GASTOS_GENERALES} (toda la empresa)</option>
                          {businessUnits.map((bu) => (
                            <option key={bu.id} value={bu.id}>{bu.nombre}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[11px] font-bold text-slate-600 flex flex-col gap-1">
                        Monto mensual
                        <input
                          type="number"
                          step="100"
                          value={nuevoFijo.monto}
                          onChange={(e) => setNuevoFijo({ ...nuevoFijo, monto: e.target.value })}
                          className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs font-normal"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleAgregarFijo}
                        className="rounded-lg bg-[#2D4A2B] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#5C7A52]"
                      >
                        Agregar
                      </button>
                      <button
                        type="button"
                        onClick={() => setNuevoFijo(null)}
                        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                          <th className="py-3 px-4 min-w-[220px]">Concepto</th>
                          {proyeccion.meses.map((m) => (
                            <th key={m} className="py-3 px-2 text-center whitespace-nowrap min-w-[100px]">
                              {new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
                                month: "short",
                                year: "2-digit"
                              })}
                            </th>
                          ))}
                          <th className="py-3 px-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {fijosAgrupados.length === 0 && (
                          <tr>
                            <td colSpan={proyeccion.meses.length + 2} className="py-6 text-center text-slate-400">
                              Este escenario no tiene gastos fijos.
                            </td>
                          </tr>
                        )}
                        {fijosAgrupados.map((g, i) => {
                          const nuevaUnidad =
                            i === 0 || fijosAgrupados[i - 1].business_unit_nombre !== g.business_unit_nombre;
                          const delGrupo = fijosAgrupados.filter(
                            (x) => x.business_unit_nombre === g.business_unit_nombre
                          );
                          const guardandoEtiqueta =
                            guardandoCelda === `fijo:${g.concepto}:${g.business_unit_id}:etiqueta`;
                          return (
                            <React.Fragment key={`${g.concepto}|${g.business_unit_id}`}>
                              {nuevaUnidad && (
                                <tr className="bg-[#2D4A2B]/5">
                                  <td className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wide text-[#2D4A2B]">
                                    {g.business_unit_nombre}
                                  </td>
                                  {proyeccion.meses.map((m) => (
                                    <td key={m} className="py-2 px-2 text-center text-[11px] font-bold font-mono text-[#2D4A2B]">
                                      {formatMXN(delGrupo.reduce((acc, x) => acc + (x.por_mes[m] || 0), 0))}
                                    </td>
                                  ))}
                                  <td />
                                </tr>
                              )}
                              <tr className="hover:bg-slate-50/50">
                                <td className={`py-2 px-4 pl-6 ${guardandoEtiqueta ? "opacity-50" : ""}`}>
                                  <input
                                    key={g.concepto}
                                    type="text"
                                    defaultValue={g.concepto}
                                    title="Editar nombre del concepto"
                                    onBlur={(e) => {
                                      const nombre = e.target.value.trim();
                                      if (!nombre) {
                                        e.target.value = g.concepto;
                                        return;
                                      }
                                      if (nombre === g.concepto) return;
                                      handleEditarEtiquetaFijo(g.concepto, g.business_unit_id, { concepto: nombre });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none"
                                  />
                                  <div className="mt-0.5 flex items-center gap-1">
                                    <select
                                      value={g.categoria_id || ""}
                                      onChange={(e) =>
                                        handleEditarEtiquetaFijo(g.concepto, g.business_unit_id, {
                                          categoria_id: e.target.value
                                        })
                                      }
                                      title="Cuenta contable (catálogo de Finanzas)"
                                      className="max-w-[170px] rounded border border-transparent bg-transparent px-0.5 text-[10px] text-slate-500 hover:border-slate-200 focus:outline-none"
                                    >
                                      {!g.categoria_id && <option value="">Sin cuenta ({g.linea_pnl})</option>}
                                      {g.categoria_id && !cuentasEgreso.some((c) => c.id === g.categoria_id) && (
                                        <option value={g.categoria_id}>
                                          {categories.find((c) => c.id === g.categoria_id)?.nombre || g.linea_pnl} (pasar a CAC)
                                        </option>
                                      )}
                                      {cuentasEgreso.map((c) => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                      ))}
                                    </select>
                                    <span className="text-[10px] text-slate-300">·</span>
                                    <select
                                      value={g.business_unit_id || ""}
                                      onChange={(e) =>
                                        handleEditarEtiquetaFijo(g.concepto, g.business_unit_id, {
                                          business_unit_id: e.target.value || null
                                        })
                                      }
                                      title="Unidad de negocio"
                                      className="max-w-[130px] rounded border border-transparent bg-transparent px-0.5 text-[10px] text-slate-500 hover:border-slate-200 focus:outline-none"
                                    >
                                      <option value="">{GASTOS_GENERALES}</option>
                                      {businessUnits.map((bu) => (
                                        <option key={bu.id} value={bu.id}>{bu.nombre}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                {proyeccion.meses.map((m) => {
                                  const monto = g.por_mes[m];
                                  const valor = monto === undefined ? "" : String(Math.round(monto * 100) / 100);
                                  const guardando = guardandoCelda === `fijo:${g.concepto}:${g.business_unit_id}:${m}`;
                                  return (
                                    <td key={m} className="py-2 px-1 text-center">
                                      <input
                                        key={`${m}:${valor}`}
                                        type="number"
                                        step="100"
                                        defaultValue={valor}
                                        disabled={monto === undefined}
                                        title={monto === undefined ? "Sin registro para este mes" : undefined}
                                        onBlur={(e) => {
                                          if (e.target.value === valor) return;
                                          handleEditarFijo(g.concepto, g.business_unit_id, m, e.target.value);
                                        }}
                                        className={`w-24 text-center rounded-lg border py-1 px-1.5 text-xs font-mono font-bold transition disabled:opacity-40 ${
                                          guardando
                                            ? "bg-amber-100 border-amber-400"
                                            : "bg-[#FEF9C3]/70 text-[#1E40AF] border-blue-300 hover:border-blue-500"
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleEditarFijo(
                                          g.concepto,
                                          g.business_unit_id,
                                          null,
                                          String(g.por_mes[proyeccion.meses[0]] ?? 0)
                                        )
                                      }
                                      className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-bold"
                                      title="Copiar el monto del primer mes a todos los meses"
                                    >
                                      Copiar mes 1
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEliminarFijo(g.concepto, g.business_unit_id)}
                                      className="text-xs text-red-500 hover:text-red-700 p-1"
                                      title="Eliminar concepto"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                        {fijosAgrupados.length > 0 && (
                          <tr className="bg-slate-50 font-bold text-slate-700">
                            <td className="py-2.5 px-4">Total gastos fijos</td>
                            {proyeccion.meses.map((m) => (
                              <td key={m} className="py-2.5 px-2 text-center font-mono">
                                {formatMXN(proyeccion.consolidado.por_mes[m]?.gastos_fijos || 0)}
                              </td>
                            ))}
                            <td />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
              /* Grid de Supuestos por Línea, agrupado por unidad de negocio */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <th className="py-3 px-4 min-w-[220px]">Línea de Negocio</th>
                        <th className="py-3 px-2">Modelo</th>
                        {proyeccion.meses.map((m) => (
                          <th key={m} className="py-3 px-2 text-center whitespace-nowrap min-w-[90px]">
                            {new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
                              month: "short",
                              year: "2-digit"
                            })}
                          </th>
                        ))}
                        <th className="py-3 px-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineasAgrupadas.map((grupo) => {
                        const utilidadGrupo = grupo.lineas.reduce((acc, l) => acc + l.total.utilidad_bruta, 0);
                        return (
                          <React.Fragment key={grupo.buId}>
                            <tr className="bg-[#2D4A2B]/5">
                              <td colSpan={2} className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wide text-[#2D4A2B]">
                                {grupo.nombre}
                                <span className="ml-2 normal-case font-bold text-slate-500">
                                  {grupo.lineas.length} {grupo.lineas.length === 1 ? "línea" : "líneas"} · Utilidad bruta{" "}
                                  {formatMXN(utilidadGrupo)}
                                </span>
                              </td>
                              {proyeccion.meses.map((m) => (
                                <td key={m} className="py-2 px-2 text-center text-[10px] font-bold font-mono text-[#2D4A2B]">
                                  {formatMXN(grupo.lineas.reduce((acc, l) => acc + (l.por_mes[m]?.utilidad_bruta || 0), 0))}
                                </td>
                              ))}
                              <td />
                            </tr>

                            {grupo.lineas.map((l) => {
                              const campo = variableActiva as VariableSupuesto;
                              const noAplica =
                                (l.modelo === "manual" && SOLO_EMBUDO.includes(campo)) ||
                                (l.modelo === "embudo" && SOLO_MANUAL.includes(campo));
                              const primerSupuesto = supuestosMap.get(`${l.linea_id}:${proyeccion.meses[0]}`);

                              return (
                                <tr key={l.linea_id} className="hover:bg-slate-50/50">
                                  <td className="py-2.5 px-4 pl-7 font-bold text-slate-800">
                                    <div>{l.nombre}</div>
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      Utilidad bruta {formatMXN(l.total.utilidad_bruta)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      l.modelo === "embudo" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                                    }`}>
                                      {l.modelo}
                                    </span>
                                  </td>

                                  {proyeccion.meses.map((m) => {
                                    // Valor guardado del supuesto (no derivado del resultado)
                                    const supuesto = supuestosMap.get(`${l.linea_id}:${m}`);
                                    const valor = valorParaMostrar(campo, supuesto?.[campo] as number | null | undefined);
                                    const esReal = supuesto?.fuente !== "manual";

                                    const key = `${l.linea_id}:${m}:${campo}`;
                                    const guardando = guardandoCelda === key;

                                    return (
                                      <td key={m} className="py-2 px-1 text-center">
                                        <input
                                          key={`${key}:${valor}`}
                                          type="number"
                                          step={campo.includes("pct") || campo === "operaciones_manual" ? "0.1" : "100"}
                                          defaultValue={valor}
                                          disabled={!supuesto || noAplica}
                                          title={
                                            noAplica
                                              ? `No aplica a líneas de modelo ${l.modelo}`
                                              : !supuesto
                                              ? "Sin supuesto para este mes"
                                              : undefined
                                          }
                                          onBlur={(e) => {
                                            if (e.target.value === valor) return;
                                            handleEditarSupuesto(l.linea_id, m, campo, e.target.value);
                                          }}
                                          className={`w-20 text-center rounded-lg border py-1 px-1.5 text-xs font-mono font-bold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                            guardando
                                              ? "bg-amber-100 border-amber-400"
                                              : esReal
                                              ? "bg-slate-100 text-slate-700 border-slate-300 hover:border-slate-500"
                                              : "bg-[#FEF9C3]/70 text-[#1E40AF] border-blue-300 hover:border-blue-500"
                                          }`}
                                        />
                                      </td>
                                    );
                                  })}

                                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={noAplica}
                                        onClick={() =>
                                          handleAplicarATodos(
                                            l.linea_id,
                                            campo,
                                            (primerSupuesto?.[campo] as number | null | undefined) ?? null
                                          )
                                        }
                                        className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-bold disabled:opacity-30"
                                        title="Copiar el valor del primer mes a todos los meses"
                                      >
                                        Copiar mes 1
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRestaurarReal(l.linea_id)}
                                        className="text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                                        title="Restaurar a promedios reales históricos"
                                      >
                                        ↺ Real
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleEliminarLinea(l.linea_id, l.nombre)}
                                        className="text-xs text-red-500 hover:text-red-700 p-1"
                                        title="Eliminar línea"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* SECCIÓN 3: BASE REAL DEL CRM (HISTÓRICO DETERMINÍSTICO) */}
          {/* ======================================================= */}
          {seccionActiva === "base_real" && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Métricas Reales Históricas del CRM (Últimos 3 Meses)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tasas de conversión y tickets calculados automáticamente desde expedientes, cotizaciones y remisiones.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                  Vista Determinística
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-4">Línea de Negocio</th>
                      <th className="py-2.5 px-3 text-right">Leads / Mes</th>
                      <th className="py-2.5 px-3 text-right">% a Cotización</th>
                      <th className="py-2.5 px-3 text-right">% de Cierre</th>
                      <th className="py-2.5 px-3 text-right">Ticket Promedio</th>
                      <th className="py-2.5 px-3 text-right">Margen Bruto</th>
                      <th className="py-2.5 px-3 text-right">% Asesor</th>
                      <th className="py-2.5 px-3 text-right">Costo / Lead</th>
                      <th className="py-2.5 px-4 text-center">Confiabilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {baseReal.map((b) => (
                      <tr key={b.tipo_negocio} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {b.nombre_legible}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {b.leads_promedio}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatPct(b.pct_a_cotizacion)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {formatPct(b.pct_cierre)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#2D4A2B]">
                          {formatMXN(b.ticket_promedio)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-700">
                          {formatPct(b.margen_pct)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatPct(b.pct_comision_asesor)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatMXN(b.costo_por_lead)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              b.confiabilidad === "alta"
                                ? "bg-emerald-100 text-emerald-800"
                                : b.confiabilidad === "media"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {b.confiabilidad}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* SECCIÓN 4: REAL VS. PLAN (SEGUIMIENTO Y DRIVERS) */}
          {/* ======================================================= */}
          {seccionActiva === "real_vs_plan" && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Comparativa Real vs. Plan y Análisis de Desviaciones
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Meses cerrados hasta la fecha de corte ({escenarioActual?.fecha_corte_real || "N/A"}).
                  </p>
                </div>
              </div>

              {realVsPlan.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No hay meses cerrados con fecha anterior o igual a la fecha de corte para este escenario.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <th className="py-2.5 px-4">Mes / Línea</th>
                        <th className="py-2.5 px-3 text-right">Plan ($)</th>
                        <th className="py-2.5 px-3 text-right">Real ($)</th>
                        <th className="py-2.5 px-3 text-right">Var ($)</th>
                        <th className="py-2.5 px-3 text-right">Var (%)</th>
                        <th className="py-2.5 px-3 text-center">Semáforo</th>
                        <th className="py-2.5 px-4">Driver de la Desviación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {realVsPlan.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-bold text-slate-800">
                            <div>{r.linea_nombre}</div>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {new Date(r.mes + "T00:00:00").toLocaleDateString("es-MX", {
                                month: "long",
                                year: "numeric"
                              })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatMXN(r.plan_ingreso)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D4A2B]">
                            {formatMXN(r.real_ingreso)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                            r.var_ingreso_monto >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}>
                            {r.var_ingreso_monto >= 0 ? "+" : ""}
                            {formatMXN(r.var_ingreso_monto)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${
                            r.var_ingreso_pct >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}>
                            {r.var_ingreso_pct >= 0 ? "+" : ""}
                            {formatPct(r.var_ingreso_pct)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block w-3 h-3 rounded-full ${
                              r.semaforo === "verde"
                                ? "bg-emerald-500"
                                : r.semaforo === "amarillo"
                                ? "bg-amber-400"
                                : "bg-red-500"
                            }`} />
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            <span className="font-bold text-slate-800 uppercase text-[10px] mr-1.5">
                              [{r.driver_desviacion}]
                            </span>
                            <span>{r.explicacion_driver}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* SECCIÓN 5: SOFÍA (AUDITORÍA & PALANCAS FINANCIERAS) */}
          {/* ======================================================= */}
          {seccionActiva === "sofia" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center text-xl">
                    🤖
                  </div>
                  <div>
                    <h4 className="font-fraunces text-base font-bold text-[#2D4A2B]">
                      Sofía · Directora de Finanzas Inteligente
                    </h4>
                    <p className="text-xs text-slate-400">
                      Auditoría heurística de supuestos, riesgos de liquidez y palancas de rentabilidad
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePedirLecturaSofia}
                  disabled={cargandoSofia}
                  className="rounded-xl bg-[#2D4A2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {cargandoSofia ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Auditando...
                    </>
                  ) : (
                    <>
                      <span>🔮</span> Pedir Lectura a Sofía
                    </>
                  )}
                </button>
              </div>

              {!diagnosticoSofia ? (
                <div className="py-12 text-center max-w-md mx-auto text-slate-500">
                  <div className="text-3xl mb-2">💡</div>
                  <p className="text-xs font-bold text-slate-700">
                    Solicita a Sofía una auditoría de este escenario
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sofía revisará si tus supuestos de cierre o ticket son demasiado optimistas comparados con la base real del CRM, y te dará las 3 palancas prioritarias.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Lectura General */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Lectura General del Escenario
                    </span>
                    <div className="text-xs text-slate-800 leading-relaxed font-cuerpo">
                      {diagnosticoSofia.lectura_general}
                    </div>
                  </div>

                  {/* Alertas & Riesgos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-2">
                        <span>⚠️</span> Alertas sobre Supuestos
                      </div>
                      <ul className="space-y-1.5 text-xs text-amber-950">
                        {diagnosticoSofia.alertas_supuestos.map((a, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-amber-600 mt-0.5">•</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-red-50/60 rounded-2xl p-4 border border-red-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-900 mb-2">
                        <span>🛡️</span> Riesgos Clave
                      </div>
                      <ul className="space-y-1.5 text-xs text-red-950">
                        {diagnosticoSofia.riesgos.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-red-600 mt-0.5">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Palancas Recomendadas */}
                  <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 mb-2">
                      <span>🎯</span> Palancas Tácticas para Alcanzar la Meta
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {diagnosticoSofia.palancas.map((p, i) => (
                        <div key={i} className="bg-white p-3 rounded-xl border border-emerald-100 text-xs text-emerald-950 shadow-2xs">
                          <strong className="block text-emerald-800 mb-0.5">Palanca #{i + 1}</strong>
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODALES */}
      <ModalNuevoEscenario
        abierto={modalNuevo}
        alCerrar={() => setModalNuevo(false)}
        alGuardar={(id) => {
          setEscenarioSeleccionadoId(id);
          cargarEscenarios();
        }}
        escenariosExistentes={escenarios}
      />

      <ModalDuplicarEscenario
        abierto={modalDuplicar}
        alCerrar={() => setModalDuplicar(false)}
        alGuardar={(id) => {
          setEscenarioSeleccionadoId(id);
          cargarEscenarios();
        }}
        escenarioActual={escenarioActual}
      />

      {proyeccion && (
        <ModalNuevoNegocio
          abierto={modalNuevoNegocio}
          alCerrar={() => setModalNuevoNegocio(false)}
          alGuardar={() => {
            if (escenarioSeleccionadoId) {
              cargarDatosEscenario(escenarioSeleccionadoId);
            }
          }}
          escenarioId={escenarioSeleccionadoId}
          meses={proyeccion.meses}
          unidades={businessUnits}
        />
      )}
    </div>
  );
}
