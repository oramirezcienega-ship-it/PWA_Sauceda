"use client";

import { useState } from "react";
import type { Comision } from "@/lib/types";
import { ajustarComisionManual } from "@/app/actions/comisiones";

interface Props {
  comision: Comision;
  alCerrar: () => void;
  alGuardar: () => void;
}

export function ModalAjustarComision({ comision, alCerrar, alGuardar }: Props) {
  const [porcentaje, setPorcentaje] = useState<number>(comision.porcentajeComision);
  const [monto, setMonto] = useState<number>(comision.montoComision);
  const [motivo, setMotivo] = useState<string>(comision.motivoAjuste || "");
  const [notas, setNotas] = useState<string>(comision.notas || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  // La comisión se calcula sobre la base comisionable (venta - costo de
  // proveedor - comisión bancaria), no sobre el monto de venta completo.
  const baseComisionable = comision.baseComisionable || comision.montoVenta;

  // Sincronizar porcentaje -> monto
  const handleCambioPorcentaje = (val: number) => {
    setPorcentaje(val);
    if (baseComisionable > 0) {
      const nuevoMonto = Math.round(baseComisionable * (val / 100) * 100) / 100;
      setMonto(nuevoMonto);
    }
  };

  // Sincronizar monto -> porcentaje
  const handleCambioMonto = (val: number) => {
    setMonto(val);
    if (baseComisionable > 0) {
      const nuevoPorcentaje = Math.round((val / baseComisionable) * 100 * 100) / 100;
      setPorcentaje(nuevoPorcentaje);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setError("Por favor indique el motivo o justificación del ajuste manual.");
      return;
    }

    try {
      setGuardando(true);
      setError(null);
      const res = await ajustarComisionManual({
        comisionId: comision.id,
        porcentajeComision: porcentaje,
        montoComision: monto,
        motivoAjuste: motivo.trim(),
        notas: notas.trim(),
      });

      if (!res.ok) {
        throw new Error(res.error || "No se pudo guardar el ajuste.");
      }

      alGuardar();
    } catch (err: any) {
      setError(err.message || "Error al procesar el ajuste.");
    } finally {
      setGuardando(false);
    }
  };

  const nuevoSaldoPendiente = Math.max(0, monto - comision.montoPagado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-dorado/30 text-carbon">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-crema px-6 py-4 flex items-center justify-between border-b border-dorado/30">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-dorado block">
              Caso Particular / Ajuste Manual
            </span>
            <h3 className="font-titular text-lg font-bold">
              Ajustar Comisión · {comision.remisionFolio}
            </h3>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-crema/70 hover:text-crema p-1 rounded-lg transition hover:bg-crema/10"
          >
            ✕
          </button>
        </div>

        {/* Resumen de la Venta */}
        <div className="bg-slate-50 border-b border-carbon/10 px-6 py-3 text-xs grid grid-cols-2 gap-3">
          <div>
            <span className="text-carbon/60 block">Asesor:</span>
            <span className="font-semibold text-verde-profundo text-sm">
              {comision.asesorNombre}
            </span>
          </div>
          <div>
            <span className="text-carbon/60 block">Cliente:</span>
            <span className="font-semibold truncate block" title={comision.clienteNombre}>
              {comision.clienteNombre}
            </span>
          </div>
          <div>
            <span className="text-carbon/60 block">Monto Venta:</span>
            <span className="font-mono font-bold text-carbon text-sm">
              {formatoMoneda(comision.montoVenta)}
            </span>
          </div>
          <div>
            <span className="text-carbon/60 block">Pagado Acumulado:</span>
            <span className="font-mono font-semibold text-emerald-700">
              {formatoMoneda(comision.montoPagado)}
            </span>
          </div>
          <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <span className="text-emerald-800 block">
              Base Comisionable (Venta − Proveedor − Comisión Bancaria):
            </span>
            <span className="font-mono font-bold text-emerald-900 text-sm">
              {formatoMoneda(baseComisionable)}
            </span>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          {(() => {
            const montoEsperado = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100;
            const desfasado = Math.abs(montoEsperado - monto) > 0.01;
            if (!desfasado) return null;
            return (
              <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs">
                <span className="text-amber-900">
                  ⚠️ Este monto (${monto.toFixed(2)}) no coincide con {porcentaje}% de la base comisionable
                  actual (${montoEsperado.toFixed(2)}). Es probable que se haya calculado antes de que
                  existieran las deducciones de proveedor/pasarela.
                </span>
                <button
                  type="button"
                  onClick={() => setMonto(montoEsperado)}
                  className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 whitespace-nowrap"
                >
                  Recalcular
                </button>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Porcentaje (%) de Comisión
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={porcentaje}
                  onChange={(e) => handleCambioPorcentaje(parseFloat(e.target.value) || 0)}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                  required
                />
                <span className="absolute right-3 top-2 text-carbon/40 font-bold text-xs">%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Monto Comisión ($ MXN)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monto}
                  onChange={(e) => handleCambioMonto(parseFloat(e.target.value) || 0)}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono font-bold text-verde-profundo focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                  required
                />
                <span className="absolute right-3 top-2 text-carbon/40 font-bold text-xs">$</span>
              </div>
            </div>
          </div>

          {/* Nuevo Saldo Estimado */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex justify-between items-center text-xs">
            <span className="text-amber-900 font-medium">Nuevo Saldo Pendiente por Pagar:</span>
            <span className="font-mono font-bold text-amber-950 text-sm">
              {formatoMoneda(nuevoSaldoPendiente)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon mb-1">
              Motivo o Justificación del Ajuste <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej. Porcentaje especial acordado por volumen / Margen especial"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon mb-1">
              Notas Adicionales (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Comentarios internos sobre este movimiento..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex justify-end gap-2 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              className="px-4 py-2 border border-carbon/20 text-carbon/80 rounded-xl text-xs font-semibold hover:bg-slate-100 transition"
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 bg-verde-profundo text-crema rounded-xl text-xs font-bold hover:bg-verde-profundo/90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-crema/40 border-t-crema rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Ajuste"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
