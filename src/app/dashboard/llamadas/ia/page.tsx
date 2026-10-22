import { Encabezado } from "@/components/Encabezado";
import { PestanasLlamadas } from "@/components/PestanasLlamadas";
import { LlamadasIA } from "@/components/LlamadasIA";
import {
  listarLlamadasIA,
  obtenerConfiguracionLlamadasIA,
  type ConfiguracionLlamadasIA,
} from "@/app/actions/llamadas-ia";
import type { LlamadaIA } from "@/features/llamadas-ia/service";

export const dynamic = "force-dynamic";

export default async function PaginaLlamadasIA() {
  let llamadas: LlamadaIA[] = [];
  let config: ConfiguracionLlamadasIA | null = null;
  let errorMensaje = "";

  try {
    [llamadas, config] = await Promise.all([listarLlamadasIA(), obtenerConfiguracionLlamadasIA()]);
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : "Error al obtener las llamadas IA";
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <PestanasLlamadas />
        <div className="mb-6">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">Llamadas IA</h1>
          <p className="mt-1 text-sm text-carbon/60">
            Sofía llama por Vapi para dar seguimiento a cotizaciones enviadas. Nada se marca sin aprobación.
          </p>
        </div>

        {errorMensaje || !config ? (
          <p className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">{errorMensaje}</p>
        ) : (
          <LlamadasIA inicial={llamadas} config={config} />
        )}
      </div>
    </main>
  );
}
