import { obtenerReporteVisitaPorToken } from "@/app/actions/cotizaciones";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PaginaReporteProps {
  params: {
    token: string;
  };
}

export async function generateMetadata({ params }: PaginaReporteProps): Promise<Metadata> {
  try {
    const datos = await obtenerReporteVisitaPorToken(params.token);
    if (datos?.cotizacion) {
      return {
        title: `SAUCEDA · Reporte de Visita Técnica (Cotización ${datos.cotizacion.id})`,
        description: `Ficha de diagnóstico técnico y levantamiento físico para ${datos.cotizacion.prospectoNombre?.split(" ")[0]}.`,
      };
    }
  } catch (e) {
    // ignorar
  }
  return {
    title: "SAUCEDA · Reporte Técnico",
    description: "Ficha de levantamiento técnico de obra.",
  };
}

export default async function PaginaReporteVisita({ params }: PaginaReporteProps) {
  let datos = null;
  try {
    datos = await obtenerReporteVisitaPorToken(params.token);
  } catch (err) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 font-cuerpo space-y-4">
          <div className="text-3xl">⚠️</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">Reporte no disponible</h2>
          <p className="text-sm text-carbon/60 leading-relaxed font-cuerpo">
            {err instanceof Error ? err.message : "El reporte técnico no existe o no cuenta con los permisos necesarios para ser visualizado."}
          </p>
          <div className="pt-2">
            <p className="text-xs text-carbon/40 font-cuerpo">Por favor, comunícate con tu asesor técnico de SAUCEDA.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!datos || !datos.reporteVisita) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 font-cuerpo space-y-4">
          <div className="text-3xl">📋</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">Reporte no registrado</h2>
          <p className="text-sm text-carbon/60 leading-relaxed font-cuerpo">
            Aún no se han capturado los datos de la inspección técnica para esta solicitud.
          </p>
          <div className="pt-2">
            <p className="text-xs text-carbon/40 font-cuerpo">León, Gto. SAUCEDA Construye.</p>
          </div>
        </div>
      </main>
    );
  }

  const { cotizacion, reporteVisita } = datos;

  const getServicioLabel = (tipo: string) => {
    switch (tipo) {
      case "pintura": return "Pintura";
      case "impermeabilizacion": return "Impermeabilización";
      case "losa": return "Construcción de Losa (Techo)";
      case "remodelacion": return "Remodelación";
      default: return "Servicios de Construcción";
    }
  };

  const formatFecha = (fechaStr: string) => {
    return new Date(fechaStr).toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Obtener operario/técnico de los datos de medidas o del inspector
  const tecnicoRealizo = reporteVisita.medidas?.tecnicoNombre || reporteVisita.inspectorNombre || "Personal Técnico Sauceda";
  const fechaVisita = reporteVisita.medidas?.fechaVisita 
    ? formatFecha(reporteVisita.medidas.fechaVisita) 
    : (reporteVisita.fechaInspeccion ? formatFecha(reporteVisita.fechaInspeccion) : "No especificada");
  const horaVisita = reporteVisita.medidas?.horaVisita || "No especificada";

  return (
    <main className="min-h-screen bg-slate-50/50 py-10 font-cuerpo text-carbon">
      <div className="max-w-3xl mx-auto px-4">
        
        {/* Encabezado Logo */}
        <div className="text-center mb-6 print:hidden">
          <img src="/logo.svg" alt="SAUCEDA" className="mx-auto h-14 w-14 mb-2" />
          <h1 className="font-display text-xl font-bold tracking-tight text-verde-profundo">SAUCEDA</h1>
          <p className="font-mono text-[9px] tracking-[0.2em] text-dorado uppercase">Construye</p>
        </div>

        {/* Ficha Principal */}
        <div className="bg-white rounded-3xl border border-carbon/10 shadow-xl overflow-hidden">
          
          {/* Banner */}
          <div className="bg-gradient-to-r from-verde-profundo to-sauce p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-[10px] bg-crema/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-crema">Reporte de Levantamiento Técnico</span>
                <span className="font-mono text-xs font-bold text-dorado">{cotizacion.id}</span>
              </div>
              <h2 className="font-titular text-xl sm:text-2xl font-bold text-crema">Ficha de Inspección y Diagnóstico</h2>
              <p className="text-xs text-crema/80 mt-1">
                Servicio: <span className="font-semibold">{getServicioLabel(cotizacion.servicioTipo)}</span> · Cliente: <span className="font-semibold">{cotizacion.prospectoNombre}</span>
              </p>
            </div>
            
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition print:hidden shadow-sm self-start sm:self-center"
            >
              🖨️ Imprimir / Guardar PDF
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            
            {/* 1. Datos Generales de la Visita */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-carbon/5">
              <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider mb-3">Información de la Visita</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                <div>
                  <span className="text-carbon/40 text-xs block">Técnico / Operario Visitador</span>
                  <span className="font-semibold">{tecnicoRealizo}</span>
                </div>
                <div>
                  <span className="text-carbon/40 text-xs block">Fecha de la Inspección</span>
                  <span className="font-semibold">{fechaVisita}</span>
                </div>
                <div>
                  <span className="text-carbon/40 text-xs block">Hora de la Inspección</span>
                  <span className="font-semibold">{horaVisita} hrs</span>
                </div>
                <div>
                  <span className="text-carbon/40 text-xs block">Teléfono de Contacto</span>
                  <span className="font-mono">{cotizacion.prospectoTelefono || "—"}</span>
                </div>
              </div>
            </div>

            {/* 2. Diagnóstico Técnico */}
            <div className="space-y-3">
              <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider border-b pb-2">Diagnóstico y Observaciones Técnicas</h3>
              <div className="text-sm text-carbon/80 leading-relaxed whitespace-pre-line bg-slate-50/50 p-5 rounded-2xl border border-carbon/5 italic">
                "{reporteVisita.observacionesTecnicas}"
              </div>
            </div>

            {/* 3. Condiciones y Medidas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Condiciones */}
              <div className="space-y-3">
                <h4 className="font-titular text-xs font-bold text-carbon/50 uppercase tracking-wider">Condiciones Detectadas en el Sitio</h4>
                <div className="text-sm bg-slate-50 p-4 rounded-xl border border-carbon/5 min-h-[80px]">
                  {reporteVisita.condicionesSitio || "No se especificaron condiciones especiales del sitio."}
                </div>
              </div>

              {/* Medidas */}
              <div className="space-y-3">
                <h4 className="font-titular text-xs font-bold text-carbon/50 uppercase tracking-wider">Medidas y Dimensionamiento</h4>
                <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b"><td className="py-2 text-carbon/50">Largo</td><td className="py-2 font-mono text-right">{reporteVisita.medidas.largo || 0} m</td></tr>
                      <tr className="border-b"><td className="py-2 text-carbon/50">Ancho</td><td className="py-2 font-mono text-right">{reporteVisita.medidas.ancho || 0} m</td></tr>
                      {reporteVisita.medidas.altura > 0 && (
                        <tr className="border-b"><td className="py-2 text-carbon/50">Altura de Trabajo</td><td className="py-2 font-mono text-right">{reporteVisita.medidas.altura || 0} m</td></tr>
                      )}
                      <tr><td className="py-2 text-carbon/50 font-bold">Área Estimada</td><td className="py-2 font-mono font-bold text-verde-profundo text-right">{reporteVisita.medidas.areaCalculada || 0} m²</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* 4. Evidencia Fotográfica */}
            {reporteVisita.fotos && reporteVisita.fotos.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">Evidencia Fotográfica de la Visita</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {reporteVisita.fotos.map((f, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden border border-carbon/10 shadow-sm aspect-video bg-slate-900">
                      <img src={f} alt={`Evidencia de diagnóstico ${idx + 1}`} className="object-cover w-full h-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-carbon/40 mt-8 font-cuerpo print:hidden">
          Este es un documento técnico digital emitido por SAUCEDA Construye · León, Gto.
        </div>

        <style>{`
          @media print {
            body {
              background-color: white !important;
              color: black !important;
            }
            .print\\:hidden, button, nav, footer {
              display: none !important;
            }
            .bg-white, .bg-slate-50, .bg-slate-50\\/50 {
              background-color: transparent !important;
              border-color: #cbd5e1 !important;
            }
            .shadow-xl, .shadow-md, .shadow-sm {
              box-shadow: none !important;
            }
            .max-w-3xl {
              max-width: 100% !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .rounded-3xl, .rounded-2xl, .rounded-xl {
              border-radius: 0.5rem !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
