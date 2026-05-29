"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioProspecto } from "@/components/FormularioProspecto";
import { crearProspecto } from "@/app/actions/prospectos";

/** Alta de un prospecto nuevo: /prospectos/nuevo */
export default function PaginaNuevoProspecto() {
  const router = useRouter();

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/prospectos"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a prospectos
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Nuevo prospecto
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Registra una persona y su origen de adquisición.
        </p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <FormularioProspecto
            textoBoton="Crear prospecto"
            onCancelar={() => router.push("/prospectos")}
            onGuardar={async (datos) => {
              const nuevo = await crearProspecto(datos);
              router.push(`/prospectos/${nuevo.id}`);
            }}
          />
        </div>
      </div>
    </main>
  );
}
