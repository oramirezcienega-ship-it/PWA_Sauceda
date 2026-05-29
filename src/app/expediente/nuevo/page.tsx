"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioExpediente } from "@/components/FormularioExpediente";
import { useExpedientes } from "@/context/expedientes-context";

/**
 * Alta de un expediente nuevo: /expediente/nuevo
 * (Next.js prioriza esta ruta estática sobre la dinámica /expediente/[id].)
 */
export default function PaginaNuevo() {
  const router = useRouter();
  const { crearExpediente } = useExpedientes();

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver al tablero
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo expediente
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Da de alta un lead de traspaso INFONAVIT.
        </p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <FormularioExpediente
            textoBoton="Crear expediente"
            onCancelar={() => router.push("/")}
            onGuardar={async (datos) => {
              const id = await crearExpediente(datos);
              router.push(`/expediente/${id}`);
            }}
          />
        </div>
      </div>
    </main>
  );
}
