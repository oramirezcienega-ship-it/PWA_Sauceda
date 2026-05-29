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
  correo: "✉️",
  reunion: "🤝",
  mensaje: "💬",
  formulario: "📋",
  etapa: "🔀",
  creacion: "✨",
  sistema: "⚙️",
};

/** Tipos que el asesor puede registrar manualmente. */
const TIPOS_MANUALES: { id: TipoActividad; nombre: string }[] = [
  { id: "nota", nombre: "Nota" },
  { id: "llamada", nombre: "Llamada" },
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
  const [guardando, setGuardando] = useState(false);

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
      await crearActividadManual({
        expedienteId: expedienteId ?? null,
        prospectoId: prospectoId ?? null,
        tipo,
        titulo: titulo.trim(),
        detalle: detalle.trim(),
      });
      setTitulo("");
      setDetalle("");
      setTipo("nota");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  const INPUT =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  return (
    <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
        Actividades
      </p>

      {/* Registrar actividad manual */}
      <div className="space-y-2 rounded-lg border border-carbon/10 bg-crema/30 p-3">
        <div className="flex gap-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoActividad)}
            className="rounded-md border border-carbon/15 bg-white px-2 py-2 text-sm"
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
            placeholder="Resumen (ej. Llamada de seguimiento)"
            className={INPUT}
          />
        </div>
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          rows={2}
          placeholder="Detalle (opcional)"
          className={INPUT}
        />
        <button
          type="button"
          onClick={registrar}
          disabled={!titulo.trim() || guardando}
          className="rounded-md bg-sauce px-3 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
        >
          {guardando ? "Registrando…" : "Registrar actividad"}
        </button>
      </div>

      {/* Timeline */}
      {actividades.length === 0 ? (
        <p className="mt-4 text-sm text-carbon/40">Sin actividades todavía.</p>
      ) : (
        <ul className="mt-4 space-y-3">
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
  );
}
