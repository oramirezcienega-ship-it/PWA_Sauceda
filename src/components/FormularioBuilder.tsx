"use client";

import { useState } from "react";
import { TIPOS_PREGUNTA } from "@/lib/preguntas";
import type { DatosFormulario, Pregunta, TipoPregunta } from "@/lib/types";

/** Crea una pregunta vacía. */
function preguntaVacia(): Pregunta {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random()}`,
    etiqueta: "",
    tipo: "texto-corto",
    opciones: [],
    requerido: false,
  };
}

const VACIO: DatosFormulario = {
  titulo: "",
  descripcion: "",
  preguntas: [],
};

/**
 * Constructor de formularios (crear/editar). Maneja título, descripción y
 * la lista de preguntas (agregar, quitar, mover, editar). Presentacional.
 */
export function FormularioBuilder({
  valorInicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  valorInicial?: DatosFormulario;
  textoBoton: string;
  onGuardar: (datos: DatosFormulario) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosFormulario>(valorInicial ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function setPreguntas(preguntas: Pregunta[]) {
    setDatos((d) => ({ ...d, preguntas }));
  }

  function actualizarPregunta(id: string, cambios: Partial<Pregunta>) {
    setPreguntas(
      datos.preguntas.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
    );
  }

  function mover(idx: number, dir: -1 | 1) {
    const nuevas = [...datos.preguntas];
    const destino = idx + dir;
    if (destino < 0 || destino >= nuevas.length) return;
    [nuevas[idx], nuevas[destino]] = [nuevas[destino], nuevas[idx]];
    setPreguntas(nuevas);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.titulo.trim()) {
      setError("El título del formulario es obligatorio.");
      return;
    }
    if (datos.preguntas.length === 0) {
      setError("Agrega al menos una pregunta.");
      return;
    }
    if (datos.preguntas.some((p) => !p.etiqueta.trim())) {
      setError("Todas las preguntas necesitan un texto.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({
        ...datos,
        titulo: datos.titulo.trim(),
        preguntas: datos.preguntas.map((p) => ({
          ...p,
          etiqueta: p.etiqueta.trim(),
          opciones: p.tipo === "opcion-multiple" ? p.opciones : [],
        })),
      });
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {error && (
        <p className="rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
          {error}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
          Título <span className="text-rojo">*</span>
        </span>
        <input
          type="text"
          value={datos.titulo}
          onChange={(e) => setDatos((d) => ({ ...d, titulo: e.target.value }))}
          placeholder="Ej. Datos para iniciar el traspaso"
          className={INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
          Descripción
        </span>
        <textarea
          value={datos.descripcion}
          onChange={(e) =>
            setDatos((d) => ({ ...d, descripcion: e.target.value }))
          }
          rows={2}
          placeholder="Texto breve que verá el cliente"
          className={INPUT}
        />
      </label>

      {/* Preguntas */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
          Preguntas ({datos.preguntas.length})
        </p>

        {datos.preguntas.map((p, idx) => (
          <div
            key={p.id}
            className="rounded-lg border border-carbon/10 bg-crema/30 p-3"
          >
            <div className="flex items-start gap-2">
              <span className="mt-2 font-mono text-xs text-carbon/40">
                {idx + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={p.etiqueta}
                  onChange={(e) =>
                    actualizarPregunta(p.id, { etiqueta: e.target.value })
                  }
                  placeholder="Texto de la pregunta"
                  className={INPUT}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={p.tipo}
                    onChange={(e) =>
                      actualizarPregunta(p.id, {
                        tipo: e.target.value as TipoPregunta,
                      })
                    }
                    className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs"
                  >
                    {TIPOS_PREGUNTA.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-carbon/60">
                    <input
                      type="checkbox"
                      checked={p.requerido}
                      onChange={(e) =>
                        actualizarPregunta(p.id, { requerido: e.target.checked })
                      }
                    />
                    Obligatoria
                  </label>
                </div>

                {p.tipo === "opcion-multiple" && (
                  <input
                    type="text"
                    value={p.opciones.join(", ")}
                    onChange={(e) =>
                      actualizarPregunta(p.id, {
                        opciones: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Opciones separadas por coma"
                    className={`${INPUT} text-xs`}
                  />
                )}
              </div>

              {/* Controles de orden/borrado */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => mover(idx, -1)}
                  className="rounded px-1.5 text-carbon/50 hover:text-verde-profundo"
                  title="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => mover(idx, 1)}
                  className="rounded px-1.5 text-carbon/50 hover:text-verde-profundo"
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreguntas(datos.preguntas.filter((q) => q.id !== p.id))
                  }
                  className="rounded px-1.5 text-rojo/70 hover:text-rojo"
                  title="Quitar"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setPreguntas([...datos.preguntas, preguntaVacia()])}
          className="rounded-md border border-dashed border-sauce/40 px-4 py-2 text-sm text-sauce transition hover:bg-sauce/5"
        >
          + Agregar pregunta
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="flex-1 rounded-md border border-carbon/15 bg-white px-4 py-2.5 text-sm text-carbon/70 transition hover:border-carbon/30 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
        >
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";
