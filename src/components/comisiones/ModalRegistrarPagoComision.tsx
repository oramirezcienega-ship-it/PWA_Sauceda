"use client";

import { useState, useMemo } from "react";
import type { Comision, MetodoPagoComision } from "@/lib/types";
import { registrarPagoComisiones } from "@/app/actions/comisiones";

interface Props {
  asesores: { id: string; nombre: string }[];
  comisionesPendientes: Comision[];
  asesorIdInicial?: string;
  comisionInicialId?: string;
  alCerrar: () => void;
  alGuardar: () => void;
}

export function ModalRegistrarPagoComision({
  asesores,
  comisionesPendientes,
  asesorIdInicial,
  comisionInicialId,
  alCerrar,
  alGuardar,
}: Props) {
  const [asesorId, setAsesorId] = useState<string>(
    asesorIdInicial || asesores[0]?.id || ""
  );
  const [monto, setMonto] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [metodoPago, setMetodoPago] = useState<MetodoPagoComision>("transferencia");
  const [referencia, setReferencia] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [modoManual, setModoManual] = useState<boolean>(Boolean(comisionInicialId));
  const [aplicacionesManuales, setAplicacionesManuales] = useState<Record<string, number>>(() => {
    if (comisionInicialId) {
      const c = comisionesPendientes.find((item) => item.id === comisionInicialId);
      if (c) return { [c.id]: c.saldoPendiente };
    }
    return {};
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  // Filtrar comisiones pendientes correspondientes al asesor seleccionado
  const pendientesDelAsesor = useMemo(() => {
    return comisionesPendientes.filter(
      (c) => c.asesorId === asesorId && c.saldoPendiente > 0 && c.estatus !== "cancelada"
    );
  }, [comisionesPendientes, asesorId]);

  const saldoTotalPendienteAsesor = useMemo(() => {
    return pendientesDelAsesor.reduce((acc, c) => acc + c.saldoPendiente, 0);
  }, [pendientesDelAsesor]);

  // Si se inicializó con una comisión específica, precargar su saldo en el campo de monto
  useState(() => {
    if (comisionInicialId) {
      const c = comisionesPendientes.find((item) => item.id === comisionInicialId);
      if (c) {
        setMonto(String(c.saldoPendiente));
      }
    }
  });

  const handleSeleccionarAsesor = (nuevoId: string) => {
    setAsesorId(nuevoId);
    setAplicacionesManuales({});
    setMonto("");
  };

  const handleCambioMontoManual = (comisionId: string, val: number) => {
    const c = pendientesDelAsesor.find((item) => item.id === comisionId);
    const max = c ? c.saldoPendiente : 0;
    const clamped = Math.max(0, Math.min(max, val));

    const nuevas = { ...aplicacionesManuales, [comisionId]: clamped };
    setAplicacionesManuales(nuevas);

    // Sumar total al campo principal de monto
    const suma = Object.values(nuevas).reduce((a, b) => a + b, 0);
    setMonto(suma > 0 ? String(suma) : "");
  };

  const handleLiquidarTotalComision = (comisionId: string) => {
    const c = pendientesDelAsesor.find((item) => item.id === comisionId);
    if (!c) return;
    handleCambioMontoManual(comisionId, c.saldoPendiente);
  };

  const handleLiquidarTodoElSaldo = () => {
    setMonto(String(saldoTotalPendienteAsesor));
    setModoManual(false);
    setAplicacionesManuales({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoNumerico = parseFloat(monto) || 0;

    if (montoNumerico <= 0) {
      setError("Por favor ingrese un monto válido a pagar.");
      return;
    }

    // Ya no se bloquea si el monto excede el saldo pendiente: el excedente
    // (por ejemplo, un préstamo/anticipo que solicita el asesor) se registra
    // como anticipo a favor de SAUCEDA y se descuenta automáticamente de sus
    // próximas comisiones.

    try {
      setGuardando(true);
      setError(null);

      let appsPayload: { comisionId: string; monto: number }[] | undefined = undefined;

      if (modoManual) {
        appsPayload = Object.entries(aplicacionesManuales)
          .filter(([_, val]) => val > 0)
          .map(([comId, val]) => ({ comisionId: comId, monto: val }));

        if (appsPayload.length === 0) {
          throw new Error("Seleccione al menos una comisión para aplicar el pago manual.");
        }
      }

      const res = await registrarPagoComisiones({
        asesorId,
        fechaPago,
        monto: montoNumerico,
        metodoPago,
        referencia: referencia.trim(),
        notas: notas.trim(),
        aplicaciones: appsPayload,
      });

      if (!res.ok) {
        throw new Error(res.error || "No se pudo registrar el pago.");
      }

      alGuardar();
    } catch (err: any) {
      setError(err.message || "Error al procesar el pago.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-dorado/30 text-carbon my-8">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-crema px-6 py-4 flex items-center justify-between border-b border-dorado/30">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-dorado block">
              Dispersión / Finiquito
            </span>
            <h3 className="font-titular text-lg font-bold">
              Registrar Pago de Comisiones
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Selector de Asesor y Saldo Pendiente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Asesor Beneficiario
              </label>
              <select
                value={asesorId}
                onChange={(e) => handleSeleccionarAsesor(e.target.value)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                disabled={Boolean(asesorIdInicial && comisionInicialId)}
                required
              >
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-slate-50 border border-carbon/10 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[11px] text-carbon/60 block">Saldo Total Pendiente Asesor:</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-mono font-bold text-amber-950 text-base">
                  {formatoMoneda(saldoTotalPendienteAsesor)}
                </span>
                {saldoTotalPendienteAsesor > 0 && (
                  <button
                    type="button"
                    onClick={handleLiquidarTodoElSaldo}
                    className="text-[11px] text-verde-profundo hover:underline font-semibold"
                  >
                    Liquidar Todo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Monto y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Monto del Pago ($) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono font-bold text-verde-profundo focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                  required
                />
                <span className="absolute right-3 top-2 text-carbon/40 font-bold text-xs">$</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Fecha del Pago
              </label>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Método de Pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPagoComision)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
              >
                <option value="transferencia">Transferencia SPEI</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="deposito">Depósito Bancario</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {(() => {
            const montoNumerico = parseFloat(monto) || 0;
            const excedente =
              Math.round((montoNumerico - saldoTotalPendienteAsesor) * 100) / 100;
            if (excedente <= 0.01) return null;
            return (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <span>💰</span>
                <span>
                  Este pago excede el saldo pendiente por{" "}
                  <strong>{formatoMoneda(excedente)}</strong>. Ese excedente se registrará como{" "}
                  <strong>anticipo/préstamo a favor de SAUCEDA</strong>, y se descontará
                  automáticamente de las próximas comisiones de este asesor.
                </span>
              </div>
            );
          })()}

          {/* Referencia bancaria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Referencia / Folio Bancario
              </label>
              <input
                type="text"
                placeholder="Ej. SPEI 839218 / Cheque #1029"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Notas / Observaciones
              </label>
              <input
                type="text"
                placeholder="Ej. Pago de comisiones semana 38"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo focus:ring-1 focus:ring-verde-profundo outline-none"
              />
            </div>
          </div>

          {/* Modo de aplicación */}
          <div className="border-t border-carbon/10 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-carbon">
                Desglose de Comisiones a Cubrir
              </span>
              <button
                type="button"
                onClick={() => setModoManual(!modoManual)}
                className="text-xs text-verde-profundo hover:underline font-semibold"
              >
                {modoManual
                  ? "⚡ Cambiar a aplicación automática por fecha"
                  : "✏️ Asignar montos manualmente a cada venta"}
              </button>
            </div>

            {!modoManual ? (
              <div className="p-3 bg-slate-50 border border-carbon/10 rounded-xl text-xs text-carbon/70">
                ℹ️ <strong>Distribución Automática:</strong> El sistema cubrirá las comisiones pendientes del asesor de manera cronológica (las más antiguas primero) hasta agotar el monto ingresado (${monto || "0.00"}).
              </div>
            ) : (
              <div className="border border-carbon/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-carbon/70 sticky top-0 text-[11px]">
                    <tr>
                      <th className="p-2">Folio / Fecha</th>
                      <th className="p-2">Cliente</th>
                      <th className="p-2 text-right">Saldo Pendiente</th>
                      <th className="p-2 text-right w-32">Monto a Aplicar</th>
                      <th className="p-2 text-center w-16">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5">
                    {pendientesDelAsesor.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-carbon/50">
                          Este asesor no tiene comisiones pendientes por pagar. Puedes registrar el
                          monto de todos modos como anticipo/préstamo a favor de SAUCEDA (se
                          descontará de sus próximas comisiones).
                        </td>
                      </tr>
                    ) : (
                      pendientesDelAsesor.map((c) => {
                        const aplicado = aplicacionesManuales[c.id] || 0;
                        return (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="p-2">
                              <span className="font-mono font-bold text-verde-profundo block">
                                {c.remisionFolio}
                              </span>
                              <span className="text-[10px] text-carbon/50">
                                {new Date(c.fecha).toLocaleDateString("es-MX")}
                              </span>
                            </td>
                            <td className="p-2 font-medium truncate max-w-[140px]" title={c.clienteNombre}>
                              {c.clienteNombre}
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-amber-950">
                              {formatoMoneda(c.saldoPendiente)}
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={c.saldoPendiente}
                                value={aplicado > 0 ? aplicado : ""}
                                placeholder="0.00"
                                onChange={(e) =>
                                  handleCambioMontoManual(c.id, parseFloat(e.target.value) || 0)
                                }
                                className="w-24 text-right border border-carbon/20 rounded-lg px-2 py-1 font-mono text-xs focus:border-verde-profundo outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleLiquidarTotalComision(c.id)}
                                className="text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon px-2 py-1 rounded-md font-semibold"
                                title="Cubrir todo el saldo de esta venta"
                              >
                                Max
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="pt-3 flex justify-end gap-2 border-t border-carbon/10">
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
              disabled={guardando || (!monto && pendientesDelAsesor.length === 0)}
              className="px-5 py-2 bg-verde-profundo text-crema rounded-xl text-xs font-bold hover:bg-verde-profundo/90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-crema/40 border-t-crema rounded-full animate-spin" />
                  Procesando Pago...
                </>
              ) : (
                `Aplicar Pago · ${monto ? formatoMoneda(parseFloat(monto) || 0) : "$0.00"}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
