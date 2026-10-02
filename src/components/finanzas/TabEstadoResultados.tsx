"use client";

import React, { useState } from "react";
import type { EstadoResultadosReporte, LineaPnLReporte } from "@/app/actions/finanzas";
import { ModalDrillDown } from "./ModalDrillDown";
import { exportarEstadoResultadosPdf, exportarAExcelCSV } from "@/lib/finanzasExport";

interface TabEstadoResultadosProps {
  reporte: EstadoResultadosReporte;
  cargando: boolean;
  fechaInicio: string;
  fechaFin: string;
  businessUnitId?: string;
  nombreUnidad?: string;
}

export function TabEstadoResultados({
  reporte,
  cargando,
  fechaInicio,
  fechaFin,
  businessUnitId,
  nombreUnidad
}: TabEstadoResultadosProps) {
  const [vistaMensual, setVistaMensual] = useState(false);
  const [drillDownFila, setDrillDownFila] = useState<LineaPnLReporte | null>(null);

  const handleExportarPdf = () => {
    exportarEstadoResultadosPdf(
      reporte,
      `${fechaInicio} al ${fechaFin}`,
      nombreUnidad || "Consolidado Todas"
    );
  };

  const handleExportarExcel = () => {
    const encabezados = [
      "Concepto",
      "% Vertical",
      "Total Acumulado",
      ...reporte.meses
    ];

    const filas = reporte.lineas.map((l) => [
      l.concepto,
      `${l.porcentajeVertical.toFixed(1)}%`,
      l.monto,
      ...reporte.meses.map((m) => l.mensual[m] || 0)
    ]);

    exportarAExcelCSV(
      `Estado_Resultados_SAUCEDA_${fechaInicio}_${fechaFin}`,
      encabezados,
      filas
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR DE ACCIONES */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>📑</span> Estado de Resultados (P&L Base Devengada)
          </h3>
          <p className="text-[11px] text-slate-400">
            Revenues, Costos Directos, Marketing, OPEX, EBIT, Gastos Financieros, ISR y Utilidad Neta
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* TOGGLE CONSOLIDADO VS MENSUAL */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold shadow-2xs">
            <button
              type="button"
              onClick={() => setVistaMensual(false)}
              className={`rounded-lg px-3 py-1.5 transition ${
                !vistaMensual
                  ? "bg-[#2D4A2B] text-[#F5F1E8] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Consolidado
            </button>
            <button
              type="button"
              onClick={() => setVistaMensual(true)}
              className={`rounded-lg px-3 py-1.5 transition ${
                vistaMensual
                  ? "bg-[#2D4A2B] text-[#F5F1E8] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Mensual (Columnas)
            </button>
          </div>

          {/* BOTONES EXPORTAR */}
          <button
            type="button"
            onClick={handleExportarExcel}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
          >
            <span>📊</span> Excel
          </button>
          <button
            type="button"
            onClick={handleExportarPdf}
            className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
          >
            <span>📥</span> PDF SAUCEDA
          </button>
        </div>
      </section>

      {/* 2. TABLA PRINCIPAL DE P&L */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="overflow-x-auto scrollbar-sutil">
          {cargando ? (
            <div className="py-20 text-center text-xs text-slate-400">
              Calculando Estado de Resultados devengado...
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[9px] font-bold tracking-wider border-b border-slate-200">
                  <th className="px-4 py-2.5">Línea Contable</th>
                  <th className="px-4 py-2.5 text-right">% Vert.</th>
                  <th className="px-4 py-2.5 text-right font-mono text-[10px]">Total Acumulado</th>
                  {vistaMensual &&
                    reporte.meses.map((m) => (
                      <th key={m} className="px-3 py-2.5 text-right font-mono text-[10px]">
                        {m}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reporte.lineas.map((linea) => {
                  const esHeader = linea.esEncabezado;
                  const esTotal = linea.esTotal;
                  const esNeta = linea.clave === "utilidad_neta";

                  if (esHeader) {
                    return (
                      <tr key={linea.clave} className="bg-slate-50 font-bold text-[#2D4A2B]">
                        <td
                          colSpan={vistaMensual ? 3 + reporte.meses.length : 3}
                          className="px-4 py-2 text-[10px] uppercase tracking-wider"
                        >
                          {linea.concepto}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={linea.clave}
                      onClick={() => !esTotal && setDrillDownFila(linea)}
                      className={`transition ${
                        esNeta
                          ? "bg-[#2D4A2B] text-[#F5F1E8] font-bold"
                          : esTotal
                          ? "bg-slate-50 font-bold text-slate-900 border-t border-slate-300"
                          : "hover:bg-slate-50/80 cursor-pointer text-slate-700"
                      }`}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          {!esTotal && <span className="text-[10px] text-slate-300">🔍</span>}
                          <span className={esNeta ? "text-white" : ""}>{linea.concepto}</span>
                        </div>
                      </td>

                      <td
                        className={`px-4 py-2 text-right font-mono text-[10px] ${
                          esNeta ? "text-[#C9A961]" : "text-slate-400"
                        }`}
                      >
                        {linea.porcentajeVertical.toFixed(1)}%
                      </td>

                      <td
                        className={`px-4 py-2 text-right font-mono font-bold ${
                          esNeta
                            ? "text-[#C9A961] text-sm"
                            : esTotal
                            ? "text-slate-900"
                            : "text-slate-800"
                        }`}
                      >
                        ${linea.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </td>

                      {vistaMensual &&
                        reporte.meses.map((m) => (
                          <td
                            key={m}
                            className={`px-3 py-2 text-right font-mono text-[10px] ${
                              esNeta ? "text-white" : "text-slate-600"
                            }`}
                          >
                            ${(linea.mensual[m] || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Haz clic en cualquier línea operativa para ver el desglose de movimientos</span>
          <span>Moneda: MXN ($) · Base Devengada</span>
        </div>
      </section>

      {/* DRILL DOWN MODAL */}
      {drillDownFila && (
        <ModalDrillDown
          abierto={Boolean(drillDownFila)}
          onCerrar={() => setDrillDownFila(null)}
          titulo={drillDownFila.concepto}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          businessUnitId={businessUnitId}
          tipo="todos"
          lineaPnl={drillDownFila.clave}
        />
      )}
    </div>
  );
}
