import { Encabezado } from "@/components/Encabezado";
import { VistaExpedientes } from "@/components/VistaExpedientes";
import { AccionesTablero } from "@/components/AccionesTablero";
import { supabaseServidor } from "@/lib/supabase/server";

/**
 * Panel de operación: tablero de expedientes de traspaso INFONAVIT.
 * Es la vista principal del BPM (Incremento 1).
 */
export default async function PaginaTablero() {
  // CÓDIGO DE DEPURACIÓN TEMPORAL
  try {
    const sb = supabaseServidor();
    const { data: perfiles } = await sb.from("perfiles").select("*");
    const { data: prospectos } = await sb.from("prospectos").select("*");
    const { data: expedientes } = await sb.from("expedientes").select("*");
    const fs = require("fs");
    fs.writeFileSync("debug-data.json", JSON.stringify({ perfiles, prospectos, expedientes }, null, 2));
  } catch (e: any) {
    const fs = require("fs");
    fs.writeFileSync("debug-data-error.json", JSON.stringify({ error: e.message || e }, null, 2));
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />

      <div className="mx-auto max-w-6xl px-4 pt-5">
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
