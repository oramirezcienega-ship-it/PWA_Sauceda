import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { DetalleEmpresa360 } from "@/components/DetalleEmpresa360";
import { obtenerEmpresa } from "@/app/actions/empresas";
import { listarAsesoresActivos, obtenerUsuarioActual } from "@/app/actions/usuarios";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Vista de Detalle (Record View - 360°) de Empresa */
export default async function PaginaDetalleEmpresa({
  params,
}: {
  params: { id: string };
}) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  const [resultado, asesores] = await Promise.all([
    obtenerEmpresa(params.id),
    listarAsesoresActivos(),
  ]);

  if (!resultado) {
    return (
      <main className="min-h-screen pb-10 bg-carbon/5">
        <Encabezado />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="text-4xl mb-3">🏢</div>
          <h1 className="font-titular text-2xl font-bold text-verde-profundo">
            Empresa no encontrada
          </h1>
          <p className="mt-2 text-xs text-carbon/60">
            La cuenta corporativa solicitada no existe o fue eliminada.
          </p>
          <Link
            href="/empresas"
            className="mt-6 inline-block rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-crema hover:bg-verde-profundo transition"
          >
            ← Volver a Empresas
          </Link>
        </div>
      </main>
    );
  }

  const { empresa, prospectos, negocios, sucursales } = resultado;

  return (
    <main className="min-h-screen pb-12 bg-carbon/5">
      <Encabezado />
      <div className="mx-auto max-w-[1700px] px-4 pt-6">
        <DetalleEmpresa360
          empresaInicial={empresa}
          prospectosIniciales={prospectos}
          negociosIniciales={negocios}
          sucursalesIniciales={sucursales || []}
          asesores={asesores}
        />
      </div>
    </main>
  );
}
