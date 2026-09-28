"use client";

import React, { useState } from "react";
import { importarMovimientosMasivos } from "@/app/actions/finanzas";
import { exportarAExcelCSV } from "@/lib/finanzasExport";

interface ModalImportarExcelProps {
  abierto: boolean;
  onCerrar: () => void;
  onImportado: () => void;
}

interface FilaPreview {
  linea: number;
  fecha: string;
  tipo: "ingreso" | "egreso" | "traspaso";
  categoria: string;
  concepto: string;
  monto: number;
  unidad?: string;
  cuenta?: string;
  valida: boolean;
  error?: string;
}

export function ModalImportarExcel({
  abierto,
  onCerrar,
  onImportado
}: ModalImportarExcelProps) {
  const [textoPegado, setTextoPegado] = useState("");
  const [previewFilas, setPreviewFilas] = useState<FilaPreview[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState("");

  if (!abierto) return null;

  const descargarPlantilla = () => {
    const encabezados = ["Fecha (AAAA-MM-DD)", "Tipo (ingreso/egreso)", "Categoria", "Concepto", "Monto", "Unidad", "Cuenta"];
    const filasEjemplo = [
      ["2026-06-01", "egreso", "Renta de Inmueble", "Renta Oficina Central", 12000, "Bienes Raíces", "Banco Principal Santander"],
      ["2026-06-15", "ingreso", "Comisiones Inmobiliarias", "Comisión Venta Terreno", 45000, "Bienes Raíces", "Banco Principal Santander"],
      ["2026-06-20", "egreso", "Servicios Básicos y Software", "Internet y Telefonía", 1800, "Construye", "Caja Operativa / Efectivo"]
    ];
    exportarAExcelCSV("Plantilla_Importacion_Finanzas_SAUCEDA", encabezados, filasEjemplo);
  };

  const handleAnalizarTexto = () => {
    setErrorGlobal("");
    if (!textoPegado.trim()) {
      setErrorGlobal("Pega los datos de tu Excel o CSV en el cuadro de texto.");
      return;
    }

    setProcesando(true);
    try {
      const lineas = textoPegado.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const resultado: FilaPreview[] = [];

      lineas.forEach((linea, index) => {
        // Detectar si es cabecera
        if (index === 0 && (linea.toLowerCase().includes("fecha") || linea.toLowerCase().includes("concepto"))) {
          return;
        }

        // Dividir por tabulación o por coma
        let partes = linea.includes("\t")
          ? linea.split("\t")
          : linea.split(",").map((s) => s.replace(/^["']|["']$/g, "").trim());

        if (partes.length < 5) {
          resultado.push({
            linea: index + 1,
            fecha: "",
            tipo: "egreso",
            categoria: "",
            concepto: linea,
            monto: 0,
            valida: false,
            error: "Faltan columnas (se requieren al menos 5: Fecha, Tipo, Categoría, Concepto, Monto)."
          });
          return;
        }

        const fechaRaw = partes[0].trim();
        const tipoRaw = partes[1].trim().toLowerCase();
        const catRaw = partes[2].trim();
        const conceptoRaw = partes[3].trim();
        const montoRaw = partes[4].trim().replace(/[$,]/g, "");
        const unidadRaw = partes[5]?.trim() || "";
        const cuentaRaw = partes[6]?.trim() || "";

        const montoNum = parseFloat(montoRaw);
        let error = "";

        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
          error = "Fecha inválida (usa AAAA-MM-DD).";
        } else if (!["ingreso", "egreso", "traspaso"].includes(tipoRaw)) {
          error = "Tipo inválido (debe ser ingreso o egreso).";
        } else if (isNaN(montoNum) || montoNum <= 0) {
          error = "Monto inválido.";
        }

        resultado.push({
          linea: index + 1,
          fecha: fechaRaw,
          tipo: tipoRaw as any,
          categoria: catRaw,
          concepto: conceptoRaw,
          monto: isNaN(montoNum) ? 0 : montoNum,
          unidad: unidadRaw,
          cuenta: cuentaRaw,
          valida: !error,
          error
        });
      });

      setPreviewFilas(resultado);
    } catch (err: any) {
      setErrorGlobal(err.message || "Error al procesar el texto.");
    } finally {
      setProcesando(false);
    }
  };

  const handleConfirmarImportacion = async () => {
    const validas = previewFilas.filter((f) => f.valida);
    if (validas.length === 0) {
      setErrorGlobal("No hay filas válidas para importar.");
      return;
    }

    setGuardando(true);
    try {
      const res = await importarMovimientosMasivos(
        validas.map((v) => ({
          fecha: v.fecha,
          tipo: v.tipo,
          categoria: v.categoria,
          concepto: v.concepto,
          monto: v.monto,
          unidad: v.unidad,
          cuenta: v.cuenta
        }))
      );

      if (!res.success) throw new Error(res.message);

      onImportado();
      onCerrar();
    } catch (err: any) {
      setErrorGlobal(err.message || "Error al guardar importación.");
    } finally {
      setGuardando(false);
    }
  };

  const filasValidas = previewFilas.filter((f) => f.valida).length;
  const filasInvalidas = previewFilas.filter((f) => !f.valida).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>📋</span> Importar Movimientos desde Excel / CSV
            </h3>
            <p className="text-[11px] text-slate-400">
              Copia tus filas de Excel y pégalas directamente · Vista previa antes de confirmar
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

        {errorGlobal && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-medium">
            ⚠️ {errorGlobal}
          </div>
        )}

        {previewFilas.length === 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-700">¿No tienes el formato?</p>
                <p className="text-[11px] text-slate-400">Descarga la plantilla oficial con encabezados y ejemplos listos.</p>
              </div>
              <button
                type="button"
                onClick={descargarPlantilla}
                className="rounded-xl border border-[#2D4A2B] bg-white px-3 py-1.5 text-xs font-bold text-[#2D4A2B] hover:bg-[#F5F1E8] transition shadow-xs flex items-center gap-1.5"
              >
                <span>📥</span> Descargar Plantilla CSV
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pega aquí las columnas copiadas de Excel (separadas por tabulación o coma)
              </label>
              <textarea
                value={textoPegado}
                onChange={(e) => setTextoPegado(e.target.value)}
                placeholder={"2026-06-01\tegro\tRenta de Inmueble\tRenta Oficina Junio\t12000\tBienes Raíces\tBanco Santander\n2026-06-15\tingreso\tComisiones Inmobiliarias\tComisión Cierre Casa\t45000\tBienes Raíces\tBanco Santander"}
                className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono h-48 focus:border-[#2D4A2B] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAnalizarTexto}
                disabled={procesando || !textoPegado.trim()}
                className="rounded-xl bg-[#2D4A2B] px-5 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50"
              >
                {procesando ? "Analizando..." : "Analizar y Ver Vista Previa"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* RESUMEN DE VISTA PREVIA */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex gap-4 text-xs font-bold">
                <span className="text-emerald-700">✓ {filasValidas} filas listas para importar</span>
                {filasInvalidas > 0 && (
                  <span className="text-rose-600">✕ {filasInvalidas} filas con error (se omitirán)</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewFilas([])}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
              >
                Volver a editar texto
              </button>
            </div>

            {/* TABLA PREVIEW */}
            <div className="overflow-x-auto max-h-[300px] border border-slate-200 rounded-xl scrollbar-sutil">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[9px] font-bold sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Categoría</th>
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewFilas.map((f, i) => (
                    <tr key={i} className={f.valida ? "hover:bg-slate-50" : "bg-red-50/50"}>
                      <td className="px-3 py-2 font-bold">
                        {f.valida ? (
                          <span className="text-emerald-600 text-[10px]">✓ Válida</span>
                        ) : (
                          <span className="text-rose-600 text-[10px]" title={f.error}>
                            ✕ Error: {f.error}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">{f.fecha || "—"}</td>
                      <td className="px-3 py-2 uppercase text-[9px] font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            f.tipo === "ingreso"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {f.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{f.categoria || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{f.concepto}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">
                        ${f.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPreviewFilas([])}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleConfirmarImportacion}
                disabled={guardando || filasValidas === 0}
                className="rounded-xl bg-[#2D4A2B] px-5 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center gap-2"
              >
                {guardando ? "Guardando..." : `Confirmar e Importar ${filasValidas} Movimientos`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
