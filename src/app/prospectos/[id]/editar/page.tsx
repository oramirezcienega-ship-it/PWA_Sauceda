"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioProspecto } from "@/components/FormularioProspecto";
import {
  actualizarProspecto,
  obtenerProspecto,
} from "@/app/actions/prospectos";
import type { DatosProspecto } from "@/lib/types";

/** Edición de un prospecto: /prospectos/[id]/editar */
export default function PaginaEditarProspecto({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosProspecto | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    obtenerProspecto(params.id)
      .then((res) => {
        if (!res) {
          setNoEncontrado(true);
          return;
        }
        // Quitamos el id; el resto son los datos editables.
        const { id, ...resto } = res.prospecto;
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
          href={`/prospectos/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver al prospecto
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Editar prospecto
        </h1>
        <p className="mt-1 font-mono text-xs text-carbon/40">{params.id}</p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          {noEncontrado ? (
            <p className="text-sm text-carbon/60">Prospecto no encontrado.</p>
          ) : !datos ? (
            <p className="text-sm text-carbon/50">Cargando…</p>
          ) : (
            <FormularioProspecto
              valorInicial={datos}
              textoBoton="Guardar cambios"
              onCancelar={() => router.push(`/prospectos/${params.id}`)}
              onGuardar={async (nuevos) => {
                await actualizarProspecto(params.id, nuevos);
                router.push(`/prospectos/${params.id}`);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
