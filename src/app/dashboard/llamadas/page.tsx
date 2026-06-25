import { Encabezado } from "@/components/Encabezado";
import { TablaLlamadas } from "@/components/TablaLlamadas";
import { listarLlamadasConmutador, type LlamadaConmutadorApp } from "@/app/actions/llamadas";

export const dynamic = "force-dynamic";

export default async function PaginaLlamadas() {
  let llamadas: LlamadaConmutadorApp[] = [];
  let errorMensaje = "";

  try {
    llamadas = await listarLlamadasConmutador();
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : "Error al obtener historial de llamadas";
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <div className="mb-6">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Historial del Conmutador
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            Registro de llamadas telefónicas, grabaciones oficiales e interacciones del Voice Bot.
          </p>
        </div>

        {errorMensaje ? (
          <p className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            {errorMensaje}
          </p>
        ) : (
          <TablaLlamadas inicial={llamadas} />
        )}
      </div>
    </main>
  );
}
