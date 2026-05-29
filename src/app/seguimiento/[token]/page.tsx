import Link from "next/link";
import { obtenerPorToken } from "@/app/actions/expedientes";
import { obtenerEnviosPorToken } from "@/app/actions/formularios";
import { SeguimientoCliente } from "@/features/portal-cliente/SeguimientoCliente";

// Siempre dinámica: depende del token y consulta la base de datos en cada visita.
export const dynamic = "force-dynamic";

/**
 * Portal del cliente: /seguimiento/[token]
 * El cliente abre su enlace privado y ve SOLO su expediente (solo lectura).
 */
export default async function PaginaSeguimiento({
  params,
}: {
  params: { token: string };
}) {
  const expediente = await obtenerPorToken(params.token);
  const envios = expediente ? await obtenerEnviosPorToken(params.token) : [];

  if (!expediente) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-crema px-5 text-center">
        <div>
          <p className="font-display text-3xl font-semibold text-verde-profundo">
            SAUCEDA
          </p>
          <p className="mt-4 font-titular text-xl text-carbon/70">
            Enlace no válido
          </p>
          <p className="mt-2 text-sm text-carbon/60">
            Este enlace de seguimiento no existe o ya no está disponible.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-sauce hover:text-verde-profundo"
          >
            Ir al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <SeguimientoCliente
      expediente={expediente}
      token={params.token}
      envios={envios}
    />
  );
}
