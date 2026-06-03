"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { AutomatizacionBuilder } from "@/components/AutomatizacionBuilder";
import {
  actualizarAutomatizacion,
  eliminarAutomatizacion,
  obtenerAutomatizacion,
} from "@/app/actions/automatizaciones";
import type { DatosAutomatizacion } from "@/lib/types";

/** Editar automatización: /automatizaciones/[id]/editar */
export default function PaginaEditarAutomatizacion({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosAutomatizacion | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    obtenerAutomatizacion(params.id)
      .then((a) => {
        if (!a) {
          setNoEncontrado(true);
          return;
        }
        const { id, ...resto } = a;
        void id;
        setDatos(resto);
      })
      .catch(() => setNoEncontrado(true));
  }, [params.id]);

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/automatizaciones"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a automatizaciones
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Editar automatización
          </h1>
          <button
            type="button"
            onClick={async () => {
              await eliminarAutomatizacion(params.id);
              router.push("/automatizaciones");
            }}
            className="rounded-md border border-rojo/30 bg-white px-3 py-1.5 text-xs text-rojo transition hover:bg-rojo/10"
          >
            Eliminar
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          {noEncontrado ? (
            <p className="text-sm text-carbon/60">Automatización no encontrada.</p>
          ) : !datos ? (
            <p className="text-sm text-carbon/50">Cargando…</p>
          ) : (
            <AutomatizacionBuilder
              valorInicial={datos}
              textoBoton="Guardar cambios"
              onCancelar={() => router.push("/automatizaciones")}
              onGuardar={async (nuevos) => {
                await actualizarAutomatizacion(params.id, nuevos);
                router.push("/automatizaciones");
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
