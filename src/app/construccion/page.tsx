import { Encabezado } from "@/components/Encabezado";
import { TableroCotizaciones } from "@/components/TableroCotizaciones";
import { TableroProductos } from "@/components/TableroProductos";
import { listarCotizaciones } from "@/app/actions/cotizaciones";
import { listarProspectos } from "@/app/actions/prospectos";
import { obtenerUsuarioActual, listarAsesoresActivos } from "@/app/actions/usuarios";
import { listarProductosServicios } from "@/app/actions/productos";
import type { Cotizacion, Prospecto, ProductoServicio } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaginaConstruccion({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  const tab = searchParams?.tab || "cotizaciones";

  let cotizaciones: Cotizacion[] = [];
  let prospectos: Prospecto[] = [];
  let inspectores: { id: string; nombre: string }[] = [];
  let productos: ProductoServicio[] = [];
  let errorMsj = "";

  try {
    cotizaciones = await listarCotizaciones();
    prospectos = await listarProspectos();
    inspectores = await listarAsesoresActivos();
    productos = await listarProductosServicios();
  } catch (err) {
    errorMsj = err instanceof Error ? err.message : "Error desconocido al cargar datos.";
  }

  if (errorMsj) {
    if (errorMsj.includes("No autorizado")) {
      redirect("/login");
    }
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-[1700px] px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Sauceda Construye
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo font-cuerpo">
            No se pudo cargar el módulo de Construcción. Detalle: {errorMsj}.
            Si es la primera vez, asegúrate de correr las migraciones en Supabase.
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
      <div className="mx-auto max-w-[1700px] px-4 pt-5">
        
        {/* Encabezado y Selector de Pestañas */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon/10 pb-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Sauceda Construye
            </h1>
            <p className="mt-1 text-sm text-carbon/60 font-cuerpo">
              Gestión de cotizaciones, inspecciones físicas y catálogo de precios.
            </p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl border border-carbon/5 self-start sm:self-center font-cuerpo text-xs font-semibold">
            <Link
              href="/construccion?tab=cotizaciones"
              className={`px-4 py-2 rounded-lg transition-all ${
                tab === "cotizaciones"
                  ? "bg-white text-sauce shadow-sm"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              📋 Cotizaciones e Inspecciones
            </Link>
            <Link
              href="/construccion?tab=catalogo"
              className={`px-4 py-2 rounded-lg transition-all ${
                tab === "catalogo"
                  ? "bg-white text-sauce shadow-sm"
                  : "text-carbon/60 hover:text-carbon"
              }`}
            >
              📦 Catálogo de Conceptos
            </Link>
          </div>
        </div>

        {tab === "catalogo" ? (
          <TableroProductos productosIniciales={productos} />
        ) : (
          <TableroCotizaciones
            cotizacionesIniciales={cotizaciones}
            prospectos={prospectosSimples}
            inspectores={inspectores}
          />
        )}
      </div>
    </main>
  );
}

