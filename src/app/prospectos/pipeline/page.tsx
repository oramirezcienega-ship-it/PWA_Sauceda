import { listarProspectos } from "@/app/actions/prospectos";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import { PipelineProspectosClient } from "@/components/PipelineProspectosClient";

export const dynamic = "force-dynamic";

/** Página dedicada al Pipeline comercial de prospectos con Drag & Drop. */
export default async function PaginaPipelineProspectos() {
  const prospectos = await listarProspectos();
  const perfiles = await listarPerfilesActivos();

  return (
    <main className="min-h-screen pb-10">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <PipelineProspectosClient
          prospectosIniciales={prospectos}
          perfiles={perfiles}
        />
      </div>
    </main>
  );
}
