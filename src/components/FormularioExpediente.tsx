"use client";

import { useState } from "react";
import { ETAPAS } from "@/lib/etapas";
import type { DatosExpediente } from "@/lib/types";

/** Valores por defecto para un expediente nuevo. */
const VACIO: DatosExpediente = {
  cliente: "",
  fraccionamiento: "",
  etapa: "nuevo-lead",
  situacion: "",
  telefono: "",
  valorEstimado: 0,
  saldoDeuda: 0,
  notas: "",
};

/**
 * Formulario reutilizable para crear o editar un expediente.
 * Es presentacional: recibe el valor inicial y delega el guardado/cancelado
 * a quien lo usa (las páginas conectan el contexto y el ruteo).
 */
export function FormularioExpediente({
  valorInicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  valorInicial?: DatosExpediente;
  textoBoton: string;
  onGuardar: (datos: DatosExpediente) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosExpediente>(valorInicial ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function actualizar<K extends keyof DatosExpediente>(
    campo: K,
    valor: DatosExpediente[K],
  ) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.cliente.trim() || !datos.fraccionamiento.trim()) {
      setError("El nombre del cliente y el fraccionamiento son obligatorios.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({
        ...datos,
        cliente: datos.cliente.trim(),
        fraccionamiento: datos.fraccionamiento.trim(),
        valorEstimado: Number(datos.valorEstimado) || 0,
        saldoDeuda: Number(datos.saldoDeuda) || 0,
      });
      // Si todo salió bien la página normalmente redirige; si no, liberamos.
    } catch (err) {
      console.error("Error al guardar el expediente:", err);
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

      <Campo etiqueta="Cliente" requerido>
        <input
          type="text"
          value={datos.cliente}
          onChange={(e) => actualizar("cliente", e.target.value)}
          placeholder="Nombre del titular del crédito"
          className={INPUT}
        />
      </Campo>

      <Campo etiqueta="Fraccionamiento" requerido>
        <input
          type="text"
          value={datos.fraccionamiento}
          onChange={(e) => actualizar("fraccionamiento", e.target.value)}
          placeholder="Zona / fraccionamiento en León, Gto."
          className={INPUT}
        />
      </Campo>

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

        <Campo etiqueta="Etapa">
          <select
            value={datos.etapa}
            onChange={(e) =>
              actualizar("etapa", e.target.value as DatosExpediente["etapa"])
            }
            className={INPUT}
          >
            {ETAPAS.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Valor estimado (MXN)">
          <input
            type="number"
            min={0}
            step={1000}
            value={datos.valorEstimado || ""}
            onChange={(e) => actualizar("valorEstimado", Number(e.target.value))}
            placeholder="980000"
            className={`${INPUT} font-mono`}
          />
        </Campo>

        <Campo etiqueta="Saldo de deuda (MXN)">
          <input
            type="number"
            min={0}
            step={1000}
            value={datos.saldoDeuda || ""}
            onChange={(e) => actualizar("saldoDeuda", Number(e.target.value))}
            placeholder="410000"
            className={`${INPUT} font-mono`}
          />
        </Campo>
      </div>

      <Campo etiqueta="Situación">
        <textarea
          value={datos.situacion}
          onChange={(e) => actualizar("situacion", e.target.value)}
          rows={2}
          placeholder="Estado de la deuda / motivo del traspaso"
          className={INPUT}
        />
      </Campo>

      <Campo etiqueta="Notas del asesor">
        <textarea
          value={datos.notas}
          onChange={(e) => actualizar("notas", e.target.value)}
          rows={2}
          placeholder="Notas internas, pendientes, acuerdos…"
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

/** Estilo base compartido de los campos de entrada. */
const INPUT =
  "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

/** Envoltorio etiqueta + control. */
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
