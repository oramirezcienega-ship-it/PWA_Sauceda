"use client";

import { useState } from "react";
import { PARAMETROS_DISPONIBLES } from "@/lib/parametros";
import type { DatosMensaje } from "@/lib/types";

const VACIO: DatosMensaje = { titulo: "", texto: "" };

/** Formulario reutilizable para crear/editar una plantilla de mensaje. */
export function FormularioMensaje({
  valorInicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  valorInicial?: DatosMensaje;
  textoBoton: string;
  onGuardar: (datos: DatosMensaje) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosMensaje>(valorInicial ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.titulo.trim() || !datos.texto.trim()) {
      setError("El título y el texto son obligatorios.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({
        titulo: datos.titulo.trim(),
        texto: datos.texto.trim(),
      });
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  const INPUT =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

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
          placeholder="Ej. Recordatorio de documentos"
          className={INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
          Mensaje <span className="text-rojo">*</span>
        </span>
        <textarea
          value={datos.texto}
          onChange={(e) => setDatos((d) => ({ ...d, texto: e.target.value }))}
          rows={4}
          placeholder="Hola {nombre}, te recordamos que…"
          className={INPUT}
        />
      </label>

      <p className="rounded-md border border-cielo/30 bg-cielo/5 px-3 py-2 text-xs text-carbon/70">
        Puedes usar datos del cliente, ej.{" "}
        <span className="font-mono">Hola {"{nombre}"}</span>. Disponibles:{" "}
        <span className="font-mono">{PARAMETROS_DISPONIBLES.join(" ")}</span>
      </p>

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
