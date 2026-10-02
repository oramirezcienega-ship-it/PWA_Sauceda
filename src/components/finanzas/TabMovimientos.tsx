"use client";

import React, { useState, useEffect } from "react";
import type { BusinessUnit, MoneyAccount, Category, Transaction } from "@/app/actions/finanzas";
import {
  obtenerMovimientosFinanzas,
  eliminarMovimientoFinanzas,
  marcarMovimientoPagado,
  sincronizarMovimientosHistoricosCRM
} from "@/app/actions/finanzas";
import { obtenerExpedientesCerradosSinComision } from "@/app/actions/reportes-ia";
import { ModalNuevoMovimiento } from "./ModalNuevoMovimiento";
import { ModalImportarExcel } from "./ModalImportarExcel";

interface TabMovimientosProps {
  catalogos: {
    businessUnits: BusinessUnit[];
    moneyAccounts: MoneyAccount[];
    categories: Category[];
  };
  fechaInicio: string;
  fechaFin: string;
  businessUnitId?: string;
  onMovimientoModificado: () => void;
}


const CLAVE_FILTROS_MOVIMIENTOS = "finanzas:filtros-movimientos";

export function TabMovimientos({
  catalogos,
  fechaInicio,
  fechaFin,
  businessUnitId,
  onMovimientoModificado
}: TabMovimientosProps) {
  const [movimientos, setMovimientos] = useState<Transaction[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [cargando, setCargando] = useState(false);

  // Filtros locales
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "ingreso" | "egreso" | "traspaso">("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [cuentaFiltro, setCuentaFiltro] = useState<string>("todas");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "pagado" | "pendiente">("todos");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtrosRestaurados, setFiltrosRestaurados] = useState(false);

  // Modales
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [showImportarModal, setShowImportarModal] = useState(false);
  const [valoresNuevo, setValoresNuevo] = useState<any>(null);

  // Atribución CRM
  const [expedientesSinComision, setExpedientesSinComision] = useState<
    Array<{ id: string; cliente: string; valor_estimado: number; ultimo_movimiento: string }>
  >([]);
  const [cargandoExpedientes, setCargandoExpedientes] = useState(false);
  const [sincronizandoCRM, setSincronizandoCRM] = useState(false);

  const cargarMovimientos = async () => {
    setCargando(true);
    try {
      const res = await obtenerMovimientosFinanzas({
        fechaInicio,
        fechaFin,
        tipo: tipoFiltro,
        categoriaId: categoriaFiltro,
        businessUnitId: businessUnitId === "todas" ? undefined : businessUnitId,
        moneyAccountId: cuentaFiltro,
        estado: estadoFiltro,
        busqueda
      });
      setMovimientos(res.movimientos);
      setTotalRegistros(res.total);
    } catch (err: any) {
      console.error("Error al cargar movimientos:", err);
    } finally {
      setCargando(false);
    }
  };

  const cargarExpedientesCRM = async () => {
    setCargandoExpedientes(true);
    try {
      const exps = await obtenerExpedientesCerradosSinComision();
      setExpedientesSinComision(exps);
    } catch (err: any) {
      console.error("Error al cargar expedientes sin comisión:", err);
    } finally {
      setCargandoExpedientes(false);
    }
  };

  // Restaurar los filtros guardados (persisten al recargar la página)
  useEffect(() => {
    try {
      const g = JSON.parse(window.localStorage.getItem(CLAVE_FILTROS_MOVIMIENTOS) || "null");
      if (g && typeof g === "object") {
        if (g.tipoFiltro) setTipoFiltro(g.tipoFiltro);
        if (g.categoriaFiltro) setCategoriaFiltro(g.categoriaFiltro);
        if (g.cuentaFiltro) setCuentaFiltro(g.cuentaFiltro);
        if (g.estadoFiltro) setEstadoFiltro(g.estadoFiltro);
        if (typeof g.busqueda === "string") setBusqueda(g.busqueda);
      }
    } catch {}
    setFiltrosRestaurados(true);
  }, []);

  // Guardar filtros cada vez que cambian (solo tras restaurar los previos)
  useEffect(() => {
    if (!filtrosRestaurados) return;
    try {
      window.localStorage.setItem(
        CLAVE_FILTROS_MOVIMIENTOS,
        JSON.stringify({ tipoFiltro, categoriaFiltro, cuentaFiltro, estadoFiltro, busqueda })
      );
    } catch {}
  }, [filtrosRestaurados, tipoFiltro, categoriaFiltro, cuentaFiltro, estadoFiltro, busqueda]);

  useEffect(() => {
    if (!filtrosRestaurados) return;
    cargarMovimientos();
    cargarExpedientesCRM();
  }, [filtrosRestaurados, fechaInicio, fechaFin, businessUnitId, tipoFiltro, categoriaFiltro, cuentaFiltro, estadoFiltro, busqueda]);

  const handleSincronizarCRM = async () => {
    setSincronizandoCRM(true);
    try {
      const res = await sincronizarMovimientosHistoricosCRM();
      if (res.ok) {
        alert(res.mensaje);
        await cargarMovimientos();
        await cargarExpedientesCRM();
        onMovimientoModificado();
      } else {
        alert("Error al sincronizar: " + res.mensaje);
      }
    } catch (err: any) {
      alert("Error inesperado al sincronizar con Finanzas: " + (err?.message || ""));
    } finally {
      setSincronizandoCRM(false);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este movimiento contable? Se anularán sus asientos en automático.")) {
      return;
    }
    const res = await eliminarMovimientoFinanzas(id);
    if (res.success) {
      cargarMovimientos();
      onMovimientoModificado();
    } else {
      alert("Error: " + res.message);
    }
  };

  const handleAtribuirComision = (exp: { id: string; cliente: string; valor_estimado: number }) => {
    const comisionSugerida = Math.round(exp.valor_estimado * 0.05); // 5% por defecto
    const catComision = catalogos.categories.find((c) => c.linea_pnl === "ingresos_comisiones") || catalogos.categories[0];

    setValoresNuevo({
      tipo: "ingreso",
      monto: comisionSugerida,
      concepto: `Comisión Venta Cerrada: ${exp.cliente}`,
      crm_deal_id: exp.id,
      contraparte: exp.cliente
    });
    setShowNuevoModal(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. BARRA SUPERIOR DE ACCIONES Y FILTROS */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>📖</span> Libro de Movimientos Contables
            </h3>
            <p className="text-[11px] text-slate-400">
              Registros detallados de ingresos, egresos y traspasos con conciliación automática
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSincronizarCRM}
              disabled={sincronizandoCRM}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Sincroniza y refleja en Finanzas todas las remisiones, comisiones y compras a proveedores existentes en el CRM"
            >
              <span>{sincronizandoCRM ? "⏳" : "🔄"}</span>
              {sincronizandoCRM ? "Sincronizando..." : "Sincronizar CRM"}
            </button>
            <button
              type="button"
              onClick={() => setShowImportarModal(true)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
            >
              <span>📋</span> Importar Excel
            </button>
            <button
              type="button"
              onClick={() => {
                setValoresNuevo(null);
                setShowNuevoModal(true);
              }}
              className="rounded-xl bg-[#2D4A2B] px-4 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
            >
              <span>➕</span> Nuevo Registro
            </button>
          </div>
        </div>

        {/* FILTROS EN LÍNEA */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Búsqueda
            </label>
            <input
              type="text"
              placeholder="Concepto o cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Tipo
            </label>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="todos">Todos los tipos</option>
              <option value="ingreso">🟢 Ingresos</option>
              <option value="egreso">🔴 Egresos</option>
              <option value="traspaso">🔄 Traspasos</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Categoría
            </label>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="todas">Todas las categorías</option>
              {catalogos.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Cuenta
            </label>
            <select
              value={cuentaFiltro}
              onChange={(e) => setCuentaFiltro(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="todas">Todas las cuentas</option>
              {catalogos.moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Estado
            </label>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="todos">Todos los estados</option>
              <option value="pagado">✓ Pagado / Cobrado</option>
              <option value="pendiente">⏳ Pendiente</option>
            </select>
          </div>
        </div>
      </section>

      {/* 2. ATRIBUCIÓN DE VENTAS CRM */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🤝</span>
            <div>
              <h3 className="font-fraunces text-base font-bold text-emerald-950">
                Atribución de Ventas CRM
              </h3>
              <p className="text-[11px] text-emerald-700">
                Expedientes cerrados sin remisión, comisión ni ingreso registrado en Finanzas:
              </p>
            </div>
          </div>
          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">
            {expedientesSinComision.length} pendientes
          </span>
        </div>

        {cargandoExpedientes ? (
          <div className="py-4 text-center text-xs text-emerald-600">Verificando expedientes del CRM...</div>
        ) : expedientesSinComision.length === 0 ? (
          <div className="py-3 px-4 bg-white/70 rounded-xl border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <span>🎉</span> ¡Excelente! Todos los expedientes cerrados tienen su comisión registrada en Finanzas.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expedientesSinComision.slice(0, 6).map((exp) => (
              <div
                key={exp.id}
                className="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-2xs hover:border-emerald-500 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">{exp.id}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 uppercase">
                      Cerrado
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-800 truncate">{exp.cliente}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Valor Operación: <span className="font-bold text-slate-700">${exp.valor_estimado.toLocaleString()}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAtribuirComision(exp)}
                  className="mt-3 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 transition text-center shadow-xs"
                >
                  Registrar Comisión (5% sugerido)
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. TABLA DE MOVIMIENTOS */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="overflow-x-auto scrollbar-sutil">
          {cargando ? (
            <div className="py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent mx-auto mb-2" />
              <p className="text-xs text-slate-400">Cargando movimientos contables...</p>
            </div>
          ) : movimientos.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              No se encontraron movimientos con los filtros seleccionados.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-3.5 py-2.5">Fecha</th>
                  <th className="px-3.5 py-2.5">Tipo</th>
                  <th className="px-3.5 py-2.5">Categoría</th>
                  <th className="px-3.5 py-2.5">Concepto / Contraparte</th>
                  <th className="px-3.5 py-2.5">Unidad</th>
                  <th className="px-3.5 py-2.5">Cuenta</th>
                  <th className="px-3.5 py-2.5">Estado</th>
                  <th className="px-3.5 py-2.5 text-right">Monto (MXN)</th>
                  <th className="px-3.5 py-2.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition text-slate-700">
                    <td className="px-3.5 py-2.5 font-mono text-[10px] whitespace-nowrap">
                      {m.fecha_operacion}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                          m.tipo === "ingreso"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.tipo === "egreso"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {m.tipo}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-[10px] font-bold uppercase text-slate-600">
                      {m.categoria_nombre}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-slate-900">{m.concepto}</div>
                      {m.contraparte && (
                        <div className="text-[10px] text-slate-400">Contraparte: {m.contraparte}</div>
                      )}
                      {m.expediente_cliente && (
                        <span className="text-[9px] text-[#2D4A2B] bg-[#F5F1E8] px-1.5 py-0.2 rounded font-bold mt-0.5 inline-block">
                          Folio CRM: {m.crm_deal_id} ({m.expediente_cliente})
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 text-[10px]">
                      {m.business_unit_nombre}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 text-[10px]">
                      {m.tipo === "traspaso"
                        ? `${m.money_account_nombre} → ${m.money_account_destino_nombre}`
                        : m.money_account_nombre || "—"}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          m.estado === "pagado"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {m.estado === "pagado" ? "✓ Pagado" : "⏳ Pendiente"}
                      </span>
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-mono font-bold whitespace-nowrap ${
                        m.tipo === "ingreso" ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      ${m.monto_total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {m.comprobante_url && (
                          <a
                            href={m.comprobante_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-[#2D4A2B]"
                            title="Ver comprobante"
                          >
                            📎
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEliminar(m.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400">
          <span>Mostrando {movimientos.length} de {totalRegistros} movimientos</span>
          <span>Partida doble automática activa</span>
        </div>
      </section>

      {/* MODAL NUEVO MOVIMIENTO */}
      <ModalNuevoMovimiento
        abierto={showNuevoModal}
        onCerrar={() => setShowNuevoModal(false)}
        onGuardado={() => {
          cargarMovimientos();
          cargarExpedientesCRM();
          onMovimientoModificado();
        }}
        catalogos={catalogos}
        valoresIniciales={valoresNuevo}
      />

      {/* MODAL IMPORTADOR EXCEL */}
      <ModalImportarExcel
        abierto={showImportarModal}
        onCerrar={() => setShowImportarModal(false)}
        onImportado={() => {
          cargarMovimientos();
          onMovimientoModificado();
        }}
      />
    </div>
  );
}
