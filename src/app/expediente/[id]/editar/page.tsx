"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioExpediente } from "@/components/FormularioExpediente";
import { useExpedientes } from "@/context/expedientes-context";
import { listarProspectosMin } from "@/app/actions/prospectos";
import { actualizarExpedienteSeguro } from "@/app/actions/expedientes";

/**
 * Edición de un expediente existente: /expediente/[id]/editar
 */
export default function PaginaEditar({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { obtenerExpediente, cargado, recargar } = useExpedientes();
  const expediente = obtenerExpediente(params.id);
  const [prospectos, setProspectos] = useState<
    { id: string; nombre: string }[]
  >([]);

  useEffect(() => {
    listarProspectosMin().then(setProspectos).catch(() => setProspectos([]));
  }, []);

  // Mientras carga el estado persistido, evitamos mostrar "no encontrado".
  if (!expediente) {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="font-titular text-2xl text-verde-profundo">
            {cargado ? "Expediente no encontrado" : "Cargando…"}
          </p>
          {cargado && (
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-sauce px-4 py-2 text-sm text-crema hover:bg-verde-profundo"
            >
              ← Volver al tablero
            </Link>
          )}
        </div>
      </main>
    );
  }

  // Separamos los campos que administra la app de los editables.
  const { id, ultimoMovimiento, ...datos } = expediente;
  void ultimoMovimiento; // no se edita manualmente

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href={`/expediente/${id}`}
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver al expediente
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Editar expediente
        </h1>
        <p className="mt-1 font-mono text-xs text-carbon/40">{id}</p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <FormularioExpediente
            valorInicial={datos}
            prospectos={prospectos}
            textoBoton="Guardar cambios"
            onCancelar={() => router.push(`/expediente/${id}`)}
            onGuardar={async (nuevos) => {
              const res = await actualizarExpedienteSeguro(id, nuevos);
              if (!res.ok) {
                throw new Error(res.error);
              }
              // Refrescar el contexto con los datos actualizados
              await recargar();
              router.push(`/expediente/${id}`);
            }}
          />
        </div>
      </div>
    </main>
  );
}
