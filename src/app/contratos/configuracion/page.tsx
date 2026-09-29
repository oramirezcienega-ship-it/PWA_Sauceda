import { redirect } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { EditorClausulasContrato } from "@/components/EditorClausulasContrato";
import { listarPlantillasClausulas } from "@/app/actions/contratos";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracionContratos() {
  const usuario = await usuarioActual().catch(() => null);
  if (!usuario) redirect("/login");

  const plantillas = await listarPlantillasClausulas();

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />
      <div className="mx-auto max-w-5xl px-4 pt-5 space-y-4">
        <div>
          <h1 className="font-titular text-2xl font-semibold text-verde-profundo">Configuración de contratos</h1>
          <p className="text-sm text-carbon/60 font-cuerpo">
            Datos del prestador y cláusulas por tipo de servicio. Los cambios aplican a los contratos que se generen
            a partir de ahora; los ya generados no cambian.
          </p>
        </div>
        <EditorClausulasContrato plantillasIniciales={plantillas} />
      </div>
    </main>
  );
}
