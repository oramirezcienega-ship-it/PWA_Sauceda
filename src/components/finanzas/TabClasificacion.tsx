"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  guardarReglaMeta,
  listarReglasMeta,
  type ReglaCampanaMeta,
} from "@/app/actions/clasificacion";
import {
  obtenerCatalogoMarketing,
  type ProductoMarketing,
  type SubcuentaMarketing,
} from "@/app/actions/marketing-contable";

interface TabClasificacionProps {
  /** Se llama tras guardar una regla (el P&L cambió). */
  onCambio: () => void;
}

const formatMoneda = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

const ESTADO: Record<ReglaCampanaMeta["estado"], { texto: string; clase: string }> = {
  sugerida: { texto: "Sugerida · aplicada provisionalmente", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  pendiente: { texto: "Sin clasificar · no afecta el P&L", clase: "bg-red-50 text-red-700 border-red-200" },
  confirmada: { texto: "Confirmada", clase: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export function TabClasificacion({ onCambio }: TabClasificacionProps) {
  const [reglas, setReglas] = useState<ReglaCampanaMeta[]>([]);
  const [subcuentas, setSubcuentas] = useState<SubcuentaMarketing[]>([]);
  const [productos, setProductos] = useState<ProductoMarketing[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verConfirmadas, setVerConfirmadas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [r, cat] = await Promise.all([listarReglasMeta(), obtenerCatalogoMarketing()]);
      setReglas(r);
      setSubcuentas(cat.subcuentas);
      setProductos(cat.productos);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las reglas de clasificación.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porConfirmar = reglas.filter((r) => r.estado !== "confirmada");
  const confirmadas = reglas.filter((r) => r.estado === "confirmada");

  // Productos ya usados por subcuenta (texto libre de meta_ads_gastos) + catálogo
  const productosPorSubcuenta = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    const agregar = (codigo: string | null, nombre: string | null) => {
      if (!codigo || !nombre) return;
      const s = mapa.get(codigo) || new Set<string>();
      s.add(nombre);
      mapa.set(codigo, s);
    };
    reglas.forEach((r) => agregar(r.codigoSubcuenta, r.productoNombre));
    productos.forEach((p) => agregar(p.codigoSubcuenta, p.nombre));
    return mapa;
  }, [reglas, productos]);

  if (cargando && reglas.length === 0) {
    return <p className="py-16 text-center text-xs font-bold text-slate-500">Cargando reglas de clasificación...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <h2 className="font-fraunces text-lg font-bold text-[#2D4A2B]">🗂️ Por clasificar</h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Los gastos que llegan solos (por ahora Meta Ads) afectan el estado de resultados según una regla. La primera vez
          que aparece una campaña nueva se clasifica aquí: subcuenta (que define centro de costos y cuenta mayor) y
          producto. Al confirmarla, el sistema lo recuerda y recalcula sus meses en Finanzas.
        </p>
        {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      </div>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Por confirmar ({porConfirmar.length})
        </h3>
        {porConfirmar.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
            ✓ Todo está clasificado. Las campañas nuevas aparecerán aquí.
          </p>
        ) : (
          <div className="space-y-3">
            {porConfirmar.map((r) => (
              <FilaRegla
                key={r.campaignId}
                regla={r}
                subcuentas={subcuentas}
                productosPorSubcuenta={productosPorSubcuenta}
                abierta
                onGuardado={async () => {
                  await cargar();
                  onCambio();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setVerConfirmadas((v) => !v)}
          className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
        >
          {verConfirmadas ? "▾" : "▸"} Reglas confirmadas ({confirmadas.length})
        </button>
        {verConfirmadas && (
          <div className="space-y-2">
            {confirmadas.map((r) => (
              <FilaRegla
                key={r.campaignId}
                regla={r}
                subcuentas={subcuentas}
                productosPorSubcuenta={productosPorSubcuenta}
                abierta={false}
                onGuardado={async () => {
                  await cargar();
                  onCambio();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilaRegla({
  regla,
  subcuentas,
  productosPorSubcuenta,
  abierta,
  onGuardado,
}: {
  regla: ReglaCampanaMeta;
  subcuentas: SubcuentaMarketing[];
  productosPorSubcuenta: Map<string, Set<string>>;
  abierta: boolean;
  onGuardado: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(abierta);
  const [codigo, setCodigo] = useState(regla.codigoSubcuenta || "");
  const [producto, setProducto] = useState(regla.productoNombre || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sub = subcuentas.find((s) => s.codigo === regla.codigoSubcuenta);
  const listaId = `productos-${regla.campaignId}`;
  const opcionesProducto = Array.from(productosPorSubcuenta.get(codigo) || []);

  const guardar = async (accion: "clasificar" | "ignorar") => {
    setGuardando(true);
    setError(null);
    const res = await guardarReglaMeta({
      campaignId: regla.campaignId,
      accion,
      codigoSubcuenta: accion === "clasificar" ? codigo || null : null,
      productoNombre: accion === "clasificar" ? producto || null : null,
    });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    setEditando(false);
    await onGuardado();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 break-words">📣 {regla.nombre}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Meta Ads · {formatMoneda(regla.gastoMesActual)} este mes · {formatMoneda(regla.gastoTotal)} acumulado
            {regla.ultimoDia ? ` · último gasto ${regla.ultimoDia}` : ""}
          </p>
          {!editando && (
            <p className="mt-1 text-xs text-slate-700">
              {regla.accion === "ignorar"
                ? "🚫 Ignorada (no afecta el estado de resultados)"
                : `→ ${sub ? `${sub.codigo} ${sub.nombre} · ${sub.cuentaMayorNombre}` : "Sin subcuenta"}${
                    regla.productoNombre ? ` · ${regla.productoNombre}` : ""
                  }`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO[regla.estado].clase}`}>
            {ESTADO[regla.estado].texto}
          </span>
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              Cambiar
            </button>
          )}
        </div>
      </div>

      {editando && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Subcuenta</label>
            <select
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setProducto(Array.from(productosPorSubcuenta.get(e.target.value) || [])[0] || "");
              }}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
            >
              <option value="">Elige a dónde afecta…</option>
              {subcuentas.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} {s.nombre} · {s.cuentaMayorNombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Producto / servicio</label>
            <input
              list={listaId}
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-700 focus:border-[#2D4A2B] focus:outline-none"
            />
            <datalist id={listaId}>
              {opcionesProducto.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar("ignorar")}
              title="No afecta el estado de resultados (p. ej. ya entra por otra fuente)"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Ignorar
            </button>
            <button
              type="button"
              disabled={guardando || !codigo}
              onClick={() => guardar("clasificar")}
              className="rounded-xl bg-[#2D4A2B] px-4 py-2.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-3">{error}</p>}
          {!abierta && (
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="justify-self-start text-[11px] font-semibold text-slate-400 hover:text-slate-700 sm:col-span-3"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
