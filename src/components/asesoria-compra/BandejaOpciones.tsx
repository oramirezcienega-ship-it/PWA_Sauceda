"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listarPropuestas,
  generarSugerencias,
  publicarPropuesta,
  descartarSugerencia,
  type PropuestaInmueble,
} from "@/app/actions/asesoria-compra";
import {
  ETIQUETA_ESTATUS_PROPUESTA,
  ETIQUETA_MOTIVO_DESCARTE,
  MAX_PUBLICADAS_POR_RONDA,
  type MotivoDescarte,
} from "@/lib/asesoria/inmuebles";
import { TarjetaInmueble } from "./TarjetaInmueble";

/**
 * Bandeja "Opciones" del expediente comprador: sugerencias del match con su
 * score y razones; el asesor las revisa y publica al portal del cliente.
 */
export function BandejaOpciones({ expedienteId }: { expedienteId: string }) {
  const [propuestas, setPropuestas] = useState<PropuestaInmueble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"sugerida" | "cliente" | "todas">("sugerida");

  const cargar = useCallback(async () => {
    try {
      setPropuestas(await listarPropuestas(expedienteId));
    } catch (e: any) {
      setAviso(e?.message || "No se pudieron cargar las opciones.");
    } finally {
      setCargando(false);
    }
  }, [expedienteId]);

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
    const r = await generarSugerencias(expedienteId);
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
                {p.estatus === "sugerida" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => publicar(p)}
                      className="flex-1 rounded-md bg-sauce px-2 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo"
                    >
                      Publicar
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
