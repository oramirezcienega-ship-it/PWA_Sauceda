"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarProspecto } from "@/app/actions/prospectos";

/** Botón para eliminar un prospecto, con confirmación en línea. */
export function EliminarProspecto({ id }: { id: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        className="rounded-md border border-rojo/30 bg-white px-3 py-1.5 text-xs text-rojo transition hover:bg-rojo/10"
      >
        Eliminar
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-rojo/30 bg-rojo/5 px-2 py-1 text-xs">
      <span className="text-carbon/70">¿Eliminar?</span>
      <button
        type="button"
        disabled={borrando}
        onClick={async () => {
          setBorrando(true);
          await eliminarProspecto(id);
          router.push("/prospectos");
          router.refresh();
        }}
        className="rounded bg-rojo px-2 py-1 font-medium text-crema hover:opacity-90 disabled:opacity-60"
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
  );
}
