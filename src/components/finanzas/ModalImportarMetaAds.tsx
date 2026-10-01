"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { MoneyAccount } from "@/app/actions/finanzas";
import {
  aprobarImportacionMeta,
  listarMesesMetaAds,
  previsualizarImportacionMeta,
  type GrupoImportacionMeta,
  type MesMeta,
} from "@/app/actions/marketing-contable";

interface ModalImportarMetaAdsProps {
  abierto: boolean;
  onCerrar: () => void;
  onImportado: () => void;
  moneyAccounts: MoneyAccount[];
}

const formatMoneda = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

const nombreMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

export function ModalImportarMetaAds({ abierto, onCerrar, onImportado, moneyAccounts }: ModalImportarMetaAdsProps) {
  const [meses, setMeses] = useState<MesMeta[]>([]);
  const [mes, setMes] = useState<string>("");
  const [grupos, setGrupos] = useState<GrupoImportacionMeta[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const tarjetaPorDefecto = moneyAccounts.find((a) => a.tipo === "tarjeta_credito")?.id || moneyAccounts[0]?.id || "";
  const [moneyAccountId, setMoneyAccountId] = useState<string>(tarjetaPorDefecto);
  const [pagado, setPagado] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setMensaje(null);
    listarMesesMetaAds()
      .then((lista) => {
        setMeses(lista);
        const pendiente = lista.find((m) => m.registrosPendientes > 0);
        setMes((actual) => actual || pendiente?.mes || lista[0]?.mes || "");
      })
      .catch((err) => setMensaje({ tipo: "error", texto: err?.message || "No se pudo leer meta_ads_gastos." }));
  }, [abierto]);

  const cargarGrupos = useCallback(async (m: string) => {
    if (!m) return;
    setCargando(true);
    try {
      const g = await previsualizarImportacionMeta(m);
      setGrupos(g);
      setSeleccion(new Set(g.filter((x) => x.codigoSubcuenta !== "SIN-SUBCUENTA" && x.businessUnitId).map((x) => x.codigoSubcuenta)));
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err?.message || "No se pudo agrupar el gasto." });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (abierto && mes) cargarGrupos(mes);
  }, [abierto, mes, cargarGrupos]);

  if (!abierto) return null;

  const totalSeleccionado = grupos
    .filter((g) => seleccion.has(g.codigoSubcuenta))
    .reduce((acc, g) => acc + g.gasto, 0);

  const handleAprobar = async () => {
    setAprobando(true);
    setMensaje(null);
    const res = await aprobarImportacionMeta({
      mes,
      moneyAccountId: moneyAccountId || null,
      pagado,
      subcuentas: Array.from(seleccion),
    });
    setAprobando(false);
    if (res.ok) {
      setMensaje({
        tipo: "ok",
        texto: `${res.movimientos} movimientos contabilizados por ${formatMoneda(res.total)} en ${nombreMes(mes)}.`,
      });
      await cargarGrupos(mes);
      setMeses(await listarMesesMetaAds());
      onImportado();
    } else {
      setMensaje({ tipo: "error", texto: res.error || "No se pudo importar." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] flex items-center gap-2">
              <span>📣</span> Importar Gastos de Meta Ads
            </h3>
            <p className="text-[11px] text-slate-400">
              Un movimiento por mes y subcuenta · la póliza se carga a la subcuenta 601-… de cada especialidad
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 font-bold">
            ✕
          </button>
        </div>

        {mensaje && (
          <div
            className={`mb-4 rounded-xl border p-3 text-xs font-medium ${
              mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              {meses.map((m) => (
                <option key={m.mes} value={m.mes}>
                  {nombreMes(m.mes)} · {formatMoneda(m.gasto)}
                  {m.registrosPendientes > 0 ? " · pendiente" : " · contabilizado"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cuenta del cargo</label>
            <select
              value={moneyAccountId}
              onChange={(e) => setMoneyAccountId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 bg-white focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="">Sin cuenta</option>
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pt-5 font-semibold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} className="h-4 w-4" />
            Ya se cobró en la cuenta (pagado)
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {cargando ? (
            <div className="py-10 text-center text-xs text-slate-500">Agrupando gasto por subcuenta...</div>
          ) : grupos.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">No hay gasto de Meta Ads en ese mes.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2 px-3"></th>
                  <th className="py-2 px-3">Subcuenta</th>
                  <th className="py-2 px-3">Centro</th>
                  <th className="py-2 px-3 text-right">Días</th>
                  <th className="py-2 px-3 text-right">Clics</th>
                  <th className="py-2 px-3 text-right">Gasto</th>
                  <th className="py-2 px-3">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grupos.map((g) => {
                  const valido = g.codigoSubcuenta !== "SIN-SUBCUENTA" && Boolean(g.businessUnitId);
                  const completo = g.pendientes === 0 && g.contabilizado > 0;
                  return (
                    <tr key={g.codigoSubcuenta} className={valido ? "" : "opacity-60"}>
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          disabled={!valido}
                          checked={seleccion.has(g.codigoSubcuenta)}
                          onChange={(e) => {
                            const s = new Set(seleccion);
                            if (e.target.checked) s.add(g.codigoSubcuenta);
                            else s.delete(g.codigoSubcuenta);
                            setSeleccion(s);
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-slate-800 block">
                          {g.codigoSubcuenta} {g.nombreSubcuenta}
                        </span>
                        <span className="text-[10px] text-slate-400" title={g.campanas.join("\n")}>
                          {g.productoServicio} · {g.campanas.length} {g.campanas.length === 1 ? "campaña" : "campañas"}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{g.centroCostos || "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{g.registros}</td>
                      <td className="py-2 px-3 text-right font-mono">{g.clics.toLocaleString("es-MX")}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold">{formatMoneda(g.gasto)}</td>
                      <td className="py-2 px-3">
                        {!valido ? (
                          <span className="text-[10px] font-bold text-red-700">Sin subcuenta válida</span>
                        ) : completo ? (
                          <span className="text-[10px] font-bold text-emerald-700">✓ Contabilizado</span>
                        ) : g.contabilizado > 0 ? (
                          <span className="text-[10px] font-bold text-amber-700">Actualizar ({g.pendientes} nuevos)</span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          Si ya existe el movimiento del mes para una subcuenta, se actualiza con el total (no se duplica) y los registros
          diarios quedan marcados como CONTABILIZADO.
        </p>

        <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100">
          <span className="text-xs text-slate-600">
            Seleccionado: <strong className="font-mono">{formatMoneda(totalSeleccionado)}</strong>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleAprobar}
              disabled={aprobando || seleccion.size === 0}
              className="rounded-xl bg-[#2D4A2B] px-4 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] disabled:opacity-50"
            >
              {aprobando ? "Contabilizando..." : "✓ Aprobar y contabilizar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
