import { notFound } from "next/navigation";
import { obtenerGarantiaOTPorToken } from "@/app/actions/ordenes-trabajo";
import { BotonImprimirGarantia } from "@/components/BotonImprimirGarantia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GarantiaOTPageProps {
  params: {
    token: string;
  };
}

export default async function PaginaGarantiaOTPublica({ params }: GarantiaOTPageProps) {
  const data = await obtenerGarantiaOTPorToken(params.token);

  if (!data) {
    return notFound();
  }

  const { garantia, orden } = data;

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0 print:px-0 flex flex-col items-center">
      {/* Botón flotante para imprimir */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-6 print:hidden">
        <span className="text-xs font-semibold text-carbon/60 bg-white border border-carbon/10 px-3 py-2 rounded-lg shadow-2xs flex items-center gap-1.5">
          <span>🛡️</span> Póliza Oficial de Garantía
        </span>
        <BotonImprimirGarantia />
      </div>

      {/* Carta de Garantía Membretada */}
      <div className="w-full max-w-3xl bg-white border border-carbon/10 p-10 sm:p-16 rounded-2xl shadow-xl print:shadow-none print:border-none print:p-0 print:max-w-none text-carbon font-cuerpo">
        {/* Encabezado */}
        <div className="border-b-2 border-sauce pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="font-titular text-2xl font-bold tracking-tight text-verde-profundo uppercase">
              SAUCEDA
            </h1>
            <p className="font-titular text-xs font-semibold tracking-wider text-sauce uppercase mt-0.5">
              Soluciones Inmobiliarias & Construcción
            </p>
            <p className="text-[10px] text-carbon/50 mt-1">
              Tradición con tecnología · León, Guanajuato
            </p>
          </div>
          <div className="text-right">
            <h2 className="font-titular text-lg font-bold text-verde-profundo uppercase tracking-wider">
              {garantia.titulo}
            </h2>
            <div className="font-mono text-sm font-bold text-sauce mt-0.5">
              Orden de Trabajo: {orden.folio}
            </div>
            <div className="text-xs text-amber-900 font-bold bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-full inline-block mt-1">
              Vigencia: {garantia.anosGarantia} Años de Cobertura
            </div>
          </div>
        </div>

        {/* Vigencia y Fechas */}
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-amber-900/70 uppercase block font-semibold">
              Cliente Beneficiario
            </span>
            <span className="font-bold text-carbon mt-0.5 block">
              {orden.clienteNombre}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-amber-900/70 uppercase block font-semibold">
              Fecha de Inicio
            </span>
            <span className="font-mono text-carbon/80 mt-0.5 block">
              {garantia.fechaInicio
                ? new Date(garantia.fechaInicio).toLocaleDateString("es-MX")
                : "Fecha de entrega"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-amber-900/70 uppercase block font-semibold">
              Vencimiento de Póliza
            </span>
            <span className="font-mono font-bold text-amber-900 mt-0.5 block">
              {garantia.fechaVencimiento
                ? new Date(garantia.fechaVencimiento).toLocaleDateString("es-MX")
                : "Calculada a partir de entrega"}
            </span>
          </div>
        </div>

        {/* Texto del Documento */}
        <article className="prose prose-sm max-w-none my-6">
          <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm text-carbon leading-relaxed bg-transparent border-none p-0 overflow-visible max-w-none">
            {garantia.contenido}
          </pre>
        </article>

        {/* Firmas de Conformidad */}
        <div className="mt-16 pt-8 border-t border-carbon/10 grid grid-cols-2 gap-8 text-center text-xs print:mt-24">
          <div>
            <div className="border-b border-carbon/30 pb-2 mb-2 h-16 flex items-end justify-center">
              <span className="font-mono text-xs text-carbon/60">
                {orden.asesorEjecutorNombre || "Sauceda Construye"}
              </span>
            </div>
            <p className="font-semibold text-carbon">Por Sauceda Construye</p>
            <p className="text-[10px] text-carbon/50">Responsable Técnico de Ejecución</p>
          </div>

          <div>
            <div className="border-b border-carbon/30 pb-2 mb-2 h-16 flex items-end justify-center">
              <span className="font-mono text-xs text-carbon/60">
                {orden.clienteNombre}
              </span>
            </div>
            <p className="font-semibold text-carbon">Cliente Titular</p>
            <p className="text-[10px] text-carbon/50">Recepción a Entera Satisfacción</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-dashed border-carbon/10 text-center text-[10px] text-carbon/40 font-mono">
          Token de verificación: {garantia.token} · Póliza digital emitida por Sauceda Soluciones Inmobiliarias y Construcción.
        </div>
      </div>
    </main>
  );
}
