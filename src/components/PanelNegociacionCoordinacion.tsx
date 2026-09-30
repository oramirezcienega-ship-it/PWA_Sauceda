"use client";

import type { CoordinacionInspeccionDetalle } from "@/lib/coordinacion-inspecciones";

const etiquetaDia = (fecha: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1).replace(".", "");
};

const etiquetaPar = (clave: string) => {
  const [f, fr] = clave.split("|");
  return `${etiquetaDia(f)} ${fr === "M" ? "☀️ mañana" : "🌤️ tarde"}`;
};

/**
 * Muestra en qué etapa va la negociación entre los asesores (día → franja →
 * hora) y permite iniciarla cuando ninguna opción propuesta les acomoda.
 */
export function PanelNegociacionCoordinacion({
  coordinacion,
  onIniciar,
  ocupado,
}: {
  coordinacion: CoordinacionInspeccionDetalle;
  onIniciar: () => void;
  ocupado: boolean;
}) {
  const neg = coordinacion.negociacion || {};
  const etapa = neg.etapa || "opciones";
  const cerrada = coordinacion.estado === "confirmada" || coordinacion.estado === "cancelada";
  if (cerrada) return null;

  const nombre = (id: string) =>
    coordinacion.respuestasAsesores[id]?.nombre?.split(" ")[0] || "Asesor";

  const Paso = ({ n, titulo }: { n: number; titulo: string }) => (
    <div className="text-xs font-bold text-indigo-900">
      Etapa {n} de 3 · {titulo}
      {neg.ronda && neg.ronda > 1 && etapa === "dias" ? ` (ronda ${neg.ronda})` : ""}
    </div>
  );

  if (etapa === "opciones") {
    if (coordinacion.estado === "enviado_cliente") return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2">
        <span className="text-[11px] text-indigo-900">
          ¿Ninguna opción acomoda a los asesores? Se negocia por etapas: primero el <strong>día</strong>, luego la{" "}
          <strong>franja</strong> (mañana / tarde) y al final la <strong>hora</strong>.
        </span>
        <button
          type="button"
          onClick={onIniciar}
          disabled={ocupado}
          className="rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
        >
          📅 Negociar otro día con los asesores
        </button>
      </div>
    );
  }

  if (etapa === "sin_coincidencia") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 space-y-1.5">
        <div className="text-xs font-bold text-rose-800">⚠️ Sin acuerdo automático entre los asesores</div>
        <div className="text-[11px] text-rose-800">{neg.motivo || "No se encontró una coincidencia."}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-rose-700">Llama a los asesores para acordar, o reintenta desde los días.</span>
          <button
            type="button"
            onClick={onIniciar}
            disabled={ocupado}
            className="rounded-lg border border-rose-300 bg-white text-rose-800 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-100 disabled:opacity-50"
          >
            🔁 Reintentar desde los días
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 space-y-1.5">
      {etapa === "dias" && <Paso n={1} titulo="Acordando el DÍA" />}
      {etapa === "franjas" && <Paso n={2} titulo="Acordando la FRANJA (mañana / tarde)" />}
      {etapa === "horas" && <Paso n={3} titulo="Eligiendo la HORA exacta (opciones nuevas abajo)" />}

      {etapa === "dias" && (
        <>
          <div className="text-[11px] text-indigo-900">
            Días ofrecidos: {(neg.diasOfrecidos || []).map(etiquetaDia).join(" · ")}
          </div>
          {coordinacion.asesoresIds.map((id) => {
            const d = neg.dias?.[id];
            return (
              <div key={id} className="text-[11px]">
                <strong>{nombre(id)}:</strong>{" "}
                {d?.listo
                  ? d.fechas.length > 0
                    ? `✅ ${d.fechas.map(etiquetaDia).join(", ")}`
                    : "✅ ningún día"
                  : `⏳ eligiendo${d && d.fechas.length > 0 ? ` (${d.fechas.map(etiquetaDia).join(", ")})` : ""}`}
              </div>
            );
          })}
        </>
      )}

      {etapa === "franjas" && (
        <>
          <div className="text-[11px] text-indigo-900">
            Coinciden en: {Array.from(new Set((neg.paresOfrecidos || []).map((p) => p.split("|")[0]))).map(etiquetaDia).join(" · ")}
          </div>
          {coordinacion.asesoresIds.map((id) => {
            const f = neg.franjas?.[id];
            return (
              <div key={id} className="text-[11px]">
                <strong>{nombre(id)}:</strong>{" "}
                {f?.listo
                  ? f.claves.length > 0
                    ? `✅ ${f.claves.map(etiquetaPar).join(", ")}`
                    : "✅ ninguna franja"
                  : `⏳ eligiendo${f && f.claves.length > 0 ? ` (${f.claves.map(etiquetaPar).join(", ")})` : ""}`}
              </div>
            );
          })}
        </>
      )}

      {etapa === "horas" && (
        <div className="text-[11px] text-indigo-900">
          Ya coinciden en día y franja. Los asesores están votando las horas exactas disponibles.
        </div>
      )}
    </div>
  );
}
