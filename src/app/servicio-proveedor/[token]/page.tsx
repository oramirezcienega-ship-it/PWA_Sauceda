import type { Metadata } from "next";
import { obtenerSolicitudUnicaPortal } from "@/app/actions/portal-precios-proveedor";
import { SolicitudServicioProveedorView } from "@/components/proveedores/SolicitudServicioProveedorView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Petición de Servicio · SAUCEDA",
  robots: { index: false, follow: false },
};

/**
 * Vista pública enfocada exclusivamente en una petición de servicio para el proveedor.
 * Muestra única y exclusivamente la información del trabajo y las opciones para
 * que el proveedor responda qué días y horario tiene disponibles.
 */
export default async function PaginaServicioProveedor({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { solicitud?: string };
}) {
  const res = await obtenerSolicitudUnicaPortal(params.token, searchParams?.solicitud);

  if (!res.ok || !res.solicitud) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-sm rounded-2xl border border-carbon/10 bg-white p-6 text-center shadow-sm">
          <p className="text-3xl">🔒</p>
          <p className="mt-2 font-titular text-lg text-verde-profundo font-bold">Enlace no disponible</p>
          <p className="mt-1 text-sm text-carbon/60">{res.mensaje || "Esta solicitud no está disponible o ya fue atendida."}</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <SolicitudServicioProveedorView
        token={params.token}
        proveedorNombre={res.proveedor?.contacto || res.proveedor?.nombre || "Proveedor"}
        solicitudInicial={res.solicitud}
      />
    </main>
  );
}
