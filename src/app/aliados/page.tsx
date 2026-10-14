import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { AliadosClient } from "@/components/aliados/AliadosClient";

export const dynamic = "force-dynamic";

/** Menú Aliados: inmobiliarias y asesores externos que aportan casas a la asesoría de compra. */
export default async function PaginaAliados() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <main className="min-h-screen bg-carbon/5 pb-12">
      <div className="mx-auto max-w-[1400px] px-4 pt-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 text-base">🤝</span>
            <span className="font-titular text-xs font-bold uppercase tracking-wider text-orange-900">Asesoría de compra</span>
          </div>
          <h1 className="mt-1 font-titular text-3xl font-bold text-carbon">Aliados inmobiliarios</h1>
          <p className="mt-1 max-w-xl text-xs text-carbon/60">
            Solo los aliados con convenio de comisión compartida firmado reciben solicitudes de búsqueda. Cada aliado
            tiene un link permanente para subir casas desde su celular.
          </p>
        </div>
        <AliadosClient />
      </div>
    </main>
  );
}
