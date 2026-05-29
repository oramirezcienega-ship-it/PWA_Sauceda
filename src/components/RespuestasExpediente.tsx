"use client";

import { useEffect, useState } from "react";
import {
  listarEnviosDeExpediente,
  urlArchivoFormulario,
} from "@/app/actions/formularios";
import type { EnvioConFormulario } from "@/lib/types";

/**
 * "Información recopilada": muestra las respuestas de los formularios que el
 * cliente ya contestó, agrupadas junto a la información del expediente.
 */
export function RespuestasExpediente({
  expedienteId,
}: {
  expedienteId: string;
}) {
  const [respondidos, setRespondidos] = useState<EnvioConFormulario[]>([]);

  useEffect(() => {
    listarEnviosDeExpediente(expedienteId)
      .then((envios) =>
        setRespondidos(envios.filter((e) => e.estado === "respondido")),
      )
      .catch(() => setRespondidos([]));
  }, [expedienteId]);

  if (respondidos.length === 0) return null;

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
        Información recopilada
      </p>
      <div className="space-y-4">
        {respondidos.map((env) => (
          <div key={env.id}>
            <p className="mb-1 text-sm font-medium text-verde-profundo">
              {env.formulario.titulo}
            </p>
            <dl className="space-y-1 text-sm">
              {env.formulario.preguntas.map((p) => (
                <div key={p.id}>
                  <dt className="text-xs text-carbon/50">{p.etiqueta}</dt>
                  <dd className="text-carbon/80">
                    {!env.respuestas[p.id] ? (
                      "—"
                    ) : p.tipo === "archivo" ? (
                      <span className="flex flex-wrap gap-2">
                        {env.respuestas[p.id]
                          .split(",")
                          .filter(Boolean)
                          .map((ruta, i) => (
                            <button
                              key={ruta}
                              type="button"
                              onClick={async () => {
                                const url = await urlArchivoFormulario(ruta);
                                window.open(url, "_blank");
                              }}
                              className="text-sauce underline hover:text-verde-profundo"
                            >
                              Ver archivo {i + 1}
                            </button>
                          ))}
                      </span>
                    ) : (
                      env.respuestas[p.id]
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
