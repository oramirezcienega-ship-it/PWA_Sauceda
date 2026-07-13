import { obtenerProyectos, ProyectoConsejo } from "@/app/actions/consejo";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { ListaProyectos } from "@/components/ListaProyectos";

export const dynamic = "force-dynamic";

export default async function PaginaConsejo() {
  const userActual = await obtenerUsuarioActual();

  // Verificar rol de admin para acceso a la sección
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
              Si crees que esto es un error, por favor contacta al soporte técnico.
            </p>
          </div>
        </div>
      </main>
    );
  }

  let proyectos: ProyectoConsejo[] = [];
  let errorMsg = "";

  try {
    proyectos = await obtenerProyectos();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error desconocido al listar proyectos.";
  }

  return (
    <main className="min-h-screen pb-10 bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 pt-8">
        {/* Encabezado Principal */}
        <div className="mb-8">
          <h1 className="font-titular text-3xl font-black text-carbon tracking-tight flex items-center gap-2">
            🤝 El Consejo
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            Consultas estratégicas multilaterales con IA para SAUCEDA Bienes Raíces.
          </p>
        </div>

        {errorMsg ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-semibold">
            <h3 className="font-bold mb-1">Error al conectar con la Base de Datos</h3>
            <p className="text-xs font-normal">
              Asegúrate de haber corrido la migración <code>0040_consejo_ia.sql</code> en tu panel de Supabase.
            </p>
            <p className="text-[10px] text-red-500 font-mono mt-2">{errorMsg}</p>
          </div>
        ) : (
          <ListaProyectos proyectosIniciales={proyectos} />
        )}
      </div>
    </main>
  );
}
