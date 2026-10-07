import type { Metadata } from "next";
import { obtenerPortalAsesor } from "@/app/actions/portal-asesor";
import { PortalAsesor } from "@/components/PortalAsesor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: { token: string };
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: "SAUCEDA · Portal del asesor",
    description: "Tus coordinaciones de inspección y clientes compartidos.",
    // Manifest propio para que "Agregar a inicio" abra este link y no el login del CRM
    manifest: `/asesor/${params.token}/manifest.webmanifest`,
    robots: { index: false, follow: false },
  };
}

export default async function PaginaPortalAsesor({ params }: Props) {
  const datos = await obtenerPortalAsesor(params.token);

  if (!datos) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
        <div className="max-w-sm w-full text-center bg-white p-8 rounded-2xl shadow border border-slate-200 space-y-2">
          <p className="text-3xl">🔒</p>
          <h1 className="text-base font-extrabold text-slate-800">Este link ya no es válido</h1>
          <p className="text-sm text-slate-500">Pide a Sauceda tu link actualizado del portal del asesor.</p>
        </div>
      </main>
    );
  }

  return <PortalAsesor token={params.token} datos={datos} />;
}
