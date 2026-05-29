"use client";

import { useState } from "react";
import {
  responderFormulario,
  subirArchivoFormulario,
} from "@/app/actions/formularios";
import { aplicarParametros } from "@/lib/parametros";
import type { EnvioConFormulario, Pregunta } from "@/lib/types";

/**
 * Formularios pendientes que el cliente llena desde su portal.
 * Cada respuesta se valida por el token del expediente.
 */
export function FormulariosCliente({
  token,
  envios,
  parametros = {},
}: {
  token: string;
  envios: EnvioConFormulario[];
  parametros?: Record<string, string>;
}) {
  if (envios.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
        Formularios
      </p>
      {envios.map((envio) => (
        <TarjetaFormulario
          key={envio.id}
          token={token}
          envio={envio}
          parametros={parametros}
        />
      ))}
    </div>
  );
}

function TarjetaFormulario({
  token,
  envio,
  parametros,
}: {
  token: string;
  envio: EnvioConFormulario;
  parametros: Record<string, string>;
}) {
  const titulo = aplicarParametros(envio.formulario.titulo, parametros);
  const descripcion = aplicarParametros(
    envio.formulario.descripcion,
    parametros,
  );
  const [respuestas, setRespuestas] = useState<Record<string, string>>(
    envio.respuestas ?? {},
  );
  const [enviado, setEnviado] = useState(envio.estado === "respondido");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function set(id: string, valor: string) {
    setRespuestas((r) => ({ ...r, [id]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const faltan = envio.formulario.preguntas.filter(
      (p) => p.requerido && !(respuestas[p.id] ?? "").trim(),
    );
    if (faltan.length > 0) {
      setError("Por favor responde las preguntas obligatorias.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await responderFormulario(token, envio.id, respuestas);
      setEnviado(true);
    } catch {
      setError("No se pudo enviar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-sauce/30 bg-sauce/5 p-5">
        <p className="font-titular text-lg font-semibold text-verde-profundo">
          {titulo}
        </p>
        <p className="mt-1 text-sm text-sauce">✓ ¡Gracias! Ya recibimos tus respuestas.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="rounded-2xl border border-dorado/40 bg-white p-5"
    >
      <p className="font-titular text-lg font-semibold text-verde-profundo">
        {titulo}
      </p>
      {descripcion && (
        <p className="mt-1 text-sm text-carbon/60">{descripcion}</p>
      )}

      <div className="mt-4 space-y-3">
        {envio.formulario.preguntas.map((p) => (
          <CampoPregunta
            key={p.id}
            token={token}
            pregunta={p}
            etiqueta={aplicarParametros(p.etiqueta, parametros)}
            valor={respuestas[p.id] ?? ""}
            onChange={(v) => set(p.id, v)}
          />
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-4 w-full rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar respuestas"}
      </button>
    </form>
  );
}

function CampoPregunta({
  token,
  pregunta,
  etiqueta,
  valor,
  onChange,
}: {
  token: string;
  pregunta: Pregunta;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  const base =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  return (
    <label className="block">
      <span className="mb-1 block text-sm text-carbon/80">
        {etiqueta}
        {pregunta.requerido && <span className="ml-0.5 text-rojo">*</span>}
      </span>

      {pregunta.tipo === "texto-largo" ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={base}
        />
      ) : pregunta.tipo === "numero" ? (
        <input
          type="number"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} font-mono`}
        />
      ) : pregunta.tipo === "fecha" ? (
        <input
          type="date"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      ) : pregunta.tipo === "archivo" ? (
        <CampoArchivo token={token} valor={valor} onChange={onChange} />
      ) : pregunta.tipo === "si-no" ? (
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">Selecciona…</option>
          <option value="Sí">Sí</option>
          <option value="No">No</option>
        </select>
      ) : pregunta.tipo === "opcion-multiple" ? (
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">Selecciona…</option>
          {pregunta.opciones.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}
    </label>
  );
}

/** Campo de subida de archivos (PDF/fotos) para el portal del cliente. */
function CampoArchivo({
  token,
  valor,
  onChange,
}: {
  token: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rutas = valor ? valor.split(",").filter(Boolean) : [];

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    if (archivos.length === 0) return;
    setSubiendo(true);
    setError(null);
    try {
      const nuevas = await Promise.all(
        archivos.map(async (archivo) => {
          const fd = new FormData();
          fd.append("archivo", archivo);
          return subirArchivoFormulario(token, fd);
        }),
      );
      onChange([...rutas, ...nuevas].join(","));
    } catch {
      setError("No se pudo subir alguno de los archivos.");
    } finally {
      setSubiendo(false);
      e.target.value = ""; // permite volver a seleccionar/agregar más
    }
  }

  return (
    <div>
      {/* Sin "capture": el celular ofrece Cámara, Galería o Archivos. */}
      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={subir}
        className="block w-full text-sm text-carbon/70 file:mr-3 file:rounded-md file:border-0 file:bg-sauce file:px-3 file:py-2 file:text-sm file:text-crema"
      />
      <p className="mt-1 text-[11px] text-carbon/50">
        Puedes tomar foto, elegir de tu galería o subir un PDF. Se pueden
        agregar varios.
      </p>
      {subiendo && <p className="mt-1 text-xs text-carbon/50">Subiendo…</p>}
      {!subiendo && rutas.length > 0 && (
        <p className="mt-1 text-xs text-sauce">
          ✓ {rutas.length} archivo{rutas.length === 1 ? "" : "s"} cargado
          {rutas.length === 1 ? "" : "s"}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-rojo">{error}</p>}
    </div>
  );
}
