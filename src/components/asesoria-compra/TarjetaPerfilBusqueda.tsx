"use client";

import { useState } from "react";
import { guardarFichaAsesoria } from "@/app/actions/asesoria-compra";
import { ETIQUETA_CREDITO, TIPOS_CREDITO } from "@/lib/asesoria/match";
import {
  ETIQUETA_FUENTE,
  FUENTES_PRECALIFICACION,
  normalizarZonas,
  poderDeCompra,
  type PerfilBusqueda,
} from "@/lib/asesoria/perfil";
import { formatoPesos, formatoFecha } from "@/lib/formato";

/** Formato MXN $#,##0 mientras se escribe ("1250000" → "$1,250,000"). */
function aTextoMonto(valor: number | null): string {
  return valor === null ? "" : formatoPesos(valor);
}

function MontoInput({
  valor,
  onCambio,
  placeholder,
}: {
  valor: string;
  onCambio: (texto: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={valor}
      placeholder={placeholder}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "");
        onCambio(digitos ? formatoPesos(Number(digitos)) : "");
      }}
      className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 font-mono text-sm focus:border-sauce focus:outline-none"
    />
  );
}

interface Borrador {
  tipoCredito: string;
  montoCreditoPrecalificado: string;
  montoAhorroPropio: string;
  precalificacionFuente: string;
  precalificacionFecha: string;
  zonasTexto: string;
  busquedaPrecioMin: string;
  busquedaPrecioMax: string;
  busquedaRecamarasMin: string;
  busquedaRequisitos: string;
  yaTieneCasa: boolean;
}

function aBorrador(p: PerfilBusqueda | null): Borrador {
  return {
    tipoCredito: p?.tipoCredito ?? "",
    montoCreditoPrecalificado: aTextoMonto(p?.montoCreditoPrecalificado ?? null),
    montoAhorroPropio: aTextoMonto(p?.montoAhorroPropio ?? null),
    precalificacionFuente: p?.precalificacionFuente ?? "",
    precalificacionFecha: p?.precalificacionFecha ?? "",
    zonasTexto: (p?.busquedaZonas ?? []).join(", "),
    busquedaPrecioMin: aTextoMonto(p?.busquedaPrecioMin ?? null),
    busquedaPrecioMax: aTextoMonto(p?.busquedaPrecioMax ?? null),
    busquedaRecamarasMin: p?.busquedaRecamarasMin != null ? String(p.busquedaRecamarasMin) : "",
    busquedaRequisitos: p?.busquedaRequisitos ?? "",
    yaTieneCasa: Boolean(p?.yaTieneCasa),
  };
}

/**
 * Ficha de la OT de asesoría de compra: precalificación (poder de compra) y
 * perfil de búsqueda del comprador.
 */
