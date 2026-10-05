"use client";

import { useEffect, useMemo, useState } from "react";
import { useExpedientes } from "@/context/expedientes-context";
import { TODAS_LAS_ETAPAS } from "@/lib/etapas";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { labelTipoNegocio, type EtapaId, type Expediente, type OrigenAdquisicion } from "@/lib/types";
import { TableroExpedientes } from "./TableroExpedientes";
import { TablaExpedientes } from "./TablaExpedientes";

type Vista = "lista" | "tablero";
type RangoPreset =
  | "todos"
  | "hoy"
  | "ayer"
  | "ultima-semana"
  | "este-mes"
  | "mes-pasado"
  | "personalizado";

const CLAVE_VISTA = "sauceda.vista";
const CLAVE_FILTROS = "negocios:filtros:v1";

/** Valor especial de los selects para "sin dato" (sin asesor, sin secuencia, etc.). */
const SIN = "__sin__";

interface Filtros {
  busqueda: string;
  etapasSel: EtapaId[];
  rango: RangoPreset;
  campoFecha: "movimiento" | "registro";
  desde: string;
  hasta: string;
  asesor: string;
  fraccionamiento: string;
  tipoNegocio: string;
  origen: string;
  secuencia: string;
  monto: "todos" | "con" | "sin";
  montoMin: string;
  montoMax: string;
  deuda: "todos" | "con" | "sin";
}

const FILTROS_VACIOS: Filtros = {
  busqueda: "",
  etapasSel: [],
  rango: "todos",
  campoFecha: "movimiento",
  desde: "",
  hasta: "",
  asesor: "",
  fraccionamiento: "",
  tipoNegocio: "",
  origen: "",
  secuencia: "",
  monto: "todos",
  montoMin: "",
  montoMax: "",
  deuda: "todos",
};

