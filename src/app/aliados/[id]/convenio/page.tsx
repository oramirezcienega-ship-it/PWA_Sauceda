import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { obtenerConvenioAliado } from "@/app/actions/aliados";
import { DocumentoConvenio } from "@/components/aliados/DocumentoConvenio";

export const dynamic = "force-dynamic";

/** Convenio del aliado para revisar o imprimir (Ctrl+P → Guardar como PDF). */
export default async function PaginaConvenioAliado({ params }: { params: { id: string } }) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/login");
  const convenio = await obtenerConvenioAliado(params.id);
  return (
    <main className="min-h-screen bg-carbon/5 py-6 print:bg-white print:py-0">
      {convenio ? (
        <DocumentoConvenio convenio={convenio} />
      ) : (
        <p className="text-center text-sm text-carbon/60">Este aliado aún no tiene convenio generado.</p>
      )}
    </main>
  );
}
