import { Encabezado } from "@/components/Encabezado";
import { TableroCotizaciones } from "@/components/TableroCotizaciones";
import { listarCotizaciones } from "@/app/actions/cotizaciones";
import { listarProspectos } from "@/app/actions/prospectos";
import { listarAsesoresActivos } from "@/app/actions/usuarios";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";
import type { Cotizacion, Prospecto } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaginaConstruccion({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  // Solo se manda a /login si de verdad no hay sesion. Antes, cualquier falla
  // transitoria al leer el perfil devolvia null y el redireccionamiento a
  // /login terminaba en /dashboard (el middleware lo reenvia si hay sesion).
  const usuario = await usuarioActual().catch(() => null);
  if (!usuario) {
    redirect("/login");
  }

  const tab = searchParams?.tab || "cotizaciones";
  if (tab === "catalogo") {
    redirect("/productos");
  }

  let cotizaciones: Cotizacion[] = [];
  let prospectos: Prospecto[] = [];
  let inspectores: { id: string; nombre: string }[] = [];
  let errorMsj = "";

  try {
    cotizaciones = await listarCotizaciones();
    prospectos = await listarProspectos();
    inspectores = await listarAsesoresActivos();
  } catch (err) {
    errorMsj = err instanceof Error ? err.message : "Error desconocido al cargar datos.";
  }

  if (errorMsj) {
    // Ya se comprobó que hay sesión: no se redirige a /login (terminaría en
    // /dashboard); se muestra el error con opción de reintentar.
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
          <Link
            href="/construccion"
            className="mt-3 inline-block rounded-lg bg-verde-profundo px-4 py-2 text-xs font-bold text-crema"
          >
            Reintentar
          </Link>
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
              Presupuestos de obra por APU, cotizaciones, inspecciones físicas y seguimiento.
            </p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl border border-carbon/5 self-start sm:self-center font-cuerpo text-xs font-semibold flex-wrap gap-1">
            <Link
              href="/construccion"
              className="px-4 py-2 rounded-lg transition-all bg-white text-sauce shadow-sm flex items-center gap-1.5"
            >
              <span>📋</span> Cotizaciones y Presupuestos
            </Link>
            <Link
              href="/productos"
              className="px-4 py-2 rounded-lg transition-all text-carbon/70 hover:text-sauce hover:bg-white/60 flex items-center gap-1.5"
            >
              <span>📦</span> Catálogo de Productos y Servicios
            </Link>
            <Link
              href="/comisiones"
              className="px-4 py-2 rounded-lg transition-all text-verde-profundo bg-amber-50 hover:bg-amber-100 border border-amber-200/60 shadow-xs flex items-center gap-1.5"
              title="Ir al módulo de Comisiones de Asesores"
            >
              <span>💰</span> Comisiones Asesores
            </Link>
            <Link
              href="/visualizador"
              className="px-4 py-2 rounded-lg transition-all text-verde-profundo bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 shadow-xs flex items-center gap-1.5"
            >
              <span>✨</span> Visualizador IA
            </Link>
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
}

