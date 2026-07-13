import { obtenerProyectoPorId, obtenerAlternativas, AlternativaConsejo } from "@/app/actions/consejo";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { DetalleProyecto } from "@/components/DetalleProyecto";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PaginaDetalleProyectoProps {
  params: {
    id: string;
  };
}

export default async function PaginaDetalleProyecto({ params }: PaginaDetalleProyectoProps) {
  const { id } = params;
  const userActual = await obtenerUsuarioActual();

  // Verificar rol de admin para acceso
  if (!userActual || userActual.rol !== "admin") {
    return (
      <main className="min-h-screen pb-10 bg-[#F8FAFC]">
        <div className="mx-auto max-w-4xl px-4 pt-12">
          <div className="text-center bg-white border border-carbon/10 rounded-xl p-8 shadow-sm">
            <span className="text-4xl">🚫</span>
            <h1 className="mt-4 font-titular text-2xl font-bold text-carbon">
              Acceso Restringido
            </h1>
            <p className="mt-2 text-sm text-carbon/60 max-w-md mx-auto">
              La sección <strong>El Consejo</strong> es exclusiva para usuarios con rol de administrador.
            </p>
          </div>
        </div>
      </main>
    );
  }

  let data = null;
  let alternativas: AlternativaConsejo[] = [];
  let errorMsg = "";

  try {
    const [projData, altsData] = await Promise.all([
      obtenerProyectoPorId(id),
      obtenerAlternativas(id),
    ]);
    data = projData;
    alternativas = altsData;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error al cargar los datos del proyecto.";
  }

  if (errorMsg) {
    return (
      <main className="min-h-screen pb-10 bg-[#F8FAFC]">
        <div className="mx-auto max-w-4xl px-4 pt-12">
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-semibold">
            <h3 className="font-bold mb-1">Error al cargar el proyecto</h3>
            <p className="text-xs font-normal">{errorMsg}</p>
            <Link href="/consejo" className="text-xs font-bold text-[#E05A2B] hover:underline mt-3 block">
              ← Volver a proyectos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen pb-10 bg-[#F8FAFC]">
        <div className="mx-auto max-w-4xl px-4 pt-12">
          <div className="text-center bg-white border border-carbon/10 rounded-xl p-8 shadow-sm">
            <span className="text-4xl">🔍</span>
            <h1 className="mt-4 font-titular text-2xl font-bold text-carbon">
              Proyecto No Encontrado
            </h1>
            <p className="mt-2 text-sm text-carbon/60 max-w-md mx-auto mb-4">
              El proyecto con el ID solicitado no existe o fue eliminado.
            </p>
            <Link
              href="/consejo"
              className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Volver a la lista
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10 bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <DetalleProyecto
          proyecto={data.proyecto}
          asesores={data.asesores}
          alternativasIniciales={alternativas}
        />
      </div>
    </main>
  );
}
