import { Encabezado } from "@/components/Encabezado";
import { DetalleExpediente } from "@/components/DetalleExpediente";
import { FormularioClienteInfonavit } from "@/components/FormularioClienteInfonavit";

export const dynamic = "force-dynamic";

/**
 * Página de expediente: /expediente/[id]
 *
 * 1. Si id es un token de parte de compraventa INFONAVIT (longitud >= 24),
 *    renderiza el portal público de llenado y carga de documentos para el cliente.
 * 2. Si id es un folio de expediente del CRM (ej. EXP-001), renderiza
 *    el panel interno administrativo del expediente con Encabezado.
 */
export default function PaginaDetalle({
  params,
}: {
  params: { id: string };
}) {
  const esTokenPublico = params.id && !params.id.startsWith("EXP-") && params.id.length >= 20;

  if (esTokenPublico) {
    return <FormularioClienteInfonavit token={params.id} />;
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <DetalleExpediente id={params.id} />
    </main>
  );
}
