"use client";

import { useState, useMemo } from "react";
import { formatoPesos } from "@/lib/formato";
import type {
  TipoMovimientoProveedor,
  OrdenTrabajoBalanceProveedor,
  DocumentoBalanceProveedor,
  TipoDestinoAplicacion,
} from "@/lib/types";
import { registrarMovimientoBalanceAction } from "@/app/actions/proveedores-balance";

interface ModalRegistrarMovimientoBalanceProps {
  proveedorId: string;
  proveedorNombre: string;
  tipoInicial?: TipoMovimientoProveedor;
  ordenes: OrdenTrabajoBalanceProveedor[];
  documentos: DocumentoBalanceProveedor[];
  alCerrar: () => void;
  alGuardar: () => void;
}

export function ModalRegistrarMovimientoBalance({
  proveedorId,
  proveedorNombre,
  tipoInicial = "anticipo_a_proveedor",
  ordenes,
  documentos,
  alCerrar,
  alGuardar,
}: ModalRegistrarMovimientoBalanceProps) {
  const [tipo, setTipo] = useState<TipoMovimientoProveedor>(tipoInicial);
  const [monto, setMonto] = useState<number | "">("");
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split("T")[0]);
  const [metodoPago, setMetodoPago] = useState<"transferencia" | "efectivo" | "cheque" | "compensacion" | "otro">(
    "transferencia"
  );
  const [referencia, setReferencia] = useState("");
  const [concepto, setConcepto] = useState("");
  const [notas, setNotas] = useState("");

  // Aplicación inmediata opcional
  const [aplicarInmediato, setAplicarInmediato] = useState(false);
  const [montosAsignados, setMontosAsignados] = useState<Record<string, number>>({});

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otsPendientes = useMemo(() => ordenes.filter((o) => o.saldoPendiente > 0), [ordenes]);
  const docsPendientes = useMemo(() => documentos.filter((d) => d.saldoPendiente > 0), [documentos]);

  const numMonto = Number(monto) || 0;
  const totalAsignado = useMemo(() => {
    return Object.values(montosAsignados).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [montosAsignados]);

  const remanente = numMonto - totalAsignado;
  const excede = aplicarInmediato && totalAsignado > numMonto + 0.01;

  function handleSetMontoAsignado(key: string, valor: number, maximo: number) {
    const v = Math.max(0, Math.min(valor, maximo));
    setMontosAsignados((prev) => {
      if (v <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: v };
    });
  }

  function handleAutoLiquidar(key: string, saldoPendiente: number) {
    const asignadoActual = montosAsignados[key] || 0;
    const disponibleLibre = numMonto - (totalAsignado - asignadoActual);
    const sugerido = Math.min(saldoPendiente, Math.max(0, disponibleLibre));
    handleSetMontoAsignado(key, sugerido, saldoPendiente);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!monto || numMonto <= 0) {
      setError("Ingresa un monto válido mayor a 0.");
      return;
    }
    if (!concepto.trim()) {
      setError("Ingresa un concepto descriptivo.");
      return;
    }
    if (excede) {
      setError(`La suma aplicada ($${totalAsignado.toLocaleString("es-MX")}) excede el monto del pago ($${numMonto.toLocaleString("es-MX")}).`);
      return;
    }

    setGuardando(true);
    setError(null);

    const aplicaciones: Array<{
      ordenTrabajoId?: string | null;
      documentoProveedorId?: string | null;
      tipoDestino: TipoDestinoAplicacion;
      folioDestino?: string | null;
      descripcionDestino: string;
      montoAplicado: number;
    }> = [];

    if (aplicarInmediato) {
      otsPendientes.forEach((ot) => {
        const m = montosAsignados[`ot_${ot.id}`];
        if (m && m > 0) {
          aplicaciones.push({
            ordenTrabajoId: ot.id,
            tipoDestino: "orden_trabajo",
            folioDestino: ot.folio,
            descripcionDestino: `${ot.folio} · ${ot.titulo}${ot.expedienteId ? ` (${ot.expedienteId})` : ""}`,
            montoAplicado: m,
          });
        }
      });

      docsPendientes.forEach((doc) => {
        const m = montosAsignados[`doc_${doc.id}`];
        if (m && m > 0) {
          aplicaciones.push({
            documentoProveedorId: doc.id,
            tipoDestino: doc.tipo === "factura" ? "factura_proveedor" : "remision_proveedor",
            folioDestino: doc.folio,
            descripcionDestino: `${doc.folio} · ${doc.concepto}`,
            montoAplicado: m,
          });
        }
      });
    }

    const res = await registrarMovimientoBalanceAction({
      proveedorId,
      tipo,
      monto: numMonto,
      fecha,
      metodoPago,
      referencia: referencia.trim() || undefined,
      concepto: concepto.trim(),
      notas: notas.trim() || undefined,
      aplicaciones: aplicaciones.length > 0 ? aplicaciones : undefined,
    });

    setGuardando(false);

    if (!res.ok) {
      setError(res.error || "No se pudo registrar el movimiento.");
    } else {
      alGuardar();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 font-cuerpo overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-carbon/10 flex flex-col max-h-[92vh]">
        {/* ENCABEZADO */}
        <div className="flex items-center justify-between border-b border-carbon/10 px-6 py-4 bg-slate-50/70 rounded-t-2xl">
          <div>
            <span className="font-mono text-[10px] bg-sauce/15 text-verde-profundo px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Movimiento de Balance
            </span>
            <h3 className="font-titular text-lg font-bold text-verde-profundo mt-0.5">
              Registrar Movimiento / Pago: {proveedorNombre}
            </h3>
          </div>
          <button
            onClick={alCerrar}
            disabled={guardando}
            className="rounded-lg p-1.5 text-carbon/40 hover:bg-carbon/10 hover:text-carbon transition text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-semibold flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* TIPO DE MOVIMIENTO */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1.5">
              Tipo de Operación
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: "anticipo_a_proveedor",
                  titulo: "🟢 Anticipo a Proveedor",
                  desc: "Dinero adelantado por Sauceda a cuenta de obra (Saldo a nuestro favor)",
                },
                {
                  id: "pago_a_proveedor",
                  titulo: "💳 Pago a Proveedor",
                  desc: "Liquidación o abono a órdenes y facturas del proveedor",
                },
                {
                  id: "pago_recibido_proveedor",
                  titulo: "💰 Pago Recibido de Proveedor",
                  desc: "Comisiones o liquidaciones que el proveedor nos transfiere",
                },
                {
                  id: "comision_por_cobrar",
                  titulo: "📑 Comisión por Cobrar",
                  desc: "Cargo al proveedor por cobrar directo al cliente",
                },
                {
                  id: "ajuste_saldo",
                  titulo: "⚖️ Ajuste de Saldo",
                  desc: "Aclaración manual, redondeo o descuento",
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTipo(opt.id as TipoMovimientoProveedor)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    tipo === opt.id
                      ? "bg-verde-profundo text-white border-verde-profundo shadow-xs"
                      : "bg-white border-carbon/15 hover:border-carbon/30 text-carbon"
                  }`}
                >
                  <div className="text-xs font-bold">{opt.titulo}</div>
                  <div className={`text-[10px] mt-0.5 ${tipo === opt.id ? "text-crema/80" : "text-carbon/60"}`}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* MONTO Y FECHA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
                Monto ($ MXN) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-carbon/40 font-mono font-bold">
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-carbon/20 font-mono text-base font-bold focus:border-sauce focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
                Fecha de Operación *
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-carbon/20 text-xs font-medium focus:border-sauce focus:outline-hidden"
              />
            </div>
          </div>

          {/* MÉTODO Y REFERENCIA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
                Método de Pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-carbon/20 text-xs font-medium focus:border-sauce focus:outline-hidden"
              >
                <option value="transferencia">Transferencia bancaria / SPEI</option>
                <option value="efectivo">Efectivo en mano</option>
                <option value="cheque">Cheque</option>
                <option value="compensacion">Compensación / Cruce de saldos</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
                Referencia / Folio
              </label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Rastreo SPEI, cheque o recibo"
                className="w-full px-3 py-2 rounded-xl border border-carbon/20 text-xs font-medium focus:border-sauce focus:outline-hidden"
              />
            </div>
          </div>

          {/* CONCEPTO */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
              Concepto *
            </label>
            <input
              type="text"
              required
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Anticipo general para obra Campestre / Comisión liquidada de herrero"
              className="w-full px-3 py-2 rounded-xl border border-carbon/20 text-xs font-medium focus:border-sauce focus:outline-hidden"
            />
          </div>

          {/* NOTAS */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-carbon/60 block mb-1">
              Notas adicionales (opcional)
            </label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalles del acuerdo, persona que entregó/recibió..."
              className="w-full px-3 py-2 rounded-xl border border-carbon/20 text-xs font-medium focus:border-sauce focus:outline-hidden"
            />
          </div>

          {/* SECCIÓN OPCIONAL: APLICAR INMEDIATAMENTE */}
          {(otsPendientes.length > 0 || docsPendientes.length > 0) && numMonto > 0 && (
            <div className="pt-3 border-t border-carbon/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aplicarInmediato}
                    onChange={(e) => setAplicarInmediato(e.target.checked)}
                    className="rounded border-carbon/30 text-verde-profundo focus:ring-verde-profundo h-4 w-4"
                  />
                  <span className="text-xs font-bold text-carbon">
                    Aplicar este monto de inmediato a órdenes o facturas
                  </span>
                </label>
                {aplicarInmediato && (
                  <span className="text-[11px] font-mono font-bold text-carbon/60">
                    Disponible: {formatoPesos(remanente)}
                  </span>
                )}
              </div>

              {aplicarInmediato && (
                <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                  {otsPendientes.map((ot) => {
                    const key = `ot_${ot.id}`;
                    const val = montosAsignados[key] || 0;
                    return (
                      <div
                        key={ot.id}
                        className="p-2.5 rounded-xl border border-carbon/15 bg-slate-50 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex-1 min-w-[180px]">
                          <span className="font-mono font-bold text-verde-profundo">{ot.folio}</span> · {ot.titulo}
                          <div className="text-[10px] text-carbon/60">
                            Pendiente: <strong className="text-amber-800">{formatoPesos(ot.saldoPendiente)}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={ot.saldoPendiente}
                            step="any"
                            value={val || ""}
                            placeholder="0"
                            onChange={(e) =>
                              handleSetMontoAsignado(key, Number(e.target.value) || 0, ot.saldoPendiente)
                            }
                            className="w-24 px-2 py-1 rounded border border-carbon/20 font-mono text-xs text-right font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleAutoLiquidar(key, ot.saldoPendiente)}
                            className="text-[10px] font-bold px-2 py-1 bg-white border border-carbon/20 rounded hover:bg-carbon/5"
                          >
                            Liquidar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </form>

        {/* PIE */}
        <div className="border-t border-carbon/10 px-6 py-4 bg-slate-50/70 rounded-b-2xl flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={alCerrar}
            disabled={guardando}
            className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/70 bg-white border border-carbon/20 hover:bg-carbon/5 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando || !monto || numMonto <= 0 || excede}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-verde-profundo hover:bg-[#1a382b] transition disabled:opacity-50 shadow-xs"
          >
            {guardando ? "Guardando…" : `Guardar Movimiento ${numMonto > 0 ? formatoPesos(numMonto) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
