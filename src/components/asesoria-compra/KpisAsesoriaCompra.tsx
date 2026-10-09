"use client";

import { useEffect, useState } from "react";
import { obtenerKpisAsesoriaCompra, type KpisAsesoriaCompra as Kpis } from "@/app/actions/asesoria-compra";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Indicadores de la asesoría de compra (vista v_asesoria_compra_kpis). */
export function KpisAsesoriaCompra() {
  const [k, setK] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerKpisAsesoriaCompra().then(setK).catch((e) => setError(e?.message || "No se pudieron cargar los indicadores."));
  }, []);

  if (error) return <p className="text-xs text-rojo">{error}</p>;
  if (!k) return <p className="text-xs text-carbon/50">Cargando indicadores…</p>;

  const totalCierres = k.cierres || 0;
  const reparto = (n: number) => (totalCierres ? `${Math.round((n / totalCierres) * 100)}%` : "—");
  const tiles = [
    { t: "Compradores en asesoría", v: String(k.expedientes) },
    { t: "Días de precalificación a 1.ª opción", v: k.diasPrecalificacionAPrimeraOpcion ?? "—" },
    { t: "Opciones publicadas por ronda", v: k.opcionesPorRonda ?? "—" },
    { t: "Tasa de “me interesa”", v: pct(k.tasaMeInteresa) },
    { t: "Tasa de visita a oferta", v: pct(k.tasaVisitaAOferta) },
    { t: "Días de captación a escritura", v: k.diasCaptacionAEscritura ?? "—" },
  ];

  return (
    <section className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-carbon/60">Indicadores de asesoría de compra</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <div key={x.t} className="rounded-lg bg-carbon/5 px-3 py-2">
            <p className="text-[10px] uppercase text-carbon/50">{x.t}</p>
            <p className="font-mono text-lg font-bold text-verde-profundo">{x.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold text-carbon/70">Cierres por origen ({totalCierres})</p>
          <p className="text-carbon/70">
            Propio {reparto(k.cierresPorOrigen.propio)} · Aliado {reparto(k.cierresPorOrigen.aliado)} · Portal{" "}
            {reparto(k.cierresPorOrigen.portal)}
          </p>
        </div>
        <div>
          <p className="mb-1 font-semibold text-carbon/70">Respuesta por aliado</p>
          {k.aliados.length === 0 ? (
            <p className="text-carbon/50">Sin búsquedas a aliados todavía.</p>
          ) : (
            <ul className="space-y-0.5 text-carbon/70">
              {k.aliados.slice(0, 6).map((a) => (
                <li key={a.nombre}>
                  {a.nombre}: {pct(a.tasaRespuesta)} de {a.busquedas} búsquedas · {a.casas} casas
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
