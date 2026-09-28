"use client";

import React, { useState, useEffect } from "react";
import type { MoneyAccount, CuentaPendienteItem } from "@/app/actions/finanzas";
import { obtenerCuentasPendientes, marcarMovimientoPagado } from "@/app/actions/finanzas";

interface TabCuentasProps {
  moneyAccounts: MoneyAccount[];
  businessUnitId?: string;
  onMovimientoModificado: () => void;
}

export function TabCuentas({
  moneyAccounts,
  businessUnitId,
  onMovimientoModificado
}: TabCuentasProps) {
  const [vista, setVista] = useState<"cobrar" | "pagar">("cobrar");
  const [cargando, setCargando] = useState(false);
  const [dataPendientes, setDataPendientes] = useState<{
    porCobrar: { items: CuentaPendienteItem[]; total: number; tramo0a30: number; tramo31a60: number; tramo60mas: number };
    porPagar: { items: CuentaPendienteItem[]; total: number; tramo0a30: number; tramo31a60: number; tramo60mas: number };
  }>({
    porCobrar: { items: [], total: 0, tramo0a30: 0, tramo31a60: 0, tramo60mas: 0 },
    porPagar: { items: [], total: 0, tramo0a30: 0, tramo31a60: 0, tramo60mas: 0 }
  });

  // Modal para liquidar / marcar pagado
  const [itemALiquidar, setItemALiquidar] = useState<CuentaPendienteItem | null>(null);
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().split("T")[0]);
  const [cuentaPagoId, setCuentaPagoId] = useState<string>(moneyAccounts[0]?.id || "");
  const [liquidando, setLiquidando] = useState(false);

  const cargarCuentas = async () => {
    setCargando(true);
    try {
      const res = await obtenerCuentasPendientes(businessUnitId === "todas" ? undefined : businessUnitId);
      setDataPendientes(res);
    } catch (err: any) {
      console.error("Error al cargar cuentas pendientes:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCuentas();
  }, [businessUnitId]);

  const handleMarcarPagado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemALiquidar || !cuentaPagoId) return;

    setLiquidando(true);
    try {
      const res = await marcarMovimientoPagado(itemALiquidar.id, fechaPago, cuentaPagoId);
      if (!res.success) throw new Error(res.message);

      setItemALiquidar(null);
      await cargarCuentas();
      onMovimientoModificado();
    } catch (err: any) {
      alert("Error al marcar como pagado: " + err.message);
    } finally {
      setLiquidando(false);
    }
  };

  const seccionActual = vista === "cobrar" ? dataPendientes.porCobrar : dataPendientes.porPagar;

  return (
    <div className="space-y-6">
      {/* 1. SELECTOR COBRAR VS PAGAR */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>⏳</span> Cuentas por Cobrar y por Pagar
          </h3>
          <p className="text-[11px] text-slate-400">
            Control de cartera y pasivos con antigüedad de saldos y liquidación directa
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold shadow-2xs">
          <button
            type="button"
            onClick={() => setVista("cobrar")}
            className={`rounded-lg px-4 py-1.5 transition flex items-center gap-1.5 ${
              vista === "cobrar"
                ? "bg-emerald-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🟢</span> Por Cobrar (${dataPendientes.porCobrar.total.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => setVista("pagar")}
            className={`rounded-lg px-4 py-1.5 transition flex items-center gap-1.5 ${
              vista === "pagar"
                ? "bg-rose-700 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🔴</span> Por Pagar (${dataPendientes.porPagar.total.toLocaleString()})
          </button>
        </div>
      </section>

      {/* 2. TARJETAS DE ANTIGÜEDAD DE SALDOS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Total {vista === "cobrar" ? "por Cobrar" : "por Pagar"}
          </span>
          <p className="text-xl sm:text-2xl font-black font-mono mt-1 text-slate-900">
            ${seccionActual.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-400">{seccionActual.items.length} documento(s)</span>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
              Corriente (0-30 días)
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono mt-1 text-emerald-900">
            ${seccionActual.tramo0a30.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-700">Dentro del plazo estándar</span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              Atención (31-60 días)
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono mt-1 text-amber-900">
            ${seccionActual.tramo31a60.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-amber-700">Requiere seguimiento</span>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">
              Vencido (+60 días)
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black font-mono mt-1 text-rose-900">
            ${seccionActual.tramo60mas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-rose-700 font-bold">Cobranza / Pago prioritario</span>
        </div>
      </section>

      {/* 3. TABLA DE PARTIDAS PENDIENTES */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="overflow-x-auto scrollbar-sutil">
          {cargando ? (
            <div className="py-16 text-center text-xs text-slate-400">Consultando cartera pendiente...</div>
          ) : seccionActual.items.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              🎉 No hay cuentas {vista === "cobrar" ? "por cobrar" : "por pagar"} pendientes en este momento.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-3.5 py-2.5">Fecha Operación</th>
                  <th className="px-3.5 py-2.5">Antigüedad</th>
                  <th className="px-3.5 py-2.5">Concepto</th>
                  <th className="px-3.5 py-2.5">Contraparte</th>
                  <th className="px-3.5 py-2.5">Unidad</th>
                  <th className="px-3.5 py-2.5 text-right">Monto Pendiente</th>
                  <th className="px-3.5 py-2.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {seccionActual.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 text-slate-700">
                    <td className="px-3.5 py-2.5 font-mono text-[10px] whitespace-nowrap">
                      {item.fecha_operacion}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          item.tramo === "0-30"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.tramo === "31-60"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800 font-black"
                        }`}
                      >
                        {item.diasAntiguedad} días ({item.tramo})
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                      {item.concepto}
                      {item.crm_deal_id && (
                        <span className="text-[9px] text-[#2D4A2B] bg-[#F5F1E8] px-1.5 py-0.2 rounded font-bold ml-1.5 inline-block">
                          Folio: {item.crm_deal_id}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 font-medium">
                      {item.contraparte}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 text-[10px]">
                      {item.business_unit_nombre}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      ${item.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setItemALiquidar(item);
                          setFechaPago(new Date().toISOString().split("T")[0]);
                          setCuentaPagoId(moneyAccounts[0]?.id || "");
                        }}
                        className={`rounded-lg px-3 py-1 text-xs font-bold text-white transition shadow-2xs ${
                          vista === "cobrar"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : "bg-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        {vista === "cobrar" ? "Marcar Cobrado" : "Marcar Pagado"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 4. MODAL PARA MARCAR PAGADO / COBRADO */}
      {itemALiquidar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-fraunces text-base font-bold text-[#2D4A2B]">
                  {vista === "cobrar" ? "💰 Registrar Cobro de Cliente" : "💳 Registrar Liquidación de Pago"}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Afecta el saldo en cuenta y cuadra automáticamente el balance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setItemALiquidar(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMarcarPagado} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <p className="text-slate-500 font-semibold">Concepto:</p>
                <p className="font-bold text-slate-800">{itemALiquidar.concepto}</p>
                <p className="mt-1 text-slate-500">
                  Monto:{" "}
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    ${itemALiquidar.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Fecha en que se {vista === "cobrar" ? "cobró" : "pagó"} *
                </label>
                <input
                  type="date"
                  required
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Cuenta de Dinero ({vista === "cobrar" ? "a dónde entró" : "de dónde salió"}) *
                </label>
                <select
                  required
                  value={cuentaPagoId}
                  onChange={(e) => setCuentaPagoId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
                >
                  {moneyAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} (Saldo actual: ${a.saldo_actual?.toLocaleString("es-MX")})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setItemALiquidar(null)}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={liquidando}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50"
                >
                  {liquidando ? "Registrando..." : "Confirmar Pago"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
