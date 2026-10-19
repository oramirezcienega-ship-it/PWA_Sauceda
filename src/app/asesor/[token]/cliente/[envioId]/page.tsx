import type { Metadata } from "next";
import { obtenerClientePortalAsesor } from "@/app/actions/portal-asesor";
import { RetroClienteAsesor } from "@/components/PortalAsesor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: { token: string; envioId: string };
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: "SAUCEDA · Retro del cliente",
    description: "Ficha del cliente y retroalimentación del asesor.",
    manifest: `/asesor/${params.token}/manifest.webmanifest`,
    robots: { index: false, follow: false },
  };
}

/** Link directo (sin contraseña) para que el asesor dé retro de un cliente en particular. */
export default async function PaginaRetroCliente({ params }: Props) {
  const datos = await obtenerClientePortalAsesor(params.token, params.envioId);

  if (!datos) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
        <div className="max-w-sm w-full text-center bg-white p-8 rounded-2xl shadow border border-slate-200 space-y-2">
          <p className="text-3xl">🔒</p>
          <h1 className="text-base font-extrabold text-slate-800">Este link ya no es válido</h1>
          <p className="text-sm text-slate-500">El cliente ya no está asignado a ti o tu link cambió. Pide a Sauceda el link actualizado.</p>
        </div>
      </main>
    );
  }

  return <RetroClienteAsesor token={params.token} asesorNombre={datos.asesor.nombre} lead={datos.lead} />;
}
