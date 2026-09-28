"use client";

import React from "react";
import type { FlujoEfectivoReporte } from "@/app/actions/finanzas";
import { exportarFlujoEfectivoPdf, exportarAExcelCSV } from "@/lib/finanzasExport";

interface TabFlujoEfectivoProps {
  flujo: FlujoEfectivoReporte;
  cargando: boolean;
  fechaInicio: string;
  fechaFin: string;
  nombreUnidad?: string;
}

export function TabFlujoEfectivo({
  flujo,
  cargando,
  fechaInicio,
  fechaFin,
  nombreUnidad
}: TabFlujoEfectivoProps) {
  const handleExportarPdf = () => {
    exportarFlujoEfectivoPdf(flujo, `${fechaInicio} al ${fechaFin}`, nombreUnidad || "Consolidado Todas");
  };

  const handleExportarExcel = () => {
    const encabezados = ["Actividad", "Concepto de Flujo", "Monto (MXN)"];
    const filas: Array<[string, string, number]> = [
      ["SALDO INICIAL", "Saldo Inicial de Caja y Bancos", flujo.saldoInicial],

      ["OPERACIÓN", "Cobros a clientes (ventas/comisiones)", flujo.operacion.cobrosClientes],
      ["OPERACIÓN", "Pagos de costos directos de obra (-)", -flujo.operacion.pagosProveedoresCostos],
      ["OPERACIÓN", "Pagos de marketing y publicidad (-)", -flujo.operacion.pagosMarketing],
      ["OPERACIÓN", "Pagos de nómina y asesores (-)", -flujo.operacion.pagosNomina],
      ["OPERACIÓN", "Pagos de renta y servicios (-)", -flujo.operacion.pagosRentaServicios],
      ["OPERACIÓN", "Pagos de impuestos (-)", -flujo.operacion.pagosImpuestos],
      ["OPERACIÓN", "Flujo Neto de Actividades de Operación", flujo.operacion.flujoNetoOperacion],

      ["INVERSIÓN", "Compra de equipo y activo fijo (-)", -flujo.inversion.compraEquipoActivo],
      ["INVERSIÓN", "Flujo Neto de Actividades de Inversión", flujo.inversion.flujoNetoInversion],

      ["FINANCIAMIENTO", "Aportaciones de socios", flujo.financiamiento.aportacionesCapital],
      ["FINANCIAMIENTO", "Retiros de socios (-)", -flujo.financiamiento.retirosDueno],
      ["FINANCIAMIENTO", "Préstamos recibidos", flujo.financiamiento.prestamosRecibidos],
      ["FINANCIAMIENTO", "Pagos a capital de préstamos (-)", -flujo.financiamiento.pagosPrestamos],
      ["FINANCIAMIENTO", "Flujo Neto de Financiamiento", flujo.financiamiento.flujoNetoFinanciamiento],

      ["VARIACIÓN", "Variación Neta de Efectivo", flujo.flujoNetoTotal],
      ["SALDO FINAL", "Saldo Final en Caja y Bancos", flujo.saldoFinal]
    ];

    exportarAExcelCSV(`Flujo_Efectivo_SAUCEDA_${fechaInicio}_${fechaFin}`, encabezados, filas);
  };

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR DE ACCIONES */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>🌊</span> Estado de Flujo de Efectivo (Base Caja)
          </h3>
          <p className="text-[11px] text-slate-400">
            Movimientos reales de dinero cobrados y pagados por actividades operativas, de inversión y financiamiento
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* 2. TARJETAS DE SALDO INICIAL Y FINAL */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Saldo Inicial de Caja & Bancos
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono text-slate-800 mt-1">
            ${flujo.saldoInicial.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">Al arranque del periodo seleccionado</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Variación Neta de Efectivo
          </span>
          <p
            className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
              flujo.flujoNetoTotal >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {flujo.flujoNetoTotal >= 0 ? "+" : ""}
            ${flujo.flujoNetoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">Entradas menos salidas de caja</span>
        </div>

        <div className="rounded-2xl border border-[#2D4A2B] bg-[#2D4A2B] p-4 shadow-xs text-white">
          <span className="text-[10px] font-bold text-[#C9A961] uppercase tracking-wider">
            Saldo Final Disponible
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono mt-1 text-[#F5F1E8]">
            ${flujo.saldoFinal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-white/70">Coincide al centavo con el Balance General</span>
        </div>
      </section>

      {/* 3. DESGLOSE POR ACTIVIDADES */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-6">
        {/* OPERACIÓN */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="font-fraunces text-sm font-bold text-[#2D4A2B] uppercase tracking-wide">
              1. Actividades de Operación
            </h4>
            <span
              className={`font-mono font-bold text-sm ${
                flujo.operacion.flujoNetoOperacion >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              ${flujo.operacion.flujoNetoOperacion.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700 pl-3">
            <div className="flex items-center justify-between">
              <span>Cobros de comisiones y ventas a clientes</span>
              <span className="font-mono text-emerald-700">
                +${flujo.operacion.cobrosClientes.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de costos directos de obra y gestoría</span>
              <span className="font-mono text-rose-700">
                -${flujo.operacion.pagosProveedoresCostos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de marketing y publicidad (Meta/TikTok)</span>
              <span className="font-mono text-rose-700">
                -${flujo.operacion.pagosMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de nómina y honorarios a asesores</span>
              <span className="font-mono text-rose-700">
                -${flujo.operacion.pagosNomina.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de renta y servicios básicos</span>
              <span className="font-mono text-rose-700">
                -${flujo.operacion.pagosRentaServicios.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de impuestos a la utilidad</span>
              <span className="font-mono text-rose-700">
                -${flujo.operacion.pagosImpuestos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* INVERSIÓN */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="font-fraunces text-sm font-bold text-[#2D4A2B] uppercase tracking-wide">
              2. Actividades de Inversión
            </h4>
            <span className="font-mono font-bold text-sm text-slate-800">
              ${flujo.inversion.flujoNetoInversion.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700 pl-3">
            <div className="flex items-center justify-between">
              <span>Compra de mobiliario, equipo y activo fijo</span>
              <span className="font-mono text-rose-700">
                -${flujo.inversion.compraEquipoActivo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* FINANCIAMIENTO */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="font-fraunces text-sm font-bold text-[#2D4A2B] uppercase tracking-wide">
              3. Actividades de Financiamiento
            </h4>
            <span className="font-mono font-bold text-sm text-slate-800">
              ${flujo.financiamiento.flujoNetoFinanciamiento.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700 pl-3">
            <div className="flex items-center justify-between">
              <span>Aportaciones de capital recibidas de socios</span>
              <span className="font-mono text-emerald-700">
                +${flujo.financiamiento.aportacionesCapital.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Retiros de socios / dueño</span>
              <span className="font-mono text-rose-700">
                -${flujo.financiamiento.retirosDueno.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Préstamos bancarios y de terceros recibidos</span>
              <span className="font-mono text-emerald-700">
                +${flujo.financiamiento.prestamosRecibidos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pagos de capital a préstamos</span>
              <span className="font-mono text-rose-700">
                -${flujo.financiamiento.pagosPrestamos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. EVOLUCIÓN MENSUAL DEL SALDO EN CAJA */}
      {flujo.meses.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h4 className="font-fraunces text-sm font-bold text-[#2D4A2B] uppercase tracking-wide mb-3">
            Evolución Mensual del Flujo de Caja
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold">
                <tr>
                  <th className="px-3 py-2">Mes</th>
                  <th className="px-3 py-2 text-right">Saldo Inicial</th>
                  <th className="px-3 py-2 text-right">Entradas</th>
                  <th className="px-3 py-2 text-right">Salidas</th>
                  <th className="px-3 py-2 text-right">Flujo Neto</th>
                  <th className="px-3 py-2 text-right">Saldo Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {flujo.meses.map((m) => (
                  <tr key={m.mes} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{m.mes}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      ${m.saldoInicial.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      +${m.entradas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-rose-700">
                      -${m.salidas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-bold ${
                        m.flujoNeto >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {m.flujoNeto >= 0 ? "+" : ""}
                      ${m.flujoNeto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#2D4A2B]">
                      ${m.saldoFinal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
