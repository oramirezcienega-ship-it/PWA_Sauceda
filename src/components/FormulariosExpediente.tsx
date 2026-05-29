"use client";

import { useEffect, useState } from "react";
import {
  eliminarEnvio,
  enviarFormulario,
  listarEnviosDeExpediente,
  listarFormularios,
} from "@/app/actions/formularios";
import type { EnvioConFormulario, Formulario } from "@/lib/types";

/**
 * Bloque del detalle del expediente para enviar formularios al cliente y
 * ver el estado/respuestas de los enviados.
 */
export function FormulariosExpediente({
  expedienteId,
}: {
  expedienteId: string;
}) {
  const [plantillas, setPlantillas] = useState<Formulario[]>([]);
  const [envios, setEnvios] = useState<EnvioConFormulario[]>([]);
  const [seleccion, setSeleccion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const [p, e] = await Promise.all([
      listarFormularios().catch(() => []),
      listarEnviosDeExpediente(expedienteId).catch(() => []),
    ]);
    setPlantillas(p);
    setEnvios(e);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId]);

  async function enviar() {
    if (!seleccion) return;
    setEnviando(true);
    setAviso(null);
    try {
      const res = await enviarFormulario(expedienteId, seleccion);
      if (!res.ok) {
        setAviso(res.mensaje ?? "No se pudo enviar.");
        return;
      }
      setSeleccion("");
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
        Formularios del cliente
      </p>

      {/* Enviar uno nuevo */}
      {plantillas.length === 0 ? (
        <p className="text-sm text-carbon/50">
          No hay plantillas. Crea una en la sección Formularios.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={seleccion}
            onChange={(e) => setSeleccion(e.target.value)}
            className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm"
          >
            <option value="">Elegir formulario…</option>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={enviar}
            disabled={!seleccion || enviando}
            className="rounded-md bg-sauce px-3 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar al cliente"}
          </button>
        </div>
      )}

      {aviso && (
        <p className="mt-2 rounded-md border border-dorado/40 bg-dorado/10 px-3 py-2 text-xs text-[#8a7233]">
          {aviso}
        </p>
      )}

      {/* Envíos existentes */}
      {envios.length > 0 && (
        <ul className="mt-4 space-y-3">
          {envios.map((env) => (
            <li
              key={env.id}
              className="rounded-lg border border-carbon/10 bg-crema/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-verde-profundo">
                  {env.formulario.titulo}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      env.estado === "respondido"
                        ? "bg-sauce/20 text-verde-profundo"
                        : "bg-dorado/20 text-[#8a7233]"
                    }`}
                  >
                    {env.estado === "respondido" ? "Respondido" : "Pendiente"}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await eliminarEnvio(env.id);
                      await cargar();
                    }}
                    className="text-xs text-rojo/70 hover:text-rojo"
                    title="Retirar este formulario del cliente"
                  >
                    Retirar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
