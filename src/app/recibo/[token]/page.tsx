import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { obtenerReciboPorToken } from "@/app/actions/ordenes-trabajo";
import { BotonImprimirGarantia } from "@/components/BotonImprimirGarantia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ReciboPageProps {
  params: {
    token: string;
  };
}

/**
 * El título de la página es el nombre que propone el navegador al guardar como PDF:
 * "Recibo <folio> - <nombre del cliente>".
 */
export async function generateMetadata({ params }: ReciboPageProps): Promise<Metadata> {
  const recibo = await obtenerReciboPorToken(params.token).catch(() => null);
  if (!recibo) return { title: "Recibo de pago · SAUCEDA" };
  const nombre = `Recibo ${recibo.folio} - ${recibo.clienteNombre || "Cliente"}`
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return { title: nombre };
}

export default async function PaginaReciboPublico({ params }: ReciboPageProps) {
  const recibo = await obtenerReciboPorToken(params.token);

  if (!recibo) {
    return notFound();
  }

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0 print:px-0 flex flex-col items-center">
      {/* Botón flotante para imprimir */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-6 print:hidden">
        <span className="text-xs font-semibold text-carbon/60 bg-white border border-carbon/10 px-3 py-2 rounded-lg shadow-2xs">
          🔒 Documento Oficial Verificado
        </span>
        <BotonImprimirGarantia />
      </div>

      {/* Recibo Membretado Oficial */}
      <div className="w-full max-w-3xl bg-white border border-carbon/10 p-10 sm:p-14 rounded-2xl shadow-xl print:shadow-none print:border-none print:p-0 print:max-w-none text-carbon font-cuerpo">
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
              RECIBO DE PAGO
            </h2>
            <div className="font-mono text-sm font-bold text-sauce mt-0.5">
              Folio: {recibo.folio}
            </div>
            <div className="text-xs text-carbon/60 mt-1 font-mono">
              Fecha: {new Date(recibo.fechaPago).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        </div>

        {/* Importe Destacado (Bueno Por) */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/80 block">
              BUENO POR LA CANTIDAD DE
            </span>
            <div className="font-mono text-3xl font-bold text-emerald-800 mt-0.5">
              {formatMoneda(recibo.monto)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-emerald-800/70 block">
              Forma de Pago
            </span>
            <span className="font-bold text-sm text-emerald-950 uppercase">
              {recibo.metodoPago === "transferencia"
                ? "Transferencia Electrónica SPEI"
                : recibo.metodoPago}
            </span>
            {recibo.referenciaPago && (
              <span className="text-[11px] font-mono text-emerald-800 block mt-0.5">
                Ref: {recibo.referenciaPago}
              </span>
            )}
          </div>
        </div>

        {/* Declaración de Recibo */}
        <div className="space-y-4 text-xs sm:text-sm leading-relaxed border-b border-carbon/10 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-semibold text-carbon/60 uppercase text-[11px]">
              Recibí de:
            </span>
            <span className="sm:col-span-3 font-bold text-carbon text-sm">
              {recibo.clienteNombre}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-semibold text-carbon/60 uppercase text-[11px]">
              La cantidad de:
            </span>
            <span className="sm:col-span-3 font-mono font-semibold text-emerald-900 bg-emerald-50/40 p-2 rounded-lg border border-emerald-100">
              "{recibo.montoLetra}"
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <span className="font-semibold text-carbon/60 uppercase text-[11px]">
              Por concepto de:
            </span>
            <span className="sm:col-span-3 text-carbon font-medium">
              {recibo.concepto}
            </span>
          </div>

          {recibo.notas && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <span className="font-semibold text-carbon/60 uppercase text-[11px]">
                Observaciones:
              </span>
              <span className="sm:col-span-3 text-carbon/70 italic">
                {recibo.notas}
              </span>
            </div>
          )}
        </div>

        {/* Estado de Cuenta de la Orden */}
        <div className="my-8">
          <h3 className="font-titular text-xs font-bold uppercase tracking-wider text-carbon/60 mb-3">
            Estado de Cuenta del Servicio
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center border border-carbon/10 rounded-xl p-4 bg-carbon/5 font-mono">
            <div>
              <span className="text-[10px] text-carbon/50 uppercase block font-sans font-semibold">
                Saldo Anterior
              </span>
              <span className="text-xs sm:text-sm font-bold text-carbon">
                {formatMoneda(recibo.saldoAnterior)}
              </span>
            </div>
            <div className="border-x border-carbon/10">
              <span className="text-[10px] text-emerald-700 uppercase block font-sans font-semibold">
                Monto Cubierto
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-800">
                {formatMoneda(recibo.monto)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-amber-800 uppercase block font-sans font-semibold">
                Saldo Restante
              </span>
              <span className="text-xs sm:text-sm font-bold text-amber-900">
                {formatMoneda(recibo.saldoRestante)}
              </span>
            </div>
          </div>
        </div>

        {/* Firmas y Sello de Validación */}
        <div className="mt-16 pt-8 border-t border-carbon/10 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <div className="border-b border-carbon/30 pb-2 mb-2 h-16 flex items-end justify-center">
              <span className="font-mono text-xs text-carbon/60">
                {recibo.recibidoPorNombre || "Sauceda Construye"}
              </span>
            </div>
            <p className="font-semibold text-carbon">Por Sauceda Construye</p>
            <p className="text-[10px] text-carbon/50">Cobranza y Administración</p>
          </div>

          <div>
            <div className="border-b border-carbon/30 pb-2 mb-2 h-16 flex items-end justify-center">
              <span className="font-mono text-xs text-carbon/60">
                {recibo.clienteNombre}
              </span>
            </div>
            <p className="font-semibold text-carbon">Cliente Beneficiario</p>
            <p className="text-[10px] text-carbon/50">Firma de Conformidad</p>
          </div>
        </div>

        {/* Footer Criptográfico */}
        <div className="mt-12 pt-4 border-t border-dashed border-carbon/10 text-center text-[10px] text-carbon/40 font-mono">
          Token de validación: {recibo.token} · Comprobante digital generado por el sistema Sauceda.
        </div>
      </div>
    </main>
  );
}
