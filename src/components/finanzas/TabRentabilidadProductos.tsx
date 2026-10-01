"use client";

import React, { useCallback, useEffect, useState } from "react";
import { recalcularContabilidadRemisiones } from "@/app/actions/contabilidad-remisiones";
import {
  obtenerRentabilidadComercial,
  type MetricasRentabilidad,
  type ReporteRentabilidadComercial,
} from "@/app/actions/rentabilidad-comercial";
import { exportarAExcelCSV } from "@/lib/finanzasExport";

interface TabRentabilidadProductosProps {
  fechaInicio: string;
  fechaFin: string;
  onRecalculado?: () => void;
}

const formatMoneda = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
const formatPct = (val: number) => `${val.toFixed(1)}%`;
const formatRoas = (val: number | null) => (val === null ? "—" : `${val.toFixed(2)}x`);
const formatCac = (val: number | null) => (val === null ? "—" : formatMoneda(val));

function CeldasMetricas({ m, negrita = false }: { m: MetricasRentabilidad; negrita?: boolean }) {
  const peso = negrita ? "font-bold" : "";
  return (
    <>
      <td className={`py-2.5 px-3 text-right font-mono text-slate-800 ${peso}`}>{formatMoneda(m.ingreso)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(m.costoDirecto)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(m.terminal)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(m.comision)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-amber-800" title={`Directa ${formatMoneda(m.publicidadDirecta)} · Prorrateo ${formatMoneda(m.publicidadProrrateada)}`}>
        {formatMoneda(m.publicidadTotal)}
        {m.publicidadProrrateada > 0 && (
          <span className="block text-[10px] text-slate-400">incl. {formatMoneda(m.publicidadProrrateada)} prorr.</span>
        )}
      </td>
      <td className={`py-2.5 px-3 text-right font-mono font-bold ${m.margenNeto >= 0 ? "text-emerald-700" : "text-red-700"}`}>
        {formatMoneda(m.margenNeto)}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatPct(m.margenPct)}</td>
      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D4A2B]">{formatRoas(m.roas)}</td>
      <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatCac(m.cac)}</td>
    </>
  );
}

const ENCABEZADOS_METRICAS = ["Venta", "Costo directo", "Terminal", "Comisiones", "Publicidad", "Margen neto", "Margen", "ROAS", "CAC"];

