import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { listarFormularios } from "@/app/actions/formularios";

export const dynamic = "force-dynamic";

/** Panel de formularios (plantillas). */
export default async function PaginaFormularios() {
  const formularios = await listarFormularios();

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-4xl px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Formularios
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Plantillas que envías a los clientes para completar su expediente.
            </p>
          </div>
          <Link
            href="/formularios/nuevo"
            className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nuevo formulario
          </Link>
        </div>

        {formularios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
            Aún no hay formularios. Crea el primero con “+ Nuevo formulario”.
          </p>
        ) : (
          <div className="space-y-2">
            {formularios.map((f) => (
              <Link
                key={f.id}
                href={`/formularios/${f.id}/editar`}
                className="flex items-center justify-between gap-3 rounded-lg border border-carbon/10 bg-white p-4 transition hover:border-dorado hover:shadow-sm"
              >
                <div>
                  <p className="font-titular font-medium text-verde-profundo">
                    {f.titulo}
                  </p>
                  <p className="text-xs text-carbon/50">
                    {f.preguntas.length} pregunta
                    {f.preguntas.length === 1 ? "" : "s"} · {f.id}
                  </p>
                </div>
                <span className="text-sm text-sauce">Editar →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
