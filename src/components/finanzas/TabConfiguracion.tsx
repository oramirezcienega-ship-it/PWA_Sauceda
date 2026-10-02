"use client";

import React, { useState } from "react";
import type { BusinessUnit, MoneyAccount, Category, LineaPnL } from "@/app/actions/finanzas";
import {
  guardarCuentaDinero,
  guardarCategoria,
  guardarUnidadNegocio,
  registrarSaldoInicialApertura
} from "@/app/actions/finanzas";

interface TabConfiguracionProps {
  catalogos: {
    businessUnits: BusinessUnit[];
    moneyAccounts: MoneyAccount[];
    categories: Category[];
  };
  onConfiguracionModificada: () => void;
}

export function TabConfiguracion({
  catalogos,
  onConfiguracionModificada
}: TabConfiguracionProps) {
  const [subTab, setSubTab] = useState<"cuentas" | "categorias" | "unidades" | "apertura">("cuentas");

  // Estados Cuenta
  const [showModalCuenta, setShowModalCuenta] = useState(false);
  const [editandoCuenta, setEditandoCuenta] = useState<MoneyAccount | null>(null);
  const [nombreCuenta, setNombreCuenta] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState<"efectivo" | "banco" | "tarjeta_credito">("banco");
  const [saldoInicialCuenta, setSaldoInicialCuenta] = useState("0");
  const [fechaSaldoInicial, setFechaSaldoInicial] = useState(new Date().toISOString().split("T")[0]);
  const [numCuenta, setNumCuenta] = useState("");

  // Estados Categoría
  const [showModalCat, setShowModalCat] = useState(false);
  const [nombreCat, setNombreCat] = useState("");
  const [tipoCat, setTipoCat] = useState<"ingreso" | "egreso">("egreso");
  const [lineaPnlCat, setLineaPnlCat] = useState<LineaPnL>("opex_otros");

  // Estados Unidad
  const [showModalUnidad, setShowModalUnidad] = useState(false);
  const [nombreUnidad, setNombreUnidad] = useState("");
  const [descUnidad, setDescUnidad] = useState("");

  // Estados Saldo Inicial Apertura
  const [tipoApertura, setTipoApertura] = useState<"por_cobrar" | "por_pagar" | "prestamo" | "activo_fijo">("por_cobrar");
  const [fechaApertura, setFechaApertura] = useState(new Date().toISOString().split("T")[0]);
  const [conceptoApertura, setConceptoApertura] = useState("");
  const [contraparteApertura, setContraparteApertura] = useState("");
  const [montoApertura, setMontoApertura] = useState("");
  const [buApertura, setBuApertura] = useState(catalogos.businessUnits[0]?.id || "");
  const [accApertura, setAccApertura] = useState(catalogos.moneyAccounts[0]?.id || "");

  const [guardando, setGuardando] = useState(false);

  // Handlers
  const handleGuardarCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await guardarCuentaDinero({
        id: editandoCuenta?.id,
        nombre: nombreCuenta,
        tipo: tipoCuenta,
        saldo_inicial: parseFloat(saldoInicialCuenta) || 0,
        fecha_saldo_inicial: fechaSaldoInicial,
        numero_cuenta: numCuenta
      });
      if (!res.success) throw new Error(res.message);
      setShowModalCuenta(false);
      setEditandoCuenta(null);
      setNombreCuenta("");
      setSaldoInicialCuenta("0");
      onConfiguracionModificada();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await guardarCategoria({
        nombre: nombreCat,
        tipo: tipoCat,
        linea_pnl: lineaPnlCat
      });
      if (!res.success) throw new Error(res.message);
      setShowModalCat(false);
      setNombreCat("");
      onConfiguracionModificada();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await guardarUnidadNegocio({
        nombre: nombreUnidad,
        descripcion: descUnidad
      });
      if (!res.success) throw new Error(res.message);
      setShowModalUnidad(false);
      setNombreUnidad("");
      setDescUnidad("");
      onConfiguracionModificada();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarApertura = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await registrarSaldoInicialApertura({
        fecha_corte: fechaApertura,
        tipo_apertura: tipoApertura,
        concepto: conceptoApertura,
        contraparte: contraparteApertura,
        monto: parseFloat(montoApertura) || 0,
        business_unit_id: buApertura,
        money_account_id: accApertura
      });
      if (!res.success) throw new Error(res.message);
      alert("Saldo de apertura registrado con éxito. El Balance ya lo refleja.");
      setConceptoApertura("");
      setContraparteApertura("");
      setMontoApertura("");
      onConfiguracionModificada();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. NAVEGACIÓN SUB-PESTAÑAS */}
      <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
            <span>⚙️</span> Catálogos y Configuración Contable
          </h3>
          <p className="text-[11px] text-slate-400">
            Administra tus cuentas financieras, catálogo de categorías P&L, unidades de negocio y saldos de apertura
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab("cuentas")}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              subTab === "cuentas" ? "bg-[#2D4A2B] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Cuentas de Dinero
          </button>
          <button
            type="button"
            onClick={() => setSubTab("categorias")}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              subTab === "categorias" ? "bg-[#2D4A2B] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Categorías P&L
          </button>
          <button
            type="button"
            onClick={() => setSubTab("unidades")}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              subTab === "unidades" ? "bg-[#2D4A2B] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Unidades de Negocio
          </button>
          <button
            type="button"
            onClick={() => setSubTab("apertura")}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              subTab === "apertura" ? "bg-[#2D4A2B] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Saldos de Apertura
          </button>
        </div>
      </section>

      {/* 2. SUBTAB: CUENTAS DE DINERO */}
      {subTab === "cuentas" && (
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-fraunces text-sm font-bold text-slate-800">Cuentas Bancarias y Cajas</h4>
              <p className="text-[11px] text-slate-400">
                Cajas chicas, cuentas de cheques/débito y tarjetas de crédito de la empresa
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditandoCuenta(null);
                setNombreCuenta("");
                setTipoCuenta("banco");
                setSaldoInicialCuenta("0");
                setShowModalCuenta(true);
              }}
              className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
            >
              <span>➕</span> Nueva Cuenta
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalogos.moneyAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-[#2D4A2B] transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-base">
                      {acc.tipo === "efectivo" ? "💵" : acc.tipo === "tarjeta_credito" ? "💳" : "🏦"}
                    </span>
                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {acc.tipo}
                    </span>
                  </div>
                  <h5 className="font-bold text-xs text-slate-800 mt-2">{acc.nombre}</h5>
                  {acc.numero_cuenta && (
                    <p className="text-[10px] text-slate-400 font-mono">No. {acc.numero_cuenta}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Saldo inicial: ${acc.saldo_inicial.toLocaleString()} ({acc.fecha_saldo_inicial})
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Saldo Actual:</span>
                  <span className="font-mono font-bold text-sm text-[#2D4A2B]">
                    ${acc.saldo_actual?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. SUBTAB: CATEGORÍAS P&L */}
      {subTab === "categorias" && (
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-fraunces text-sm font-bold text-slate-800">Catálogo de Categorías Contables</h4>
              <p className="text-[11px] text-slate-400">
                Cada categoría mapea a una línea del Estado de Resultados para generar el reporte automáticamente
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNombreCat("");
                setTipoCat("egreso");
                setLineaPnlCat("opex_otros");
                setShowModalCat(true);
              }}
              className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
            >
              <span>➕</span> Nueva Categoría
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold">
                <tr>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Línea del Estado de Resultados (P&L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogos.categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{c.nombre}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          c.tipo === "ingreso"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 text-[10px]">
                      {c.linea_pnl === "no_pnl" ? (
                        <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">
                          No afecta P&L (Balance Patrimonial)
                        </span>
                      ) : (
                        c.linea_pnl
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. SUBTAB: UNIDADES DE NEGOCIO */}
      {subTab === "unidades" && (
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-fraunces text-sm font-bold text-slate-800">Unidades de Negocio</h4>
              <p className="text-[11px] text-slate-400">
                Segmentación para reportes consolidados o individuales
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNombreUnidad("");
                setDescUnidad("");
                setShowModalUnidad(true);
              }}
              className="rounded-xl bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-xs flex items-center gap-1.5"
            >
              <span>➕</span> Nueva Unidad
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {catalogos.businessUnits.map((u) => (
              <div key={u.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <h5 className="font-bold text-xs text-slate-800">{u.nombre}</h5>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {u.descripcion || "Sin descripción"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. SUBTAB: SALDOS INICIALES DE APERTURA */}
      {subTab === "apertura" && (
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h4 className="font-fraunces text-sm font-bold text-slate-800">
              Registrar Saldos Iniciales de Apertura
            </h4>
            <p className="text-[11px] text-slate-400">
              Registra clientes por cobrar históricos, facturas por pagar a proveedores, préstamos existentes o activos fijos para que tu primer Balance General refleje la realidad exacta
            </p>
          </div>

          <form onSubmit={handleGuardarApertura} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Tipo de Saldo Inicial
              </label>
              <select
                value={tipoApertura}
                onChange={(e) => setTipoApertura(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="por_cobrar">Cuentas por Cobrar Inicial (Cliente pendiente)</option>
                <option value="por_pagar">Cuentas por Pagar Inicial (Proveedor pendiente)</option>
                <option value="prestamo">Préstamo Existente por Pagar (Pasivo)</option>
                <option value="activo_fijo">Activo Fijo Existente (Vehículo, Equipo, etc.)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Fecha de Apertura / Corte
              </label>
              <input
                type="date"
                required
                value={fechaApertura}
                onChange={(e) => setFechaApertura(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Concepto / Descripción
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Saldo pendiente cliente lote 4 o Camioneta Nissan"
                value={conceptoApertura}
                onChange={(e) => setConceptoApertura(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Contraparte (Cliente, Acreedor o Proveedor)
              </label>
              <input
                type="text"
                placeholder="Ej. Banco del Bajío o Materiales Express"
                value={contraparteApertura}
                onChange={(e) => setContraparteApertura(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Monto ($ MXN)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={montoApertura}
                onChange={(e) => setMontoApertura(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-mono font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Unidad de Negocio
              </label>
              <select
                value={buApertura}
                onChange={(e) => setBuApertura(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white"
              >
                {catalogos.businessUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 pt-2">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-xl bg-[#2D4A2B] px-5 py-2.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50"
              >
                {guardando ? "Registrando..." : "Registrar Saldo Inicial"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* MODAL NUEVA CUENTA DE DINERO */}
      {showModalCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
              {editandoCuenta ? "Editar Cuenta de Dinero" : "Agregar Cuenta de Dinero"}
            </h3>
            <form onSubmit={handleGuardarCuenta} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Santander Empresarial"
                  value={nombreCuenta}
                  onChange={(e) => setNombreCuenta(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select
                  value={tipoCuenta}
                  onChange={(e) => setTipoCuenta(e.target.value as any)}
                  className="w-full rounded-xl border p-2 text-xs bg-white"
                >
                  <option value="banco">🏦 Cuenta Bancaria</option>
                  <option value="efectivo">💵 Caja / Efectivo</option>
                  <option value="tarjeta_credito">💳 Tarjeta de Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Saldo Inicial ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={saldoInicialCuenta}
                  onChange={(e) => setSaldoInicialCuenta(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Saldo Inicial</label>
                <input
                  type="date"
                  required
                  value={fechaSaldoInicial}
                  onChange={(e) => setFechaSaldoInicial(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalCuenta(false)}
                  className="w-1/2 rounded-xl border py-2 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] text-white py-2 text-xs font-bold"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA CATEGORÍA */}
      {showModalCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">Nueva Categoría Contable</h3>
            <form onSubmit={handleGuardarCategoria} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Combustibles y Viáticos"
                  value={nombreCat}
                  onChange={(e) => setNombreCat(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select
                  value={tipoCat}
                  onChange={(e) => setTipoCat(e.target.value as any)}
                  className="w-full rounded-xl border p-2 text-xs bg-white"
                >
                  <option value="egreso">🔴 Egreso (Gasto o Costo)</option>
                  <option value="ingreso">🟢 Ingreso</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Línea de P&L (Estado de Resultados)
                </label>
                <select
                  value={lineaPnlCat}
                  onChange={(e) => setLineaPnlCat(e.target.value as any)}
                  className="w-full rounded-xl border p-2 text-xs bg-white"
                >
                  <option value="ingresos_comisiones">Ingresos: Comisiones</option>
                  <option value="ingresos_ventas">Ingresos: Ventas</option>
                  <option value="ingresos_otros">Ingresos: Otros</option>
                  <option value="costo_directo">Costo Directo de Operación</option>
                  <option value="costo_comisiones_venta">Costo Directo: Comisiones por Venta</option>
                  <option value="costo_marketing">Costo de Marketing</option>
                  <option value="opex_nomina">OPEX: Nómina</option>
                  <option value="opex_comisiones_visitas">OPEX: Comisiones por Visitas</option>
                  <option value="opex_renta">OPEX: Renta</option>
                  <option value="opex_servicios">OPEX: Servicios y Software</option>
                  <option value="opex_otros">OPEX: Otros Gastos</option>
                  <option value="gastos_financieros">Gastos Financieros</option>
                  <option value="isr">Impuestos a la Utilidad (ISR)</option>
                  <option value="no_pnl">No P&L (Balance / Movimiento Patrimonial)</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalCat(false)}
                  className="w-1/2 rounded-xl border py-2 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] text-white py-2 text-xs font-bold"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA UNIDAD */}
      {showModalUnidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">Nueva Unidad de Negocio</h3>
            <form onSubmit={handleGuardarUnidad} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Loft Las Cocheras"
                  value={nombreUnidad}
                  onChange={(e) => setNombreUnidad(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descripción</label>
                <textarea
                  placeholder="Detalle o propósito de la unidad"
                  value={descUnidad}
                  onChange={(e) => setDescUnidad(e.target.value)}
                  className="w-full rounded-xl border p-2 text-xs h-20"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalUnidad(false)}
                  className="w-1/2 rounded-xl border py-2 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] text-white py-2 text-xs font-bold"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
