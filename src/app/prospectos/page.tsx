import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { listarProspectos } from "@/app/actions/prospectos";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** Lista de prospectos (CRM). */
export default async function PaginaProspectos() {
  const prospectos = await listarProspectos();

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
          <Link
            href="/prospectos/nuevo"
            className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nuevo prospecto
          </Link>
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
          <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-carbon/10 bg-crema/60 text-left">
                  <Th>Prospecto</Th>
                  <Th>Teléfono</Th>
                  <Th>Ciudad</Th>
                  <Th>Origen</Th>
                  <Th alineado="derecha">Valor campaña</Th>
                </tr>
              </thead>
              <tbody>
                {prospectos.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-carbon/5 transition hover:bg-crema/40"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/prospectos/${p.id}`}
                        className="font-titular font-medium text-verde-profundo hover:text-sauce"
                      >
                        {p.nombre}
                      </Link>
                      <span className="ml-2 font-mono text-[10px] text-carbon/40">
                        {p.id}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-carbon/70">
                      {p.telefono || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-carbon/70">
                      {p.ciudad || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-xs text-cielo">
                        {ORIGEN_POR_ID[p.origen]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-carbon/70">
                      {formatoPesos(p.valorCampana)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Th({
  children,
  alineado = "izquierda",
}: {
  children: React.ReactNode;
  alineado?: "izquierda" | "derecha";
}) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-carbon/50 ${
        alineado === "derecha" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
