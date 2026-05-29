import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { TablaProspectos } from "@/components/TablaProspectos";
import { listarProspectos } from "@/app/actions/prospectos";

export const dynamic = "force-dynamic";

/** Lista de prospectos (CRM). */
export default async function PaginaProspectos() {
  let prospectos;
  try {
    prospectos = await listarProspectos();
  } catch {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Prospectos
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            No se pudo cargar el módulo de prospectos. Si es la primera vez,
            corre la migración <span className="font-mono">0002_prospectos.sql</span>{" "}
            en Supabase.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-6xl px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Prospectos
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Personas captadas y su origen de adquisición.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/prospectos/importar"
              className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition hover:border-sauce hover:text-sauce"
            >
              Importar CSV
            </Link>
            <Link
              href="/prospectos/nuevo"
              className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
            >
              + Nuevo prospecto
            </Link>
          </div>
        </div>

        <p className="mb-3 text-sm text-carbon/60">
          <span className="font-mono font-medium text-verde-profundo">
            {prospectos.length}
          </span>{" "}
          prospecto{prospectos.length === 1 ? "" : "s"}
        </p>

        {prospectos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
            Aún no hay prospectos. Crea el primero con “+ Nuevo prospecto”.
          </p>
        ) : (
          <TablaProspectos prospectos={prospectos} />
        )}
      </div>
    </main>
  );
}
