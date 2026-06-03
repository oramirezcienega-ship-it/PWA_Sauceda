"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { AutomatizacionBuilder } from "@/components/AutomatizacionBuilder";
import { crearAutomatizacion } from "@/app/actions/automatizaciones";

/** Crear automatización: /automatizaciones/nuevo */
export default function PaginaNuevaAutomatizacion() {
  const router = useRouter();

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

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nueva automatización
        </h1>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <AutomatizacionBuilder
            textoBoton="Crear automatización"
            onCancelar={() => router.push("/automatizaciones")}
            onGuardar={async (datos) => {
              await crearAutomatizacion(datos);
              router.push("/automatizaciones");
            }}
          />
        </div>
      </div>
    </main>
  );
}
