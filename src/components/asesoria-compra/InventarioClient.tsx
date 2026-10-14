"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listarInmuebles,
  cambiarEstatusInmueble,
  crearInmueblePortal,
  prepararSubidaFotoInmueble,
  sincronizarInventarioPropio,
  type FiltrosInventario,
} from "@/app/actions/asesoria-compra";
import { formatoPesos, formatoFecha } from "@/lib/formato";
import {
  ESTATUS_INMUEBLE,
  ETIQUETA_ESTATUS_INMUEBLE,
  ETIQUETA_ORIGEN,
  type EstatusInmueble,
  type Inmueble,
} from "@/lib/asesoria/inmuebles";
import type { OrigenInmueble } from "@/lib/asesoria/match";
import { TarjetaInmueble } from "./TarjetaInmueble";
import { FormularioInmuebleRapido } from "./FormularioInmuebleRapido";

const SELECT = "rounded-md border border-carbon/20 bg-white px-2 py-1.5 text-xs focus:border-sauce focus:outline-none";

/** Menú Inventario: tabla / tarjetas con filtros, bandeja por validar y alta desde portal. */
export function InventarioClient() {
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [porValidar, setPorValidar] = useState<Inmueble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<"tarjetas" | "tabla">("tarjetas");
  const [filtros, setFiltros] = useState<FiltrosInventario>({ estatus: "disponible" });
  const [textoMin, setTextoMin] = useState("");
  const [textoMax, setTextoMax] = useState("");
  const [mostrarPortal, setMostrarPortal] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, pendientes] = await Promise.all([
        listarInmuebles(filtros),
        listarInmuebles({ estatus: "por_validar" }),
      ]);
      setInmuebles(lista);
      setPorValidar(pendientes);
    } catch (e: any) {
      setAviso(e?.message || "No se pudo cargar el inventario.");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totales = useMemo(() => {
    const porOrigen: Record<string, number> = { propio: 0, aliado: 0, portal: 0 };
    for (const i of inmuebles) porOrigen[i.origen] = (porOrigen[i.origen] || 0) + 1;
    return porOrigen;
  }, [inmuebles]);

  async function cambiar(id: string, estatus: EstatusInmueble) {
    const r = await cambiarEstatusInmueble(id, estatus);
    if (!r.ok) setAviso(r.mensaje || "No se pudo actualizar.");
    await cargar();
  }

  async function sincronizar() {
    setSincronizando(true);
    const r = await sincronizarInventarioPropio();
    setSincronizando(false);
    setAviso(
      r.ok
        ? `Inventario propio: ${r.creados} nuevos (por validar), ${r.actualizados} actualizados${r.omitidos.length ? `, ${r.omitidos.length} omitidos (sin ficha o sin precio)` : ""}.`
        : r.mensaje || "No se pudo sincronizar.",
    );
    await cargar();
  }

  const aplicarRango = () => {
    const n = (t: string) => Number(t.replace(/\D/g, "")) || null;
    setFiltros((f) => ({ ...f, precioMin: n(textoMin), precioMax: n(textoMax) }));
  };

  return (
    <div className="space-y-5">
      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-sauce/30 bg-sauce/10 px-3 py-2 text-sm text-verde-profundo">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-carbon/50">×</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMostrarPortal((v) => !v)}
          className="rounded-md bg-sauce px-3 py-2 text-sm font-semibold text-crema hover:bg-verde-profundo"
        >
          ＋ Agregar desde portal
        </button>
        <button
          type="button"
          onClick={sincronizar}
          disabled={sincronizando}
          className="rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
        >
          {sincronizando ? "Sincronizando…" : "🔄 Sincronizar inventario propio"}
        </button>
      </div>

      {mostrarPortal && (
        <section className="max-w-2xl rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-verde-profundo">Agregar desde portal</h2>
          <FormularioInmuebleRapido
            modo="portal"
            preparar={prepararSubidaFotoInmueble}
            onCancelar={() => setMostrarPortal(false)}
            onGuardar={async (datos) => {
              const r = await crearInmueblePortal(datos);
              if (r.ok) {
                setAviso(`Se agregó ${r.inmueble.folio} al inventario.`);
                setMostrarPortal(false);
                await cargar();
                return { ok: true };
              }
              return { ok: false, mensaje: r.mensaje };
            }}
          />
        </section>
      )}

      {/* Bandeja por validar */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-900">
          Por validar ({porValidar.length})
        </h2>
        {porValidar.length === 0 ? (
          <p className="text-xs text-carbon/50">No hay inmuebles pendientes de validar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {porValidar.map((i) => (
              <TarjetaInmueble key={i.id} inmueble={i}>
                <div className="flex gap-2">
                  <button type="button" onClick={() => cambiar(i.id, "disponible")} className="flex-1 rounded-md bg-sauce px-2 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo">
                    Aprobar
                  </button>
                  <button type="button" onClick={() => cambiar(i.id, "descartado")} className="flex-1 rounded-md border border-carbon/15 px-2 py-1.5 text-xs text-carbon/70 hover:border-rojo hover:text-rojo">
                    Descartar
                  </button>
                </div>
              </TarjetaInmueble>
            ))}
          </div>
        )}
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-carbon/10 bg-white p-3">
        <label className="text-[10px] font-bold uppercase text-carbon/50">
          Zona
          <input
            className={`${SELECT} ml-0 block w-44`}
            placeholder="Fraccionamiento, colonia…"
            defaultValue={filtros.zona}
            onKeyDown={(e) => {
              if (e.key === "Enter") setFiltros((f) => ({ ...f, zona: (e.target as HTMLInputElement).value }));
            }}
            onBlur={(e) => setFiltros((f) => ({ ...f, zona: e.target.value }))}
          />
        </label>
        <label className="text-[10px] font-bold uppercase text-carbon/50">
          Precio desde
          <input className={`${SELECT} block w-28 font-mono`} value={textoMin} inputMode="numeric"
            onChange={(e) => { const n = e.target.value.replace(/\D/g, ""); setTextoMin(n ? formatoPesos(Number(n)) : ""); }}
            onBlur={aplicarRango} />
        </label>
        <label className="text-[10px] font-bold uppercase text-carbon/50">
          hasta
          <input className={`${SELECT} block w-28 font-mono`} value={textoMax} inputMode="numeric"
            onChange={(e) => { const n = e.target.value.replace(/\D/g, ""); setTextoMax(n ? formatoPesos(Number(n)) : ""); }}
            onBlur={aplicarRango} />
        </label>
        <label className="text-[10px] font-bold uppercase text-carbon/50">
          Origen
          <select className={`${SELECT} block`} value={filtros.origen ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value as OrigenInmueble | "" }))}>
            <option value="">Todos</option>
            {(Object.keys(ETIQUETA_ORIGEN) as OrigenInmueble[]).map((o) => (
              <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-carbon/50">
          Estatus
          <select className={`${SELECT} block`} value={filtros.estatus ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, estatus: e.target.value as EstatusInmueble | "" }))}>
            <option value="">Todos</option>
            {ESTATUS_INMUEBLE.map((s) => (
              <option key={s} value={s}>{ETIQUETA_ESTATUS_INMUEBLE[s]}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-3 text-xs text-carbon/60">
          <span>
            {inmuebles.length} inmuebles · Propio {totales.propio} · Aliado {totales.aliado} · Portal {totales.portal}
          </span>
          <div className="flex overflow-hidden rounded-md border border-carbon/20">
            {(["tarjetas", "tabla"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setVista(v)} className={`px-2.5 py-1 ${vista === v ? "bg-sauce text-crema" : "bg-white"}`}>
                {v === "tarjetas" ? "Tarjetas" : "Tabla"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {cargando ? (
        <p className="text-sm text-carbon/50">Cargando…</p>
      ) : inmuebles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-carbon/15 bg-white p-8 text-center text-sm text-carbon/50">
          No hay inmuebles con esos filtros.
        </p>
      ) : vista === "tarjetas" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {inmuebles.map((i) => (
            <TarjetaInmueble key={i.id} inmueble={i}>
              <SelectorEstatus inmueble={i} onCambio={cambiar} />
            </TarjetaInmueble>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-carbon/5 text-[10px] uppercase text-carbon/50">
              <tr>
                <th className="px-3 py-2">Folio</th>
                <th className="px-3 py-2">Zona</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Rec.</th>
                <th className="px-3 py-2">m²</th>
                <th className="px-3 py-2">Origen</th>
                <th className="px-3 py-2">Fotos</th>
                <th className="px-3 py-2">Alta</th>
                <th className="px-3 py-2">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {inmuebles.map((i) => (
                <tr key={i.id} className="border-t border-carbon/5">
                  <td className="px-3 py-2 font-mono">{i.folio}</td>
                  <td className="px-3 py-2">{i.fraccionamiento || i.zona || i.colonia || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatoPesos(i.precio)}</td>
                  <td className="px-3 py-2">{i.recamaras ?? "—"}</td>
                  <td className="px-3 py-2">{i.metrosConstruccion ?? "—"}</td>
                  <td className="px-3 py-2">{ETIQUETA_ORIGEN[i.origen]}{i.aliadoNombre ? ` · ${i.aliadoNombre}` : ""}</td>
                  <td className="px-3 py-2">{i.fotos.length}</td>
                  <td className="px-3 py-2">{formatoFecha(i.createdAt)}</td>
                  <td className="px-3 py-2"><SelectorEstatus inmueble={i} onCambio={cambiar} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectorEstatus({ inmueble, onCambio }: { inmueble: Inmueble; onCambio: (id: string, e: EstatusInmueble) => void }) {
  return (
    <select
      value={inmueble.estatus}
      onChange={(e) => onCambio(inmueble.id, e.target.value as EstatusInmueble)}
      className={`${SELECT} w-full`}
      aria-label="Cambiar estatus"
    >
      {ESTATUS_INMUEBLE.map((s) => (
        <option key={s} value={s}>{ETIQUETA_ESTATUS_INMUEBLE[s]}</option>
      ))}
    </select>
  );
}
