"use client";

import React, { useState } from "react";
import type { ResumenFinanciero } from "@/app/actions/finanzas";
import { generarDiagnosticoSofiaFinanzas } from "@/app/actions/finanzas";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface TabResumenProps {
  resumen: ResumenFinanciero;
  cargando: boolean;
  onRefrescar: () => void;
  fechaInicio: string;
  fechaFin: string;
  businessUnitId?: string;
}

const PALETA_COLORES = [
  "#2D4A2B", // Verde Profundo
  "#C9A961", // Dorado
  "#3B82F6", // Azul
  "#EC4899", // Rosa
  "#8B5CF6", // Púrpura
  "#F59E0B", // Ámbar
  "#10B981", // Esmeralda
  "#64748B"  // Slate
];

export function TabResumen({
  resumen,
  cargando,
  onRefrescar,
  fechaInicio,
  fechaFin,
  businessUnitId
}: TabResumenProps) {
  const [generandoSofia, setGenerandoSofia] = useState(false);
  const [sofiaFeedback, setSofiaFeedback] = useState<ResumenFinanciero["diagnosticoSofia"]>(
    resumen.diagnosticoSofia || null
  );

  const handleGenerarSofia = async () => {
    setGenerandoSofia(true);
    try {
      const diag = await generarDiagnosticoSofiaFinanzas(fechaInicio, fechaFin, businessUnitId);
      setSofiaFeedback(diag);
      onRefrescar();
    } catch (err: any) {
      alert("Error al generar diagnóstico: " + err.message);
    } finally {
      setGenerandoSofia(false);
    }
  };

  // Datos para gráfica de ingresos vs egresos (periodo actual vs previo)
  const datosGraficoComparativo = [
    {
      nombre: "Periodo Anterior",
      Ingresos: resumen.ingresosPrev,
      Egresos: resumen.egresosPrev,
      Utilidad: resumen.utilidadNetaPrev
    },
    {
      nombre: "Periodo Actual",
      Ingresos: resumen.ingresos,
      Egresos: resumen.egresos,
      Utilidad: resumen.utilidadNeta
    }
  ];

  // Datos para gráfico de pastel de rentabilidad por unidad
  const datosPastelUnidades = resumen.rentabilidadPorUnidad
    .filter((u) => u.ingresos > 0)
    .map((u) => ({
      name: u.nombre,
      value: u.ingresos
    }));

  return (
    <div className="space-y-6">
      {/* 1. KPIS PRINCIPALES (GRID EJECUTIVO) */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        {/* INGRESOS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-[#2D4A2B] transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Ingresos Totales
            </span>
            <span className="text-base">📈</span>
          </div>
          <div className="mt-2">
            <p className="text-xl sm:text-2xl font-black font-mono text-[#2D4A2B]">
              ${resumen.ingresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              {resumen.ingresosPrev > 0 ? (
                <span
                  className={`font-bold ${
                    resumen.variacionIngresos >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {resumen.variacionIngresos >= 0 ? "▲ +" : "▼ "}
                  {resumen.variacionIngresos.toFixed(1)}% vs anterior
                </span>
              ) : (
                <span className="text-slate-400">Sin comparativo previo</span>
              )}
            </div>
          </div>
        </div>

        {/* EGRESOS TOTALES */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-[#2D4A2B] transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Egresos Totales
            </span>
            <span className="text-base">📉</span>
          </div>
          <div className="mt-2">
            <p className="text-xl sm:text-2xl font-black font-mono text-rose-700">
              ${resumen.egresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              {resumen.egresosPrev > 0 ? (
                <span
                  className={`font-bold ${
                    resumen.variacionEgresos <= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {resumen.variacionEgresos >= 0 ? "▲ +" : "▼ "}
                  {resumen.variacionEgresos.toFixed(1)}% vs anterior
                </span>
              ) : (
                <span className="text-slate-400">Sin comparativo previo</span>
              )}
            </div>
          </div>
        </div>

        {/* UTILIDAD NETA */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-[#2D4A2B] transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Utilidad Neta
            </span>
            <span className="text-base">💰</span>
          </div>
          <div className="mt-2">
            <p
              className={`text-xl sm:text-2xl font-black font-mono ${
                resumen.utilidadNeta >= 0 ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              ${resumen.utilidadNeta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              <span className="font-semibold text-slate-500">
                Margen: {resumen.margenNeto.toFixed(1)}%
              </span>
              {resumen.utilidadNetaPrev !== 0 && (
                <span
                  className={`font-bold ${
                    resumen.variacionUtilidad >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  ({resumen.variacionUtilidad >= 0 ? "+" : ""}
                  {resumen.variacionUtilidad.toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* EFECTIVO DISPONIBLE */}
        <div className="rounded-2xl border border-slate-200 bg-[#F5F1E8]/40 p-4 shadow-xs hover:border-[#2D4A2B] transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#2D4A2B] uppercase tracking-wider">
              Efectivo Disponible
            </span>
            <span className="text-base">🏦</span>
          </div>
          <div className="mt-2">
            <p className="text-xl sm:text-2xl font-black font-mono text-[#2D4A2B]">
              ${resumen.efectivoDisponible.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
              <span>Caja & Cuentas Bancarias</span>
            </div>
          </div>
        </div>

        {/* POR COBRAR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Por Cobrar (Pendiente)
          </span>
          <p className="text-lg sm:text-xl font-extrabold font-mono text-amber-700 mt-1">
            ${resumen.porCobrar.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400 mt-1">Ventas y comisiones pendientes</span>
        </div>

        {/* POR PAGAR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Por Pagar a Proveedores
          </span>
          <p className="text-lg sm:text-xl font-extrabold font-mono text-slate-700 mt-1">
            ${resumen.porPagar.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400 mt-1">Facturas y compras pendientes</span>
        </div>

        {/* RUNWAY: MESES DE OPERACIÓN */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Meses Cubiertos (Runway)
          </span>
          <p
            className={`text-lg sm:text-xl font-extrabold font-mono mt-1 ${
              resumen.mesesOperacionCubiertos >= 3
                ? "text-emerald-700"
                : resumen.mesesOperacionCubiertos >= 1.5
                ? "text-amber-600"
                : "text-rose-600"
            }`}
          >
            {resumen.mesesOperacionCubiertos >= 90 ? "90+ meses" : `${resumen.mesesOperacionCubiertos} meses`}
          </p>
          <span className="text-[10px] text-slate-400 mt-1">
            Gasto fijo: ${resumen.puntoEquilibrio.gastoFijoMensual.toLocaleString()}/mes
          </span>
        </div>

        {/* PUNTO DE EQUILIBRIO */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Punto de Equilibrio
          </span>
          <p className="text-lg sm:text-xl font-extrabold font-mono text-[#2D4A2B] mt-1">
            ${resumen.puntoEquilibrio.ventasRequeridas.toLocaleString()}{" "}
            <span className="text-xs font-normal text-slate-500">/ mes</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1">
            ~{resumen.puntoEquilibrio.operacionesRequeridas} operaciones al mes
          </span>
        </div>
      </section>

      {/* 2. ALERTAS BASADAS 100% EN DATOS REALES */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-3 flex items-center gap-2">
          <span>🔔</span> Alertas del Negocio (Calculadas con Reglas Reales)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {resumen.alertas.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin datos suficientes para calcular alertas.</p>
          ) : (
            resumen.alertas.map((al, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                  al.tipo === "danger"
                    ? "bg-rose-50/70 border-rose-200 text-rose-900"
                    : al.tipo === "warning"
                    ? "bg-amber-50/70 border-amber-200 text-amber-900"
                    : al.tipo === "success"
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                    : "bg-slate-50 border-slate-200 text-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">
                      {al.tipo === "danger" ? "🔴" : al.tipo === "warning" ? "🟡" : al.tipo === "success" ? "🟢" : "ℹ️"}
                    </span>
                    <h4 className="font-bold text-xs">{al.titulo}</h4>
                  </div>
                  <p className="text-[11px] mt-1 leading-snug text-slate-600">{al.descripcion}</p>
                </div>
                {al.metrica && (
                  <span className="px-2 py-0.5 rounded-lg bg-white/80 font-mono font-bold text-[10px] border border-black/5 shadow-2xs whitespace-nowrap">
                    {al.metrica}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 3. DIAGNÓSTICO DE SOFÍA (IA BAJO DEMANDA) */}
      <section className="rounded-2xl border border-[#2D4A2B]/20 bg-gradient-to-br from-white to-[#F5F1E8]/30 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>🧠</span> Diagnóstico de Sofía (Directora de Operaciones & Finanzas)
            </h3>
            <p className="text-[11px] text-slate-500">
              Generado bajo demanda analizando exclusivamente las cifras reales agregadas de este periodo
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerarSofia}
            disabled={generandoSofia}
            className="self-start sm:self-auto rounded-xl bg-[#2D4A2B] px-4 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-2 disabled:opacity-50"
          >
            {generandoSofia ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Analizando finanzas reales...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Generar Diagnóstico Actualizado</span>
              </>
            )}
          </button>
        </div>

        {sofiaFeedback ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-white/80 p-2 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700">
                Periodo analizado: {sofiaFeedback.periodo}
              </span>
              <span>
                Fecha de emisión: {new Date(sofiaFeedback.fecha).toLocaleDateString("es-MX")}{" "}
                {new Date(sofiaFeedback.fecha).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="text-xs font-bold text-[#2D4A2B] uppercase tracking-wider mb-2">
                  Informe Ejecutivo
                </h4>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-cuerpo">
                  {sofiaFeedback.diagnostico_general}
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-xl">
                  <h4 className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span>💡</span> Oportunidades Clave
                  </h4>
                  <ul className="space-y-1.5 text-[11px] text-amber-900 leading-snug">
                    {sofiaFeedback.oportunidades.map((o, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-amber-500">•</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl">
                  <h4 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span>🛡️</span> Estado General
                  </h4>
                  <p className="text-xs font-bold text-emerald-900 capitalize">
                    {sofiaFeedback.estado_salud}
                  </p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    Diagnóstico generado con estricta base en los registros contables del CRM.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center bg-white/50 rounded-xl border border-dashed border-slate-300">
            <span className="text-2xl">📊</span>
            <p className="text-xs font-semibold text-slate-600 mt-2">
              Aún no se ha generado el Diagnóstico de Sofía para este periodo.
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Haz clic en &quot;Generar Diagnóstico Actualizado&quot; para que Sofía evalúe los números reales.
            </p>
          </div>
        )}
      </section>

      {/* 4. GRÁFICOS: INGRESOS VS EGRESOS Y RENTABILIDAD POR UNIDAD */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-2">
            Desempeño Financiero (Actual vs Anterior)
          </h3>
          <p className="text-[11px] text-slate-400 mb-4">
            Comparativa de volumen de facturación, egresos y resultado neto
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosGraficoComparativo} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748B" />
                <Tooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()} MXN`]}
                  contentStyle={{ fontSize: 11, borderRadius: 10 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Egresos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Utilidad" fill="#2D4A2B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RENTABILIDAD POR UNIDAD DE NEGOCIO */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-1">
              Rentabilidad por Unidad
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">Distribución de ingresos generados</p>

            {datosPastelUnidades.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosPastelUnidades}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={65}
                      innerRadius={35}
                    >
                      {datosPastelUnidades.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PALETA_COLORES[index % PALETA_COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Sin ingresos registrados por unidad en este periodo.
              </div>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            {resumen.rentabilidadPorUnidad.map((u, i) => (
              <div key={u.unidad_id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: PALETA_COLORES[i % PALETA_COLORES.length] }}
                  />
                  <span className="font-semibold text-slate-700 truncate">{u.nombre}</span>
                </div>
                <div className="text-right font-mono font-bold text-slate-800">
                  ${u.utilidad.toLocaleString()}{" "}
                  <span className={`text-[10px] ${u.margen >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    ({u.margen.toFixed(0)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. TOP OPERACIONES DEL CRM POR MARGEN */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-2">
          Top Operaciones del CRM por Margen
        </h3>
        <p className="text-[11px] text-slate-400 mb-4">
          Ingresos menos costos directos ligados al expediente del CRM
        </p>

        {resumen.topOperacionesCRM.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Aún no hay operaciones del CRM con ingresos o costos directos vinculados en este periodo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold">
                <tr>
                  <th className="px-3 py-2">Expediente / Cliente</th>
                  <th className="px-3 py-2 text-right">Comisión / Venta</th>
                  <th className="px-3 py-2 text-right">Costo Directo</th>
                  <th className="px-3 py-2 text-right">Margen Bruto</th>
                  <th className="px-3 py-2 text-right">% Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {resumen.topOperacionesCRM.map((op) => (
                  <tr key={op.expediente_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {op.cliente}{" "}
                      <span className="text-[9px] font-mono text-slate-400 font-normal">
                        ({op.expediente_id})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      ${op.monto_ingreso.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-rose-700">
                      ${op.costo_directo.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#2D4A2B]">
                      ${op.margen_bruto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          op.margen_pct >= 40
                            ? "bg-emerald-100 text-emerald-800"
                            : op.margen_pct > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {op.margen_pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
