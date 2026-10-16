import { notFound, redirect } from "next/navigation";
import { CLASE_TITULOS_CONTRATO, FuenteContrato } from "@/components/FuenteContrato";
import { ContratoDocumento } from "@/components/ContratoDocumento";
import { obtenerContrato } from "@/app/actions/contratos";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";

export const dynamic = "force-dynamic";

export default async function PaginaContrato({
  params,
}: {
  params: { id: string; contratoId: string };
}) {
  const usuario = await usuarioActual().catch(() => null);
  if (!usuario) redirect("/login");

  const contrato = await obtenerContrato(params.contratoId);
  if (!contrato || contrato.registro.ordenTrabajoId !== params.id) notFound();

  return (
    <>
      <FuenteContrato />
      <ContratoDocumento
        datos={contrato.datos}
        estado={contrato.registro.estado}
        claseTitulos={CLASE_TITULOS_CONTRATO}
        urlRegreso={`/ordenes-trabajo/${params.id}`}
      />
    </>
  );
}
