"use client";

import React, { useEffect, useState } from "react";
import type { BusinessUnit, MoneyAccount, Category, SubtipoNoPnL } from "@/app/actions/finanzas";
import { crearMovimientoFinanzas } from "@/app/actions/finanzas";
import {
  obtenerCatalogoMarketing,
  type SubcuentaMarketing,
  type ProductoMarketing,
} from "@/app/actions/marketing-contable";

interface ModalNuevoMovimientoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  catalogos: {
    businessUnits: BusinessUnit[];
    moneyAccounts: MoneyAccount[];
    categories: Category[];
  };
  valoresIniciales?: {
    tipo?: "ingreso" | "egreso" | "traspaso";
    monto?: number;
    concepto?: string;
    crm_deal_id?: string;
    contraparte?: string;
  };
}

export function ModalNuevoMovimiento({
  abierto,
  onCerrar,
  onGuardado,
  catalogos,
  valoresIniciales
}: ModalNuevoMovimientoProps) {
  const hoyStr = new Date().toISOString().split("T")[0];

  const [tipo, setTipo] = useState<"ingreso" | "egreso" | "traspaso">(
    valoresIniciales?.tipo || "egreso"
  );
  const [monto, setMonto] = useState<string>(
    valoresIniciales?.monto ? String(valoresIniciales.monto) : ""
  );
  const [fecha, setFecha] = useState<string>(hoyStr);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [businessUnitId, setBusinessUnitId] = useState<string>(
    catalogos.businessUnits[0]?.id || ""
  );
  const [moneyAccountId, setMoneyAccountId] = useState<string>(
    catalogos.moneyAccounts[0]?.id || ""
  );
  const [moneyDestinoId, setMoneyDestinoId] = useState<string>("");

  // Campos opcionales (colapsables)
  const [mostrarOpcionales, setMostrarOpcionales] = useState(
    Boolean(valoresIniciales?.concepto || valoresIniciales?.crm_deal_id)
  );
  const [concepto, setConcepto] = useState<string>(valoresIniciales?.concepto || "");
  const [contraparte, setContraparte] = useState<string>(valoresIniciales?.contraparte || "");
  const [crmDealId, setCrmDealId] = useState<string>(valoresIniciales?.crm_deal_id || "");
  const [pendiente, setPendiente] = useState<boolean>(false);
  const [subtipoNoPnl, setSubtipoNoPnl] = useState<SubtipoNoPnL | "">("");
  const [comprobanteUrl, setComprobanteUrl] = useState<string>("");

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Clasificación de publicidad: Centro de Costos → Subcuenta → Producto
  const [subcuentas, setSubcuentas] = useState<SubcuentaMarketing[]>([]);
  const [productos, setProductos] = useState<ProductoMarketing[]>([]);
  const [codigoSubcuenta, setCodigoSubcuenta] = useState<string>("");
  const [productoId, setProductoId] = useState<string>("");

  useEffect(() => {
    if (!abierto || subcuentas.length > 0) return;
    obtenerCatalogoMarketing()
      .then((cat) => {
        setSubcuentas(cat.subcuentas);
        setProductos(cat.productos);
      })
      .catch(() => {});
  }, [abierto, subcuentas.length]);

  if (!abierto) return null;

  const esMarketing =
    tipo === "egreso" && catalogos.categories.find((c) => c.id === categoriaId)?.linea_pnl === "costo_marketing";
  const subcuentasDelCentro = subcuentas.filter((s) => !businessUnitId || s.businessUnitId === businessUnitId);
  const productosDeSubcuenta = productos.filter((p) => p.codigoSubcuenta === codigoSubcuenta);

  // Filtrar categorías según tipo
  const categoriasFiltradas = catalogos.categories.filter((c) =>
    tipo === "traspaso" ? false : c.tipo === tipo
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setErrorMsg("Ingresa un monto válido mayor a 0.");
      return;
    }

    if (tipo !== "traspaso" && !categoriaId) {
      setErrorMsg("Selecciona una categoría para el movimiento.");
      return;
    }

    if (esMarketing && !businessUnitId) {
      setErrorMsg("Selecciona el centro de costos de la publicidad.");
      return;
    }

    if (esMarketing && !codigoSubcuenta) {
      setErrorMsg("Selecciona la subcuenta (especialidad) de la publicidad.");
      return;
    }

    if (tipo === "traspaso" && (!moneyAccountId || !moneyDestinoId)) {
      setErrorMsg("Para un traspaso debes seleccionar la cuenta origen y la cuenta destino.");
      return;
    }

    if (tipo === "traspaso" && moneyAccountId === moneyDestinoId) {
      setErrorMsg("La cuenta origen y destino deben ser distintas.");
      return;
    }

    setGuardando(true);
    try {
      const catObj = catalogos.categories.find((c) => c.id === categoriaId);
      const conceptoFinal =
        concepto.trim() ||
        (tipo === "traspaso"
          ? "Traspaso de fondos"
          : `${catObj?.nombre || "Movimiento"} (${fecha})`);

      const res = await crearMovimientoFinanzas({
        fecha_operacion: fecha,
        tipo,
        subtipo_no_pnl: subtipoNoPnl || (catObj?.linea_pnl === "no_pnl" ? "aportacion_capital" : null),
        categoria_id: tipo === "traspaso" ? null : categoriaId,
        business_unit_id: businessUnitId || null,
        money_account_id: moneyAccountId || null,
        money_account_destino_id: tipo === "traspaso" ? moneyDestinoId : null,
        monto_total: montoNum,
        concepto: conceptoFinal,
        contraparte: contraparte.trim() || null,
        crm_deal_id: crmDealId.trim() || null,
        comprobante_url: comprobanteUrl.trim() || null,
        estado: pendiente ? "pendiente" : "pagado",
        codigo_subcuenta: esMarketing ? codigoSubcuenta || null : null,
        producto_servicio_id: esMarketing ? productoId || null : null
      });

      if (!res.success) throw new Error(res.message);

      onGuardado();
      onCerrar();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al guardar el movimiento.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>➕</span> Registrar Movimiento
            </h3>
            <p className="text-[11px] text-slate-400">
              Captura simple · La partida doble contable se genera en automático
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

        {errorMsg && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. TIPO DE MOVIMIENTO */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              1. Tipo de Movimiento
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipo("ingreso");
                  setCategoriaId("");
                }}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tipo === "ingreso"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>🟢</span> Ingreso
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo("egreso");
                  setCategoriaId("");
                }}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tipo === "egreso"
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>🔴</span> Egreso (Gasto)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo("traspaso");
                  setCategoriaId("");
                }}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tipo === "traspaso"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>🔄</span> Traspaso
              </button>
            </div>
          </div>

          {/* 2 & 3. MONTO Y FECHA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                2. Monto ($ MXN) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-3 text-sm font-mono font-bold text-slate-800 focus:border-[#2D4A2B] focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                3. Fecha de Operación *
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
              />
            </div>
          </div>

          {/* 4. CATEGORÍA (O CUENTA DESTINO EN TRASPASO) */}
          {tipo !== "traspaso" ? (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                4. Categoría Contable *
              </label>
              <select
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value);
                  const sel = catalogos.categories.find((c) => c.id === e.target.value);
                  if (sel?.linea_pnl === "no_pnl") {
                    setMostrarOpcionales(true);
                  }
                }}
                required
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-800 bg-white focus:border-[#2D4A2B] focus:outline-none"
              >
                <option value="">-- Selecciona Categoría --</option>
                {categoriasFiltradas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.linea_pnl === "no_pnl" ? "(Balance / Capital)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                4. Cuenta Destino (A dónde entra) *
              </label>
              <select
                value={moneyDestinoId}
                onChange={(e) => setMoneyDestinoId(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-800 bg-white focus:border-[#2D4A2B] focus:outline-none"
              >
                <option value="">-- Selecciona Cuenta Destino --</option>
                {catalogos.moneyAccounts
                  .filter((a) => a.id !== moneyAccountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} (Saldo: ${a.saldo_actual?.toLocaleString("es-MX")})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* 5 & 6. UNIDAD DE NEGOCIO Y CUENTA DE DINERO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {esMarketing ? "5. Centro de Costos *" : "5. Unidad de Negocio *"}
              </label>
              <select
                value={businessUnitId}
                onChange={(e) => {
                  setBusinessUnitId(e.target.value);
                  setCodigoSubcuenta("");
                  setProductoId("");
                }}
                required
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
              >
                {catalogos.businessUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {tipo === "traspaso" ? "6. Cuenta Origen (De dónde sale) *" : "6. Cuenta de Dinero *"}
              </label>
              <select
                value={moneyAccountId}
                onChange={(e) => setMoneyAccountId(e.target.value)}
                required={!pendiente}
                disabled={pendiente}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none disabled:bg-slate-100"
              >
                {catalogos.moneyAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} (${a.saldo_actual?.toLocaleString("es-MX")})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CLASIFICACIÓN DE PUBLICIDAD */}
          {esMarketing && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <span className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                Clasificación de la publicidad
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Subcuenta / Especialidad *
                  </label>
                  <select
                    value={codigoSubcuenta}
                    onChange={(e) => {
                      setCodigoSubcuenta(e.target.value);
                      setProductoId("");
                    }}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
                  >
                    <option value="">-- Selecciona Subcuenta --</option>
                    {subcuentasDelCentro.map((s) => (
                      <option key={s.codigo} value={s.codigo}>
                        {s.codigo} {s.nombre}
                      </option>
                    ))}
                  </select>
                  {subcuentasDelCentro.length === 0 && subcuentas.length > 0 && (
                    <span className="text-[10px] text-amber-800 block mt-1">
                      Este centro de costos no tiene subcuentas de marketing.
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Producto o Servicio
                  </label>
                  <select
                    value={productoId}
                    onChange={(e) => setProductoId(e.target.value)}
                    disabled={!codigoSubcuenta}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none disabled:bg-slate-100"
                  >
                    <option value="">Gasto general de la subcuenta / Prorratear</option>
                    {productosDeSubcuenta.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                La póliza se carga a la subcuenta elegida. La publicidad institucional (Corporativo) se prorratea entre
                todas las especialidades según sus ventas.
              </p>
            </div>
          )}

          {/* CHECKBOX PENDIENTE (POR COBRAR / POR PAGAR) */}
          {tipo !== "traspaso" && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                id="chkPendiente"
                checked={pendiente}
                onChange={(e) => setPendiente(e.target.checked)}
                className="h-4 w-4 rounded text-[#2D4A2B] focus:ring-[#2D4A2B]"
              />
              <label htmlFor="chkPendiente" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Movimiento pendiente de {tipo === "ingreso" ? "cobro (Cuenta por Cobrar)" : "pago (Cuenta por Pagar)"}
              </label>
            </div>
          )}

          {/* BOTÓN COLAPSABLE OPCIONALES */}
          <div>
            <button
              type="button"
              onClick={() => setMostrarOpcionales(!mostrarOpcionales)}
              className="text-xs font-bold text-[#2D4A2B] hover:underline flex items-center gap-1"
            >
              <span>{mostrarOpcionales ? "▾" : "▸"}</span>
              <span>{mostrarOpcionales ? "Ocultar detalles adicionales" : "Más detalles (concepto, cliente/proveedor, folio CRM, comprobante)"}</span>
            </button>
          </div>

          {mostrarOpcionales && (
            <div className="space-y-3 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Concepto / Detalle
                </label>
                <input
                  type="text"
                  placeholder="Ej. Factura 104, Anticipo de comisión, etc."
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Contraparte (Cliente o Proveedor)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Juan Pérez o Sodimac"
                    value={contraparte}
                    onChange={(e) => setContraparte(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    ID Expediente CRM (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. EXP-1004"
                    value={crmDealId}
                    onChange={(e) => setCrmDealId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Si es no-pnl */}
              {catalogos.categories.find((c) => c.id === categoriaId)?.linea_pnl === "no_pnl" && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Tipo de Movimiento Patrimonial / Balance
                  </label>
                  <select
                    value={subtipoNoPnl}
                    onChange={(e) => setSubtipoNoPnl(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold text-slate-800 bg-white focus:border-[#2D4A2B] focus:outline-none"
                  >
                    <option value="aportacion_capital">Aportación de Capital (Dueño)</option>
                    <option value="retiro_dueno">Retiro de Capital / Utilidades (Dueño)</option>
                    <option value="prestamo_recibido">Préstamo Recibido (Pasivo)</option>
                    <option value="pago_prestamo">Pago de Capital a Préstamo</option>
                    <option value="compra_equipo">Compra de Mobiliario o Equipo (Activo Fijo)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  URL del Comprobante o Foto del Ticket
                </label>
                <input
                  type="url"
                  placeholder="https://... (enlace a foto o PDF)"
                  value={comprobanteUrl}
                  onChange={(e) => setComprobanteUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* BOTONES DE ACCIÓN */}
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onCerrar}
              className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs"
            >
              {guardando ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Movimiento</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
