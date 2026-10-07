"use client";

import React from "react";
import type { ResultadoLineaTotal, ResultadoLineaMes, SupuestoMes } from "@/lib/finanzas/proyeccion";

export type CampoSupuesto =
  | "operaciones_manual"
  | "leads"
  | "pct_a_cotizacion"
  | "pct_cierre"
  | "ticket_promedio"
  | "margen_pct"
  | "pct_comision_asesor"
  | "cac"
  | "pct_comision_pasarela";

interface PanelLineaSupuestosProps {
  linea: ResultadoLineaTotal;
  meses: string[];
  supuestosMap: Map<string, SupuestoMes>;
  guardandoCelda: string | null;
  onEditar: (lineaId: string, mes: string, campo: CampoSupuesto, valorRaw: string) => void;
  onCopiarMes1: (lineaId: string, campo: CampoSupuesto, valor: number | null) => void;
  onRestaurarReal: (lineaId: string) => void;
  onEliminar: (lineaId: string, nombre: string) => void;
}

// Supuestos que se editan, en el orden en que se encadena el cálculo
const SUPUESTOS_EMBUDO: Array<{ id: CampoSupuesto; label: string; unidad: string }> = [
  { id: "leads", label: "Leads captados", unidad: "leads" },
  { id: "pct_a_cotizacion", label: "% a cotización", unidad: "%" },
  { id: "pct_cierre", label: "% de cierre", unidad: "%" }
];
const SUPUESTOS_MANUAL: Array<{ id: CampoSupuesto; label: string; unidad: string }> = [
  { id: "operaciones_manual", label: "Operaciones", unidad: "ops" }
];
const SUPUESTOS_COMUNES: Array<{ id: CampoSupuesto; label: string; unidad: string }> = [
  { id: "ticket_promedio", label: "Ticket promedio", unidad: "$" },
  { id: "margen_pct", label: "Margen bruto", unidad: "%" },
  { id: "pct_comision_asesor", label: "% comisión asesor", unidad: "%" },
  { id: "cac", label: "CAC (marketing por cliente)", unidad: "$" },
  { id: "pct_comision_pasarela", label: "% comisión pasarela / tarjeta", unidad: "%" }
];

// Renglones calculados por el motor (solo lectura)
const RESULTADOS: Array<{
  id: keyof ResultadoLineaMes;
  label: string;
  signo?: "+" | "-" | "=";
  destacado?: boolean;
}> = [
  { id: "operaciones", label: "Operaciones resultantes" },
  { id: "ingreso_bruto", label: "Ingreso bruto", signo: "+" },
  { id: "costo_directo", label: "Costo directo", signo: "-" },
  { id: "margen_bruto", label: "Margen bruto", signo: "=", destacado: true },
  { id: "comision_asesor", label: "Comisión asesor", signo: "-" },
  { id: "marketing", label: "Marketing (operaciones × CAC)", signo: "-" },
  { id: "comision_pasarela", label: "Comisión pasarela", signo: "-" },
  { id: "contribucion", label: "Contribución marginal", signo: "=", destacado: true },
  { id: "cobro_caja", label: "Cobro en caja" }
];

const formatMXN = (val: number) => `$${Math.round(val || 0).toLocaleString("es-MX")}`;

// Los porcentajes se guardan como 0..1 y se muestran como 0..100
const valorParaMostrar = (campo: CampoSupuesto, raw: number | null | undefined): string => {
  if (raw === null || raw === undefined || isNaN(Number(raw))) return "";
  const n = Number(raw);
  const v = campo.includes("pct") && n <= 1 ? n * 100 : n;
  return String(Math.round(v * 100) / 100);
};

