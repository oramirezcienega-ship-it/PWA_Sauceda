import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { InventarioClient } from "@/components/asesoria-compra/InventarioClient";

export const dynamic = "force-dynamic";

/** Menú Inventario: casas propias, de aliados y de portales para la asesoría de compra. */
export default async function PaginaInventario() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <main className="min-h-screen bg-carbon/5 pb-12">
      <div className="mx-auto max-w-[1700px] px-4 pt-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-300 bg-violet-50 text-base">🏘️</span>
            <span className="font-titular text-xs font-bold uppercase tracking-wider text-violet-900">Asesoría de compra</span>
          </div>
          <h1 className="mt-1 font-titular text-3xl font-bold text-carbon">Inventario</h1>
          <p className="mt-1 max-w-xl text-xs text-carbon/60">
            Casas propias (de vendedores de SAUCEDA), de aliados inmobiliarios y de portales. Solo las disponibles
            entran al cruce con los compradores.
          </p>
        </div>
        <InventarioClient />
      </div>
    </main>
  );
}
