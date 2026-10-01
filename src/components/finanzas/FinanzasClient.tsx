"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  BusinessUnit,
  MoneyAccount,
  Category,
  ResumenFinanciero,
  EstadoResultadosReporte,
  BalanceGeneralReporte,
  FlujoEfectivoReporte
} from "@/app/actions/finanzas";
import {
  obtenerCatalogosFinanzas,
  obtenerResumenFinanciero,
  obtenerEstadoResultados,
  obtenerBalanceGeneral,
  obtenerFlujoEfectivo
} from "@/app/actions/finanzas";
import { conciliarRemisionesPendientes } from "@/app/actions/contabilidad-remisiones";

import { TabResumen } from "./TabResumen";
import { TabMovimientos } from "./TabMovimientos";
import { TabCuentas } from "./TabCuentas";
import { TabEstadoResultados } from "./TabEstadoResultados";
import { TabBalanceGeneral } from "./TabBalanceGeneral";
import { TabFlujoEfectivo } from "./TabFlujoEfectivo";
import { TabConfiguracion } from "./TabConfiguracion";
import { TabRentabilidadProductos } from "./TabRentabilidadProductos";
import { ModalNuevoMovimiento } from "./ModalNuevoMovimiento";
import { ModalImportarExcel } from "./ModalImportarExcel";

type TabId =
  | "resumen"
  | "movimientos"
  | "cuentas"
  | "estado_resultados"
  | "balance"
  | "flujo"
  | "rentabilidad"
  | "configuracion";

