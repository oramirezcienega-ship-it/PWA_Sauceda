import type { Metadata } from "next";
import {
  obtenerCotizacionesEspecialesPortal,
  obtenerPortalPrecios,
  obtenerSolicitudesPortal,
} from "@/app/actions/portal-precios-proveedor";
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
export default async function PaginaPreciosProveedor({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { solicitud?: string };
}) {
  const contexto = await obtenerPortalPrecios(params.token);
  const solicitudes = contexto.ok ? await obtenerSolicitudesPortal(params.token).catch(() => ({ ok: false as const })) : null;
  const estimaciones = contexto.ok ? await obtenerCotizacionesEspecialesPortal(params.token).catch(() => []) : [];

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

  // Si el enlace viene enfocado en una solicitud específica de servicio,
  // mostrar exclusivamente la vista de esa petición sin mezclar con el catálogo.
  if (searchParams?.solicitud) {
    const { obtenerSolicitudUnicaPortal } = await import("@/app/actions/portal-precios-proveedor");
    const { SolicitudServicioProveedorView } = await import("@/components/proveedores/SolicitudServicioProveedorView");
    const resSol = await obtenerSolicitudUnicaPortal(params.token, searchParams.solicitud);
    if (resSol.ok && resSol.solicitud) {
      return (
        <main>
          <SolicitudServicioProveedorView
            token={params.token}
            proveedorNombre={resSol.proveedor?.contacto || resSol.proveedor?.nombre || contexto.proveedorNombre || "Proveedor"}
            solicitudInicial={resSol.solicitud}
          />
        </main>
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <PortalPreciosProveedorClient
        token={params.token}
        proveedorNombre={contexto.proveedorNombre || ""}
        ofertasIniciales={contexto.ofertas || []}
        condicionesIniciales={contexto.condiciones}
        estimacionesIniciales={estimaciones}
        solicitudesIniciales={solicitudes?.ok ? solicitudes.solicitudes || [] : []}
        solicitudFoco={searchParams?.solicitud}
      />
    </main>
  );
}
