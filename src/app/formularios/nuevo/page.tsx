"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioBuilder } from "@/components/FormularioBuilder";
import { crearFormulario } from "@/app/actions/formularios";

/** Crear formulario: /formularios/nuevo */
export default function PaginaNuevoFormulario() {
  const router = useRouter();

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

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo formulario
        </h1>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <FormularioBuilder
            textoBoton="Crear formulario"
            onCancelar={() => router.push("/formularios")}
            onGuardar={async (datos) => {
              await crearFormulario(datos);
              router.push("/formularios");
            }}
          />
        </div>
      </div>
    </main>
  );
}
