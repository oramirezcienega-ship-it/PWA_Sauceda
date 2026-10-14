import type { Metadata } from "next";
import { obtenerPortalPrecios, obtenerSolicitudesPortal } from "@/app/actions/portal-precios-proveedor";
import { PortalPreciosProveedorClient } from "@/components/proveedores/PortalPreciosProveedorClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis precios · SAUCEDA",
  robots: { index: false, follow: false },
};

/**
 * Link público para que el proveedor actualice costos, garantía, proceso y fotos
 * de los productos que nos ofrece (sin login). El token se valida en el servidor.
 */
export default async function PaginaPreciosProveedor({ params }: { params: { token: string } }) {
  const contexto = await obtenerPortalPrecios(params.token);
  const solicitudes = contexto.ok ? await obtenerSolicitudesPortal(params.token).catch(() => ({ ok: false as const })) : null;

  if (!contexto.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-crema px-4">
        <div className="max-w-sm rounded-xl border border-carbon/10 bg-white p-6 text-center shadow-sm">
          <p className="text-3xl">🔒</p>
          <p className="mt-2 font-titular text-lg text-verde-profundo">Link no válido</p>
          <p className="mt-1 text-sm text-carbon/60">{contexto.mensaje}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <PortalPreciosProveedorClient
        token={params.token}
        proveedorNombre={contexto.proveedorNombre || ""}
        ofertasIniciales={contexto.ofertas || []}
        solicitudesIniciales={solicitudes?.ok ? solicitudes.solicitudes || [] : []}
      />
    </main>
  );
}
