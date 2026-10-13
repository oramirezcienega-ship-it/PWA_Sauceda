"use client";

import { useState } from "react";
import { guardarCostosInspeccion, obtenerCostosInspeccion } from "@/app/actions/productos";
import {
  COSTO_INSPECCION_BASE,
  LINEAS_INSPECCION,
  anticipoInspeccion,
  costoInspeccionPorTipo,
  formatoPesosEnteros,
  type CostosInspeccion,
} from "@/lib/costo-inspeccion";

/**
 * Costo de la visita técnica / inspección por línea de negocio. Sofía lo usa al
 * presentar la visita (anticipo = la mitad; se descuenta completa si contrata).
 */
export function CostosInspeccionPanel() {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function abrir() {
    setAbierto((x) => !x);
    if (valores) return;
    const costos = await obtenerCostosInspeccion().catch(() => ({}) as CostosInspeccion);
    const inicial: Record<string, string> = {
      default: String(costos.default ?? COSTO_INSPECCION_BASE),
    };
    for (const l of LINEAS_INSPECCION) inicial[l.tipo] = costos[l.tipo] !== undefined ? String(costos[l.tipo]) : "";
    setValores(inicial);
  }

  async function guardar() {
    if (!valores) return;
    setGuardando(true);
    setMensaje(null);
    const costos: CostosInspeccion = {};
    for (const [k, v] of Object.entries(valores)) {
      if (v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) costos[k] = Number(v);
    }
    const res = await guardarCostosInspeccion(costos);
    setGuardando(false);
    setMensaje(
      res.ok ? { tipo: "ok", texto: "Guardado. Sofía ya usa estos costos." } : { tipo: "error", texto: res.error || "No se pudo guardar." }
    );
  }

  const costosActuales: CostosInspeccion = {};
  if (valores) {
    for (const [k, v] of Object.entries(valores)) if (v.trim() !== "") costosActuales[k] = Number(v);
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white shadow-xs">
      <button type="button" onClick={abrir} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold text-verde-profundo">🔎 Costo de la visita técnica por línea</span>
          <span className="text-[11px] text-carbon/60">
            Lo que cobra la inspección en sitio según el servicio. Anticipo = la mitad; se descuenta completa si contrata.
          </span>
        </span>
        <span className="text-carbon/40">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-carbon/10 p-4 text-xs">
          {!valores ? (
            <p className="text-carbon/50">Cargando…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {LINEAS_INSPECCION.map((l) => {
                  const efectivo = costoInspeccionPorTipo(costosActuales, l.tipo);
                  return (
                    <label key={l.tipo} className="flex items-center justify-between gap-3 rounded-lg border border-carbon/10 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-semibold text-carbon">{l.etiqueta}</span>
                        <span className="text-[10.5px] text-carbon/50">
                          {valores[l.tipo] === "" ? "Usa el general · " : ""}
                          anticipo {formatoPesosEnteros(anticipoInspeccion(efectivo))}
                        </span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={valores[l.tipo]}
                        placeholder={String(costoInspeccionPorTipo(costosActuales, null))}
                        onChange={(e) => setValores((v) => ({ ...(v || {}), [l.tipo]: e.target.value }))}
                        className="w-24 rounded-lg border border-carbon/20 px-2 py-1.5 text-right font-mono"
                      />
                    </label>
                  );
                })}
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-semibold text-carbon">General (líneas sin costo propio)</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={valores.default}
                  onChange={(e) => setValores((v) => ({ ...(v || {}), default: e.target.value }))}
                  className="w-24 rounded-lg border border-carbon/20 px-2 py-1.5 text-right font-mono"
                />
              </label>
              <div className="flex items-center justify-end gap-3">
                {mensaje && (
                  <span className={mensaje.tipo === "ok" ? "text-emerald-700" : "text-rojo"}>{mensaje.texto}</span>
                )}
                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando}
                  className="rounded-lg bg-sauce px-4 py-1.5 font-semibold text-white hover:bg-verde-profundo disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar costos"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
