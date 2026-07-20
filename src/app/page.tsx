import { redirect } from "next/navigation";
import { rolUsuarioActual } from "@/app/actions/usuarios";
import { Encabezado } from "@/components/Encabezado";
import { VistaExpedientes } from "@/components/VistaExpedientes";
import { AccionesTablero } from "@/components/AccionesTablero";

export const dynamic = "force-dynamic";

/**
 * Panel de operación: tablero de expedientes de traspaso INFONAVIT.
 * Es la vista principal del BPM (Incremento 1).
 */
export default async function PaginaTablero() {
  const rol = await rolUsuarioActual();
  if (rol === "asesor" || rol === "operaciones") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />

      <div className="mx-auto max-w-[1700px] px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Panel de operación
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Tablero de expedientes de traspaso INFONAVIT · León, Gto.
            </p>
          </div>
          <AccionesTablero />
        </div>

        <VistaExpedientes />
      </div>
    </main>
  );
}
