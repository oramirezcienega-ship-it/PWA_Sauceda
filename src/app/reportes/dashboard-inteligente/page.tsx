import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { DashboardInteligente } from "@/components/DashboardInteligente";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PaginaDashboardInteligente() {
  try {
    // Exigir rol de administrador a nivel servidor (SSR)
    await requireAdministrador();

    return <DashboardInteligente />;
  } catch (error) {
    // Vista de acceso denegado si no es administrador o usuario inactivo
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 text-[#0F172A] font-cuerpo">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h1 className="font-fraunces text-2xl font-bold text-[#2D4A2B] mb-2">Acceso Denegado</h1>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Esta sección de análisis avanzado y control operativo es exclusiva para usuarios con rol de <strong>Administrador</strong>.
          </p>

          <Link
            href="/"
            className="inline-block w-full rounded-xl bg-[#2D4A2B] px-4 py-2.5 text-sm font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-md"
          >
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }
}
