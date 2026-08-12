import { obtenerCotizacionPorToken } from "@/app/actions/cotizaciones";
import { VisualizadorCotizacionCliente } from "@/components/VisualizadorCotizacionCliente";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PaginaPropuestaProps {
  params: {
    token: string;
  };
}

export async function generateMetadata({ params }: PaginaPropuestaProps): Promise<Metadata> {
  try {
    const datos = await obtenerCotizacionPorToken(params.token);
    if (datos?.cotizacion) {
      const { cotizacion } = datos;
      const servicio = cotizacion.servicioTipo === "impermeabilizacion" ? "Impermeabilización" :
                       cotizacion.servicioTipo === "pintura" ? "Pintura" :
                       cotizacion.servicioTipo === "losa" ? "Construcción de Losa" :
                       cotizacion.servicioTipo === "remodelacion" ? "Remodelación" : "Servicio";
      return {
        title: `SAUCEDA · Propuesta Comercial (Folio ${cotizacion.id})`,
        description: `Propuesta de ${servicio} para ${cotizacion.prospectoNombre?.split(" ")[0]}. Revisa, descarga el PDF y autoriza en línea.`,
      };
    }
  } catch (e) {
    // ignorar
  }
  return {
    title: "SAUCEDA · Propuesta Comercial",
    description: "Portal seguro de autorizaciones comerciales de construcción.",
  };
}

export default async function PaginaPropuestaCliente({ params }: PaginaPropuestaProps) {
  let datos = null;
  try {
    datos = await obtenerCotizacionPorToken(params.token);
  } catch (err) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 font-cuerpo space-y-4">
          <div className="text-3xl">⚠️</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">Propuesta no disponible</h2>
          <p className="text-sm text-carbon/60 leading-relaxed">
            {err instanceof Error ? err.message : "La propuesta no existe o aún no cuenta con las autorizaciones necesarias para ser mostrada."}
          </p>
          <div className="pt-2">
            <p className="text-xs text-carbon/40">Por favor, comunícate con tu asesor comercial de SAUCEDA.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!datos) {
    notFound();
  }

  const { cotizacion, conceptos, reporteVisita } = datos;

  return (
    <main className="min-h-screen bg-slate-50/50 py-6">
      <VisualizadorCotizacionCliente
        cotizacion={cotizacion}
        conceptos={conceptos}
        reporteVisita={reporteVisita}
      />
    </main>
  );
}