export function TarjetaPerfilBusqueda({
  ordenTrabajoId,
  perfilInicial,
  onGuardado,
}: {
  ordenTrabajoId: string;
  perfilInicial: PerfilBusqueda;
  onGuardado?: () => void | Promise<void>;
}) {
  const [perfil, setPerfil] = useState<PerfilBusqueda | null>(perfilInicial);
  const cargando = false;
  // Si aún no hay precalificación, se abre directo en edición.
  const [editando, setEditando] = useState(perfilInicial.montoCreditoPrecalificado === null);
  const [borrador, setBorrador] = useState<Borrador>(aBorrador(perfilInicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Borrador>(campo: K, valor: Borrador[K]) {
    setBorrador((b) => ({ ...b, [campo]: valor }));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await guardarFichaAsesoria(ordenTrabajoId, {
      tipoCredito: borrador.tipoCredito,
      montoCreditoPrecalificado: borrador.montoCreditoPrecalificado,
      montoAhorroPropio: borrador.montoAhorroPropio,
      precalificacionFuente: borrador.precalificacionFuente,
      precalificacionFecha: borrador.precalificacionFecha,
      busquedaZonas: normalizarZonas(borrador.zonasTexto),
      busquedaPrecioMin: borrador.busquedaPrecioMin,
      busquedaPrecioMax: borrador.busquedaPrecioMax,
      busquedaRecamarasMin: borrador.busquedaRecamarasMin,
      busquedaRequisitos: borrador.busquedaRequisitos,
      yaTieneCasa: borrador.yaTieneCasa,
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setPerfil(r.perfil);
    setBorrador(aBorrador(r.perfil));
    setEditando(false);
    await onGuardado?.();
  }

  const montoNum = (t: string) => Number(t.replace(/\D/g, "")) || 0;
  const poderBorrador = montoNum(borrador.montoCreditoPrecalificado) + montoNum(borrador.montoAhorroPropio);
  const listoParaBuscar =
    !!perfil && (perfil.montoCreditoPrecalificado ?? 0) > 0 && perfil.busquedaZonas.length > 0;

  return (
    <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">🔎 Ficha: precalificación y perfil de búsqueda</p>
          <p className="text-[11px] text-carbon/50">Precalificación y lo que busca el comprador.</p>
        </div>
        {!cargando && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-md border border-violet-300 px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-50"
          >
            Editar
          </button>
        )}
      </div>

      {cargando && <p className="text-sm text-carbon/50">Cargando…</p>}

      {!cargando && !editando && perfil && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dato etiqueta="Crédito precalificado" valor={perfil.montoCreditoPrecalificado !== null ? formatoPesos(perfil.montoCreditoPrecalificado) : "—"} />
            <Dato etiqueta="Ahorro propio" valor={perfil.montoAhorroPropio !== null ? formatoPesos(perfil.montoAhorroPropio) : "—"} />
            <Dato etiqueta="Poder de compra" valor={formatoPesos(poderDeCompra(perfil))} resaltar />
            <Dato etiqueta="Tipo de crédito" valor={perfil.tipoCredito ? ETIQUETA_CREDITO[perfil.tipoCredito] : "—"} />
            <Dato
              etiqueta="Fuente"
              valor={perfil.precalificacionFuente ? ETIQUETA_FUENTE[perfil.precalificacionFuente] : "—"}
            />
            <Dato
              etiqueta="Fecha de precalificación"
              valor={perfil.precalificacionFecha ? formatoFecha(`${perfil.precalificacionFecha}T12:00:00`) : "—"}
            />
            <Dato etiqueta="Recámaras mínimas" valor={perfil.busquedaRecamarasMin !== null ? String(perfil.busquedaRecamarasMin) : "—"} />
          </div>

          {perfil.yaTieneCasa ? (
            <p className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-900">
              🏠 El cliente <strong>ya tiene casa</strong>: se salta la búsqueda y la negociación.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase text-carbon/40">Zonas</p>
                {perfil.busquedaZonas.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {perfil.busquedaZonas.map((z) => (
                      <span key={z} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-900">
                        {z}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-carbon/50">—</p>
                )}
              </div>
              <Dato
                etiqueta="Rango de precio"
                valor={
                  perfil.busquedaPrecioMin !== null || perfil.busquedaPrecioMax !== null
                    ? `${perfil.busquedaPrecioMin !== null ? formatoPesos(perfil.busquedaPrecioMin) : "—"} a ${perfil.busquedaPrecioMax !== null ? formatoPesos(perfil.busquedaPrecioMax) : "—"}`
                    : "—"
                }
              />
              {perfil.busquedaRequisitos && <Dato etiqueta="Requisitos" valor={perfil.busquedaRequisitos} />}
              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  listoParaBuscar ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
                }`}
              >
                {listoParaBuscar
                  ? "✅ Listo para pasar a Búsqueda."
                  : "⚠️ Para pasar a Búsqueda falta el monto precalificado y al menos una zona."}
              </p>
            </>
          )}
        </div>
      )}

      {!cargando && editando && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Crédito precalificado (crédito + subcuenta)">
              <MontoInput valor={borrador.montoCreditoPrecalificado} onCambio={(t) => set("montoCreditoPrecalificado", t)} placeholder="$850,000" />
            </Campo>
            <Campo etiqueta="Ahorro propio">
              <MontoInput valor={borrador.montoAhorroPropio} onCambio={(t) => set("montoAhorroPropio", t)} placeholder="$50,000" />
            </Campo>
            <Campo etiqueta="Tipo de crédito del cliente">
              <select
                value={borrador.tipoCredito}
                onChange={(e) => set("tipoCredito", e.target.value)}
                className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
              >
                <option value="">Sin definir</option>
                {TIPOS_CREDITO.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CREDITO[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fuente de la precalificación">
              <select
                value={borrador.precalificacionFuente}
                onChange={(e) => set("precalificacionFuente", e.target.value)}
                className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
              >
                <option value="">Sin definir</option>
                {FUENTES_PRECALIFICACION.map((f) => (
                  <option key={f} value={f}>
                    {ETIQUETA_FUENTE[f]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha de precalificación">
              <input
                type="date"
                value={borrador.precalificacionFecha}
                onChange={(e) => set("precalificacionFecha", e.target.value)}
                className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
              />
            </Campo>
          </div>
          <p className="text-xs text-carbon/60">
            Poder de compra: <strong className="font-mono text-verde-profundo">{formatoPesos(poderBorrador)}</strong>
          </p>

          <label className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-carbon/80">
            <input
              type="checkbox"
              checked={borrador.yaTieneCasa}
              onChange={(e) => set("yaTieneCasa", e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>El cliente ya tiene casa.</strong> Se salta la búsqueda y la negociación (se cancelan esas tareas).
            </span>
          </label>

          {!borrador.yaTieneCasa && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Zonas, colonias o fraccionamientos (separados por coma)" ancho>
                <input
                  type="text"
                  value={borrador.zonasTexto}
                  onChange={(e) => set("zonasTexto", e.target.value)}
                  placeholder="Villas de San Juan, Los Castillos, Centro"
                  className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
                />
              </Campo>
              <Campo etiqueta="Precio mínimo">
                <MontoInput valor={borrador.busquedaPrecioMin} onCambio={(t) => set("busquedaPrecioMin", t)} placeholder="$600,000" />
              </Campo>
              <Campo etiqueta="Precio máximo">
                <MontoInput valor={borrador.busquedaPrecioMax} onCambio={(t) => set("busquedaPrecioMax", t)} placeholder="$900,000" />
              </Campo>
              <Campo etiqueta="Recámaras mínimas">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={borrador.busquedaRecamarasMin}
                  onChange={(e) => set("busquedaRecamarasMin", e.target.value)}
                  className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
                />
              </Campo>
              <Campo etiqueta="Requisitos" ancho>
                <textarea
                  rows={2}
                  value={borrador.busquedaRequisitos}
                  onChange={(e) => set("busquedaRequisitos", e.target.value)}
                  placeholder="Planta baja, cerca de escuela…"
                  className="w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none"
                />
              </Campo>
            </div>
          )}

          {error && <p className="rounded-md bg-rojo/10 px-3 py-2 text-xs text-rojo">{error}</p>}

          <div className="flex justify-end gap-2">
            {perfil && perfil.montoCreditoPrecalificado !== null && (
              <button
                type="button"
                onClick={() => {
                  setBorrador(aBorrador(perfil));
                  setEditando(false);
                  setError(null);
                }}
                className="rounded-md border border-carbon/15 px-3 py-1.5 text-xs text-carbon/70 hover:border-sauce"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="rounded-md bg-sauce px-3 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar perfil"}
            </button>
          </div>
        </div>
      )}

      {!cargando && !editando && !perfil && error && <p className="text-xs text-rojo">{error}</p>}
    </section>
  );
}

function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`block ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[10px] font-bold uppercase text-carbon/50">{etiqueta}</span>
      {children}
    </label>
  );
}

function Dato({ etiqueta, valor, resaltar }: { etiqueta: string; valor: string; resaltar?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-carbon/40">{etiqueta}</p>
      <p className={resaltar ? "font-mono font-bold text-verde-profundo" : "text-carbon/80"}>{valor}</p>
    </div>
  );
}
