import type { Metadata } from "next";
import { obtenerContextoCarga } from "@/app/actions/aliados";
import { CargaAliadoClient } from "@/components/aliados/CargaAliadoClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subir casas · SAUCEDA",
  robots: { index: false, follow: false },
};

/**
 * Link público de carga para aliados inmobiliarios (sin login).
 * El token se valida en el servidor; la página nunca muestra datos del cliente.
 */
export default async function PaginaCargaAliado({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { b?: string };
}) {
  const contexto = await obtenerContextoCarga(params.token, searchParams.b ?? null);

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
    <main className="min-h-screen bg-crema pb-10">
      <CargaAliadoClient
        token={params.token}
        aliadoNombre={contexto.aliadoNombre || ""}
        busqueda={contexto.busqueda ?? null}
      />
    </main>
  );
}
