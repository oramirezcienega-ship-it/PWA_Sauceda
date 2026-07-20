"use client";

import { useEffect, useState } from "react";
import {
  crearActividadManual,
  listarActividadesDeExpediente,
  listarActividadesDeProspecto,
} from "@/app/actions/actividades";
import { formatoFechaHora } from "@/lib/formato";
import type { Actividad, TipoActividad } from "@/lib/types";

/** Ícono por tipo de actividad. */
const ICONO: Record<TipoActividad, string> = {
  nota: "📝",
  llamada: "📞",
  visita: "🔍",
  instalacion: "🛠️",
  correo: "✉️",
  reunion: "🤝",
  mensaje: "💬",
  formulario: "📋",
  etapa: "🔀",
  creacion: "✨",
  construccion: "🏗️",
  sistema: "⚙️",
};

/** Tipos que el asesor puede registrar manualmente. */
const TIPOS_MANUALES: { id: TipoActividad; nombre: string }[] = [
  { id: "nota", nombre: "Nota" },
  { id: "llamada", nombre: "Llamada" },
  { id: "visita", nombre: "Visita Técnica" },
  { id: "instalacion", nombre: "Instalación" },
  { id: "correo", nombre: "Correo" },
  { id: "reunion", nombre: "Reunión" },
];

/**
 * Bitácora de actividades de un expediente o prospecto. Muestra el timeline
 * y permite registrar actividades manuales (notas, llamadas, correos…).
 */
export function Actividades({
  expedienteId,
  prospectoId,
}: {
  expedienteId?: string;
  prospectoId?: string;
}) {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [tipo, setTipo] = useState<TipoActividad>("nota");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fechaProg, setFechaProg] = useState("");
  const [horaProg, setHoraProg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [colapsado, setColapsado] = useState(true);

  async function cargar() {
    try {
      const data = expedienteId
        ? await listarActividadesDeExpediente(expedienteId)
        : prospectoId
          ? await listarActividadesDeProspecto(prospectoId)
          : [];
      setActividades(data);
    } catch {
      setActividades([]);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId, prospectoId]);

  async function registrar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      let detalleFinal = detalle.trim();
      if (fechaProg) {
        const infoFecha = `📅 Programada para: ${fechaProg}${horaProg ? ` a las ${horaProg} hrs` : ""}`;
        detalleFinal = detalleFinal ? `${infoFecha}\n${detalleFinal}` : infoFecha;
      }

      await crearActividadManual({
        expedienteId: expedienteId ?? null,
        prospectoId: prospectoId ?? null,
        tipo,
        titulo: titulo.trim(),
        detalle: detalleFinal,
      });
      setTitulo("");
      setDetalle("");
      setFechaProg("");
      setHoraProg("");
      setTipo("nota");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  const INPUT =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  const requiereFechaHora = tipo === "llamada" || tipo === "visita" || tipo === "instalacion" || tipo === "reunion";

  return (
    <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
      <button
        type="button"
        onClick={() => setColapsado(!colapsado)}
        className="flex w-full items-center justify-between text-left focus:outline-none"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
          Actividades {actividades.length > 0 && `(${actividades.length})`}
        </span>
        <span className="text-xs font-semibold text-sauce hover:text-verde-profundo transition-colors">
          {colapsado ? "Mostrar actividades ↓" : "Contraer ↑"}
        </span>
      </button>

      {!colapsado && (
        <div className="mt-4 space-y-4">
          {/* Registrar actividad manual */}
          <div className="space-y-2.5 rounded-lg border border-carbon/10 bg-crema/30 p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoActividad)}
                className="rounded-md border border-carbon/15 bg-white px-2 py-2 text-sm font-medium"
              >
                {TIPOS_MANUALES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {ICONO[t.id]} {t.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={
                  tipo === "llamada" ? "Ej. Llamada de seguimiento al cliente" :
                  tipo === "visita" ? "Ej. Inspección técnica de azotea" :
                  tipo === "instalacion" ? "Ej. Instalación de impermeabilizante" :
                  "Resumen de la actividad..."
                }
                className={INPUT}
              />
            </div>

            {requiereFechaHora && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/70 p-2 rounded-md border border-carbon/10">
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-0.5">Fecha de {tipo}</label>
                  <input
                    type="date"
                    value={fechaProg}
                    onChange={(e) => setFechaProg(e.target.value)}
                    className="w-full rounded border border-carbon/15 px-2 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-0.5">Horario</label>
                  <input
                    type="time"
                    value={horaProg}
                    onChange={(e) => setHoraProg(e.target.value)}
                    className="w-full rounded border border-carbon/15 px-2 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
                  />
                </div>
              </div>
            )}

            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              placeholder="Detalles u observaciones de seguimiento (opcional)..."
              className={INPUT}
            />
            <button
              type="button"
              onClick={registrar}
              disabled={!titulo.trim() || guardando}
              className="rounded-md bg-sauce px-3.5 py-2 text-sm font-bold text-crema transition hover:bg-verde-profundo disabled:opacity-50 cursor-pointer"
            >
              {guardando ? "Registrando…" : "Registrar actividad"}
            </button>
          </div>

          {/* Timeline */}
          {actividades.length === 0 ? (
            <p className="text-sm text-carbon/40">Sin actividades todavía.</p>
          ) : (
            <ul className="space-y-3">
              {actividades.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="text-lg leading-none">
                    {ICONO[a.tipo] ?? "•"}
                  </span>
                  <div className="flex-1 border-b border-carbon/5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-verde-profundo">
                        {a.titulo}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-carbon/40">
                        {formatoFechaHora(a.fecha)}
                      </span>
                    </div>
                    {a.detalle && (
                      <p className="mt-0.5 whitespace-pre-line text-sm text-carbon/70">
                        {a.detalle}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
