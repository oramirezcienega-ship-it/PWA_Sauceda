import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { listarMensajes } from "@/app/actions/mensajes";

export const dynamic = "force-dynamic";

/** Panel de mensajes (plantillas). */
export default async function PaginaMensajes() {
  let mensajes;
  try {
    mensajes = await listarMensajes();
  } catch {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-4xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Mensajes
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            No se pudo cargar el módulo de mensajes. Si es la primera vez, corre
            la migración{" "}
            <span className="font-mono">0007_mensajes.sql</span> en Supabase.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-4xl px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Mensajes
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Plantillas de mensajes que envías a los clientes.
            </p>
          </div>
          <Link
            href="/mensajes/nuevo"
            className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nuevo mensaje
          </Link>
        </div>

        {mensajes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
            Aún no hay mensajes. Crea el primero con “+ Nuevo mensaje”.
          </p>
        ) : (
          <div className="space-y-2">
            {mensajes.map((m) => (
              <Link
                key={m.id}
                href={`/mensajes/${m.id}/editar`}
                className="block rounded-lg border border-carbon/10 bg-white p-4 transition hover:border-dorado hover:shadow-sm"
              >
                <p className="font-titular font-medium text-verde-profundo">
                  {m.titulo}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-carbon/60">
                  {m.texto}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
