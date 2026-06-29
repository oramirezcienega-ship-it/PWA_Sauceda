import { Encabezado } from "@/components/Encabezado";
import { TableroCotizaciones } from "@/components/TableroCotizaciones";
import { listarCotizaciones } from "@/app/actions/cotizaciones";
import { listarProspectos } from "@/app/actions/prospectos";
import { listarAsesoresActivos } from "@/app/actions/usuarios";
import type { Cotizacion, Prospecto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PaginaConstruccion() {
  let cotizaciones: Cotizacion[] = [];
  let prospectos: Prospecto[] = [];
  let inspectores: { id: string; nombre: string }[] = [];
  let errorMsj = "";

  try {
    cotizaciones = await listarCotizaciones();
    prospectos = await listarProspectos();
    // Obtener inspectores (que son los perfiles activos en la app)
    inspectores = await listarAsesoresActivos();
  } catch (err) {
    errorMsj = err instanceof Error ? err.message : "Error desconocido al cargar datos.";
  }

  if (errorMsj) {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Sauceda Construye
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo font-cuerpo">
            No se pudo cargar el módulo de Construcción. Detalle: {errorMsj}.
            Si es la primera vez, asegúrate de correr la migración <span className="font-mono">0027_construccion_cotizaciones.sql</span> en Supabase.
          </p>
        </div>
      </main>
    );
  }

  // Mapear prospectos a formato simple para el select
  const prospectosSimples = prospectos.map((p) => ({
    id: p.id,
    nombre: p.nombreCompleto || p.nombre || p.id,
  }));

  return (
    <main className="min-h-screen pb-10 bg-slate-50/30">
      <Encabezado />
      <div className="mx-auto max-w-6xl px-4 pt-5">
        <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Sauceda Construye
            </h1>
            <p className="mt-1 text-sm text-carbon/60 font-cuerpo">
              Gestión de cotizaciones, inspecciones físicas y flujo de aprobación dual.
            </p>
          </div>
        </div>

        <TableroCotizaciones
          cotizacionesIniciales={cotizaciones}
          prospectos={prospectosSimples}
          inspectores={inspectores}
        />
      </div>
    </main>
  );
}
