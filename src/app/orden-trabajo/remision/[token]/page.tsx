import { notFound } from "next/navigation";
import Link from "next/link";
import { obtenerRemisionOrdenTrabajoPorToken } from "@/app/actions/ordenes-trabajo";
import { BotonImprimirGarantia } from "@/components/BotonImprimirGarantia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RemisionOTPageProps {
  params: {
    token: string;
  };
}

export default async function RemisionOrdenTrabajoPage({ params }: RemisionOTPageProps) {
  const res = await obtenerRemisionOrdenTrabajoPorToken(params.token);

  if (!res.ok || !res.orden || !res.remision) {
    notFound();
  }

  const { orden, remision } = res;

  const formatMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  return (
    <main className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0 print:px-0 flex flex-col items-center">
      <div className="w-full max-w-3xl flex justify-between items-center mb-6 print:hidden">
        <Link
          href={`/orden-trabajo/entrega/${params.token}`}
          className="text-xs font-semibold text-carbon/60 hover:text-carbon flex items-center gap-1 bg-white border border-carbon/10 px-3 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm"
        >
          ← Volver al Portal de Entrega
        </Link>
        <BotonImprimirGarantia />
      </div>

      <div className="w-full max-w-3xl bg-white border border-carbon/10 p-12 sm:p-16 rounded-2xl shadow-lg print:shadow-none print:border-none print:p-0 print:max-w-none text-carbon font-cuerpo">
        <div className="border-b-2 border-sauce pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="font-titular text-2xl font-bold tracking-tight text-verde-profundo uppercase">SAUCEDA</h1>
            <p className="font-titular text-xs font-semibold tracking-wider text-sauce uppercase mt-0.5">Construye</p>
          </div>
          <div className="text-right">
            <h2 className="font-titular text-lg font-bold text-carbon uppercase tracking-wide">
              {remision.tipo === "factura" ? "FACTURA DE VENTA" : "REMISIÓN DE ENTREGA"}
            </h2>
            <div className="font-mono text-sm font-bold text-sauce mt-0.5">Folio: {remision.folio}</div>
            <div className="text-xs text-carbon/50 mt-1">Fecha: {new Date(remision.fecha).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs border-b pb-6 mb-6">
          <div className="space-y-1.5">
            <h4 className="font-bold text-carbon/50 uppercase text-[10px] tracking-wider">Cliente</h4>
            <div className="font-semibold text-sm text-verde-profundo">{orden.clienteNombre}</div>
            {orden.clienteTelefono && (
              <div className="text-carbon/70">Teléfono: {orden.clienteTelefono}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <h4 className="font-bold text-carbon/50 uppercase text-[10px] tracking-wider">Detalles de Entrega</h4>
            <div className="text-carbon/80 font-medium">Ubicación: {remision.datosDocumento.direccionEntrega || "Domicilio en Obra"}</div>
            {remision.datosDocumento.personaRecibe && (
              <div className="text-carbon/70">Recibe: {remision.datosDocumento.personaRecibe}</div>
            )}
            {remision.datosDocumento.fechaInstalacion && (
              <div className="text-carbon/70">Fecha programada: {new Date(remision.datosDocumento.fechaInstalacion).toLocaleDateString()}</div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-carbon/10 text-carbon/60 uppercase font-semibold text-[10px] tracking-wider bg-slate-50 print:bg-transparent">
                <th className="py-2.5 px-3 w-[76%]">Concepto / Descripción</th>
                <th className="py-2.5 px-3 text-right w-[24%]">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon/5">
              <tr>
                <td className="py-3 px-3 font-medium text-carbon/90 whitespace-pre-wrap">
                  Folio: {orden.folio} · {orden.titulo}
                </td>
                <td className="py-3 px-3 text-right font-semibold text-carbon/90 font-mono">
                  {formatMoneda(remision.montoSubtotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-8">
          <div className="w-full max-w-xs space-y-2 text-xs border-t pt-4">
            <div className="flex justify-between text-carbon/60">
              <span>Subtotal:</span>
              <span className="font-mono">{formatMoneda(remision.montoSubtotal)}</span>
            </div>
            {remision.serviciosExtra > 0 && (
              <div className="flex justify-between text-carbon/60">
                <span>Servicios Extra / Adicionales:</span>
                <span className="font-mono text-emerald-600">+{formatMoneda(remision.serviciosExtra)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-carbon border-t pt-2">
              <span>Total a Liquidar:</span>
              <span className="font-mono text-sauce">{formatMoneda(remision.montoTotal)}</span>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-carbon/10 grid grid-cols-2 gap-8 text-center text-xs print:mt-24">
          <div className="space-y-1">
            <div className="h-16 flex items-end justify-center" />
            <div className="border-t border-carbon/20 pt-2 font-semibold text-carbon/80">Entregó: SAUCEDA Construye</div>
            <div className="text-[10px] text-carbon/50 uppercase">Firma y Sello</div>
          </div>
          <div className="space-y-1">
            <div className="h-16 flex items-end justify-center" />
            <div className="border-t border-carbon/20 pt-2 font-semibold text-carbon/80">{orden.clienteNombre}</div>
            <div className="text-[10px] text-carbon/50 uppercase">Firma del Cliente (Conformidad)</div>
          </div>
        </div>
      </div>
    </main>
  );
}
