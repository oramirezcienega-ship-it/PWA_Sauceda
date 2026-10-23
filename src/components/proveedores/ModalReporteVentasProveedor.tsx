"use client";

import { useMemo, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import type { DocumentoProveedor } from "@/lib/types";
import { calcularReporteVentasProveedor } from "@/lib/reporte-ventas-proveedor";

type Rango = "mes" | "mes_anterior" | "3m" | "6m" | "anio" | "todo" | "personalizado";

const RANGOS: [Rango, string][] = [
  ["mes", "Este mes"],
  ["mes_anterior", "Mes anterior"],
  ["3m", "Últimos 3 meses"],
  ["6m", "Últimos 6 meses"],
  ["anio", "Este año"],
  ["todo", "Todo el historial"],
  ["personalizado", "Personalizado"],
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function fechasDeRango(rango: Rango, documentos: DocumentoProveedor[]): [string, string] {
  const hoy = new Date();
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (rango) {
    case "mes":
      return [iso(new Date(a, m, 1)), iso(hoy)];
    case "mes_anterior":
      return [iso(new Date(a, m - 1, 1)), iso(new Date(a, m, 0))];
    case "3m":
      return [iso(new Date(a, m - 2, 1)), iso(hoy)];
    case "6m":
      return [iso(new Date(a, m - 5, 1)), iso(hoy)];
    case "anio":
      return [iso(new Date(a, 0, 1)), iso(hoy)];
    default: {
      const fechas = documentos.map((d) => (d.fecha || "").slice(0, 10)).filter(Boolean).sort();
      return [fechas[0] || iso(new Date(a, m, 1)), fechas[fechas.length - 1] > iso(hoy) ? fechas[fechas.length - 1] : iso(hoy)];
    }
  }
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  proveedorNombre: string;
  documentos: DocumentoProveedor[];
}

/** Elige el periodo, muestra los KPIs y genera el PDF del reporte de ventas para el proveedor. */
export function ModalReporteVentasProveedor({ abierto, onCerrar, proveedorNombre, documentos }: Props) {
  const [rango, setRango] = useState<Rango>("todo");
  const [desdeManual, setDesdeManual] = useState("");
  const [hastaManual, setHastaManual] = useState("");
  const [generando, setGenerando] = useState<"" | "descargar" | "compartir">("");
  const [error, setError] = useState("");

  const [desde, hasta] = useMemo(() => {
    if (rango === "personalizado") {
      const [d, h] = fechasDeRango("todo", documentos);
      return [desdeManual || d, hastaManual || h];
    }
    return fechasDeRango(rango, documentos);
  }, [rango, desdeManual, hastaManual, documentos]);

  const reporte = useMemo(
    () => (desde <= hasta ? calcularReporteVentasProveedor(documentos, desde, hasta) : null),
    [documentos, desde, hasta]
  );

  if (!abierto) return null;

  async function generar(modo: "descargar" | "compartir") {
    if (!reporte) return;
    setGenerando(modo);
    setError("");
    try {
      const { generarReporteVentasProveedorPdf, nombreArchivoReporte } = await import("@/lib/reporteVentasProveedorPdf");
      const pdf = generarReporteVentasProveedorPdf(proveedorNombre, reporte);
      const nombre = nombreArchivoReporte(proveedorNombre, reporte);
      if (modo === "compartir") {
        const archivo = new File([pdf.output("blob")], nombre, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [archivo] })) {
          try {
            await navigator.share({ files: [archivo], title: `Reporte de ventas · ${proveedorNombre}` });
          } catch (err) {
            if ((err as Error)?.name !== "AbortError") throw err;
          }
          return;
        }
        setError("Este dispositivo no permite compartir archivos; se descargó el PDF para que lo adjuntes.");
      }
      pdf.save(nombre);
    } catch (err) {
      console.error("[reporte-ventas-proveedor]", err);
      setError("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerando("");
    }
  }

  const sinDatos = !reporte || reporte.operaciones === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl font-cuerpo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-carbon/10 p-5">
          <div>
            <h3 className="font-titular text-base font-bold text-verde-profundo">Reporte de ventas para el proveedor</h3>
            <p className="text-xs text-carbon/60 mt-0.5">
              PDF con sus KPIs, gráficas por mes y por producto, resumen y detalle de cada operación.
            </p>
          </div>
          <button onClick={onCerrar} className="text-carbon/50 hover:text-carbon text-lg leading-none" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider mb-1.5">Periodo del reporte</div>
            <div className="flex flex-wrap gap-1.5">
              {RANGOS.map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => {
                    if (valor === "personalizado" && rango !== "personalizado") {
                      setDesdeManual(desde);
                      setHastaManual(hasta);
                    }
                    setRango(valor);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    rango === valor
                      ? "border-sauce bg-sauce text-white"
                      : "border-carbon/20 text-carbon/70 hover:border-sauce hover:text-sauce"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
            {rango === "personalizado" && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={desdeManual}
                  onChange={(e) => setDesdeManual(e.target.value)}
                  className="rounded-lg border border-carbon/20 px-2.5 py-1.5 outline-none focus:border-sauce"
                />
                <span className="text-carbon/50">al</span>
                <input
                  type="date"
                  value={hastaManual}
                  onChange={(e) => setHastaManual(e.target.value)}
                  className="rounded-lg border border-carbon/20 px-2.5 py-1.5 outline-none focus:border-sauce"
                />
              </div>
            )}
            <p className="text-[11px] text-carbon/50 mt-2 font-mono">
              {desde} → {hasta}
            </p>
          </div>

          {!reporte ? (
            <p className="text-xs text-rojo">La fecha inicial debe ser anterior a la final.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Ventas", formatoPesos(reporte.monto)],
                  ["Trabajos", String(reporte.operaciones)],
                  ["m² trabajados", reporte.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 1 })],
                  ["Ticket promedio", formatoPesos(reporte.ticketPromedio)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-carbon/10 bg-slate-50/70 p-3">
                    <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider">{k}</div>
                    <div className="font-mono text-lg font-bold text-verde-profundo">{v}</div>
                  </div>
                ))}
              </div>
              <ul className="rounded-xl bg-sauce/10 p-3 text-xs text-carbon/80 space-y-1 list-disc pl-6">
                {reporte.resumen.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}

          {error && <p className="text-xs text-amber-700">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-carbon/10 p-4">
          <button
            type="button"
            onClick={() => generar("compartir")}
            disabled={sinDatos || !!generando}
            className="rounded-lg border border-sauce px-3.5 py-2 text-xs font-semibold text-sauce hover:bg-sauce/5 transition disabled:opacity-40"
          >
            {generando === "compartir" ? "Generando…" : "📤 Compartir (WhatsApp)"}
          </button>
          <button
            type="button"
            onClick={() => generar("descargar")}
            disabled={sinDatos || !!generando}
            className="rounded-lg bg-sauce px-3.5 py-2 text-xs font-semibold text-white hover:bg-verde-profundo transition disabled:opacity-40"
          >
            {generando === "descargar" ? "Generando…" : "⬇️ Descargar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
