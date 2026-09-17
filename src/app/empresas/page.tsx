import { Encabezado } from "@/components/Encabezado";
import { TablaEmpresas } from "@/components/TablaEmpresas";
import { listarEmpresas } from "@/app/actions/empresas";
import { INDUSTRIAS_COMUNES } from "@/lib/types";
import { listarAsesoresActivos, obtenerUsuarioActual } from "@/app/actions/usuarios";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Vista de Lista (Index) de Empresas B2B */
export default async function PaginaEmpresas() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  let empresas = [];
  let asesores: { id: string; nombre: string }[] = [];

  try {
    const [empresasRes, asesoresRes] = await Promise.all([
      listarEmpresas(),
      listarAsesoresActivos(),
    ]);
    empresas = empresasRes;
    asesores = asesoresRes;
  } catch (err: any) {
    if (err instanceof Error && err.message.includes("No autorizado")) {
      redirect("/login");
    }
    console.error("Error al cargar empresas:", err);
  }

  // Recolectar industrias dinámicas combinando las registradas con el catálogo sugerido
  const industriasSet = new Set<string>(INDUSTRIAS_COMUNES);
  empresas.forEach((e) => {
    if (e.industry && e.industry.trim()) {
      industriasSet.add(e.industry.trim());
    }
  });
  const industriasDisponibles = Array.from(industriasSet);

  return (
    <main className="min-h-screen pb-12 bg-carbon/5">
      <Encabezado />
      <div className="mx-auto max-w-[1700px] px-4 pt-6">
        {/* Cabecera del Módulo */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-verde-profundo/10 text-base text-verde-profundo border border-verde-profundo/20">
                🏢
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-verde-profundo font-titular">
                Módulo B2B · Cuentas Corporativas
              </span>
            </div>
            <h1 className="mt-1 font-titular text-3xl font-bold text-carbon">
              Empresas
            </h1>
            <p className="mt-1 text-xs text-carbon/60 max-w-xl">
              Administra cuentas comerciales, consolida personas de contacto (prospectos)
              y supervisa el valor de las oportunidades de venta (negocios) vinculadas.
            </p>
          </div>
        </div>

        {/* Tabla interactiva con filtros y creación */}
        <TablaEmpresas
          empresasIniciales={empresas}
          asesores={asesores}
          industriasDisponibles={industriasDisponibles}
        />
      </div>
    </main>
  );
}
