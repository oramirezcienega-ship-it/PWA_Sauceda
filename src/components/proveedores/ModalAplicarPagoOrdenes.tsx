"use client";

import { useState, useMemo } from "react";
import { formatoPesos, formatoFecha } from "@/lib/formato";
import type {
  MovimientoBalanceProveedor,
  OrdenTrabajoBalanceProveedor,
  DocumentoBalanceProveedor,
  TipoDestinoAplicacion,
} from "@/lib/types";
import { aplicarPagoAOrdenesAction } from "@/app/actions/proveedores-balance";

interface ModalAplicarPagoOrdenesProps {
  proveedorId: string;
  proveedorNombre: string;
  movimiento: MovimientoBalanceProveedor;
  ordenes: OrdenTrabajoBalanceProveedor[];
  documentos: DocumentoBalanceProveedor[];
  alCerrar: () => void;
  alGuardar: () => void;
}

export function ModalAplicarPagoOrdenes({
  proveedorId,
  proveedorNombre,
  movimiento,
  ordenes,
  documentos,
  alCerrar,
  alGuardar,
}: ModalAplicarPagoOrdenesProps) {
  // Solo mostrar las que tienen saldo pendiente
  const otsPendientes = useMemo(() => ordenes.filter((o) => o.saldoPendiente > 0), [ordenes]);
  const docsPendientes = useMemo(() => documentos.filter((d) => d.saldoPendiente > 0), [documentos]);

  // Estado con montos asignados: { [key]: number }
  // key formato: "ot_{id}" o "doc_{id}"
  const [montosAsignados, setMontosAsignados] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disponible = movimiento.montoDisponible;

  const totalAsignado = useMemo(() => {
    return Object.values(montosAsignados).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [montosAsignados]);

  const remanente = disponible - totalAsignado;
  const excede = totalAsignado > disponible + 0.01;

  function handleSetMonto(key: string, valor: number, maximo: number) {
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
    const disponibleLibre = disponible - (totalAsignado - asignadoActual);
    const sugerido = Math.min(saldoPendiente, Math.max(0, disponibleLibre));
    handleSetMonto(key, sugerido, saldoPendiente);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalAsignado <= 0) {
      setError("Asigna un monto a al menos una orden o factura.");
      return;
    }
    if (excede) {
      setError(`El total asignado excede los ${formatoPesos(disponible)} disponibles en este pago.`);
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

    // OTs
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

    // Docs
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

    const res = await aplicarPagoAOrdenesAction({
      movimientoId: movimiento.id,
      proveedorId,
      aplicaciones,
    });

    setGuardando(false);

    if (!res.ok) {
      setError(res.error || "No se pudo aplicar el pago.");
    } else {
      alGuardar();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 font-cuerpo overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-carbon/10 flex flex-col max-h-[90vh]">
        {/* ENCABEZADO */}
        <div className="flex items-center justify-between border-b border-carbon/10 px-6 py-4 bg-slate-50/70 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] bg-sauce/15 text-verde-profundo px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                Aplicación de Pago
              </span>
              <span className="text-xs text-carbon/60 font-semibold">{proveedorNombre}</span>
            </div>
            <h3 className="font-titular text-lg font-bold text-verde-profundo mt-0.5">
              Asignar pago a Órdenes o Facturas
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

        {/* RESUMEN DEL MOVIMIENTO SELECCIONADO */}
        <div className="bg-emerald-50/60 border-b border-emerald-100 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
              <span>💳</span> {movimiento.concepto}
            </div>
            <div className="text-[11px] text-emerald-800/80 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Fecha: {formatoFecha(movimiento.fecha)}</span>
              {movimiento.metodoPago && <span>· Método: {movimiento.metodoPago}</span>}
              {movimiento.referencia && <span className="font-mono">· Ref: {movimiento.referencia}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-emerald-800/70">Monto Disponible para Aplicar</div>
            <div className="font-mono text-xl font-bold text-emerald-700">{formatoPesos(disponible)}</div>
            <div className="text-[10px] text-emerald-800/60">de un total de {formatoPesos(movimiento.monto)}</div>
          </div>
        </div>

        {/* CONTENIDO CON SCROLL */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-semibold flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          <div className="text-xs text-carbon/70">
            Indica qué importe de este pago deseas aplicar a cada trabajo o remisión pendiente. Si pagas de menos,
            quedará como abono parcial; si pagas el saldo completo, quedará liquidada.
          </div>

          {/* LISTA DE ÓRDENES DE TRABAJO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/60 font-titular flex items-center gap-1.5">
                <span>🔨</span> Órdenes de Trabajo Pendientes ({otsPendientes.length})
              </h4>
            </div>

            {otsPendientes.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-carbon/5 text-xs text-carbon/50 text-center">
                No hay órdenes de trabajo con saldo pendiente de pago para este proveedor.
              </div>
            ) : (
              <div className="space-y-2">
                {otsPendientes.map((ot) => {
                  const key = `ot_${ot.id}`;
                  const valor = montosAsignados[key] || 0;
                  const seleccionado = valor > 0;

                  return (
                    <div
                      key={ot.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        seleccionado
                          ? "bg-sauce/5 border-sauce/40 shadow-xs"
                          : "bg-white border-carbon/10 hover:border-carbon/20"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-verde-profundo bg-slate-100 px-1.5 py-0.5 rounded">
                              {ot.folio}
                            </span>
                            {ot.expedienteId && (
                              <span className="text-[11px] text-carbon/50 font-mono">Exp: {ot.expedienteId}</span>
                            )}
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-carbon/60">
                              {ot.estatus}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-carbon mt-0.5">{ot.titulo}</div>
                          <div className="text-[11px] text-carbon/60 mt-1 flex items-center gap-2 flex-wrap">
                            <span>Costo pactado: {formatoPesos(ot.costoProveedor)}</span>
                            {ot.montoAplicado > 0 && (
                              <span className="text-emerald-700">· Pagado previo: {formatoPesos(ot.montoAplicado)}</span>
                            )}
                            <span className="font-bold text-amber-800">· Saldo pendiente: {formatoPesos(ot.saldoPendiente)}</span>
                          </div>
                        </div>

                        {/* INPUT Y BOTÓN RÁPIDO */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-carbon/40 font-mono">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={ot.saldoPendiente}
                              step="any"
                              value={valor || ""}
                              placeholder="0"
                              onChange={(e) => handleSetMonto(key, Number(e.target.value) || 0, ot.saldoPendiente)}
                              className="w-28 pl-6 pr-2 py-1.5 rounded-lg border border-carbon/20 font-mono text-xs font-bold text-right focus:border-sauce focus:outline-hidden"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAutoLiquidar(key, ot.saldoPendiente)}
                            className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon text-[11px] font-bold px-2.5 py-1.5 transition"
                            title="Asignar el saldo pendiente o lo disponible"
                          >
                            Liquidar {formatoPesos(ot.saldoPendiente)}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* LISTA DE REMISIONES / FACTURAS */}
          {docsPendientes.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-carbon/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/60 font-titular flex items-center gap-1.5">
                <span>📄</span> Facturas y Remisiones Registradas ({docsPendientes.length})
              </h4>

              <div className="space-y-2">
                {docsPendientes.map((doc) => {
                  const key = `doc_${doc.id}`;
                  const valor = montosAsignados[key] || 0;
                  const seleccionado = valor > 0;

                  return (
                    <div
                      key={doc.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        seleccionado
                          ? "bg-sauce/5 border-sauce/40 shadow-xs"
                          : "bg-white border-carbon/10 hover:border-carbon/20"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-verde-profundo bg-slate-100 px-1.5 py-0.5 rounded">
                              {doc.folio}
                            </span>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-carbon/60">
                              {doc.tipo}
                            </span>
                            <span className="text-[11px] text-carbon/50">{formatoFecha(doc.fecha)}</span>
                          </div>
                          <div className="text-xs font-semibold text-carbon mt-0.5">{doc.concepto}</div>
                          <div className="text-[11px] text-carbon/60 mt-1 flex items-center gap-2 flex-wrap">
                            <span>Importe: {formatoPesos(doc.monto)}</span>
                            {doc.montoAplicado > 0 && (
                              <span className="text-emerald-700">· Pagado: {formatoPesos(doc.montoAplicado)}</span>
                            )}
                            <span className="font-bold text-amber-800">· Pendiente: {formatoPesos(doc.saldoPendiente)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-carbon/40 font-mono">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={doc.saldoPendiente}
                              step="any"
                              value={valor || ""}
                              placeholder="0"
                              onChange={(e) => handleSetMonto(key, Number(e.target.value) || 0, doc.saldoPendiente)}
                              className="w-28 pl-6 pr-2 py-1.5 rounded-lg border border-carbon/20 font-mono text-xs font-bold text-right focus:border-sauce focus:outline-hidden"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAutoLiquidar(key, doc.saldoPendiente)}
                            className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon text-[11px] font-bold px-2.5 py-1.5 transition"
                          >
                            Liquidar {formatoPesos(doc.saldoPendiente)}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {/* PIE CON TOTALES Y BOTÓN DE GUARDAR */}
        <div className="border-t border-carbon/10 px-6 py-4 bg-slate-50/70 rounded-b-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase font-bold text-carbon/50">Total a Aplicar</div>
              <div className={`font-mono text-lg font-bold ${excede ? "text-rojo" : "text-verde-profundo"}`}>
                {formatoPesos(totalAsignado)}
              </div>
            </div>
            <div className="border-l border-carbon/15 pl-4">
              <div className="text-[10px] uppercase font-bold text-carbon/50">Remanente en el Pago</div>
              <div className={`font-mono text-sm font-bold ${remanente < 0 ? "text-rojo" : "text-carbon/80"}`}>
                {formatoPesos(remanente)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              disabled={guardando || totalAsignado <= 0 || excede}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-verde-profundo hover:bg-[#1a382b] transition disabled:opacity-50 shadow-xs"
            >
              {guardando ? "Guardando…" : `Aplicar ${formatoPesos(totalAsignado)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
