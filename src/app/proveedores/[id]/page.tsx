import { Encabezado } from "@/components/Encabezado";
import { DetalleProveedor } from "@/components/DetalleProveedor";
import { obtenerProveedor } from "@/app/actions/proveedores";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PaginaDetalleProveedorProps {
  params: {
    id: string;
  };
}

export default async function PaginaDetalleProveedor({ params }: PaginaDetalleProveedorProps) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  let datos = null;
  try {
    datos = await obtenerProveedor(params.id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No autorizado")) {
      redirect("/login");
    }
    throw err;
  }

  if (!datos) {
    notFound();
  }

  return (
    <main className="min-h-screen pb-10 bg-slate-50/30">
      <Encabezado />
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <div className="mb-4">
          <Link
            href="/proveedores"
            className="inline-flex items-center gap-1 text-xs text-sauce hover:underline font-semibold font-titular"
          >
            ← Volver a Proveedores
          </Link>
        </div>

        <DetalleProveedor proveedorInicial={datos.proveedor} documentosIniciales={datos.documentos} />
      </div>
    </main>
  );
}
