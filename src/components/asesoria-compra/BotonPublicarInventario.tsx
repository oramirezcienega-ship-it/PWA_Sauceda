"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { publicarAlInventario, obtenerInmuebleDeExpediente } from "@/app/actions/asesoria-compra";
import { ETIQUETA_ESTATUS_INMUEBLE, type EstatusInmueble } from "@/lib/asesoria/inmuebles";

/** Botón "Publicar al inventario" en el expediente del vendedor (promoción / traspaso). */
export function BotonPublicarInventario({ expedienteId }: { expedienteId: string }) {
  const [actual, setActual] = useState<{ folio: string; estatus: EstatusInmueble } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    obtenerInmuebleDeExpediente(expedienteId).then(setActual).catch(() => setActual(null));
  }, [expedienteId]);

  async function publicar() {
    setTrabajando(true);
    const r = await publicarAlInventario(expedienteId);
    setTrabajando(false);
    if (!r.ok) {
      setMensaje(r.mensaje || "No se pudo publicar.");
    } else if (r.omitidos.length > 0) {
      setMensaje(`No se publicó: ${r.omitidos[0].motivo}. Llena la ficha de la propiedad y el valor estimado.`);
    } else {
      setMensaje(r.creados ? "Publicado al inventario." : "Inventario actualizado con los datos del expediente.");
    }
    setActual(await obtenerInmuebleDeExpediente(expedienteId));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 text-sm">
      <span className="text-lg">🏘️</span>
      <div className="flex-1">
        <p className="font-semibold text-violet-900">Inventario para compradores</p>
        <p className="text-xs text-carbon/60">
          {actual ? (
            <>
              En inventario como <Link href="/inventario" className="font-mono underline">{actual.folio}</Link> ·{" "}
              {ETIQUETA_ESTATUS_INMUEBLE[actual.estatus]}
            </>
          ) : (
            "Publica esta casa para ofrecerla a los compradores de asesoría (sin compartir comisión)."
          )}
        </p>
        {mensaje && <p className="mt-1 text-xs text-violet-900">{mensaje}</p>}
      </div>
      <button
        type="button"
        onClick={publicar}
        disabled={trabajando}
        className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
      >
        {trabajando ? "Publicando…" : actual ? "Actualizar en inventario" : "Publicar al inventario"}
      </button>
    </div>
  );
}
