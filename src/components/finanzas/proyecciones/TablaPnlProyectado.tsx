"use client";

import React, { useMemo, useState } from "react";
import type { ResultadoProyeccion, FijoPlan } from "@/lib/finanzas/proyeccion";

interface TablaPnlProyectadoProps {
  proyeccion: ResultadoProyeccion;
  fijos: FijoPlan[];
}

// Cómo se muestran los gastos fijos: un solo renglón, por cuenta contable o por concepto
type ModoFijos = "total" | "cuenta" | "concepto";

const formatMXN = (val: number) => {
  const n = Math.round(val || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("es-MX")}`;
};

const etiquetaMes = (m: string) =>
  new Date(m + "T00:00:00").toLocaleDateString("es-MX", { month: "short", year: "2-digit" });

// Cascada del P&L por línea, unidad y consolidado (antes de gastos fijos)
type ClaveCascada =
  | "ingreso_bruto"
  | "costo_directo"
  | "margen_bruto"
  | "comision_asesor"
  | "marketing"
  | "comision_pasarela"
  | "contribucion";
type TipoPaso = "base" | "resta" | "subtotal";

const CASCADA: Array<{ k: ClaveCascada; label: string; tipo: TipoPaso }> = [
  { k: "ingreso_bruto", label: "Ingreso Bruto", tipo: "base" },
  { k: "costo_directo", label: "(-) Costo directo", tipo: "resta" },
  { k: "margen_bruto", label: "= Margen Bruto", tipo: "subtotal" },
  { k: "comision_asesor", label: "(-) Comisión asesor", tipo: "resta" },
  { k: "marketing", label: "(-) Marketing (ops × CAC)", tipo: "resta" },
  { k: "comision_pasarela", label: "(-) Comisión pasarela", tipo: "resta" },
  { k: "contribucion", label: "= Contribución marginal", tipo: "subtotal" }
];

const ESTILO_PASO: Record<TipoPaso, { etiqueta: string; valor: string }> = {
  base: { etiqueta: "font-semibold text-slate-800", valor: "text-slate-800" },
  resta: { etiqueta: "text-red-600", valor: "text-red-600" },
  subtotal: { etiqueta: "font-bold text-emerald-700", valor: "font-bold text-emerald-700" }
};

// Renglón de gasto fijo ya agregado según el modo elegido
interface FilaFijo {
  clave: string;
  nombre: string;
  detalle?: string;
  por_mes: Record<string, number>;
  total: number;
}

/**
 * Estado de resultados proyectado por unidad y línea, con los gastos fijos visibles,
 * unidades plegables y análisis vertical opcional (% sobre el ingreso).
 */
export function TablaPnlProyectado({ proyeccion, fijos }: TablaPnlProyectadoProps) {
  const [unidadesPlegadas, setUnidadesPlegadas] = useState<Set<string>>(new Set());
  const [modoFijos, setModoFijos] = useState<ModoFijos>("concepto");
  const [mostrarPct, setMostrarPct] = useState(false);

  const { meses, consolidado } = proyeccion;
  const ingresoConsolidadoMes = (m: string) => consolidado.por_mes[m]?.ingreso_bruto || 0;

  // Unidades con ingresos primero; Gastos Generales (sin unidad) al final
  const unidades = useMemo(
    () =>
      Object.values(proyeccion.por_unidad).sort((a, b) => {
        if (!a.business_unit_id !== !b.business_unit_id) return a.business_unit_id ? -1 : 1;
        return a.business_unit_nombre.localeCompare(b.business_unit_nombre);
      }),
    [proyeccion]
  );

  const agruparFijos = (lista: FijoPlan[]): FilaFijo[] => {
    const filas = new Map<string, FilaFijo>();
    lista.forEach((f) => {
      const cuenta = f.categoria_nombre || f.linea_pnl;
      const clave = modoFijos === "concepto" ? `${f.concepto}|${cuenta}` : modoFijos === "cuenta" ? cuenta : "total";
      const fila = filas.get(clave) || {
        clave,
        nombre: modoFijos === "concepto" ? f.concepto : modoFijos === "cuenta" ? cuenta : "Gastos fijos",
        detalle: modoFijos === "concepto" ? cuenta : undefined,
        por_mes: {},
        total: 0
      };
      const mes = f.mes.slice(0, 7) + "-01";
      const monto = Number(f.monto || 0);
      fila.por_mes[mes] = (fila.por_mes[mes] || 0) + monto;
      fila.total += monto;
      filas.set(clave, fila);
    });
    return Array.from(filas.values()).sort((a, b) => b.total - a.total);
  };

  const fijosDeUnidad = (buId: string | null) =>
    agruparFijos(fijos.filter((f) => (f.business_unit_id || null) === buId));

  const fijosConsolidados = useMemo(() => agruparFijos(fijos), [fijos, modoFijos]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleUnidad = (clave: string) =>
    setUnidadesPlegadas((prev) => {
      const sig = new Set(prev);
      if (sig.has(clave)) sig.delete(clave);
      else sig.add(clave);
      return sig;
    });

  const todasPlegadas = unidades.every((u) => unidadesPlegadas.has(u.business_unit_id || "sin_unidad"));

  // Monto con su % sobre la base (análisis vertical) debajo, si está activo
  const Celda = ({
    valor,
    base,
    negativo,
    className = ""
  }: {
    valor: number;
    base: number;
    negativo?: boolean;
    className?: string;
  }) => (
    <td className={`py-1 px-3 text-right font-mono whitespace-nowrap ${className}`}>
      <div>{negativo && valor ? `-${formatMXN(valor)}` : formatMXN(valor)}</div>
      {mostrarPct && (
        <div className="text-[9px] font-normal text-slate-400">
          {base > 0 ? `${((valor / base) * 100).toFixed(1)}%` : "—"}
        </div>
      )}
    </td>
  );

  // Renglón genérico: etiqueta + un valor por mes + total
  const Renglon = ({
    etiqueta,
    detalle,
    valorMes,
    total,
    baseMes,
    baseTotal,
    negativo,
    claseFila = "",
    claseEtiqueta = "text-slate-600",
    claseValor = "text-slate-700",
    sangria = false
  }: {
    etiqueta: React.ReactNode;
    detalle?: string;
    valorMes: (m: string) => number;
    total: number;
    baseMes: (m: string) => number;
    baseTotal: number;
    negativo?: boolean;
    claseFila?: string;
    claseEtiqueta?: string;
    claseValor?: string;
    sangria?: boolean;
  }) => (
    <tr className={`hover:bg-slate-50/80 ${claseFila}`}>
      <td colSpan={2} className={`py-1 px-4 text-[11px] ${sangria ? "pl-10" : ""} ${claseEtiqueta}`}>
        {etiqueta}
        {detalle && <span className="ml-1.5 text-[10px] font-normal text-slate-400">{detalle}</span>}
      </td>
      {meses.map((m) => (
        <Celda key={m} valor={valorMes(m)} base={baseMes(m)} negativo={negativo} className={claseValor} />
      ))}
      <Celda valor={total} base={baseTotal} negativo={negativo} className={`bg-slate-50 font-bold ${claseValor}`} />
    </tr>
  );

  // Bloque de gastos fijos (total + desglose según modo)
  const BloqueFijos = ({
    filas,
    totalMes,
    total,
    baseMes,
    baseTotal
  }: {
    filas: FilaFijo[];
    totalMes: (m: string) => number;
    total: number;
    baseMes: (m: string) => number;
    baseTotal: number;
  }) => (
    <>
      <Renglon
        etiqueta="(-) Gastos fijos"
        valorMes={totalMes}
        total={total}
        baseMes={baseMes}
        baseTotal={baseTotal}
        negativo
        claseEtiqueta="font-semibold text-red-600"
        claseValor="text-red-600"
      />
      {modoFijos !== "total" &&
        filas.map((f) => (
          <Renglon
            key={f.clave}
            etiqueta={f.nombre}
            detalle={f.detalle}
            valorMes={(m) => f.por_mes[m] || 0}
            total={f.total}
            baseMes={baseMes}
            baseTotal={baseTotal}
            negativo
            sangria
            claseEtiqueta="text-slate-600"
            claseValor="text-red-500/80"
          />
        ))}
    </>
  );

  const BotonModo = ({ id, label }: { id: ModoFijos; label: string }) => (
    <button
      type="button"
      onClick={() => setModoFijos(id)}
      className={`px-2.5 py-1 rounded-lg transition ${
        modoFijos === id ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-bold text-slate-800">Estado de Resultados Proyectado (P&L Mensual)</h4>
          <span className="text-[11px] text-slate-500">Cifras expresadas en Pesos Mexicanos (MXN)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
          <button
            type="button"
            onClick={() =>
              setUnidadesPlegadas(
                todasPlegadas ? new Set() : new Set(unidades.map((u) => u.business_unit_id || "sin_unidad"))
              )
            }
            className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
          >
            {todasPlegadas ? "Desglosar líneas" : "Agrupar por unidad"}
          </button>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
            <span className="px-2 text-[11px] text-slate-500">Fijos:</span>
            <BotonModo id="total" label="Total" />
            <BotonModo id="cuenta" label="Por cuenta" />
            <BotonModo id="concepto" label="Por concepto" />
          </div>
          <button
            type="button"
            onClick={() => setMostrarPct((v) => !v)}
            className={`px-2.5 py-1 rounded-xl transition ${
              mostrarPct ? "bg-[#2D4A2B] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            title="Análisis vertical: cada renglón como % del ingreso de su línea, unidad o del consolidado"
          >
            % sobre ingreso
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
              <th className="py-2.5 px-4 min-w-[240px]">Unidad / Línea de Negocio</th>
              <th className="py-2.5 px-2">Concepto</th>
              {meses.map((m) => (
                <th key={m} className="py-2.5 px-3 text-right whitespace-nowrap">
                  {etiquetaMes(m)}
                </th>
              ))}
              <th className="py-2.5 px-4 text-right bg-slate-100 font-extrabold text-[#2D4A2B]">TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {unidades.map((u) => {
              const claveU = u.business_unit_id || "sin_unidad";
              const plegada = unidadesPlegadas.has(claveU);
              const esGeneral = !u.business_unit_id;
              const lineasDeUnidad = Object.values(proyeccion.por_linea).filter(
                (l) => l.business_unit_id === u.business_unit_id
              );
              // Gastos generales no tienen ingreso propio: su % se mide contra el ingreso consolidado
              const baseMes = esGeneral && u.total.ingreso_bruto === 0
                ? ingresoConsolidadoMes
                : (m: string) => u.por_mes[m]?.ingreso_bruto || 0;
              const baseTotal = esGeneral && u.total.ingreso_bruto === 0
                ? consolidado.total.ingreso_bruto
                : u.total.ingreso_bruto;
              const tieneIngresos = u.total.ingreso_bruto !== 0 || lineasDeUnidad.length > 0;

              return (
                <React.Fragment key={claveU}>
                  {/* Cabecera de la unidad (ingreso) */}
                  <tr
                    className="bg-[#F5F1E8]/60 font-bold text-[#2D4A2B] cursor-pointer select-none"
                    onClick={() => toggleUnidad(claveU)}
                  >
                    <td colSpan={2} className="py-2 px-4 uppercase tracking-wider text-[11px]">
                      <span className="inline-block w-3 text-slate-400">{plegada ? "▸" : "▾"}</span>
                      🏢 {u.business_unit_nombre}
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="py-2 px-3 text-right font-mono">
                        {tieneIngresos ? formatMXN(u.por_mes[m]?.ingreso_bruto || 0) : ""}
                      </td>
                    ))}
                    <td className="py-2 px-4 text-right font-mono bg-[#F5F1E8] font-extrabold">
                      {tieneIngresos ? formatMXN(u.total.ingreso_bruto) : ""}
                    </td>
                  </tr>

                  {/* Líneas de servicio (solo desglosado) */}
                  {!plegada &&
                    lineasDeUnidad.map((l) => {
                      const baseL = (m: string) => l.por_mes[m]?.ingreso_bruto || 0;
                      // En el detalle por línea se omiten deducciones en cero (p. ej. sin pasarela)
                      const pasos = CASCADA.filter((c) => c.tipo !== "resta" || l.total[c.k] !== 0);
                      return (
                        <React.Fragment key={l.linea_id}>
                          <tr className="hover:bg-slate-50/80">
                            <td
                              rowSpan={pasos.length + 1}
                              className="py-2 px-4 align-top font-bold text-slate-800 border-r border-slate-100"
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{l.nombre}</span>
                                <span className="text-[9px] px-1.5 rounded bg-slate-100 text-slate-500 uppercase">
                                  {l.modelo}
                                </span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-[11px] text-slate-500">Operaciones</td>
                            {meses.map((m) => (
                              <td key={m} className="py-1 px-3 text-right font-mono text-slate-600">
                                {(l.por_mes[m]?.operaciones || 0).toFixed(1)}
                              </td>
                            ))}
                            <td className="py-1 px-4 text-right font-mono font-bold bg-slate-50">
                              {l.total.operaciones.toFixed(1)}
                            </td>
                          </tr>
                          {pasos.map((c, idx) => (
                            <tr
                              key={c.k}
                              className={`hover:bg-slate-50/80 ${idx === pasos.length - 1 ? "border-b border-slate-200" : ""}`}
                            >
                              <td className={`py-1 px-2 text-[11px] whitespace-nowrap ${ESTILO_PASO[c.tipo].etiqueta}`}>
                                {c.label}
                              </td>
                              {meses.map((m) => (
                                <Celda
                                  key={m}
                                  valor={l.por_mes[m]?.[c.k] || 0}
                                  base={baseL(m)}
                                  negativo={c.tipo === "resta"}
                                  className={ESTILO_PASO[c.tipo].valor}
                                />
                              ))}
                              <Celda
                                valor={l.total[c.k]}
                                base={l.total.ingreso_bruto}
                                negativo={c.tipo === "resta"}
                                className={`bg-slate-50 ${ESTILO_PASO[c.tipo].valor}`}
                              />
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                  {/* Resumen de la unidad: plegada muestra la cascada completa; desglosada, solo la contribución */}
                  {tieneIngresos &&
                    CASCADA.filter((c) => c.k !== "ingreso_bruto" && (plegada || c.k === "contribucion")).map((c) => (
                      <Renglon
                        key={c.k}
                        etiqueta={c.k === "contribucion" ? `${c.label} (${u.business_unit_nombre})` : c.label}
                        valorMes={(m) => u.por_mes[m]?.[c.k] || 0}
                        total={u.total[c.k]}
                        baseMes={baseMes}
                        baseTotal={baseTotal}
                        negativo={c.tipo === "resta"}
                        claseEtiqueta={ESTILO_PASO[c.tipo].etiqueta}
                        claseValor={ESTILO_PASO[c.tipo].valor}
                      />
                    ))}
                  {u.total.gastos_fijos !== 0 && (
                    <BloqueFijos
                      filas={fijosDeUnidad(u.business_unit_id)}
                      totalMes={(m) => u.por_mes[m]?.gastos_fijos || 0}
                      total={u.total.gastos_fijos}
                      baseMes={baseMes}
                      baseTotal={baseTotal}
                    />
                  )}

                  {/* Subtotal de la unidad */}
                  <tr className="bg-slate-100/70 font-bold text-slate-800 text-[11px]">
                    <td colSpan={2} className="py-2 px-4">
                      {esGeneral && !tieneIngresos
                        ? `Total ${u.business_unit_nombre}`
                        : `Utilidad Operativa (${u.business_unit_nombre})`}
                    </td>
                    {meses.map((m) => (
                      <Celda
                        key={m}
                        valor={u.por_mes[m]?.utilidad_operativa || 0}
                        base={baseMes(m)}
                        className={`py-2 ${(u.por_mes[m]?.utilidad_operativa || 0) < 0 ? "text-red-700" : "text-emerald-800"}`}
                      />
                    ))}
                    <Celda
                      valor={u.total.utilidad_operativa}
                      base={baseTotal}
                      className={`py-2 bg-slate-200 font-extrabold ${u.total.utilidad_operativa < 0 ? "text-red-700" : "text-emerald-900"}`}
                    />
                  </tr>
                </React.Fragment>
              );
            })}

            {/* RESUMEN CONSOLIDADO */}
            <tr className="bg-[#2D4A2B]/5">
              <td
                colSpan={meses.length + 3}
                className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#2D4A2B]"
              >
                Resumen consolidado
              </td>
            </tr>
            {CASCADA.map((c) => (
              <Renglon
                key={c.k}
                etiqueta={c.label}
                valorMes={(m) => consolidado.por_mes[m]?.[c.k] || 0}
                total={consolidado.total[c.k]}
                baseMes={ingresoConsolidadoMes}
                baseTotal={consolidado.total.ingreso_bruto}
                negativo={c.tipo === "resta"}
                claseEtiqueta={ESTILO_PASO[c.tipo].etiqueta}
                claseValor={ESTILO_PASO[c.tipo].valor}
              />
            ))}
            <BloqueFijos
              filas={fijosConsolidados}
              totalMes={(m) => consolidado.por_mes[m]?.gastos_fijos || 0}
              total={consolidado.total.gastos_fijos}
              baseMes={ingresoConsolidadoMes}
              baseTotal={consolidado.total.ingreso_bruto}
            />

            <tr className="bg-[#2D4A2B] text-white font-extrabold text-xs">
              <td colSpan={2} className="py-3 px-4 uppercase tracking-wider">
                Utilidad Operativa Consolidada
              </td>
              {meses.map((m) => (
                <td key={m} className="py-3 px-3 text-right font-mono">
                  <div>{formatMXN(consolidado.por_mes[m]?.utilidad_operativa || 0)}</div>
                  {mostrarPct && (
                    <div className="text-[9px] font-normal text-white/60">
                      {(consolidado.por_mes[m]?.margen_operativo_pct || 0).toFixed(1)}%
                    </div>
                  )}
                </td>
              ))}
              <td className="py-3 px-4 text-right font-mono bg-[#1E331D] text-[#C9A961] text-sm">
                <div>{formatMXN(consolidado.total.utilidad_operativa)}</div>
                {mostrarPct && (
                  <div className="text-[9px] font-normal text-[#C9A961]/70">
                    {consolidado.total.ingreso_bruto > 0
                      ? ((consolidado.total.utilidad_operativa / consolidado.total.ingreso_bruto) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </div>
                )}
              </td>
            </tr>
            <tr className="bg-[#1E331D] text-slate-300 font-bold text-[11px]">
              <td colSpan={2} className="py-2 px-4">
                Utilidad Acumulada
              </td>
              {meses.map((m) => (
                <td key={m} className="py-2 px-3 text-right font-mono text-[#C9A961]">
                  {formatMXN(consolidado.por_mes[m]?.utilidad_acumulada || 0)}
                </td>
              ))}
              <td className="py-2 px-4 text-right font-mono text-[#C9A961] bg-[#142313]">
                {formatMXN(consolidado.total.utilidad_acumulada)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
