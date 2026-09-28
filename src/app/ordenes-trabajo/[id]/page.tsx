import { Encabezado } from "@/components/Encabezado";
import { DetalleOrdenTrabajo } from "@/components/DetalleOrdenTrabajo";
import { obtenerOrdenTrabajoPorId } from "@/app/actions/ordenes-trabajo";
import { listarAsesoresActivos, obtenerUsuarioActual } from "@/app/actions/usuarios";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PaginaDetalleOTProps {
  params: {
    id: string;
  };
}

export default async function PaginaDetalleOrdenTrabajo({ params }: PaginaDetalleOTProps) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  let datos = null;
  let asesores: Array<{ id: string; nombre: string }> = [];

  try {
    const [resOT, resAsesores] = await Promise.all([
      obtenerOrdenTrabajoPorId(params.id),
      listarAsesoresActivos().catch(() => []),
    ]);
    datos = resOT;
    asesores = resAsesores;
  } catch (err) {
    if (err instanceof Error && err.message.includes("No autorizado")) {
      redirect("/login");
    }
    throw err;
  }

  if (!datos || !datos.orden) {
    notFound();
  }

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <Encabezado />

      <div className="mx-auto max-w-5xl px-4 pt-5 space-y-4">
        {/* Miga de Pan */}
        <div>
          <Link
            href="/ordenes-trabajo"
            className="inline-flex items-center gap-1.5 text-xs text-sauce hover:underline font-semibold font-titular"
          >
            ← Volver al Listado de Órdenes de Trabajo & Entrega
          </Link>
        </div>

        <DetalleOrdenTrabajo
          ordenInicial={datos.orden}
          recibosIniciales={datos.recibos}
          garantiaInicial={datos.garantia}
          remisionInicial={datos.remisionFactura}
          documentoProveedorInicial={datos.documentoProveedor}
          asesores={asesores}
        />
      </div>
    </main>
  );
}
