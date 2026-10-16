import { notFound } from "next/navigation";
import { CLASE_TITULOS_CONTRATO, FuenteContrato } from "@/components/FuenteContrato";
import { ContratoDocumento } from "@/components/ContratoDocumento";
import { claveContratoValida } from "@/lib/contrato-firma";
import { supabaseServidor } from "@/lib/supabase/server";
import type { DatosContrato } from "@/lib/contratos";

export const dynamic = "force-dynamic";

/** Vista del contrato para que el servidor la convierta a PDF (se accede con clave firmada, sin sesión). */
export default async function PaginaContratoPdf({
  params,
  searchParams,
}: {
  params: { contratoId: string };
  searchParams: { k?: string };
}) {
  if (!claveContratoValida(params.contratoId, searchParams.k)) notFound();
  const { data } = await supabaseServidor()
    .from("contratos")
    .select("estado, datos_snapshot")
    .eq("id", params.contratoId)
    .maybeSingle();
  if (!data?.datos_snapshot) notFound();
  return (
    <>
      <FuenteContrato />
      <ContratoDocumento datos={data.datos_snapshot as DatosContrato} estado={data.estado} claseTitulos={CLASE_TITULOS_CONTRATO} />
    </>
  );
}
