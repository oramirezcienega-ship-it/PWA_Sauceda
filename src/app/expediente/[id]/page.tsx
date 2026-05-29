import { Encabezado } from "@/components/Encabezado";
import { DetalleExpediente } from "@/components/DetalleExpediente";

/**
 * Página de detalle de un expediente: /expediente/[id]
 * El estado vive en el contexto (en memoria), por eso el detalle se
 * resuelve en el cliente a partir del id de la URL.
 */
export default function PaginaDetalle({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <DetalleExpediente id={params.id} />
    </main>
  );
}
