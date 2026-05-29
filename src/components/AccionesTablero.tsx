"use client";

import { useState } from "react";
import Link from "next/link";
import { useExpedientes } from "@/context/expedientes-context";

/**
 * Acciones del encabezado del tablero: crear un expediente nuevo y
 * restablecer los datos de ejemplo (útil para demos, ya que el estado
 * ahora persiste en el navegador).
 */
export function AccionesTablero() {
  const { restablecerMock } = useExpedientes();
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/expediente/nuevo"
        className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
      >
        + Nuevo expediente
      </Link>

      {!confirmar ? (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-xs text-carbon/60 transition hover:border-carbon/30"
          title="Vuelve a los 6 expedientes de ejemplo"
        >
          Restablecer ejemplo
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-md border border-dorado/40 bg-dorado/10 px-2 py-1 text-xs">
          <span className="text-carbon/70">¿Restablecer?</span>
          <button
            type="button"
            onClick={() => {
              restablecerMock();
              setConfirmar(false);
            }}
            className="rounded bg-verde-profundo px-2 py-1 font-medium text-crema hover:opacity-90"
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => setConfirmar(false)}
            className="rounded px-2 py-1 text-carbon/60 hover:text-carbon"
          >
            No
          </button>
        </span>
      )}
    </div>
  );
}
