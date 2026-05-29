"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { ImportadorCSV } from "@/components/ImportadorCSV";
import { importarExpedientes } from "@/app/actions/expedientes";

const PLANTILLA =
  "nombre,primer_apellido,segundo_apellido,fraccionamiento,telefono,etapa,situacion,valor_estimado,saldo_deuda,notas\n" +
  "Juan,Pérez,López,Brisas del Campestre,477 111 2233,nuevo-lead,Quiere traspasar,950000,400000,\n";

/** Importación de expedientes por CSV: /expediente/importar */
export default function PaginaImportarExpedientes() {
  const router = useRouter();

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver al panel
        </Link>

        <h1 className="mt-4 font-titular text-3xl font-semibold text-verde-profundo">
          Importar expedientes
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Sube un archivo CSV. Solo <strong>nombre</strong> y{" "}
          <strong>fraccionamiento</strong> son obligatorios.
        </p>

        <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-5">
          <ImportadorCSV
            columnas={[
              { clave: "nombre", requerido: true },
              { clave: "primer_apellido" },
              { clave: "segundo_apellido" },
              { clave: "fraccionamiento", requerido: true },
              { clave: "telefono" },
              { clave: "etapa" },
              { clave: "situacion" },
              { clave: "valor_estimado" },
              { clave: "saldo_deuda" },
              { clave: "notas" },
            ]}
            plantilla={PLANTILLA}
            onImportar={importarExpedientes}
            onListo={() => router.push("/")}
          />
        </div>
      </div>
    </main>
  );
}