export function TabRentabilidadProductos({ fechaInicio, fechaFin, onRecalculado }: TabRentabilidadProductosProps) {
  const [reporte, setReporte] = useState<ReporteRentabilidadComercial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [vista, setVista] = useState<"especialidad" | "producto">("especialidad");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setReporte(await obtenerRentabilidadComercial(fechaInicio, fechaFin));
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err?.message || "No se pudo cargar la rentabilidad." });
    } finally {
      setCargando(false);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleRecalcular = async () => {
    setRecalculando(true);
    setMensaje(null);
    const res = await recalcularContabilidadRemisiones();
    setRecalculando(false);
    if (res.ok) {
      setMensaje({
        tipo: "ok",
        texto: `${res.procesadas} remisiones conciliadas con Finanzas${res.errores ? ` (${res.errores} con error)` : ""}.`,
      });
      await cargar();
      onRecalculado?.();
    } else {
      setMensaje({ tipo: "error", texto: res.error || "Error al recalcular." });
    }
  };

  const fila = (m: MetricasRentabilidad) => [
    m.ingreso, m.costoDirecto, m.terminal, m.comision, m.publicidadTotal, m.margenNeto, m.margenPct, m.roas ?? "", m.cac ?? "",
  ];

  const handleExportar = () => {
    if (!reporte) return;
    if (vista === "especialidad") {
      const filas: Array<Array<string | number>> = [];
      reporte.centros.forEach((c) => {
        filas.push([c.codigo || "", c.nombre, "TOTAL CENTRO", c.ventas, ...fila(c)]);
        c.subcuentas.forEach((s) => filas.push([c.codigo || "", c.nombre, `${s.codigoSubcuenta || ""} ${s.nombre}`, s.ventas, ...fila(s)]));
      });
      exportarAExcelCSV(
        `Rentabilidad_Especialidad_SAUCEDA_${fechaInicio}_${fechaFin}`,
        ["Centro", "Nombre centro", "Subcuenta", "Ventas", ...ENCABEZADOS_METRICAS],
        filas
      );
    } else {
      exportarAExcelCSV(
        `Rentabilidad_Producto_SAUCEDA_${fechaInicio}_${fechaFin}`,
        ["Producto", "Subcuenta", "Centro", "Remisiones", "Cantidad", "Unidad", ...ENCABEZADOS_METRICAS],
        reporte.productos.map((p) => [p.productoNombre, p.nombreSubcuenta, p.centroNombre, p.ventas, p.cantidad, p.unidad, ...fila(p)])
      );
    }
  };

  const totales = reporte?.totales;
  const encabezado = (
    <tr>
      <th className="py-2.5 px-4">{vista === "especialidad" ? "Centro / Especialidad" : "Producto / Servicio"}</th>
      <th className="py-2.5 px-3 text-right">Ventas</th>
      {ENCABEZADOS_METRICAS.map((h) => (
        <th key={h} className="py-2.5 px-3 text-right">
          {h}
        </th>
      ))}
    </tr>
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>📦</span> Rentabilidad por Especialidad y Producto
          </h3>
          <p className="text-[11px] text-slate-400">
            Margen neto, ROAS y CAC con ventas de remisiones y publicidad contabilizada en Finanzas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            {(
              [
                ["especialidad", "Por especialidad"],
                ["producto", "Por producto"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`rounded-lg px-3 py-1.5 transition ${
                  vista === v ? "bg-[#2D4A2B] text-[#F5F1E8] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExportar}
            disabled={!reporte}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
          >
            📊 Excel
          </button>
          <button
            type="button"
            onClick={handleRecalcular}
            disabled={recalculando}
            className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs disabled:opacity-50"
            title="Vuelve a conciliar todas las remisiones con Finanzas y recalcula el centro de costos"
          >
            {recalculando ? "Recalculando..." : "🔄 Recalcular remisiones"}
          </button>
        </div>
      </section>

      {mensaje && (
        <div
          className={`rounded-xl border p-3 text-xs font-medium ${
            mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {totales && (
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ["Venta", formatMoneda(totales.ingreso), `${totales.ventas} ventas cerradas`],
            ["Publicidad", formatMoneda(totales.publicidadTotal), `ROAS ${formatRoas(totales.roas)}`],
            ["CAC promedio", formatCac(totales.cac), "Publicidad ÷ ventas cerradas"],
            ["Margen neto", formatMoneda(totales.margenNeto), `Margen ${formatPct(totales.margenPct)}`],
            ["ROI", formatPct(totales.roi), "Margen neto ÷ costo total"],
          ].map(([titulo, valor, detalle]) => (
            <div key={titulo} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{titulo}</span>
              <span className="font-mono text-lg font-bold text-[#2D4A2B] block">{valor}</span>
              <span className="text-[11px] text-slate-500">{detalle}</span>
            </div>
          ))}
        </section>
      )}

      {reporte && reporte.publicidadSinProrratear > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {formatMoneda(reporte.publicidadSinProrratear)} de publicidad institucional no se pudo prorratear porque no hubo
          ventas en el periodo; se muestra en Corporativo.
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {cargando ? (
          <div className="py-16 text-center text-xs text-slate-500">Calculando rentabilidad...</div>
        ) : !reporte || (reporte.centros.length === 0 && reporte.productos.length === 0) ? (
          <div className="py-16 text-center text-xs text-slate-500 px-4">
            No hay ventas ni publicidad contabilizada en este periodo. Si ya tienes remisiones, usa “Recalcular
            remisiones”; para la publicidad, importa y aprueba los gastos de Meta Ads.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase">{encabezado}</thead>
              <tbody className="divide-y divide-slate-100">
                {vista === "especialidad"
                  ? reporte.centros.map((c) => (
                      <React.Fragment key={c.businessUnitId || "sin"}>
                        <tr className="bg-slate-50/80">
                          <td className="py-2.5 px-4">
                            <span className="font-bold text-slate-900 block">{c.nombre}</span>
                            <span className="text-[10px] font-mono text-slate-400">{c.codigo || "—"}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                            {c.ventas}
                            <span className="block text-[10px] font-normal text-slate-400">{c.unidadVentas}</span>
                          </td>
                          <CeldasMetricas m={c} negrita />
                        </tr>
                        {c.subcuentas.map((s) => (
                          <tr key={s.clave} className="hover:bg-slate-50/60">
                            <td className="py-2 px-4 pl-8">
                              <span className="font-semibold text-slate-700 block">{s.nombre}</span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {s.codigoSubcuenta || ""} {s.cuentaMayor ? `· ${s.cuentaMayor}` : ""}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">{s.ventas || "—"}</td>
                            <CeldasMetricas m={s} />
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  : reporte.productos.map((p) => (
                      <tr key={p.clave} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-slate-800 block">{p.productoNombre}</span>
                          <span className="text-[10px] text-slate-400">
                            {p.nombreSubcuenta}
                            {p.cantidad > 0 && ` · ${p.cantidad} ${p.unidad}`}
                            {p.precioPromedioUnidad !== null &&
                              ` · ${formatMoneda(p.precioPromedioUnidad)}/${p.unidad} vs costo ${formatMoneda(p.costoDirectoPromedioUnidad || 0)}`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{p.ventas}</td>
                        <CeldasMetricas m={p} />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        Margen neto = venta − costo directo − terminal − comisiones − publicidad directa − prorrateo de publicidad
        general. La publicidad de Corporativo se reparte entre todas las especialidades según su venta, y la de un centro
        sin subcuenta, entre las especialidades de ese centro. ROAS = venta ÷ publicidad. CAC = publicidad ÷ ventas
        cerradas (remisiones; en Inmobiliaria, expedientes cerrados por fecha de último movimiento).
      </p>
    </div>
  );
}
