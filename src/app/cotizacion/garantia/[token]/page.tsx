import { obtenerGarantiaPorToken } from "@/app/actions/cotizaciones";
import { BotonImprimirGarantia } from "@/components/BotonImprimirGarantia";
import Link from "next/link";
import { notFound } from "next/navigation";

interface GarantiaPageProps {
  params: {
    token: string;
  };
}

export default async function GarantiaPublicPage({ params }: GarantiaPageProps) {
  const data = await obtenerGarantiaPorToken(params.token);

  if (!data) {
    return notFound();
  }

  const { cotizacion, garantia } = data;

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0 print:px-0 flex flex-col items-center">
      {/* Botón flotante para imprimir */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-6 print:hidden">
        <Link
          href={`/cotizacion/${cotizacion.token}`}
          className="text-xs font-semibold text-carbon/60 hover:text-carbon flex items-center gap-1 bg-white border border-carbon/10 px-3 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm"
        >
          ← Volver al Portal de Cotización
        </Link>
        <BotonImprimirGarantia />
      </div>

      {/* Contenedor de la carta de garantía - Formato A4/Carta */}
      <div className="w-full max-w-3xl bg-white border border-carbon/10 p-12 sm:p-16 rounded-2xl shadow-lg print:shadow-none print:border-none print:p-0 print:max-w-none text-carbon">
        {/* Encabezado Opcional/Identidad */}
        <div className="border-b-2 border-sauce pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="font-titular text-2xl font-bold tracking-tight text-verde-profundo uppercase">SAUCEDA</h1>
            <p className="font-titular text-xs font-semibold tracking-wider text-sauce uppercase mt-0.5">Construye</p>
          </div>
          <div className="text-right text-[10px] text-carbon/50 uppercase leading-normal font-medium">
            <div>Tradición con tecnología</div>
            <div>+52 477 465 4700</div>
            <div>saucedamx.com</div>
          </div>
        </div>

        {/* Cuerpo del Documento */}
        <article className="prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm text-carbon leading-relaxed bg-transparent border-none p-0 overflow-visible max-w-none">
            {garantia.contenido}
          </pre>
        </article>

        {/* Firmas / Cierre */}
        <div className="mt-16 pt-8 border-t border-carbon/10 grid grid-cols-2 gap-8 text-center text-xs print:mt-24">
          <div className="space-y-1">
            <div className="h-16 flex items-end justify-center">
              {/* Espacio para firma */}
            </div>
            <div className="border-t border-carbon/20 pt-2 font-semibold text-carbon/80">SAUCEDA Construye</div>
            <div className="text-[10px] text-carbon/50 uppercase">Representante Autorizado</div>
          </div>
          <div className="space-y-1">
            <div className="h-16 flex items-end justify-center">
              {/* Espacio para firma */}
            </div>
            <div className="border-t border-carbon/20 pt-2 font-semibold text-carbon/80">{cotizacion.prospectoNombre}</div>
            <div className="text-[10px] text-carbon/50 uppercase">Firma del Cliente</div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Inyección de script para habilitar window.print() en el componente del servidor a través de hidratación básica
// (Next.js nos permite declarar layouts interactivos usando eventos sencillos o declarando el botón como "use client" si se requiere interactividad).
