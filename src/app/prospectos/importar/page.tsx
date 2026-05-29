"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { ImportadorCSV } from "@/components/ImportadorCSV";
import { importarProspectos } from "@/app/actions/prospectos";

const PLANTILLA =
  "nombre,primer_apellido,segundo_apellido,telefono,correo,direccion,ciudad,origen,valor_campana\n" +
  "Juan,Pérez,López,477 111 2233,juan@correo.com,Calle 1,León,facebook,350\n";

/** Importación de prospectos por CSV: /prospectos/importar */
export default function PaginaImportarProspectos() {
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
          Importar prospectos
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Sube un archivo CSV. Solo <strong>nombre</strong> es obligatorio.
          El <strong>origen</strong> debe ser: whatsapp, facebook, instagram,
          recomendacion, sitio-web, volante u otro.
        </p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <ImportadorCSV
            columnas={[
              { clave: "nombre", requerido: true },
              { clave: "primer_apellido" },
              { clave: "segundo_apellido" },
              { clave: "telefono" },
              { clave: "correo" },
              { clave: "direccion" },
              { clave: "ciudad" },
              { clave: "origen" },
              { clave: "valor_campana" },
            ]}
            plantilla={PLANTILLA}
            onImportar={importarProspectos}
            onListo={() => router.push("/prospectos")}
          />
        </div>
      </div>
    </main>
  );
}
