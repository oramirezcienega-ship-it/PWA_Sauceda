"use client";

import React, { useState } from "react";
import type { EscenarioFinanciero } from "@/app/actions/finanzas-proyecciones";
import { duplicarEscenario } from "@/app/actions/finanzas-proyecciones";

interface ModalDuplicarEscenarioProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar: (nuevoId: string) => void;
  escenarioActual: EscenarioFinanciero | null;
}

export function ModalDuplicarEscenario({
  abierto,
  alCerrar,
  alGuardar,
  escenarioActual
}: ModalDuplicarEscenarioProps) {
  const [nombre, setNombre] = useState(
    escenarioActual ? `${escenarioActual.nombre} (Copia)` : ""
  );
  const [tipoFactor, setTipoFactor] = useState<"conservador" | "exacto" | "optimista" | "personalizado">("exacto");
  const [factorPersonalizado, setFactorPersonalizado] = useState("1.0");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto || !escenarioActual) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("Indica un nombre para el nuevo escenario.");
      return;
    }
    let factorNum = 1.0;
    if (tipoFactor === "conservador") factorNum = 0.7;
    else if (tipoFactor === "optimista") factorNum = 1.3;
    else if (tipoFactor === "personalizado") factorNum = parseFloat(factorPersonalizado) || 1.0;

    setGuardando(true);
    setError(null);
    try {
      const nuevoId = await duplicarEscenario(escenarioActual.id, nombre.trim(), factorNum);
      alGuardar(nuevoId);
      alCerrar();
    } catch (err: any) {
      setError(err?.message || "Error al duplicar escenario.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">📑</span>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B]">
              Duplicar Escenario
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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nombre del Nuevo Escenario *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Conservador Q4 2026 (-30% leads)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Ajuste de Variables (Factor de Volumen)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipoFactor("conservador")}
                className={`p-2 rounded-xl text-center border text-xs font-bold transition ${
                  tipoFactor === "conservador"
                    ? "border-amber-500 bg-amber-50 text-amber-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div>🛡️ Conservador</div>
                <div className="text-[10px] text-slate-400 font-normal">Leads × 0.7 (-30%)</div>
              </button>
              <button
                type="button"
                onClick={() => setTipoFactor("exacto")}
                className={`p-2 rounded-xl text-center border text-xs font-bold transition ${
                  tipoFactor === "exacto"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div>⚖️ Idéntico</div>
                <div className="text-[10px] text-slate-400 font-normal">Sin cambios (1.0x)</div>
              </button>
              <button
                type="button"
                onClick={() => setTipoFactor("optimista")}
                className={`p-2 rounded-xl text-center border text-xs font-bold transition ${
                  tipoFactor === "optimista"
                    ? "border-blue-500 bg-blue-50 text-blue-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div>🚀 Optimista</div>
                <div className="text-[10px] text-slate-400 font-normal">Leads × 1.3 (+30%)</div>
              </button>
            </div>
          </div>

          {tipoFactor === "personalizado" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Factor numérico multiplicador
              </label>
              <input
                type="number"
                step="0.05"
                value={factorPersonalizado}
                onChange={(e) => setFactorPersonalizado(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              />
            </div>
          )}

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
              {guardando ? "Duplicando..." : "Duplicar Escenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
