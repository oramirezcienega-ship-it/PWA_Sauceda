import { supabaseServidor } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PaginaDetalleCitaProps {
  params: {
    id: string;
  };
}

function formatearFechaLegible(fechaStr: string, horaStr: string): string {
  try {
    const [y, m, d] = fechaStr.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const diaSemana = dias[fecha.getDay()];
    const mesLabel = meses[fecha.getMonth()];

    const partesHora = horaStr.split(":");
    let hrs = parseInt(partesHora[0], 10) || 0;
    const mins = partesHora[1] || "00";
    const ampm = hrs >= 12 ? "PM" : "AM";
    hrs = hrs % 12;
    if (hrs === 0) hrs = 12;

    return `${diaSemana} ${d} de ${mesLabel} a las ${hrs}:${mins} ${ampm}`;
  } catch (e) {
    return `${fechaStr} a las ${horaStr}`;
  }
}

export default async function PaginaDetalleCita({ params }: PaginaDetalleCitaProps) {
  const sb = supabaseServidor();

  // Obtener la cita y el perfil del asesor/operador
  const { data: cita, error } = await sb
    .from("agenda_citas")
    .select("*, perfiles(nombre, telefono)")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !cita) {
    notFound();
  }

  const fechaLegible = formatearFechaLegible(cita.fecha, cita.hora_inicio);
  const nombreAsesor = cita.perfiles?.nombre || "Técnico Asignado";
  const telefonoAsesor = cita.perfiles?.telefono || "";

  return (
    <main className="min-h-screen bg-slate-50/50 py-12 px-4 flex items-center justify-center font-cuerpo">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-carbon/5 p-8 space-y-6 text-center">
        {/* Icono animado/bonito */}
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-sauce/10 text-sauce flex items-center justify-center rounded-full text-4xl animate-bounce">
            📅
          </div>
        </div>

        {/* Cabecera */}
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-verde-profundo/10 text-verde-profundo">
            Visita Confirmada ✓
          </span>
          <h1 className="text-2xl font-bold text-verde-profundo font-titular leading-snug">
            Detalles de tu Visita Técnica
          </h1>
          <p className="text-sm text-carbon/60">
            Un especialista de SAUCEDA acudirá a tu domicilio para la inspección técnica gratuita.
          </p>
        </div>

        {/* Detalles en tarjeta */}
        <div className="bg-slate-50 rounded-2xl p-5 text-left border border-carbon/5 space-y-4">
          <div>
            <span className="block text-xs font-semibold text-carbon/40 uppercase tracking-wider">Fecha y Hora</span>
            <span className="text-sm font-bold text-carbon/80">{fechaLegible}</span>
          </div>

          {cita.fraccionamiento && (
            <div>
              <span className="block text-xs font-semibold text-carbon/40 uppercase tracking-wider">Ubicación</span>
              <span className="text-sm font-semibold text-carbon/80">Col. {cita.fraccionamiento}</span>
            </div>
          )}

          <div className="border-t border-carbon/5 pt-3">
            <span className="block text-xs font-semibold text-carbon/40 uppercase tracking-wider">Técnico Asignado</span>
            <span className="text-sm font-bold text-verde-profundo">{nombreAsesor}</span>
            {telefonoAsesor && (
              <span className="block text-xs text-carbon/50 mt-0.5">Tel: {telefonoAsesor}</span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="space-y-3 pt-2">
          {telefonoAsesor && (
            <a
              href={`https://wa.me/${telefonoAsesor.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white py-3 px-4 font-semibold text-sm transition shadow-sm"
            >
              💬 Contactar Técnico por WhatsApp
            </a>
          )}
          
          <div className="text-xs text-carbon/40 leading-relaxed px-2">
            Si necesitas reprogramar o cancelar esta cita, por favor ponte en contacto con nosotros al conmutador de SAUCEDA o responde al chat de WhatsApp.
          </div>
        </div>

        <div className="pt-4 border-t border-carbon/5 flex justify-center items-center gap-1.5 text-xs text-carbon/40">
          <span>SAUCEDA Construcción</span>
          <span>•</span>
          <span>León, Gto.</span>
        </div>
      </div>
    </main>
  );
}
