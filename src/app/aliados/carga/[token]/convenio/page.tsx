import type { Metadata } from "next";
import { obtenerConvenioPorToken } from "@/app/actions/aliados";
import { DocumentoConvenio } from "@/components/aliados/DocumentoConvenio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Convenio · SAUCEDA", robots: { index: false, follow: false } };

/** El aliado lee su convenio desde su link (el token se valida en el servidor). */
export default async function PaginaConvenioPublico({ params }: { params: { token: string } }) {
  const convenio = await obtenerConvenioPorToken(params.token);
  return (
    <main className="min-h-screen bg-crema py-6">
      {convenio ? (
        <DocumentoConvenio convenio={convenio} />
      ) : (
        <p className="px-4 text-center text-sm text-carbon/60">No encontramos un convenio para este link.</p>
      )}
    </main>
  );
}
