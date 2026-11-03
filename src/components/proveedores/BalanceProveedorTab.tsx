"use client";

import { useEffect, useState, useMemo } from "react";
import { formatoPesos, formatoFecha } from "@/lib/formato";
import type {
  Proveedor,
  MovimientoBalanceProveedor,
  OrdenTrabajoBalanceProveedor,
  DocumentoBalanceProveedor,
  BalanceProveedorResumen,
  TipoMovimientoProveedor,
} from "@/lib/types";
import {
  obtenerBalanceProveedor,
  eliminarMovimientoBalanceAction,
  eliminarAplicacionPagoAction,
} from "@/app/actions/proveedores-balance";
import { ModalRegistrarMovimientoBalance } from "./ModalRegistrarMovimientoBalance";
import { ModalAplicarPagoOrdenes } from "./ModalAplicarPagoOrdenes";

interface BalanceProveedorTabProps {
  proveedor: Proveedor;
}

export function BalanceProveedorTab({ proveedor }: BalanceProveedorTabProps) {
  const [cargando, setCargando] = useState(true);
  const [resumen, setResumen] = useState<BalanceProveedorResumen | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoBalanceProveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenTrabajoBalanceProveedor[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoBalanceProveedor[]>([]);

  // Modales
  const [modalMovimientoAbierto, setModalMovimientoAbierto] = useState(false);
  const [tipoMovimientoModal, setTipoMovimientoModal] = useState<TipoMovimientoProveedor>("anticipo_a_proveedor");
  const [modalAplicarAbierto, setModalAplicarAbierto] = useState(false);
  const [movimientoParaAplicar, setMovimientoParaAplicar] = useState<MovimientoBalanceProveedor | null>(null);

  // Subtabs y filtros
  const [subtab, setSubtab] = useState<"ordenes" | "movimientos">("ordenes");
  const [filtroOts, setFiltroOts] = useState<"todas" | "pendientes" | "liquidadas">("pendientes");
  const [ordenDesplegada, setOrdenDesplegada] = useState<string | null>(null);
  const [movimientoDesplegado, setMovimientoDesplegado] = useState<string | null>(null);

  async function cargarDatos() {
    setCargando(true);
    const res = await obtenerBalanceProveedor(proveedor.id);
    setCargando(false);

    if (res.ok) {
      setResumen(res.resumen || null);
      setMovimientos(res.movimientos || []);
      setOrdenes(res.ordenes || []);
      setDocumentos(res.documentos || []);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, [proveedor.id]);

  function abrirModalMovimiento(tipo: TipoMovimientoProveedor) {
    setTipoMovimientoModal(tipo);
    setModalMovimientoAbierto(true);
  }

  function abrirModalAplicar(mov: MovimientoBalanceProveedor) {
    setMovimientoParaAplicar(mov);
    setModalAplicarAbierto(true);
  }

  async function handleEliminarMovimiento(movId: string) {
    if (!confirm("¿Eliminar este movimiento? Si tenía órdenes asociadas, quedarán desvinculadas.")) return;
    const res = await eliminarMovimientoBalanceAction(movId, proveedor.id);
    if (res.ok) {
      cargarDatos();
    } else {
      alert(res.error || "No se pudo eliminar el movimiento.");
    }
  }

  async function handleEliminarAplicacion(aplicId: string) {
    if (!confirm("¿Desvincular este pago de la orden? El importe regresará como saldo disponible en el pago.")) return;
    const res = await eliminarAplicacionPagoAction(aplicId, proveedor.id);
    if (res.ok) {
      cargarDatos();
    } else {
      alert(res.error || "No se pudo desvincular el pago.");
    }
  }

  const ordenesFiltradas = useMemo(() => {
    if (filtroOts === "pendientes") return ordenes.filter((o) => !o.estaLiquidada);
    if (filtroOts === "liquidadas") return ordenes.filter((o) => o.estaLiquidada);
    return ordenes;
  }, [ordenes, filtroOts]);

  const otsPendientesCount = useMemo(() => ordenes.filter((o) => !o.estaLiquidada).length, [ordenes]);
  const pagosConDisponibleCount = useMemo(() => movimientos.filter((m) => m.montoDisponible > 0).length, [movimientos]);

  if (cargando && !resumen) {
    return (
      <div className="p-12 text-center text-xs text-carbon/50 font-cuerpo">
        <span className="inline-block animate-spin mr-2">⚙️</span>
        Calculando balance financiero y estado de cuenta...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-cuerpo">
      {/* 1. HERO CARDS Y RESUMEN FINANCIERO */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL OTs */}
        <div className="rounded-2xl bg-white p-4 border border-carbon/10 shadow-xs">
          <div className="text-[10.5px] uppercase font-bold text-carbon/50 tracking-wider flex items-center justify-between">
            <span>Trabajos Contratados</span>
            <span>🔨</span>
          </div>
          <div className="font-mono text-xl font-bold text-carbon mt-1">
            {formatoPesos(resumen?.totalCostosOT || 0)}
          </div>
          <div className="text-[11px] text-carbon/60 mt-0.5">
            {ordenes.length} órdenes ({otsPendientesCount} pendientes de liquidar)
          </div>
        </div>

        {/* ANTICIPOS DADOS */}
        <div className="rounded-2xl bg-white p-4 border border-carbon/10 shadow-xs">
          <div className="text-[10.5px] uppercase font-bold text-carbon/50 tracking-wider flex items-center justify-between">
            <span>Anticipos Otorgados</span>
            <span>🟢</span>
          </div>
          <div className="font-mono text-xl font-bold text-emerald-700 mt-1">
            {formatoPesos(resumen?.totalAnticiposPagados || 0)}
          </div>
          <div className="text-[11px] text-carbon/60 mt-0.5">
            Pagados por Sauceda a cuenta
          </div>
        </div>

        {/* PAGOS RECIBIDOS DEL PROVEEDOR */}
        <div className="rounded-2xl bg-white p-4 border border-carbon/10 shadow-xs">
          <div className="text-[10.5px] uppercase font-bold text-carbon/50 tracking-wider flex items-center justify-between">
            <span>Pagos Recibidos de Prov.</span>
            <span>💰</span>
          </div>
          <div className="font-mono text-xl font-bold text-sky-700 mt-1">
            {formatoPesos(resumen?.totalPagosRecibidos || 0)}
          </div>
          <div className="text-[11px] text-carbon/60 mt-0.5">
            Comisiones / liquidaciones cobradas
          </div>
        </div>

        {/* HERO: SALDO NETO */}
        <div
          className={`rounded-2xl p-4 border shadow-xs ${
            resumen?.estadoNeto === "a_favor_sauceda"
              ? "bg-emerald-50/80 border-emerald-200"
              : resumen?.estadoNeto === "a_favor_proveedor"
              ? "bg-rose-50/80 border-rose-200"
              : "bg-slate-50 border-carbon/15"
          }`}
        >
          <div className="text-[10.5px] uppercase font-bold tracking-wider flex items-center justify-between">
            <span
              className={
                resumen?.estadoNeto === "a_favor_sauceda"
                  ? "text-emerald-900"
                  : resumen?.estadoNeto === "a_favor_proveedor"
                  ? "text-rose-900"
                  : "text-carbon/60"
              }
            >
              Saldo Neto
            </span>
            <span>⚖️</span>
          </div>
          <div
            className={`font-mono text-2xl font-bold mt-1 ${
              resumen?.estadoNeto === "a_favor_sauceda"
                ? "text-emerald-700"
                : resumen?.estadoNeto === "a_favor_proveedor"
                ? "text-rose-700"
                : "text-carbon"
            }`}
          >
            {formatoPesos(Math.abs(resumen?.saldoNeto || 0))}
          </div>
          <div
            className={`text-[11px] font-semibold mt-0.5 ${
              resumen?.estadoNeto === "a_favor_sauceda"
                ? "text-emerald-800"
                : resumen?.estadoNeto === "a_favor_proveedor"
                ? "text-rose-800"
                : "text-carbon/60"
            }`}
          >
            {resumen?.estadoNeto === "a_favor_sauceda"
              ? "🟢 A favor de Sauceda (Anticipo o comisión)"
              : resumen?.estadoNeto === "a_favor_proveedor"
              ? "🔴 Por pagar al proveedor (OTs pendientes)"
              : "⚪ Cuentas al día ($0.00)"}
          </div>
        </div>
      </div>

      {/* 2. BARRA DE ACCIONES RÁPIDAS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-carbon/10 shadow-xs">
        <div className="text-xs text-carbon/70 font-semibold flex items-center gap-2">
          <span>⚡</span>
          <span>Acciones de Cuenta Corriente:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => abrirModalMovimiento("anticipo_a_proveedor")}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Dar Anticipo a Proveedor
          </button>
          <button
            type="button"
            onClick={() => abrirModalMovimiento("pago_a_proveedor")}
            className="rounded-xl bg-verde-profundo hover:bg-[#1a382b] text-white px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Registrar Pago a Proveedor
          </button>
          <button
            type="button"
            onClick={() => abrirModalMovimiento("pago_recibido_proveedor")}
            className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Registrar Pago Recibido de Proveedor
          </button>
        </div>
      </div>

      {/* 3. NAVEGACIÓN ENTRE SUBTABS */}
      <div className="flex items-center gap-2 border-b border-carbon/10 pb-2">
        <button
          type="button"
          onClick={() => setSubtab("ordenes")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            subtab === "ordenes"
              ? "bg-verde-profundo text-white shadow-xs"
              : "bg-white text-carbon/70 hover:bg-carbon/5 border border-carbon/10"
          }`}
        >
          <span>🔨</span>
          <span>Órdenes de Trabajo y Liquidaciones</span>
          {otsPendientesCount > 0 && (
            <span className="bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {otsPendientesCount} pend.
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubtab("movimientos")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            subtab === "movimientos"
              ? "bg-verde-profundo text-white shadow-xs"
              : "bg-white text-carbon/70 hover:bg-carbon/5 border border-carbon/10"
          }`}
        >
          <span>💳</span>
          <span>Historial de Movimientos y Pagos</span>
          {pagosConDisponibleCount > 0 && (
            <span className="bg-emerald-100 text-emerald-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {pagosConDisponibleCount} por aplicar
            </span>
          )}
        </button>
      </div>

      {/* 4. CONTENIDO: SUBTAB ÓRDENES DE TRABAJO */}
      {subtab === "ordenes" && (
        <div className="space-y-4">
          {/* FILTRO DE OTs */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: "pendientes", label: `Pendientes (${otsPendientesCount})` },
                { id: "liquidadas", label: "Liquidadas" },
                { id: "todas", label: `Todas (${ordenes.length})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroOts(f.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    filtroOts === f.id ? "bg-white text-carbon shadow-xs" : "text-carbon/60 hover:text-carbon"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-carbon/60">
              Muestra cada orden asignada con su costo pactado, pagos aplicados y saldo pendiente.
            </div>
          </div>

          {ordenesFiltradas.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-carbon/10 text-xs text-carbon/50">
              No hay órdenes de trabajo en este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {ordenesFiltradas.map((ot) => {
                const desplegada = ordenDesplegada === ot.id;

                return (
                  <div
                    key={ot.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      ot.estaLiquidada
                        ? "bg-slate-50/60 border-carbon/10"
                        : "bg-white border-carbon/15 shadow-xs"
                    }`}
                  >
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-verde-profundo bg-slate-100 px-2 py-0.5 rounded">
                            {ot.folio}
                          </span>
                          {ot.expedienteId && (
                            <span className="font-mono text-xs text-carbon/60">Exp: {ot.expedienteId}</span>
                          )}
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-carbon/60">
                            {ot.estatus}
                          </span>
                          {ot.estaLiquidada ? (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              ✓ Liquidada
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                              Pendiente
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-carbon mt-1">{ot.titulo}</div>
                        {ot.fechaProgramada && (
                          <div className="text-[11px] text-carbon/50 mt-0.5">
                            Programada: {formatoFecha(ot.fechaProgramada)}
                          </div>
                        )}
                      </div>

                      {/* CIFRAS */}
                      <div className="flex items-center gap-6 flex-wrap">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Costo Pactado</div>
                          <div className="font-mono text-sm font-bold text-carbon">
                            {formatoPesos(ot.costoProveedor)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Pagado / Aplicado</div>
                          <div className="font-mono text-sm font-bold text-emerald-700">
                            {formatoPesos(ot.montoAplicado)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Saldo Restante</div>
                          <div
                            className={`font-mono text-base font-bold ${
                              ot.saldoPendiente > 0 ? "text-amber-800" : "text-carbon/40"
                            }`}
                          >
                            {formatoPesos(ot.saldoPendiente)}
                          </div>
                        </div>

                        {/* ACCIONES */}
                        <div className="flex items-center gap-2">
                          {ot.aplicaciones.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setOrdenDesplegada(desplegada ? null : ot.id)}
                              className="px-2.5 py-1.5 rounded-xl border border-carbon/15 bg-white hover:bg-carbon/5 text-xs font-bold text-carbon/70 transition"
                            >
                              {desplegada ? "Ocultar pagos ▲" : `Ver pagos (${ot.aplicaciones.length}) ▼`}
                            </button>
                          )}

                          {!ot.estaLiquidada && movimientos.some((m) => m.montoDisponible > 0) && (
                            <button
                              type="button"
                              onClick={() => {
                                const movConSaldo = movimientos.find((m) => m.montoDisponible > 0);
                                if (movConSaldo) abrirModalAplicar(movConSaldo);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-verde-profundo hover:bg-[#1a382b] text-white text-xs font-bold transition shadow-xs"
                            >
                              Aplicar Pago
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ACORDEÓN DE APLICACIONES EN ESTA ORDEN */}
                    {desplegada && (
                      <div className="border-t border-carbon/10 bg-slate-50/70 p-4 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/60">
                          Pagos y anticipos aplicados a esta orden:
                        </div>
                        <div className="space-y-1.5">
                          {ot.aplicaciones.map((app) => (
                            <div
                              key={app.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-carbon/10 text-xs"
                            >
                              <div>
                                <span className="font-bold text-carbon">{app.descripcionDestino}</span>
                                <div className="text-[10px] text-carbon/50">
                                  Aplicado el {formatoFecha(app.createdAt)}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-emerald-700">
                                  {formatoPesos(app.montoAplicado)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEliminarAplicacion(app.id)}
                                  className="text-rojo hover:underline text-[11px] font-semibold"
                                  title="Desvincular este pago de la orden"
                                >
                                  Desvincular
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. CONTENIDO: SUBTAB HISTORIAL DE MOVIMIENTOS */}
      {subtab === "movimientos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-carbon/60">
            <span>Listado de anticipos, pagos entregados y pagos recibidos del proveedor.</span>
            <span>{movimientos.length} movimientos registrados</span>
          </div>

          {movimientos.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-carbon/10 text-xs text-carbon/50">
              Aún no hay movimientos de cuenta corriente registrados para este proveedor.
            </div>
          ) : (
            <div className="space-y-3">
              {movimientos.map((mov) => {
                const desplegado = movimientoDesplegado === mov.id;

                const badgeTipo = {
                  anticipo_a_proveedor: { bg: "bg-emerald-100 text-emerald-800", label: "Anticipo a Proveedor" },
                  pago_a_proveedor: { bg: "bg-slate-100 text-carbon", label: "Pago a Proveedor" },
                  pago_recibido_proveedor: { bg: "bg-sky-100 text-sky-800", label: "Pago Recibido de Proveedor" },
                  comision_por_cobrar: { bg: "bg-amber-100 text-amber-900", label: "Comisión por Cobrar" },
                  cargo_orden_trabajo: { bg: "bg-slate-100 text-carbon/70", label: "Costo de Orden" },
                  ajuste_saldo: { bg: "bg-purple-100 text-purple-900", label: "Ajuste de Saldo" },
                }[mov.tipo] || { bg: "bg-slate-100 text-carbon", label: mov.tipo };

                return (
                  <div
                    key={mov.id}
                    className="rounded-2xl border border-carbon/10 bg-white shadow-xs overflow-hidden"
                  >
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${badgeTipo.bg}`}>
                            {badgeTipo.label}
                          </span>
                          <span className="font-mono text-xs text-carbon/50">{formatoFecha(mov.fecha)}</span>
                          {mov.metodoPago && (
                            <span className="text-[10px] text-carbon/60 uppercase font-semibold">
                              · {mov.metodoPago}
                            </span>
                          )}
                          {mov.referencia && (
                            <span className="text-[11px] font-mono text-carbon/70 bg-slate-50 px-1.5 py-0.2 rounded border border-carbon/10">
                              Ref: {mov.referencia}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-carbon mt-1">{mov.concepto}</div>
                        {mov.notas && <p className="text-xs text-carbon/60 mt-0.5">{mov.notas}</p>}
                      </div>

                      {/* CIFRAS */}
                      <div className="flex items-center gap-6 flex-wrap">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Monto Total</div>
                          <div className="font-mono text-base font-bold text-carbon">{formatoPesos(mov.monto)}</div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Ya Aplicado</div>
                          <div className="font-mono text-sm font-bold text-carbon/70">
                            {formatoPesos(mov.montoAplicado)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Disponible</div>
                          <div
                            className={`font-mono text-base font-bold ${
                              mov.montoDisponible > 0 ? "text-emerald-700 font-extrabold" : "text-carbon/40"
                            }`}
                          >
                            {formatoPesos(mov.montoDisponible)}
                          </div>
                        </div>

                        {/* ACCIONES */}
                        <div className="flex items-center gap-2">
                          {/* BOTÓN ASIGNAR A ÓRDENES / FACTURAS */}
                          {mov.montoDisponible > 0 && (
                            <button
                              type="button"
                              onClick={() => abrirModalAplicar(mov)}
                              className="px-3 py-1.5 rounded-xl bg-verde-profundo hover:bg-[#1a382b] text-white text-xs font-bold transition shadow-xs flex items-center gap-1"
                              title="Seleccionar a qué órdenes o facturas aplica este pago"
                            >
                              <span>🎯</span> Asignar a Órdenes
                            </button>
                          )}

                          {mov.aplicaciones && mov.aplicaciones.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setMovimientoDesplegado(desplegado ? null : mov.id)}
                              className="px-2.5 py-1.5 rounded-xl border border-carbon/15 bg-white hover:bg-carbon/5 text-xs font-bold text-carbon/70 transition"
                            >
                              {desplegado ? "Ocultar ▲" : `Destinos (${mov.aplicaciones.length}) ▼`}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleEliminarMovimiento(mov.id)}
                            className="p-1.5 rounded-lg text-carbon/40 hover:text-rojo hover:bg-rojo/10 transition text-xs"
                            title="Eliminar movimiento"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ACORDEÓN DE DESTINOS / APLICACIONES */}
                    {desplegado && mov.aplicaciones && (
                      <div className="border-t border-carbon/10 bg-slate-50/70 p-4 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/60">
                          Este pago fue aplicado a:
                        </div>
                        <div className="space-y-1.5">
                          {mov.aplicaciones.map((app) => (
                            <div
                              key={app.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-carbon/10 text-xs"
                            >
                              <div>
                                <span className="font-bold text-carbon">{app.descripcionDestino}</span>
                                <span className="text-[10px] text-carbon/50 ml-2 font-mono">
                                  ({app.tipoDestino})
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-emerald-700">
                                  {formatoPesos(app.montoAplicado)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleEliminarAplicacion(app.id)}
                                  className="text-rojo hover:underline text-[11px] font-semibold"
                                  title="Desvincular de esta orden"
                                >
                                  Desvincular
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO / PAGO */}
      {modalMovimientoAbierto && (
        <ModalRegistrarMovimientoBalance
          proveedorId={proveedor.id}
          proveedorNombre={proveedor.nombre}
          tipoInicial={tipoMovimientoModal}
          ordenes={ordenes}
          documentos={documentos}
          alCerrar={() => setModalMovimientoAbierto(false)}
          alGuardar={() => {
            setModalMovimientoAbierto(false);
            cargarDatos();
          }}
        />
      )}

      {/* MODAL APLICAR PAGO A ÓRDENES / FACTURAS */}
      {modalAplicarAbierto && movimientoParaAplicar && (
        <ModalAplicarPagoOrdenes
          proveedorId={proveedor.id}
          proveedorNombre={proveedor.nombre}
          movimiento={movimientoParaAplicar}
          ordenes={ordenes}
          documentos={documentos}
          alCerrar={() => {
            setModalAplicarAbierto(false);
            setMovimientoParaAplicar(null);
          }}
          alGuardar={() => {
            setModalAplicarAbierto(false);
            setMovimientoParaAplicar(null);
            cargarDatos();
          }}
        />
      )}
    </div>
  );
}
