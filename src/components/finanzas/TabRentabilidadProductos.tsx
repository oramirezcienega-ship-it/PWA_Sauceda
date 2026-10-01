"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  obtenerRentabilidadProductos,
  recalcularContabilidadRemisiones,
  type ReporteRentabilidadProductos,
} from "@/app/actions/contabilidad-remisiones";
import { exportarAExcelCSV } from "@/lib/finanzasExport";

interface TabRentabilidadProductosProps {
  fechaInicio: string;
  fechaFin: string;
  onRecalculado?: () => void;
}

const formatMoneda = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

const formatPct = (val: number) => `${val.toFixed(1)}%`;

export function TabRentabilidadProductos({ fechaInicio, fechaFin, onRecalculado }: TabRentabilidadProductosProps) {
  const [reporte, setReporte] = useState<ReporteRentabilidadProductos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [orden, setOrden] = useState<"utilidad" | "ingreso" | "margen" | "roi">("utilidad");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setReporte(await obtenerRentabilidadProductos(fechaInicio, fechaFin));
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

  const productos = [...(reporte?.productos || [])].sort((a, b) => b[orden] - a[orden]);
  const totales = reporte?.totales;

  const handleExportar = () => {
    exportarAExcelCSV(
      `Rentabilidad_Productos_SAUCEDA_${fechaInicio}_${fechaFin}`,
      [
        "Producto",
        "Remisiones",
        "Cantidad",
        "Unidad",
        "Ingreso",
        "Costo Directo",
        "Terminal",
        "Comisiones",
        "Utilidad",
        "Margen %",
        "ROI %",
        "Precio Prom./Unidad",
        "Costo Prom./Unidad",
      ],
      productos.map((p) => [
        p.productoNombre,
        p.remisiones,
        p.cantidad,
        p.unidad,
        p.ingreso,
        p.costoProveedor,
        p.costoFinanciero,
        p.comision,
        p.utilidad,
        p.margen,
        p.roi,
        p.precioPromedioUnidad ?? "",
        p.costoProveedorPromedioUnidad ?? "",
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Barra superior */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>📦</span> Rentabilidad por Producto (Centro de Costos)
          </h3>
          <p className="text-[11px] text-slate-400">
            Calculada con los importes definitivos de cada remisión: venta, costo directo, terminal y comisiones.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as typeof orden)}
            className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
          >
            <option value="utilidad">Ordenar por utilidad</option>
            <option value="ingreso">Ordenar por ingreso</option>
            <option value="margen">Ordenar por margen</option>
            <option value="roi">Ordenar por ROI</option>
          </select>
          <button
            type="button"
            onClick={handleExportar}
            disabled={productos.length === 0}
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
            mensaje.tipo === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Totales */}
      {totales && (
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ["Ingreso", formatMoneda(totales.ingreso), `${totales.remisiones} remisiones`],
            ["Costo total", formatMoneda(totales.costoTotal), `Directo ${formatMoneda(totales.costoProveedor)}`],
            ["Terminal y comisiones", formatMoneda(totales.costoFinanciero + totales.comision), `Comisiones ${formatMoneda(totales.comision)}`],
            ["Utilidad", formatMoneda(totales.utilidad), `Margen ${formatPct(totales.margen)}`],
            ["ROI", formatPct(totales.roi), "Utilidad / costo invertido"],
          ].map(([titulo, valor, detalle]) => (
            <div key={titulo} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{titulo}</span>
              <span className="font-mono text-lg font-bold text-[#2D4A2B] block">{valor}</span>
              <span className="text-[11px] text-slate-500">{detalle}</span>
            </div>
          ))}
        </section>
      )}

      {/* Tabla por producto */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {cargando ? (
          <div className="py-16 text-center text-xs text-slate-500">Calculando rentabilidad...</div>
        ) : productos.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 px-4">
            No hay remisiones con centro de costos en este periodo. Si ya tienes remisiones generadas, usa
            “Recalcular remisiones” para incorporarlas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-4">Producto / Servicio</th>
                  <th className="py-2.5 px-3 text-right">Cantidad</th>
                  <th className="py-2.5 px-3 text-right">Ingreso</th>
                  <th className="py-2.5 px-3 text-right">Costo directo</th>
                  <th className="py-2.5 px-3 text-right">Terminal</th>
                  <th className="py-2.5 px-3 text-right">Comisiones</th>
                  <th className="py-2.5 px-3 text-right">Utilidad</th>
                  <th className="py-2.5 px-3 text-right">Margen</th>
                  <th className="py-2.5 px-3 text-right">ROI</th>
                  <th className="py-2.5 px-4 text-right">Precio / Costo por unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productos.map((p) => (
                  <tr key={p.clave} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-slate-800 block">{p.productoNombre}</span>
                      <span className="text-[10px] text-slate-400">
                        {p.remisiones} {p.remisiones === 1 ? "remisión" : "remisiones"}
                        {!p.productoId && " · sin vínculo al catálogo"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {p.cantidad > 0 ? `${p.cantidad} ${p.unidad}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">{formatMoneda(p.ingreso)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(p.costoProveedor)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(p.costoFinanciero)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-700">{formatMoneda(p.comision)}</td>
                    <td className={`py-2.5 px-3 text-right font-mono font-bold ${p.utilidad >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {formatMoneda(p.utilidad)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatPct(p.margen)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2D4A2B]">{formatPct(p.roi)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-600">
                      {p.precioPromedioUnidad !== null
                        ? `${formatMoneda(p.precioPromedioUnidad)} / ${formatMoneda(p.costoProveedorPromedioUnidad || 0)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        El ingreso de cada producto sale de los conceptos de la cotización, escalados al total remitido. El costo de
        proveedor se asigna directo al producto cuando su documento lo indica; el resto, la terminal y la comisión se
        prorratean según el ingreso de cada producto. ROI = utilidad ÷ (costo directo + terminal + comisiones).
      </p>
    </div>
  );
}
