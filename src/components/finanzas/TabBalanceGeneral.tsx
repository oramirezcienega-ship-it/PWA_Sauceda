"use client";

import React, { useState } from "react";
import type { BalanceGeneralReporte } from "@/app/actions/finanzas";
import { exportarBalanceGeneralPdf, exportarAExcelCSV } from "@/lib/finanzasExport";

interface TabBalanceGeneralProps {
  balance: BalanceGeneralReporte;
  cargando: boolean;
  fechaCorte: string;
  onCambiarFechaCorte: (fecha: string) => void;
  nombreUnidad?: string;
}

export function TabBalanceGeneral({
  balance,
  cargando,
  fechaCorte,
  onCambiarFechaCorte,
  nombreUnidad
}: TabBalanceGeneralProps) {
  const [fechaInput, setFechaInput] = useState(fechaCorte);

  const handleExportarPdf = () => {
    exportarBalanceGeneralPdf(balance, fechaCorte, nombreUnidad || "Consolidado Todas");
  };

  const handleExportarExcel = () => {
    const encabezados = ["Clasificación", "Cuenta Contable", "Monto (MXN)"];
    const filas: Array<[string, string, number]> = [
      // ACTIVO
      ["ACTIVO CIRCULANTE", "Efectivo y Bancos", balance.activo.circulante.efectivoYBancos.total],
      ...balance.activo.circulante.efectivoYBancos.cuentas.map(
        (c) => ["  • " + c.nombre, "Efectivo/Banco", c.saldo] as [string, string, number]
      ),
      ["ACTIVO CIRCULANTE", "Cuentas por Cobrar a Clientes", balance.activo.circulante.cuentasPorCobrar],
      ["ACTIVO NO CIRCULANTE", "Mobiliario, Equipo y Activo Fijo", balance.activo.noCirculante.activoFijoNeto],
      ["TOTAL ACTIVO", "TOTAL ACTIVO", balance.activo.totalActivo],

      // PASIVO
      ["PASIVO CORTO PLAZO", "Cuentas por Pagar a Proveedores", balance.pasivo.cortoPlazo.cuentasPorPagar],
      ["PASIVO CORTO PLAZO", "Tarjetas de Crédito Corporativas", balance.pasivo.cortoPlazo.tarjetasCredito],
      ["PASIVO CORTO PLAZO", "Impuestos por Pagar (ISR)", balance.pasivo.cortoPlazo.impuestosPorPagar],
      ["PASIVO LARGO PLAZO", "Préstamos Bancarios y Terceros", balance.pasivo.largoPlazo.prestamos],
      ["TOTAL PASIVO", "TOTAL PASIVO", balance.pasivo.totalPasivo],

      // CAPITAL
      ["CAPITAL CONTABLE", "Aportaciones de Socios / Dueño", balance.capital.aportaciones],
      ["CAPITAL CONTABLE", "Retiros de Socios / Dueño (-)", -balance.capital.retiros],
      ["CAPITAL CONTABLE", "Utilidades de Ejercicios Anteriores", balance.capital.utilidadesAnteriores],
      ["CAPITAL CONTABLE", "Utilidad del Ejercicio Actual", balance.capital.utilidadEjercicio],
      ["TOTAL CAPITAL", "TOTAL CAPITAL CONTABLE", balance.capital.totalCapital],

      ["PASIVO + CAPITAL", "TOTAL PASIVO + CAPITAL", balance.totalPasivoYCapital]
    ];

    exportarAExcelCSV(`Balance_General_SAUCEDA_${fechaCorte}`, encabezados, filas);
  };

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR DE ACCIONES Y FECHA DE CORTE */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>⚖️</span> Balance General (Posición Financiera a Fecha de Corte)
          </h3>
          <p className="text-[11px] text-slate-400">
            Estructura patrimonial: Activo = Pasivo + Capital Contable
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* SELECTOR DE FECHA DE CORTE */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Corte al:
            </span>
            <input
              type="date"
              value={fechaInput}
              onChange={(e) => {
                setFechaInput(e.target.value);
                onCambiarFechaCorte(e.target.value);
              }}
              className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

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

      {/* 2. INDICADOR DE CUADRE CONTABLE */}
      <section>
        {balance.estaCuadrado ? (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-sm">
                ✓
              </span>
              <div>
                <h4 className="text-xs font-bold text-emerald-900">
                  Balance Contable Cuadrado al Centavo
                </h4>
                <p className="text-[11px] text-emerald-700">
                  Total Activo ($
                  {balance.activo.totalActivo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}) =
                  Total Pasivo + Capital ($
                  {balance.totalPasivoYCapital.toLocaleString("es-MX", { minimumFractionDigits: 2 })})
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-xl bg-white text-emerald-800 font-bold text-xs border border-emerald-200 font-mono shadow-2xs">
              Diferencia: $0.00
            </span>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white font-bold text-sm">
                !
              </span>
              <div>
                <h4 className="text-xs font-bold text-rose-900">Descuadre en Balance General</h4>
                <p className="text-[11px] text-rose-700">
                  Existe una diferencia de ${Math.abs(balance.diferencia).toLocaleString("es-MX", { minimumFractionDigits: 2 })} entre Activo y Pasivo+Capital.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-xl bg-white text-rose-800 font-bold text-xs border border-rose-200 font-mono shadow-2xs">
              Diferencia: ${balance.diferencia.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </section>

      {/* 3. DOS COLUMNAS: ACTIVO VS PASIVO Y CAPITAL */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUMNA ACTIVO */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-fraunces text-base font-bold text-[#2D4A2B] uppercase tracking-wide">
              Activo
            </h4>
            <span className="text-base font-black font-mono text-[#2D4A2B]">
              ${balance.activo.totalActivo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Activo Circulante */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700">
              <span>Activo Circulante</span>
              <span className="font-mono">
                ${balance.activo.circulante.totalCirculante.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="pl-3 pr-1 space-y-1 text-xs">
              <div className="font-semibold text-slate-800 pt-1">Efectivo y Bancos:</div>
              {balance.activo.circulante.efectivoYBancos.cuentas.map((c, i) => (
                <div key={i} className="flex items-center justify-between pl-3 text-slate-600">
                  <span className="text-[11px]">• {c.nombre}</span>
                  <span className="font-mono font-medium">
                    ${c.saldo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2 text-slate-700">
                <span>Cuentas por Cobrar a Clientes</span>
                <span className="font-mono font-medium">
                  ${balance.activo.circulante.cuentasPorCobrar.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Activo No Circulante */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700">
              <span>Activo No Circulante</span>
              <span className="font-mono">
                ${balance.activo.noCirculante.totalNoCirculante.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="pl-3 pr-1 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-700">
                <span>Mobiliario, Equipo y Activo Fijo</span>
                <span className="font-mono font-medium">
                  ${balance.activo.noCirculante.activoFijoNeto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-[#2D4A2B] flex items-center justify-between font-bold text-sm text-[#2D4A2B]">
            <span>TOTAL ACTIVO</span>
            <span className="font-mono text-base">
              ${balance.activo.totalActivo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* COLUMNA PASIVO Y CAPITAL */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
          {/* PASIVO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-fraunces text-base font-bold text-slate-800 uppercase tracking-wide">
                Pasivo
              </h4>
              <span className="text-base font-black font-mono text-rose-700">
                ${balance.pasivo.totalPasivo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-1 rounded-lg font-bold text-slate-700 text-[11px]">
                <span>Pasivo a Corto Plazo</span>
                <span className="font-mono">
                  ${balance.pasivo.cortoPlazo.totalCortoPlazo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between pl-3 pr-1 text-slate-600">
                <span>Cuentas por Pagar Proveedores</span>
                <span className="font-mono font-medium">
                  ${balance.pasivo.cortoPlazo.cuentasPorPagar.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between pl-3 pr-1 text-slate-600">
                <span>Tarjetas de Crédito Corporativas</span>
                <span className="font-mono font-medium">
                  ${balance.pasivo.cortoPlazo.tarjetasCredito.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between pl-3 pr-1 text-slate-600">
                <span>Impuestos por Pagar (ISR Acumulado)</span>
                <span className="font-mono font-medium">
                  ${balance.pasivo.cortoPlazo.impuestosPorPagar.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-50 px-3 py-1 rounded-lg font-bold text-slate-700 text-[11px] mt-2">
                <span>Pasivo a Largo Plazo</span>
                <span className="font-mono">
                  ${balance.pasivo.largoPlazo.totalLargoPlazo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between pl-3 pr-1 text-slate-600">
                <span>Préstamos Bancarios y de Terceros</span>
                <span className="font-mono font-medium">
                  ${balance.pasivo.largoPlazo.prestamos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* CAPITAL CONTABLE */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-fraunces text-base font-bold text-[#2D4A2B] uppercase tracking-wide">
                Capital Contable
              </h4>
              <span className="text-base font-black font-mono text-[#2D4A2B]">
                ${balance.capital.totalCapital.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-1.5 text-xs pl-1">
              <div className="flex items-center justify-between text-slate-600">
                <span>Aportaciones de Socios / Dueño</span>
                <span className="font-mono font-medium">
                  ${balance.capital.aportaciones.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Retiros de Socios / Dueño (-)</span>
                <span className="font-mono font-medium text-rose-600">
                  -${balance.capital.retiros.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Utilidades de Ejercicios Anteriores</span>
                <span className="font-mono font-medium">
                  ${balance.capital.utilidadesAnteriores.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-800 font-bold bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100">
                <span>Utilidad del Ejercicio Actual (Año a la Fecha)</span>
                <span className="font-mono font-bold">
                  ${balance.capital.utilidadEjercicio.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-slate-900 flex items-center justify-between font-bold text-sm text-slate-900">
            <span>TOTAL PASIVO + CAPITAL</span>
            <span className="font-mono text-base">
              ${balance.totalPasivoYCapital.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
