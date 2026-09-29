import { notFound, redirect } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import { ContratoDocumento } from "@/components/ContratoDocumento";
import { obtenerContrato } from "@/app/actions/contratos";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";

export const dynamic = "force-dynamic";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"] });

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
    <ContratoDocumento
      datos={contrato.datos}
      estado={contrato.registro.estado}
      claseTitulos={cormorant.className}
    />
  );
}
