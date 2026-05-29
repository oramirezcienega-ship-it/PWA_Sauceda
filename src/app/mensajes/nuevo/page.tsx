"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioMensaje } from "@/components/FormularioMensaje";
import { crearMensaje } from "@/app/actions/mensajes";

/** Crear mensaje: /mensajes/nuevo */
export default function PaginaNuevoMensaje() {
  const router = useRouter();
  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/mensajes"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a mensajes
        </Link>
        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo mensaje
        </h1>
        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <FormularioMensaje
            textoBoton="Crear mensaje"
            onCancelar={() => router.push("/mensajes")}
            onGuardar={async (datos) => {
              await crearMensaje(datos);
              router.push("/mensajes");
            }}
          />
        </div>
      </div>
    </main>
  );
}
