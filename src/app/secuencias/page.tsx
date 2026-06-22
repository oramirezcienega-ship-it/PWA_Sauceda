import { SecuenciasClient } from "@/components/SecuenciasClient";
import { Encabezado } from "@/components/Encabezado";

export const dynamic = "force-dynamic";

/**
 * Página principal del módulo de Marketing Automation Multicanal (Secuencias).
 * Renderiza el encabezado global de la aplicación y el componente interactivo.
 */
export default function PaginaSecuencias() {
  return (
    <main className="min-h-screen pb-10 bg-slate-50/30">
      <Encabezado />
      <SecuenciasClient />
    </main>
  );
}
