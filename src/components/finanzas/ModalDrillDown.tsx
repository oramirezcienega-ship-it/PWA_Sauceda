"use client";

import React, { useEffect, useState } from "react";
import type { Transaction } from "@/app/actions/finanzas";
import { obtenerMovimientosFinanzas } from "@/app/actions/finanzas";

interface ModalDrillDownProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  fechaInicio: string;
  fechaFin: string;
  businessUnitId?: string;
  tipo?: "ingreso" | "egreso" | "todos";
  categoriaId?: string;
}

export function ModalDrillDown({
  abierto,
  onCerrar,
  titulo,
  fechaInicio,
  fechaFin,
  businessUnitId,
  tipo,
  categoriaId
}: ModalDrillDownProps) {
  const [cargando, setCargando] = useState(false);
  const [movimientos, setMovimientos] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    obtenerMovimientosFinanzas({
      fechaInicio,
      fechaFin,
      businessUnitId: businessUnitId === "todas" ? undefined : businessUnitId,
      tipo: tipo === "todos" ? undefined : tipo,
      categoriaId: categoriaId === "todas" ? undefined : categoriaId,
      limite: 100
    })
      .then((res) => setMovimientos(res.movimientos))
      .catch((err) => console.error("Error al cargar drill-down:", err))
      .finally(() => setCargando(false));
  }, [abierto, fechaInicio, fechaFin, businessUnitId, tipo, categoriaId]);

  if (!abierto) return null;

  const total = movimientos.reduce((sum, m) => sum + m.monto_total, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>🔍</span> {titulo}
            </h3>
            <p className="text-[11px] text-slate-400">
              Desglose detallado de movimientos del periodo {fechaInicio} al {fechaFin}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
          <span className="text-xs font-semibold text-slate-600">
            Total en este concepto:{" "}
            <span className="font-bold text-slate-800 font-mono">
              ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
            </span>
          </span>
          <span className="text-[11px] text-slate-400">
            {movimientos.length} movimiento(s) registrado(s)
          </span>
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl scrollbar-sutil">
          {cargando ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2D4A2B] border-t-transparent" />
            </div>
          ) : movimientos.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No hay movimientos contables asociados a esta línea en el periodo seleccionado.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[9px] font-bold sticky top-0">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Contraparte / Cliente</th>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 text-slate-700">
                    <td className="px-3 py-2 font-mono text-[10px]">{m.fecha_operacion}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          m.tipo === "ingreso"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {m.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] font-semibold">{m.categoria_nombre}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{m.concepto}</td>
                    <td className="px-3 py-2 text-slate-500">{m.contraparte || m.expediente_cliente || "—"}</td>
                    <td className="px-3 py-2 text-slate-500 text-[10px]">{m.money_account_nombre || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                      ${m.monto_total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl bg-[#2D4A2B] px-5 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
