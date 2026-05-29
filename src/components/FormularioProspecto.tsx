"use client";

import { useState } from "react";
import { ORIGENES } from "@/lib/origenes";
import type { DatosProspecto } from "@/lib/types";

/** Valores por defecto para un prospecto nuevo. */
const VACIO: DatosProspecto = {
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  telefono: "",
  correo: "",
  direccion: "",
  ciudad: "León, Gto.",
  origen: "otro",
  valorCampana: 0,
  notas: "",
};

/**
 * Formulario reutilizable para crear o editar un prospecto.
 * Presentacional: delega guardado/cancelado a quien lo usa.
 */
export function FormularioProspecto({
  valorInicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  valorInicial?: DatosProspecto;
  textoBoton: string;
  onGuardar: (datos: DatosProspecto) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosProspecto>(valorInicial ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function actualizar<K extends keyof DatosProspecto>(
    campo: K,
    valor: DatosProspecto[K],
  ) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.nombre.trim()) {
      setError("El nombre del prospecto es obligatorio.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({
        ...datos,
        nombre: datos.nombre.trim(),
        primerApellido: datos.primerApellido.trim(),
        segundoApellido: datos.segundoApellido.trim(),
        valorCampana: Number(datos.valorCampana) || 0,
      });
    } catch (err) {
      console.error("Error al guardar el prospecto:", err);
      setError("No se pudo guardar. Revisa la conexión e inténtalo de nuevo.");
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Nombre(s)" requerido>
          <input
            type="text"
            value={datos.nombre}
            onChange={(e) => actualizar("nombre", e.target.value)}
            placeholder="Nombre(s)"
            className={INPUT}
          />
        </Campo>
        <Campo etiqueta="Primer apellido">
          <input
            type="text"
            value={datos.primerApellido}
            onChange={(e) => actualizar("primerApellido", e.target.value)}
            placeholder="Primer apellido"
            className={INPUT}
          />
        </Campo>
        <Campo etiqueta="Segundo apellido">
          <input
            type="text"
            value={datos.segundoApellido}
            onChange={(e) => actualizar("segundoApellido", e.target.value)}
            placeholder="Segundo apellido"
            className={INPUT}
          />
        </Campo>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono">
          <input
            type="tel"
            value={datos.telefono}
            onChange={(e) => actualizar("telefono", e.target.value)}
            placeholder="477 123 4567"
            className={`${INPUT} font-mono`}
          />
        </Campo>

        <Campo etiqueta="Correo">
          <input
            type="email"
            value={datos.correo}
            onChange={(e) => actualizar("correo", e.target.value)}
            placeholder="cliente@correo.com"
            className={INPUT}
          />
        </Campo>

        <Campo etiqueta="Ciudad">
          <input
            type="text"
            value={datos.ciudad}
            onChange={(e) => actualizar("ciudad", e.target.value)}
            placeholder="León, Gto."
            className={INPUT}
          />
        </Campo>

        <Campo etiqueta="Origen de adquisición">
          <select
            value={datos.origen}
            onChange={(e) =>
              actualizar("origen", e.target.value as DatosProspecto["origen"])
            }
            className={INPUT}
          >
            {ORIGENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo etiqueta="Dirección">
        <input
          type="text"
          value={datos.direccion}
          onChange={(e) => actualizar("direccion", e.target.value)}
          placeholder="Calle, número, colonia…"
          className={INPUT}
        />
      </Campo>

      <Campo etiqueta="Valor de campaña / costo de adquisición (MXN)">
        <input
          type="number"
          min={0}
          step={50}
          value={datos.valorCampana || ""}
          onChange={(e) => actualizar("valorCampana", Number(e.target.value))}
          placeholder="350"
          className={`${INPUT} font-mono`}
        />
      </Campo>

      <Campo etiqueta="Notas">
        <textarea
          value={datos.notas}
          onChange={(e) => actualizar("notas", e.target.value)}
          rows={2}
          placeholder="Notas internas sobre el prospecto…"
          className={INPUT}
        />
      </Campo>

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

function Campo({
  etiqueta,
  requerido,
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rojo">*</span>}
      </span>
      {children}
    </label>
  );
}
