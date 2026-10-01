"use client";

import { useState } from "react";
import type { Comision, EstatusComision } from "@/lib/types";
import { editarComisionesMasivas } from "@/app/actions/comisiones";

interface Props {
  comisionesSeleccionadas: Comision[];
  asesores: { id: string; nombre: string }[];
  alCerrar: () => void;
  alGuardar: (resultado?: { actualizadas: number; omitidasPorConflicto: number }) => void;
}

export function ModalEdicionMasivaComisiones({
  comisionesSeleccionadas,
  asesores,
  alCerrar,
  alGuardar,
}: Props) {
  // Opciones a modificar
  const [activarAsesor, setActivarAsesor] = useState(false);
  const [asesorId, setAsesorId] = useState<string>(asesores[0]?.id || "");

  const [modoMonto, setModoMonto] = useState<"ninguno" | "fijo" | "porcentaje">("ninguno");
  const [montoFijo, setMontoFijo] = useState<string>("150.00");
  const [porcentaje, setPorcentaje] = useState<string>("5.00");

  const [activarEstatus, setActivarEstatus] = useState(false);
  const [estatus, setEstatus] = useState<EstatusComision>("pendiente");

  const [motivo, setMotivo] = useState<string>("");
  const [notas, setNotas] = useState<string>("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  const total = comisionesSeleccionadas.length;
  const inspeccionesCount = comisionesSeleccionadas.filter((c) => c.tipoComision === "inspeccion").length;
  const ventasCount = total - inspeccionesCount;
  const sumaComisiones = comisionesSeleccionadas.reduce((acc, c) => acc + (c.montoComision || 0), 0);
  const sumaPagado = comisionesSeleccionadas.reduce((acc, c) => acc + (c.montoPagado || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validar que se haya activado al menos una modificación
    if (!activarAsesor && modoMonto === "ninguno" && !activarEstatus && !notas.trim()) {
      setError("Selecciona al menos una propiedad para modificar en las comisiones.");
      return;
    }

    if (!motivo.trim()) {
      setError("Por favor describe el motivo o justificación del ajuste masivo (requerido para auditoría).");
      return;
    }

    if (modoMonto === "fijo") {
      const val = parseFloat(montoFijo);
      if (isNaN(val) || val < 0) {
        setError("El monto fijo ingresado no es válido.");
        return;
      }
    }

    if (modoMonto === "porcentaje") {
      const val = parseFloat(porcentaje);
      if (isNaN(val) || val < 0 || val > 100) {
        setError("El porcentaje debe ser un valor entre 0 y 100.");
        return;
      }
    }

    try {
      setGuardando(true);
      const res = await editarComisionesMasivas({
        comisionIds: comisionesSeleccionadas.map((c) => c.id),
        cambios: {
          asesorId: activarAsesor && asesorId ? asesorId : undefined,
          estatus: activarEstatus ? estatus : undefined,
          montoComision: modoMonto === "fijo" ? parseFloat(montoFijo) : undefined,
          porcentajeComision: modoMonto === "porcentaje" ? parseFloat(porcentaje) : undefined,
          motivoAjuste: motivo.trim(),
          notas: notas.trim() ? notas.trim() : undefined,
        },
      });

      if (!res.ok) {
        throw new Error(res.error || "No se pudieron aplicar los cambios.");
      }

      alGuardar({
        actualizadas: res.actualizadas || 0,
        omitidasPorConflicto: res.omitidasPorConflicto || 0,
      });
    } catch (err: any) {
      setError(err.message || "Error al procesar la edición masiva.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-dorado/30 text-carbon my-8">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-crema px-6 py-4 flex items-center justify-between border-b border-dorado/30">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-dorado block">
              Operación en Lote
            </span>
            <h3 className="font-titular text-lg font-bold">
              Edición Masiva de Comisiones
            </h3>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            disabled={guardando}
            className="text-crema/70 hover:text-crema p-1 rounded-lg transition hover:bg-crema/10 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Resumen de elementos seleccionados */}
        <div className="bg-slate-50 border-b border-carbon/10 px-6 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-carbon/60 block">Comisiones seleccionadas:</span>
              <span className="font-bold text-verde-profundo text-sm">
                {total} registros ({inspeccionesCount} inspecciones, {ventasCount} ventas)
              </span>
            </div>
            <div className="text-right">
              <span className="text-carbon/60 block">Total en comisiones:</span>
              <span className="font-mono font-bold text-carbon text-sm">
                {formatoMoneda(sumaComisiones)}
              </span>
              {sumaPagado > 0 && (
                <span className="block text-[10px] text-emerald-700 font-medium">
                  Pagado previo: {formatoMoneda(sumaPagado)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-carbon/60">
            Marca las casillas de los campos que deseas modificar. Los campos desmarcados conservarán su valor original en cada comisión.
          </p>

          <div className="space-y-4">
            {/* Opción 1: Reasignar Asesor */}
            <div className={`p-4 rounded-xl border transition ${activarAsesor ? "bg-verde-profundo/5 border-verde-profundo/30" : "bg-slate-50/70 border-carbon/10"}`}>
              <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-xs text-carbon select-none">
                <input
                  type="checkbox"
                  checked={activarAsesor}
                  onChange={(e) => setActivarAsesor(e.target.checked)}
                  className="w-4 h-4 rounded text-verde-profundo focus:ring-verde-profundo/30 cursor-pointer accent-verde-profundo"
                />
                <span>Reasignar Asesor</span>
              </label>

              {activarAsesor && (
                <div className="mt-3 pl-6">
                  <select
                    value={asesorId}
                    onChange={(e) => setAsesorId(e.target.value)}
                    className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white font-medium text-carbon focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                    required={activarAsesor}
                  >
                    {asesores.map((a) => (
                      <option key={a.id} value={a.id}>
                        👤 {a.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-carbon/50 mt-1">
                    Todas las comisiones seleccionadas pasarán a la cuenta de este asesor.
                  </p>
                </div>
              )}
            </div>

            {/* Opción 2: Monto o Porcentaje */}
            <div className={`p-4 rounded-xl border transition ${modoMonto !== "ninguno" ? "bg-verde-profundo/5 border-verde-profundo/30" : "bg-slate-50/70 border-carbon/10"}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-xs text-carbon select-none">
                  <input
                    type="checkbox"
                    checked={modoMonto !== "ninguno"}
                    onChange={(e) => setModoMonto(e.target.checked ? "fijo" : "ninguno")}
                    className="w-4 h-4 rounded text-verde-profundo focus:ring-verde-profundo/30 cursor-pointer accent-verde-profundo"
                  />
                  <span>Actualizar Monto / Tarifa de Comisión</span>
                </label>

                {modoMonto !== "ninguno" && (
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-carbon/15 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setModoMonto("fijo")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${modoMonto === "fijo" ? "bg-verde-profundo text-crema" : "text-carbon/70 hover:text-carbon"}`}
                    >
                      Tarifa Fija ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoMonto("porcentaje")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${modoMonto === "porcentaje" ? "bg-verde-profundo text-crema" : "text-carbon/70 hover:text-carbon"}`}
                    >
                      Porcentaje (%)
                    </button>
                  </div>
                )}
              </div>

              {modoMonto === "fijo" && (
                <div className="mt-3 pl-6 space-y-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={montoFijo}
                      onChange={(e) => setMontoFijo(e.target.value)}
                      placeholder="150.00"
                      className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono font-bold text-verde-profundo bg-white focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-carbon/40 font-bold text-xs">$ MXN</span>
                  </div>

                  {/* Botones de sugerencia rápida */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-carbon/50">Atajos:</span>
                    <button
                      type="button"
                      onClick={() => setMontoFijo("150.00")}
                      className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-md transition"
                    >
                      🔍 $150.00 (Tarifa Técnica)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMontoFijo("60.00")}
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon font-semibold px-2 py-0.5 rounded-md transition"
                    >
                      $60.00
                    </button>
                    <button
                      type="button"
                      onClick={() => setMontoFijo("100.00")}
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon font-semibold px-2 py-0.5 rounded-md transition"
                    >
                      $100.00
                    </button>
                  </div>
                  <p className="text-[10px] text-carbon/50">
                    Se fijará este monto exacto a cada comisión. El saldo pendiente se recalculará automáticamente restando los pagos previos.
                  </p>
                </div>
              )}

              {modoMonto === "porcentaje" && (
                <div className="mt-3 pl-6 space-y-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={porcentaje}
                      onChange={(e) => setPorcentaje(e.target.value)}
                      placeholder="5.00"
                      className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono font-bold text-verde-profundo bg-white focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-carbon/40 font-bold text-xs">%</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-carbon/50">Atajos:</span>
                    <button
                      type="button"
                      onClick={() => setPorcentaje("5.00")}
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-2 py-0.5 rounded-md transition"
                    >
                      5.00%
                    </button>
                    <button
                      type="button"
                      onClick={() => setPorcentaje("7.00")}
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-2 py-0.5 rounded-md transition"
                    >
                      7.00%
                    </button>
                    <button
                      type="button"
                      onClick={() => setPorcentaje("10.00")}
                      className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-2 py-0.5 rounded-md transition"
                    >
                      10.00%
                    </button>
                  </div>
                  <p className="text-[10px] text-carbon/50">
                    Para comisiones de ventas, el monto se recalculará como Base Comisionable × %.
                  </p>
                </div>
              )}
            </div>

            {/* Opción 3: Cambiar Estatus */}
            <div className={`p-4 rounded-xl border transition ${activarEstatus ? "bg-verde-profundo/5 border-verde-profundo/30" : "bg-slate-50/70 border-carbon/10"}`}>
              <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-xs text-carbon select-none">
                <input
                  type="checkbox"
                  checked={activarEstatus}
                  onChange={(e) => setActivarEstatus(e.target.checked)}
                  className="w-4 h-4 rounded text-verde-profundo focus:ring-verde-profundo/30 cursor-pointer accent-verde-profundo"
                />
                <span>Cambiar Estatus en Lote</span>
              </label>

              {activarEstatus && (
                <div className="mt-3 pl-6">
                  <select
                    value={estatus}
                    onChange={(e) => setEstatus(e.target.value as EstatusComision)}
                    className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white font-medium text-carbon focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                  >
                    <option value="pendiente">🟡 Pendiente (Saldo vigente a pagar)</option>
                    <option value="pagada">🟢 Pagada (Marcada como cubierta)</option>
                    <option value="cancelada">🔴 Cancelada (Saldo $0.00, fuera de balance)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Motivo de Ajuste (Auditoría obligatoria) */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-carbon mb-1">
                Motivo / Justificación del Ajuste Masivo <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Corrección de tarifa fija a $150 o Reasignación de asesor técnico"
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white text-carbon focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                required
              />
              <span className="text-[10px] text-carbon/40 block mt-1">
                Quedará registrado en la auditoría contable de cada comisión.
              </span>
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Notas Adicionales (Opcional)
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Observaciones adicionales para el historial..."
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white text-carbon focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none resize-none"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              disabled={guardando}
              className="px-4 py-2 border border-carbon/20 text-carbon text-xs font-semibold rounded-xl hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold px-5 py-2 rounded-xl transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Aplicando a {total} comisiones...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Guardar Cambios en {total} Comisiones</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