export function PanelLineaSupuestos({
  linea,
  meses,
  supuestosMap,
  guardandoCelda,
  onEditar,
  onCopiarMes1,
  onRestaurarReal,
  onEliminar
}: PanelLineaSupuestosProps) {
  const supuestosEditables = [
    ...(linea.modelo === "embudo" ? SUPUESTOS_EMBUDO : SUPUESTOS_MANUAL),
    ...SUPUESTOS_COMUNES
  ];

  const etiquetaMes = (m: string) =>
    new Date(m + "T00:00:00").toLocaleDateString("es-MX", { month: "short", year: "2-digit" });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
      {/* Encabezado de la línea */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-extrabold text-slate-800">{linea.nombre}</h4>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                linea.modelo === "embudo" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
              }`}
            >
              {linea.modelo}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{linea.business_unit_nombre}</p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Ingreso</p>
            <p className="text-xs font-extrabold font-mono text-slate-800">{formatMXN(linea.total.ingreso_bruto)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Margen bruto</p>
            <p className="text-xs font-extrabold font-mono text-emerald-700">{formatMXN(linea.total.margen_bruto)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Contribución</p>
            <p
              className={`text-xs font-extrabold font-mono ${
                linea.total.contribucion >= 0 ? "text-[#2D4A2B]" : "text-red-600"
              }`}
            >
              {formatMXN(linea.total.contribucion)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onRestaurarReal(linea.linea_id)}
              className="text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
              title="Restaurar todos los supuestos de la línea a promedios reales históricos"
            >
              ↺ Real
            </button>
            <button
              type="button"
              onClick={() => onEliminar(linea.linea_id, linea.nombre)}
              className="text-xs text-red-500 hover:text-red-700 p-1"
              title="Eliminar línea"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
              <th className="py-3 px-4 min-w-[200px]">Variable</th>
              {meses.map((m) => (
                <th key={m} className="py-3 px-2 text-center whitespace-nowrap min-w-[96px]">
                  {etiquetaMes(m)}
                </th>
              ))}
              <th className="py-3 px-3 text-center">Total / Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Supuestos editables */}
            <tr className="bg-[#2D4A2B]/5">
              <td
                colSpan={meses.length + 2}
                className="py-1.5 px-4 text-[10px] font-extrabold uppercase tracking-wide text-[#2D4A2B]"
              >
                Supuestos (editables)
              </td>
            </tr>
            {supuestosEditables.map((v) => {
              const primerSupuesto = supuestosMap.get(`${linea.linea_id}:${meses[0]}`);
              return (
                <tr key={v.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-4 font-bold text-slate-700">
                    {v.label} <span className="text-[10px] font-normal text-slate-400">({v.unidad})</span>
                  </td>
                  {meses.map((m) => {
                    const supuesto = supuestosMap.get(`${linea.linea_id}:${m}`);
                    const valor = valorParaMostrar(v.id, supuesto?.[v.id] as number | null | undefined);
                    const esReal = supuesto?.fuente !== "manual";
                    const key = `${linea.linea_id}:${m}:${v.id}`;
                    const guardando = guardandoCelda === key;
                    return (
                      <td key={m} className="py-1.5 px-1 text-center">
                        <input
                          key={`${key}:${valor}`}
                          type="number"
                          step={v.unidad === "$" ? "100" : "0.1"}
                          defaultValue={valor}
                          disabled={!supuesto}
                          title={!supuesto ? "Sin supuesto para este mes" : undefined}
                          onBlur={(e) => {
                            if (e.target.value === valor) return;
                            onEditar(linea.linea_id, m, v.id, e.target.value);
                          }}
                          className={`w-20 text-center rounded-lg border py-1 px-1.5 text-xs font-mono font-bold transition disabled:opacity-30 ${
                            guardando
                              ? "bg-amber-100 border-amber-400"
                              : esReal
                              ? "bg-slate-100 text-slate-700 border-slate-300 hover:border-slate-500"
                              : "bg-[#FEF9C3]/70 text-[#1E40AF] border-blue-300 hover:border-blue-500"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onCopiarMes1(
                          linea.linea_id,
                          v.id,
                          (primerSupuesto?.[v.id] as number | null | undefined) ?? null
                        )
                      }
                      className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-bold"
                      title="Copiar el valor del primer mes a todos los meses"
                    >
                      Copiar mes 1
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Resultado calculado */}
            <tr className="bg-slate-100">
              <td
                colSpan={meses.length + 2}
                className="py-1.5 px-4 text-[10px] font-extrabold uppercase tracking-wide text-slate-600"
              >
                Resultado (calculado)
              </td>
            </tr>
            {RESULTADOS.map((r) => {
              const esOps = r.id === "operaciones";
              const fmt = (n: number) => (esOps ? (Math.round(n * 10) / 10).toString() : formatMXN(n));
              const total = Number(linea.total[r.id] || 0);
              return (
                <tr key={r.id} className={r.destacado ? "bg-emerald-50/50 font-bold" : ""}>
                  <td className={`py-1.5 px-4 ${r.destacado ? "text-slate-800" : "text-slate-600"}`}>
                    {r.signo && <span className="text-slate-400 font-mono mr-1">({r.signo})</span>}
                    {r.label}
                  </td>
                  {meses.map((m) => {
                    const val = Number(linea.por_mes[m]?.[r.id] || 0);
                    return (
                      <td
                        key={m}
                        className={`py-1.5 px-2 text-center font-mono ${
                          r.signo === "-" ? "text-red-600" : val < 0 ? "text-red-600" : "text-slate-700"
                        }`}
                      >
                        {r.signo === "-" && val > 0 ? "-" : ""}
                        {fmt(val)}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-center font-mono font-bold bg-slate-50 text-slate-800">
                    {fmt(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100">
        {linea.modelo === "embudo"
          ? "Operaciones = leads × % a cotización × % de cierre."
          : "Operaciones capturadas manualmente."}{" "}
        Ingreso = operaciones × ticket · Costo directo = ingreso × (1 − margen) · Marketing = operaciones × CAC · Pasarela = ingreso × % pasarela.
      </p>
    </div>
  );
}
