import { obtenerInformacionAsesor } from "@/app/actions/agenda";
import { ReservarCitaCliente } from "@/components/ReservarCitaCliente";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PaginaAgendaProps {
  params: {
    id: string;
  };
  searchParams?: {
    prospecto_id?: string;
  };
}

export default async function PaginaAgendaAsesor({
  params,
  searchParams,
}: PaginaAgendaProps) {
  let asesor = null;

  try {
    asesor = await obtenerInformacionAsesor(params.id);
  } catch (err) {
    console.error("Error al obtener asesor:", err);
  }

  // Si no se encuentra el asesor o está inactivo, mostrar error amigable
  if (!asesor) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 font-cuerpo space-y-4">
          <div className="text-3xl">📅</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">Agenda no disponible</h2>
          <p className="text-sm text-carbon/60 leading-relaxed">
            El calendario solicitado no existe o el asesor no está disponible para recibir reservaciones en este momento.
          </p>
          <div className="pt-2 border-t border-carbon/5">
            <p className="text-xs text-carbon/40">
              Por favor, comunícate con SAUCEDA Bienes Raíces o solicita un nuevo enlace.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/50 py-12 flex items-center justify-center">
      <ReservarCitaCliente
        asesor={{
          id: asesor.id,
          nombre: asesor.nombre,
          telefono: asesor.telefono || "",
          duracion_cita: asesor.duracion_cita || 60,
        }}
        prospectoId={searchParams?.prospecto_id}
      />
    </main>
  );
}