export function FinanzasClient() {
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split("T")[0];
  const primerDiaMesStr = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];

  // Filtros de fecha globales
  const [presetPeriodo, setPresetPeriodo] = useState<"este_mes" | "mes_anterior" | "trimestre" | "anio" | "personalizado">("este_mes");
  const [fechaInicio, setFechaInicio] = useState(primerDiaMesStr);
  const [fechaFin, setFechaFin] = useState(hoyStr);
  const [fechaCorte, setFechaCorte] = useState(hoyStr);
  const [businessUnitId, setBusinessUnitId] = useState<string>("todas");

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<TabId>("resumen");

  // Modales globales
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [showImportarModal, setShowImportarModal] = useState(false);

  // Estados de datos
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [catalogos, setCatalogos] = useState<{
    businessUnits: BusinessUnit[];
    moneyAccounts: MoneyAccount[];
    categories: Category[];
  }>({
    businessUnits: [],
    moneyAccounts: [],
    categories: []
  });

  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [resumen, setResumen] = useState<ResumenFinanciero | null>(null);
  const [estadoResultados, setEstadoResultados] = useState<EstadoResultadosReporte | null>(null);
  const [balance, setBalance] = useState<BalanceGeneralReporte | null>(null);
  const [flujo, setFlujo] = useState<FlujoEfectivoReporte | null>(null);

  // Cargar catálogos una vez
  const cargarCatalogos = useCallback(async () => {
    setCargandoCatalogos(true);
    try {
      const cats = await obtenerCatalogosFinanzas();
      setCatalogos(cats);
    } catch (err: any) {
      console.error("Error al cargar catálogos:", err);
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  // Cargar datos según filtros
  const cargarDatos = useCallback(async () => {
    setCargandoDatos(true);
    try {
      const bu = businessUnitId === "todas" ? undefined : businessUnitId;
      const [resResumen, resPnL, resBal, resFlujo] = await Promise.all([
        obtenerResumenFinanciero(fechaInicio, fechaFin, undefined, undefined, bu),
        obtenerEstadoResultados(fechaInicio, fechaFin, bu),
        obtenerBalanceGeneral(fechaCorte, undefined, bu),
        obtenerFlujoEfectivo(fechaInicio, fechaFin, bu)
      ]);

      setResumen(resResumen);
      setEstadoResultados(resPnL);
      setBalance(resBal);
      setFlujo(resFlujo);
    } catch (err: any) {
      console.error("Error al consultar datos financieros:", err);
    } finally {
      setCargandoDatos(false);
    }
  }, [fechaInicio, fechaFin, fechaCorte, businessUnitId]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Al abrir Finanzas, reflejar las remisiones que aún no estén conciliadas
  // (venta, proveedor, terminal y comisión) y refrescar si hubo cambios.
  useEffect(() => {
    conciliarRemisionesPendientes()
      .then((res) => {
        if (res.procesadas > 0) cargarDatos();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar fechas por preset
  const aplicarPreset = (p: typeof presetPeriodo) => {
    setPresetPeriodo(p);
    const ahora = new Date();
    if (p === "este_mes") {
      setFechaInicio(new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split("T")[0]);
      setFechaFin(ahora.toISOString().split("T")[0]);
    } else if (p === "mes_anterior") {
      const primMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const ultMesAnt = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      setFechaInicio(primMesAnt.toISOString().split("T")[0]);
      setFechaFin(ultMesAnt.toISOString().split("T")[0]);
    } else if (p === "trimestre") {
      const mesIni = Math.floor(ahora.getMonth() / 3) * 3;
      setFechaInicio(new Date(ahora.getFullYear(), mesIni, 1).toISOString().split("T")[0]);
      setFechaFin(ahora.toISOString().split("T")[0]);
    } else if (p === "anio") {
      setFechaInicio(`${ahora.getFullYear()}-01-01`);
      setFechaFin(ahora.toISOString().split("T")[0]);
    }
  };

  const nombreUnidadSeleccionada =
    businessUnitId === "todas"
      ? "Consolidado Todas"
      : catalogos.businessUnits.find((u) => u.id === businessUnitId)?.nombre || "Consolidado";

  return (
    <div className="min-h-screen bg-slate-50 font-cuerpo pb-20">
      {/* 1. CABECERA PRINCIPAL SAUCEDA */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <h1 className="font-fraunces text-xl sm:text-2xl font-bold text-[#2D4A2B]">
                  Módulo de Finanzas & Contabilidad
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                  Partida Doble
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Salud financiera, libro de ingresos/egresos, balance y estados financieros consolidados
              </p>
            </div>

            {/* BOTONES DE ACCIÓN RÁPIDA */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowImportarModal(true)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
              >
                <span>📋</span> Importar
              </button>
              <button
                type="button"
                onClick={() => setShowNuevoModal(true)}
                className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
              >
                <span>➕</span> Nuevo Movimiento
              </button>
            </div>
          </div>

          {/* FILTRO DE PERIODOS Y UNIDAD DE NEGOCIO */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* SELECTOR DE PRESETS */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-bold">
              {(
                [
                  ["este_mes", "Este Mes"],
                  ["mes_anterior", "Mes Anterior"],
                  ["trimestre", "Este Trimestre"],
                  ["anio", "Año en Curso"],
                  ["personalizado", "Personalizado"]
                ] as const
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => aplicarPreset(p)}
                  className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap ${
                    presetPeriodo === p
                      ? "bg-[#2D4A2B] text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap text-xs">
              {/* SELECTOR DE FECHAS */}
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => {
                    setFechaInicio(e.target.value);
                    setPresetPeriodo("personalizado");
                  }}
                  className="bg-transparent text-slate-700 text-xs focus:outline-none"
                />
                <span className="text-slate-400">al</span>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    setPresetPeriodo("personalizado");
                  }}
                  className="bg-transparent text-slate-700 text-xs focus:outline-none"
                />
              </div>

              {/* FILTRO POR UNIDAD DE NEGOCIO */}
              <select
                value={businessUnitId}
                onChange={(e) => setBusinessUnitId(e.target.value)}
                className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
              >
                <option value="todas">🏢 Todas las Unidades</option>
                {catalogos.businessUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SUB-PESTAÑAS DE NAVEGACIÓN */}
          <nav className="mt-3 flex items-center gap-1 overflow-x-auto scrollbar-none border-t border-slate-100 pt-2 text-xs font-bold">
            {(
              [
                ["resumen", "📊 Resumen"],
                ["movimientos", "📖 Movimientos"],
                ["cuentas", "⏳ Cuentas por Cobrar / Pagar"],
                ["estado_resultados", "📑 Estado de Resultados"],
                ["balance", "⚖️ Balance General"],
                ["flujo", "🌊 Flujo de Efectivo"],
                ["rentabilidad", "📦 Rentabilidad por Producto"],
                ["configuracion", "⚙️ Configuración"]
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap flex items-center gap-1 ${
                  activeTab === tab
                    ? "bg-[#2D4A2B] text-[#F5F1E8] shadow-xs"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 2. CONTENIDO PRINCIPAL SEGÚN PESTAÑA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {cargandoDatos && !resumen ? (
          <div className="py-24 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-600">Calculando indicadores financieros...</p>
          </div>
        ) : (
          <>
            {activeTab === "resumen" && resumen && (
              <TabResumen
                resumen={resumen}
                cargando={cargandoDatos}
                onRefrescar={cargarDatos}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                businessUnitId={businessUnitId}
              />
            )}

            {activeTab === "movimientos" && (
              <TabMovimientos
                catalogos={catalogos}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                businessUnitId={businessUnitId}
                onMovimientoModificado={cargarDatos}
              />
            )}

            {activeTab === "cuentas" && (
              <TabCuentas
                moneyAccounts={catalogos.moneyAccounts}
                businessUnitId={businessUnitId}
                onMovimientoModificado={cargarDatos}
              />
            )}

            {activeTab === "estado_resultados" && estadoResultados && (
              <TabEstadoResultados
                reporte={estadoResultados}
                cargando={cargandoDatos}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                businessUnitId={businessUnitId}
                nombreUnidad={nombreUnidadSeleccionada}
              />
            )}

            {activeTab === "balance" && balance && (
              <TabBalanceGeneral
                balance={balance}
                cargando={cargandoDatos}
                fechaCorte={fechaCorte}
                onCambiarFechaCorte={(fc) => {
                  setFechaCorte(fc);
                  cargarDatos();
                }}
                nombreUnidad={nombreUnidadSeleccionada}
              />
            )}

            {activeTab === "flujo" && flujo && (
              <TabFlujoEfectivo
                flujo={flujo}
                cargando={cargandoDatos}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                nombreUnidad={nombreUnidadSeleccionada}
              />
            )}

            {activeTab === "rentabilidad" && (
              <TabRentabilidadProductos
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                onRecalculado={cargarDatos}
              />
            )}

            {activeTab === "configuracion" && (
              <TabConfiguracion
                catalogos={catalogos}
                onConfiguracionModificada={() => {
                  cargarCatalogos();
                  cargarDatos();
                }}
              />
            )}
          </>
        )}
      </main>

      {/* MODAL NUEVO MOVIMIENTO GLOBAL */}
      <ModalNuevoMovimiento
        abierto={showNuevoModal}
        onCerrar={() => setShowNuevoModal(false)}
        onGuardado={() => {
          cargarCatalogos();
          cargarDatos();
        }}
        catalogos={catalogos}
      />

      {/* MODAL IMPORTADOR EXCEL GLOBAL */}
      <ModalImportarExcel
        abierto={showImportarModal}
        onCerrar={() => setShowImportarModal(false)}
        onImportado={() => {
          cargarCatalogos();
          cargarDatos();
        }}
      />
    </div>
  );
}
