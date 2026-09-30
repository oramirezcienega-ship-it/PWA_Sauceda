"use client";

import { useEffect, useState } from "react";
import { CabinaCoordinacionInspeccion } from "./CabinaCoordinacionInspeccion";
import {
  obtenerDatosCoordinacionProspecto,
  type DatosCoordinacionProspecto,
} from "@/app/actions/coordinacion-desde-chat";

/**
 * Abre la Cabina de Coordinación de Inspección (2 asesores + SLA) para el
 * prospecto de una conversación, sin salir del chat.
 */
export function ModalCoordinarInspeccion({
  prospectoId,
  alCerrar,
}: {
  prospectoId: string;
  alCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosCoordinacionProspecto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    obtenerDatosCoordinacionProspecto(prospectoId).then((r) => {
      if (cancelado) return;
      if (r.ok && r.datos) setDatos(r.datos);
      else setError(r.error || "No se pudieron cargar los datos.");
    });
    return () => {
      cancelado = true;
    };
  }, [prospectoId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-carbon/60 p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl my-4">
        <button
          type="button"
          onClick={alCerrar}
          className="absolute -top-1 right-0 z-10 rounded-full bg-white border border-carbon/15 shadow px-3 py-1 text-xs font-bold text-carbon hover:bg-slate-50"
        >
          ✕ Cerrar
        </button>

        {error ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-rojo border border-rojo/20">⚠️ {error}</div>
        ) : !datos ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-carbon/60">Cargando datos del prospecto…</div>
        ) : (
          <CabinaCoordinacionInspeccion
            prospectoId={datos.prospectoId}
            expedienteId={datos.expedienteId}
            clienteNombre={datos.clienteNombre}
            clienteTelefono={datos.clienteTelefono}
            tipoNegocioInicial={datos.tipoNegocioInicial}
            ubicacionInicial={datos.ubicacionInicial}
            detallesIniciales={datos.detallesIniciales}
            perfiles={datos.perfiles}
            asesorPredefinidoId={datos.asesorPredefinidoId}
            operadorPredefinidoId={datos.operadorPredefinidoId}
          />
        )}
      </div>
    </div>
  );
}
