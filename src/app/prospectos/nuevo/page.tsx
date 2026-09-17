"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { FormularioProspecto } from "@/components/FormularioProspecto";
import { crearProspecto } from "@/app/actions/prospectos";

function ContenidoNuevoProspecto() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaIdQuery = searchParams.get("empresa_id");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href={empresaIdQuery ? `/empresas/${empresaIdQuery}` : "/prospectos"}
        className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
      >
        ← {empresaIdQuery ? "Volver a la Empresa" : "Volver a prospectos"}
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
          valorInicial={
            empresaIdQuery
              ? {
                  nombre: "",
                  primerApellido: "",
                  segundoApellido: "",
                  telefono: "",
                  correo: "",
                  direccion: "",
                  ciudad: "León, Gto.",
                  origen: "otro",
                  valorCampana: 0,
                  adName: "",
                  adsetName: "",
                  campaignName: "",
                  notas: "",
                  canalId: "",
                  estatus: "lead",
                  calificacion: "frio",
                  empresaId: empresaIdQuery,
                }
              : undefined
          }
          onCancelar={() =>
            router.push(empresaIdQuery ? `/empresas/${empresaIdQuery}` : "/prospectos")
          }
          onGuardar={async (datos) => {
            const nuevo = await crearProspecto(datos);
            if (empresaIdQuery) {
              router.push(`/empresas/${empresaIdQuery}`);
            } else {
              router.push(`/prospectos/${nuevo.id}`);
            }
          }}
        />
      </div>
    </div>
  );
}

/** Alta de un prospecto nuevo: /prospectos/nuevo */
export default function PaginaNuevoProspecto() {
  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <Suspense fallback={<div className="p-8 text-center text-sm text-carbon/50">Cargando formulario...</div>}>
        <ContenidoNuevoProspecto />
      </Suspense>
    </main>
  );
}
