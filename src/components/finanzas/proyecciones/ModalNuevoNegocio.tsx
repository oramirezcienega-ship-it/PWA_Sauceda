"use client";

import React, { useState } from "react";
import type { BusinessUnit } from "@/app/actions/finanzas";
import { agregarLineaNueva } from "@/app/actions/finanzas-proyecciones";

interface ModalNuevoNegocioProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar: () => void;
  escenarioId: string;
  meses: string[];
  unidades: BusinessUnit[];
}

export function ModalNuevoNegocio({
  abierto,
  alCerrar,
  alGuardar,
  escenarioId,
  meses,
  unidades
}: ModalNuevoNegocioProps) {
  const [nombre, setNombre] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState(unidades[0]?.id || "");
  const [modelo, setModelo] = useState<"manual" | "embudo">("manual");
  const [ticket, setTicket] = useState("25000");
  const [margenPct, setMargenPct] = useState("50");
  const [comisionAsesorPct, setComisionAsesorPct] = useState("5");
  const [tipoCobro, setTipoCobro] = useState<"inmediato" | "infonavit_split" | "personalizado">("inmediato");
  const [operacionesGlobales, setOperacionesGlobales] = useState("1.0");
  const [operacionesPorMes, setOperacionesPorMes] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return null;

  const handleGlobalChange = (val: string) => {
    setOperacionesGlobales(val);
    const updated: Record<string, string> = {};
    meses.forEach((m) => {
      updated[m] = val;
    });
    setOperacionesPorMes(updated);
  };

  const handleMesChange = (mes: string, val: string) => {
    setOperacionesPorMes((prev) => ({ ...prev, [mes]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("Indica el nombre de la nueva línea de negocio.");
      return;
    }

    let esquema = [{ pct: 1, desfase_meses: 0 }];
    if (tipoCobro === "infonavit_split") {
      esquema = [
        { pct: 0.5, desfase_meses: 0 },
        { pct: 0.5, desfase_meses: 1 }
      ];
    }

    const opsList = meses.map((m) => ({
      mes: m,
      operaciones: parseFloat(operacionesPorMes[m] ?? operacionesGlobales) || 0
    }));

    setGuardando(true);
    setError(null);
    try {
      await agregarLineaNueva({
        escenario_id: escenarioId,
        nombre: nombre.trim(),
        business_unit_id: businessUnitId || null,
        modelo,
        ticket: parseFloat(ticket) || 0,
        margen_pct: (parseFloat(margenPct) || 0) / 100,
        pct_comision_asesor: (parseFloat(comisionAsesorPct) || 0) / 100,
        operaciones_por_mes: opsList,
        esquema_cobro: esquema
      });
      alGuardar();
      alCerrar();
    } catch (err: any) {
      setError(err?.message || "Error al crear la nueva línea.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B]">
              Dar de Alta Nuevo Negocio / Línea
            </h3>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nombre del Negocio o Servicio *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Casa compartida + trámite, Venta en verde..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Unidad de Negocio *
              </label>
              <select
                value={businessUnitId}
                onChange={(e) => setBusinessUnitId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Modelo de Cálculo
              </label>
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              >
                <option value="manual">Manual (Operaciones directas)</option>
                <option value="embudo">Embudo (Leads × % Cot × % Cierre)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ticket Bruto Promedio (MXN)
              </label>
              <input
                type="number"
                step="100"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Margen Bruto (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={margenPct}
                onChange={(e) => setMargenPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                % Comisión Asesor
              </label>
              <input
                type="number"
                step="0.5"
                value={comisionAsesorPct}
                onChange={(e) => setComisionAsesorPct(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Esquema de Cobro (Flujo de Caja)
              </label>
              <select
                value={tipoCobro}
                onChange={(e) => setTipoCobro(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              >
                <option value="inmediato">100% en el mes de cierre</option>
                <option value="infonavit_split">
                  INFONAVIT (50% al inicio + 50% escritura mes +1)
                </option>
              </select>
            </div>
          </div>

          {/* Programación de operaciones mensuales */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700">
                Operaciones estimadas por mes
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Rellenar todos:</span>
                <input
                  type="number"
                  step="0.1"
                  value={operacionesGlobales}
                  onChange={(e) => handleGlobalChange(e.target.value)}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-0.5 text-xs"
                />
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
              {meses.map((m) => {
                const mesLabel = new Date(m + "T00:00:00").toLocaleDateString("es-MX", {
                  month: "short",
                  year: "2-digit"
                });
                return (
                  <div key={m} className="bg-white p-2 rounded-lg border border-slate-200 text-center">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">
                      {mesLabel}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      value={operacionesPorMes[m] ?? operacionesGlobales}
                      onChange={(e) => handleMesChange(m, e.target.value)}
                      className="mt-1 w-full text-center rounded border border-slate-200 px-1 py-0.5 text-xs font-bold text-slate-800"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={alCerrar}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 text-xs font-bold bg-[#2D4A2B] text-white hover:bg-[#5C7A52] rounded-xl transition disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Agregar Negocio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
