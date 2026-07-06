"use client";

import { useState } from "react";

interface Props {
  entidadId: string;
  tipo: "expediente" | "prospecto";
  noViable: boolean;
  onCambio?: () => void;
}

export function BotonNoViable({ entidadId, tipo, noViable, onCambio }: Props) {
  const [estado, setEstado] = useState(noViable);
  const [cargando, setCargando] = useState(false);

  async function toggle() {
    const nuevoValor = !estado;
    const accion = nuevoValor
      ? `¿Marcar como No Viable? Este contacto no volverá a ser contactado por ninguna secuencia.`
      : `¿Quitar la marca de No Viable? El contacto podrá volver a enrolarse en secuencias.`;
    if (!confirm(accion)) return;

    setCargando(true);
    try {
      if (tipo === "expediente") {
        const { marcarExpedienteNoViable } = await import("@/app/actions/expedientes");
        await marcarExpedienteNoViable(entidadId, nuevoValor);
      } else {
        const { marcarProspectoNoViable } = await import("@/app/actions/prospectos");
        await marcarProspectoNoViable(entidadId, nuevoValor);
      }
      setEstado(nuevoValor);
      onCambio?.();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setCargando(false);
    }
  }

  if (estado) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-rojo/10 border border-rojo/30 px-2.5 py-0.5 text-[11px] font-bold text-rojo">
          🚫 No viable
        </span>
        <button
          onClick={toggle}
          disabled={cargando}
          className="text-[10px] text-carbon/40 hover:text-carbon/70 underline disabled:opacity-50"
        >
          {cargando ? "…" : "Reactivar"}
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={cargando}
      className="inline-flex items-center gap-1 rounded-full border border-carbon/15 bg-white px-2 py-0.5 text-[10px] font-medium text-carbon/50 hover:border-rojo/40 hover:text-rojo transition disabled:opacity-50"
    >
      {cargando ? "…" : "🚫 Marcar No viable"}
    </button>
  );
}