/** Opciones únicas (ordenadas) de un campo, con su etiqueta y cuántos negocios la tienen. */
function opcionesDe(
  lista: Expediente[],
  valor: (e: Expediente) => string | null | undefined,
  etiqueta: (v: string) => string = (v) => v,
): { valor: string; etiqueta: string; n: number }[] {
  const conteo = new Map<string, number>();
  for (const e of lista) {
    const v = (valor(e) || "").trim();
    if (v) conteo.set(v, (conteo.get(v) || 0) + 1);
  }
  return Array.from(conteo.entries())
    .map(([v, n]) => ({ valor: v, etiqueta: etiqueta(v), n }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Compara un campo contra el valor del filtro ("" = todos, SIN = vacío). */
function coincideSelect(filtro: string, valor: string | null | undefined): boolean {
  if (!filtro) return true;
  const v = (valor || "").trim();
  return filtro === SIN ? v === "" : v === filtro;
}

/** Fecha local en formato YYYY-MM-DD. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** Calcula [desde, hasta] (YYYY-MM-DD) según el preset. */
function calcularRango(
  preset: RangoPreset,
  desde: string,
  hasta: string,
): { desde: string; hasta: string } | null {
  const hoy = new Date();
  switch (preset) {
    case "hoy":
      return { desde: ymd(hoy), hasta: ymd(hoy) };
    case "ayer": {
      const a = new Date(hoy);
      a.setDate(a.getDate() - 1);
      return { desde: ymd(a), hasta: ymd(a) };
    }
    case "ultima-semana": {
      const i = new Date(hoy);
      i.setDate(i.getDate() - 6);
      return { desde: ymd(i), hasta: ymd(hoy) };
    }
    case "este-mes": {
      const i = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: ymd(i), hasta: ymd(hoy) };
    }
    case "mes-pasado": {
      const i = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: ymd(i), hasta: ymd(f) };
    }
    case "personalizado":
      if (!desde && !hasta) return null;
      return { desde: desde || "0000-01-01", hasta: hasta || "9999-12-31" };
    default:
      return null;
  }
}

/**
 * Contenedor de las visualizaciones de expedientes con filtros:
 * búsqueda, multi-selección de etapas y rango de fecha (último movimiento).
 */
export function VistaExpedientes() {
  const { expedientes, cargado, error, recargar } = useExpedientes();
  const [vista, setVista] = useState<Vista>("lista");
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [filtrosRestaurados, setFiltrosRestaurados] = useState(false);
  const [masFiltros, setMasFiltros] = useState(true);
  const { busqueda, etapasSel, rango, desde, hasta } = f;
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const setBusqueda = (v: string) => set("busqueda", v);
  const setEtapasSel = (fn: EtapaId[] | ((prev: EtapaId[]) => EtapaId[])) =>
    setF((prev) => ({ ...prev, etapasSel: typeof fn === "function" ? fn(prev.etapasSel) : fn }));
  const setRango = (v: RangoPreset) => set("rango", v);
  const setDesde = (v: string) => set("desde", v);
  const setHasta = (v: string) => set("hasta", v);

  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE_VISTA);
      if (guardada === "lista" || guardada === "tablero") setVista(guardada);
      const g = JSON.parse(window.localStorage.getItem(CLAVE_FILTROS) || "null");
      if (g && typeof g === "object") setF({ ...FILTROS_VACIOS, ...g });
    } catch {}
    setFiltrosRestaurados(true);
  }, []);

  // Los filtros persisten al refrescar la página (solo en este navegador)
  useEffect(() => {
    if (!filtrosRestaurados) return;
    try {
      window.localStorage.setItem(CLAVE_FILTROS, JSON.stringify(f));
    } catch {}
  }, [f, filtrosRestaurados]);

  const opciones = useMemo(
    () => ({
      asesor: opcionesDe(expedientes, (e) => e.asesorNombre),
      fraccionamiento: opcionesDe(expedientes, (e) => e.fraccionamiento),
      tipoNegocio: opcionesDe(expedientes, (e) => e.tipoNegocio, (v) => labelTipoNegocio(v as any)),
      origen: opcionesDe(expedientes, (e) => e.origenProspecto, (v) => ORIGEN_POR_ID[v as OrigenAdquisicion] || v),
      secuencia: opcionesDe(expedientes, (e) => e.secuenciaNombre),
    }),
    [expedientes],
  );

  function cambiarVista(v: Vista) {
    setVista(v);
    window.localStorage.setItem(CLAVE_VISTA, v);
  }

  function alternarEtapa(id: EtapaId) {
    setEtapasSel((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    const r = calcularRango(rango, desde, hasta);
    const min = f.montoMin.trim() ? Number(f.montoMin) : null;
    const max = f.montoMax.trim() ? Number(f.montoMax) : null;
    return expedientes.filter((e) => {
      const coincideTexto =
        !q ||
        e.nombreCompleto.toLowerCase().includes(q) ||
        e.fraccionamiento.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (qDigitos.length >= 3 && (e.telefono || "").replace(/\D/g, "").includes(qDigitos));
      const coincideEtapa =
        etapasSel.length === 0
          ? e.etapa !== "perdido" // por defecto se excluyen los Perdido
          : etapasSel.includes(e.etapa);
      const fecha =
        f.campoFecha === "registro" ? (e.createdAt ? ymd(new Date(e.createdAt)) : "") : e.ultimoMovimiento;
      const coincideFecha = !r || (!!fecha && fecha >= r.desde && fecha <= r.hasta);
      const valor = Number(e.valorEstimado) || 0;
      const deuda = Number(e.saldoDeuda) || 0;
      const coincideMonto =
        (f.monto === "todos" || (f.monto === "con" ? valor > 0 : valor <= 0)) &&
        (min === null || valor >= min) &&
        (max === null || valor <= max);
      const coincideDeuda = f.deuda === "todos" || (f.deuda === "con" ? deuda > 0 : deuda <= 0);
      return (
        coincideTexto &&
        coincideEtapa &&
        coincideFecha &&
        coincideMonto &&
        coincideDeuda &&
        coincideSelect(f.asesor, e.asesorNombre) &&
        coincideSelect(f.fraccionamiento, e.fraccionamiento) &&
        coincideSelect(f.tipoNegocio, e.tipoNegocio) &&
        coincideSelect(f.origen, e.origenProspecto) &&
        coincideSelect(f.secuencia, e.secuenciaNombre)
      );
    });
  }, [expedientes, f, busqueda, etapasSel, rango, desde, hasta]);

  // Filtros por columna activos (además de búsqueda, fecha y etapas)
  const extrasActivos = [
    f.asesor,
    f.fraccionamiento,
    f.tipoNegocio,
    f.origen,
    f.secuencia,
    f.monto !== "todos" ? "x" : "",
    f.montoMin,
    f.montoMax,
    f.deuda !== "todos" ? "x" : "",
  ].filter(Boolean).length;

  const filtrando =
    busqueda.trim() !== "" || etapasSel.length > 0 || rango !== "todos" || extrasActivos > 0;

  if (error) {
    return (
      <div className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo flex items-center justify-between">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void recargar()}
          className="rounded bg-rojo px-3 py-1 text-xs text-crema hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!cargado) {
    return (
      <div className="flex items-center gap-3 px-1 py-8 text-sm text-carbon/60">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sauce border-t-transparent"></div>
        <span>Cargando negocios…</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        {/* Fila 1: búsqueda + fecha + vista */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, teléfono, EXP o fraccionamiento…"
              className="w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30 sm:max-w-xs"
            />
            <select
              value={f.campoFecha}
              onChange={(e) => set("campoFecha", e.target.value as Filtros["campoFecha"])}
              className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
              title="Qué fecha usar para el filtro de fechas"
            >
              <option value="movimiento">Fecha: último movimiento</option>
              <option value="registro">Fecha: registro</option>
            </select>
            <select
              value={rango}
              onChange={(e) => setRango(e.target.value as RangoPreset)}
              className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
              title="Rango de fechas"
            >
              <option value="todos">Cualquier fecha</option>
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="ultima-semana">Últimos 7 días</option>
              <option value="este-mes">Este mes</option>
              <option value="mes-pasado">Mes pasado</option>
              <option value="personalizado">Personalizado…</option>
            </select>
            <button
              type="button"
              onClick={() => setMasFiltros((v) => !v)}
              className={`shrink-0 rounded-md border px-3 py-2 text-sm transition ${
                extrasActivos > 0
                  ? "border-sauce bg-sauce/10 text-verde-profundo font-semibold"
                  : "border-carbon/15 bg-white text-carbon/70 hover:border-sauce"
              }`}
            >
              Filtros{extrasActivos > 0 ? ` (${extrasActivos})` : ""} {masFiltros ? "▴" : "▾"}
            </button>
            {filtrando && (
              <button
                type="button"
                onClick={() => setF(FILTROS_VACIOS)}
                className="shrink-0 text-sm text-carbon/50 underline hover:text-carbon"
              >
                Limpiar todo
              </button>
            )}
          </div>

          <div className="inline-flex shrink-0 rounded-lg border border-carbon/15 bg-white p-0.5">
            <BotonVista
              activo={vista === "lista"}
              onClick={() => cambiarVista("lista")}
            >
              Lista
            </BotonVista>
            <BotonVista
              activo={vista === "tablero"}
              onClick={() => cambiarVista("tablero")}
            >
              Tablero
            </BotonVista>
          </div>
        </div>

        {/* Rango personalizado */}
        {rango === "personalizado" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-carbon/60">Del</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1.5 text-sm"
            />
            <span className="text-carbon/60">al</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-carbon/15 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {/* Filtros por columna */}
        {masFiltros && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-carbon/10 bg-white/60 p-2.5 text-sm sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            <SelectFiltro etiqueta="Asesor" valor={f.asesor} onCambio={(v) => set("asesor", v)} opciones={opciones.asesor} textoSin="Sin asesor" />
            <SelectFiltro
              etiqueta="Fraccionamiento"
              valor={f.fraccionamiento}
              onCambio={(v) => set("fraccionamiento", v)}
              opciones={opciones.fraccionamiento}
              textoSin="Sin fraccionamiento"
            />
            <SelectFiltro
              etiqueta="Tipo de negocio"
              valor={f.tipoNegocio}
              onCambio={(v) => set("tipoNegocio", v)}
              opciones={opciones.tipoNegocio}
              textoSin="Sin tipo"
            />
            <SelectFiltro etiqueta="Origen" valor={f.origen} onCambio={(v) => set("origen", v)} opciones={opciones.origen} textoSin="Sin origen" />
            <SelectFiltro
              etiqueta="Secuencia"
              valor={f.secuencia}
              onCambio={(v) => set("secuencia", v)}
              opciones={opciones.secuencia}
              textoSin="Sin secuencia"
            />
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">Valor estimado</span>
              <select
                value={f.monto}
                onChange={(e) => set("monto", e.target.value as Filtros["monto"])}
                className={claseSelect(f.monto !== "todos")}
              >
                <option value="todos">Todos</option>
                <option value="con">Con monto</option>
                <option value="sin">Sin monto ($0)</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">Monto entre</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={f.montoMin}
                  onChange={(e) => set("montoMin", e.target.value)}
                  placeholder="mín"
                  className={`${claseSelect(!!f.montoMin)} w-full min-w-0`}
                />
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={f.montoMax}
                  onChange={(e) => set("montoMax", e.target.value)}
                  placeholder="máx"
                  className={`${claseSelect(!!f.montoMax)} w-full min-w-0`}
                />
              </div>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">Saldo deuda</span>
              <select
                value={f.deuda}
                onChange={(e) => set("deuda", e.target.value as Filtros["deuda"])}
                className={claseSelect(f.deuda !== "todos")}
              >
                <option value="todos">Todos</option>
                <option value="con">Con deuda</option>
                <option value="sin">Sin deuda</option>
              </select>
            </label>
          </div>
        )}

        {/* Fila 2: chips de etapas (multi-selección) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          <span className="mr-1 text-xs text-carbon/50 shrink-0">Etapas:</span>
          {TODAS_LAS_ETAPAS.map((etapa) => {
            const activo = etapasSel.includes(etapa.id);
            return (
              <button
                key={etapa.id}
                type="button"
                onClick={() => alternarEtapa(etapa.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition shrink-0 ${
                  activo
                    ? "border-sauce bg-sauce text-crema"
                    : "border-carbon/15 bg-white text-carbon/60 hover:border-sauce"
                }`}
              >
                {etapa.nombre}
              </button>
            );
          })}
          {etapasSel.length > 0 && (
            <button
              type="button"
              onClick={() => setEtapasSel([])}
              className="ml-1 text-xs text-carbon/50 underline hover:text-carbon shrink-0"
            >
              limpiar
            </button>
          )}
        </div>
      </div>

      {/* Contador */}
      <p className="mb-3 text-sm text-carbon/60">
        <span className="font-mono font-medium text-verde-profundo">
          {filtrados.length}
        </span>{" "}
        {filtrando ? (
          <>
            de {expedientes.length} negocio
            {expedientes.length === 1 ? "" : "s"}
          </>
        ) : (
          <>negocio{filtrados.length === 1 ? "" : "s"}</>
        )}
        {etapasSel.length === 0 && (
          <span className="text-carbon/40"> · Perdido oculto</span>
        )}
      </p>

      {vista === "lista" ? (
        <TablaExpedientes expedientes={filtrados} />
      ) : (
        <TableroExpedientes expedientes={filtrados} />
      )}
    </>
  );
}

function claseSelect(activo: boolean): string {
  return `rounded-md border px-2 py-1.5 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30 ${
    activo ? "border-sauce bg-sauce/10 text-verde-profundo font-semibold" : "border-carbon/15 bg-white text-carbon/80"
  }`;
}

function SelectFiltro({
  etiqueta,
  valor,
  onCambio,
  opciones,
  textoSin,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; etiqueta: string; n: number }[];
  textoSin: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)} className={`${claseSelect(!!valor)} w-full`}>
        <option value="">Todos</option>
        <option value={SIN}>— {textoSin} —</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta} ({o.n})
          </option>
        ))}
      </select>
    </label>
  );
}

function BotonVista({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        activo
          ? "bg-sauce text-crema"
          : "text-carbon/60 hover:text-verde-profundo"
      }`}
    >
      {children}
    </button>
  );
}
