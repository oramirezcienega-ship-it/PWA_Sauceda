"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listarPropuestas,
  generarSugerencias,
  publicarPropuesta,
  descartarSugerencia,
  actualizarEstatusPropuesta,
  registrarCierreCompra,
  type PropuestaInmueble,
} from "@/app/actions/asesoria-compra";
import {
  ETIQUETA_ESTATUS_PROPUESTA,
  ETIQUETA_MOTIVO_DESCARTE,
  MAX_PUBLICADAS_POR_RONDA,
  type MotivoDescarte,
} from "@/lib/asesoria/inmuebles";
import { TarjetaInmueble } from "./TarjetaInmueble";
import { formatoPesos } from "@/lib/formato";

/**
 * Bandeja "Opciones" de la OT de asesoría de compra: sugerencias del match con su
 * score y razones; el asesor las revisa y publica al portal del cliente.
 */
export function BandejaOpciones({ ordenTrabajoId }: { ordenTrabajoId: string }) {
  const [propuestas, setPropuestas] = useState<PropuestaInmueble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"sugerida" | "cliente" | "todas">("sugerida");

  const cargar = useCallback(async () => {
    try {
      setPropuestas(await listarPropuestas(ordenTrabajoId));
    } catch (e: any) {
      setAviso(e?.message || "No se pudieron cargar las opciones.");
    } finally {
      setCargando(false);
    }
  }, [ordenTrabajoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const rondaActual = propuestas.reduce((m, p) => Math.max(m, p.ronda), 1);
  const publicadasRonda = propuestas.filter((p) => p.ronda === rondaActual && p.publicadaEn).length;
  const sugeridas = propuestas.filter((p) => p.estatus === "sugerida");
  const conCliente = propuestas.filter((p) => p.publicadaEn);
  const visibles = filtro === "sugerida" ? sugeridas : filtro === "cliente" ? conCliente : propuestas;

  // Aprendizaje para la siguiente ronda: motivos por los que el cliente descartó.
  const motivos = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const p of propuestas) {
      if (p.estatus === "descartada" && p.publicadaEn && p.motivoDescarte) {
        cuenta[p.motivoDescarte] = (cuenta[p.motivoDescarte] || 0) + 1;
      }
    }
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  }, [propuestas]);

  async function buscar() {
    setTrabajando(true);
    const r = await generarSugerencias(ordenTrabajoId);
    setTrabajando(false);
    setAviso(r.ok ? `Se evaluaron ${r.evaluados} inmuebles disponibles: ${r.nuevas} sugerencias nuevas.` : r.mensaje || "No se pudo buscar.");
    await cargar();
  }

  async function publicar(p: PropuestaInmueble) {
    if (publicadasRonda >= MAX_PUBLICADAS_POR_RONDA) {
      const seguir = window.confirm(
        `Ya hay ${publicadasRonda} opciones publicadas en la ronda ${rondaActual}. Se recomiendan de 3 a ${MAX_PUBLICADAS_POR_RONDA}. ¿Publicar de todos modos?`,
      );
      if (!seguir) return;
    }
    const r = await publicarPropuesta(p.id);
    setAviso(r.ok ? r.advertencia || `${p.inmueble.folio} publicada al cliente.` : r.mensaje || "No se pudo publicar.");
    await cargar();
  }

  async function descartar(p: PropuestaInmueble) {
    const r = await descartarSugerencia(p.id);
    if (!r.ok) setAviso(r.mensaje || "No se pudo descartar.");
    await cargar();
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">🏘️ Opciones</p>
          <p className="text-[11px] text-carbon/50">
            Ronda {rondaActual} · {publicadasRonda} publicada{publicadasRonda === 1 ? "" : "s"} (recomendado 3 a {MAX_PUBLICADAS_POR_RONDA})
          </p>
        </div>
        <button
          type="button"
          onClick={buscar}
          disabled={trabajando}
          className="rounded-md bg-sauce px-3 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50"
        >
          {trabajando ? "Buscando…" : "🔎 Cruzar con inventario"}
        </button>
      </div>

      {aviso && (
        <p className="mb-3 flex justify-between gap-2 rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-900">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)}>×</button>
        </p>
      )}

      {motivos.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Lo que el cliente ha descartado:</strong>{" "}
          {motivos.map(([m, n]) => `${ETIQUETA_MOTIVO_DESCARTE[m as MotivoDescarte] ?? m} (${n})`).join(", ")}.
          {" "}Úsalo para ajustar el perfil antes de la siguiente ronda.
        </div>
      )}

      <div className="mb-3 flex gap-1 text-xs">
        {[
          { id: "sugerida" as const, t: `Sugeridas (${sugeridas.length})` },
          { id: "cliente" as const, t: `Con el cliente (${conCliente.length})` },
          { id: "todas" as const, t: `Todas (${propuestas.length})` },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-2.5 py-1 ${filtro === f.id ? "border-sauce bg-sauce text-crema" : "border-carbon/15 text-carbon/60"}`}
          >
            {f.t}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-carbon/50">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="rounded-md border border-dashed border-carbon/15 p-4 text-center text-xs text-carbon/50">
          {filtro === "sugerida"
            ? "No hay sugerencias pendientes. Usa “Cruzar con inventario” para buscar en las casas disponibles."
            : "Sin opciones en esta vista."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibles.map((p) => (
            <TarjetaInmueble key={p.id} inmueble={p.inmueble}>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono font-bold text-violet-900">
                    Match {p.scoreMatch ?? "—"}
                  </span>
                  <span className="text-carbon/60">
                    {ETIQUETA_ESTATUS_PROPUESTA[p.estatus]} · ronda {p.ronda}
                  </span>
                </div>
                {p.razonesMatch.length > 0 && (
                  <details className="text-[11px] text-carbon/70">
                    <summary className="cursor-pointer text-carbon/50">Por qué coincide</summary>
                    <ul className="mt-1 space-y-0.5">
                      {p.razonesMatch.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {p.estatus === "descartada" && p.publicadaEn && (
                  <p className="text-[11px] text-rojo">
                    Descartada por el cliente: {ETIQUETA_MOTIVO_DESCARTE[p.motivoDescarte as MotivoDescarte] ?? p.motivoDescarte ?? "sin motivo"}
                    {p.comentarioCliente ? ` — “${p.comentarioCliente}”` : ""}
                  </p>
                )}
                {["me_interesa", "visita_agendada", "visitada", "ofertada"].includes(p.estatus) && (
                  <SeguimientoPropuesta
                    propuesta={p}
                    onAviso={setAviso}
                    onCambio={cargar}
                  />
                )}
                {p.comentarioCliente && p.estatus !== "descartada" && (
                  <p className="text-[11px] text-carbon/70">💬 “{p.comentarioCliente}”</p>
                )}
                {p.estatus === "sugerida" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => publicar(p)}
                      className="flex-1 rounded-md bg-sauce px-2 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo"
                    >
                      {p.inmueble.estatus === "por_validar" ? "Validar y publicar" : "Publicar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => descartar(p)}
                      className="rounded-md border border-carbon/15 px-2 py-1.5 text-xs text-carbon/60 hover:border-rojo hover:text-rojo"
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            </TarjetaInmueble>
          ))}
        </div>
      )}
    </section>
  );
}

/** Avance tras el interés del cliente: visita realizada, oferta y cierre (escritura). */
function SeguimientoPropuesta({
  propuesta: p,
  onAviso,
  onCambio,
}: {
  propuesta: PropuestaInmueble;
  onAviso: (m: string) => void;
  onCambio: () => Promise<void>;
}) {
  const [cierre, setCierre] = useState(false);
  const [precio, setPrecio] = useState(formatoPesos(p.inmueble.precio));
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);

  async function avanzar(estatus: "visitada" | "ofertada") {
    const r = await actualizarEstatusPropuesta(p.id, estatus);
    if (!r.ok) onAviso(r.mensaje || "No se pudo actualizar.");
    await onCambio();
  }

  return (
    <div className="space-y-1.5 rounded-md border border-violet-100 bg-violet-50/50 p-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {(p.estatus === "me_interesa" || p.estatus === "visita_agendada") && (
          <button type="button" onClick={() => avanzar("visitada")} className="rounded border border-violet-300 px-2 py-1 text-violet-900">
            Visita realizada
          </button>
        )}
        {p.estatus !== "ofertada" && (
          <button type="button" onClick={() => avanzar("ofertada")} className="rounded border border-violet-300 px-2 py-1 text-violet-900">
            Oferta presentada
          </button>
        )}
        <button type="button" onClick={() => setCierre((v) => !v)} className="rounded bg-verde-profundo px-2 py-1 font-semibold text-crema">
          🔑 Registrar cierre
        </button>
      </div>
      {cierre && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] uppercase text-carbon/50">
              Precio de compraventa
              <input
                value={precio}
                inputMode="numeric"
                onChange={(e) => {
                  const n = e.target.value.replace(/\D/g, "");
                  setPrecio(n ? formatoPesos(Number(n)) : "");
                }}
                className="mt-0.5 block w-full rounded border border-carbon/20 px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="text-[10px] uppercase text-carbon/50">
              Firma de escritura
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-0.5 block w-full rounded border border-carbon/20 px-2 py-1 text-xs" />
            </label>
          </div>
          <p className="text-[10px] text-carbon/50">
            La casa queda como elegida y vendida.{p.inmueble.origen === "aliado" ? " Se genera la comisión compartida del aliado." : ""}
          </p>
          <button
            type="button"
            disabled={enviando}
            onClick={async () => {
              if (!window.confirm(`¿Registrar el cierre de ${p.inmueble.folio}?`)) return;
              setEnviando(true);
              const r = await registrarCierreCompra(p.id, { precioCompraventa: precio, fechaEscritura: fecha });
              setEnviando(false);
              onAviso(
                r.ok
                  ? `Cierre registrado.${r.comisionAliado != null ? ` Comisión al aliado: ${formatoPesos(r.comisionAliado)}.` : ""}`
                  : r.mensaje || "No se pudo registrar el cierre.",
              );
              await onCambio();
            }}
            className="w-full rounded bg-verde-profundo px-2 py-1.5 font-semibold text-crema disabled:opacity-50"
          >
            {enviando ? "Registrando…" : "Confirmar cierre"}
          </button>
        </div>
      )}
    </div>
  );
}
