"use client";

import React, { useState } from "react";
import type { EscenarioFinanciero } from "@/app/actions/finanzas-proyecciones";
import { crearEscenario } from "@/app/actions/finanzas-proyecciones";

interface ModalNuevoEscenarioProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar: (nuevoId: string) => void;
  escenariosExistentes: EscenarioFinanciero[];
}

export function ModalNuevoEscenario({
  abierto,
  alCerrar,
  alGuardar,
  escenariosExistentes
}: ModalNuevoEscenarioProps) {
  const [nombre, setNombre] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("2026-10-01");
  const [periodoFin, setPeriodoFin] = useState("2027-12-01");
  const [fechaCorteReal, setFechaCorteReal] = useState("2026-09-30");
  const [copiarDe, setCopiarDe] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("Indica un nombre para el escenario.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const nuevoId = await crearEscenario({
        nombre: nombre.trim(),
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        fecha_corte_real: fechaCorteReal,
        copiarDe: copiarDe || undefined
      });
      alGuardar(nuevoId);
      alCerrar();
    } catch (err: any) {
      setError(err?.message || "Error al crear el escenario.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔮</span>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B]">
              Nuevo Escenario Financiero
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
              Nombre del Escenario *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Base Q4 2026, Optimista 2027, Plan Expansión"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Periodo Inicio *
              </label>
              <input
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Periodo Fin *
              </label>
              <input
                type="date"
                value={periodoFin}
                onChange={(e) => setPeriodoFin(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Fecha de Corte para Datos Reales
            </label>
            <input
              type="date"
              value={fechaCorteReal}
              onChange={(e) => setFechaCorteReal(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Los meses hasta esta fecha se contrastarán contra las métricas reales del CRM.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Punto de Partida
            </label>
            <select
              value={copiarDe}
              onChange={(e) => setCopiarDe(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A2B]"
            >
              <option value="">
                📊 Prellenar con Base Real del CRM (promedios últimos 3 meses)
              </option>
              {escenariosExistentes.map((esc) => (
                <option key={esc.id} value={esc.id}>
                  📋 Copiar líneas y supuestos de: {esc.nombre}
                </option>
              ))}
            </select>
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
              {guardando ? "Creando..." : "Crear Escenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
