import { Encabezado } from "@/components/Encabezado";
import { DetalleCotizacionAdmin } from "@/components/DetalleCotizacionAdmin";
import { obtenerCotizacionPorId } from "@/app/actions/cotizaciones";
import { rolUsuarioActual } from "@/app/actions/usuarios";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PaginaDetalleProps {
  params: {
    id: string;
  };
}

export default async function PaginaDetalleCotizacion({ params }: PaginaDetalleProps) {
  const rol = await rolUsuarioActual();
  const datos = await obtenerCotizacionPorId(params.id);

  if (!datos) {
    notFound();
  }

  const { cotizacion, conceptos, reporteVisita } = datos;

  return (
    <main className="min-h-screen pb-10 bg-slate-50/30">
      <Encabezado />
      
      <div className="mx-auto max-w-5xl px-4 pt-5">
        {/* Miga de Pan */}
        <div className="mb-4">
          <Link
            href="/construccion"
            className="inline-flex items-center gap-1 text-xs text-sauce hover:underline font-semibold font-titular"
          >
            ← Volver al Tablero de Construcción
          </Link>
        </div>

        <DetalleCotizacionAdmin
          cotizacionInicial={cotizacion}
          conceptosIniciales={conceptos}
          reporteVisitaInicial={reporteVisita}
          rolUsuario={rol}
        />
      </div>
    </main>
  );
}
