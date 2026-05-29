"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioBuilder } from "@/components/FormularioBuilder";
import {
  actualizarFormulario,
  eliminarFormulario,
  obtenerFormulario,
} from "@/app/actions/formularios";
import type { DatosFormulario } from "@/lib/types";

/** Editar formulario: /formularios/[id]/editar */
export default function PaginaEditarFormulario({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosFormulario | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    obtenerFormulario(params.id)
      .then((f) => {
        if (!f) {
          setNoEncontrado(true);
          return;
        }
        const { id, ...resto } = f;
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
          href="/formularios"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a formularios
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Editar formulario
          </h1>
          <button
            type="button"
            onClick={async () => {
              await eliminarFormulario(params.id);
              router.push("/formularios");
            }}
            className="rounded-md border border-rojo/30 bg-white px-3 py-1.5 text-xs text-rojo transition hover:bg-rojo/10"
          >
            Eliminar
          </button>
        </div>
        <p className="mt-1 font-mono text-xs text-carbon/40">{params.id}</p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          {noEncontrado ? (
            <p className="text-sm text-carbon/60">Formulario no encontrado.</p>
          ) : !datos ? (
            <p className="text-sm text-carbon/50">Cargando…</p>
          ) : (
            <FormularioBuilder
              valorInicial={datos}
              textoBoton="Guardar cambios"
              onCancelar={() => router.push("/formularios")}
              onGuardar={async (nuevos) => {
                await actualizarFormulario(params.id, nuevos);
                router.push("/formularios");
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
