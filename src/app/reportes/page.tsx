import { CRMClient } from "@/components/CRMClient";

export const dynamic = "force-dynamic";

/**
 * Página principal de Reportes (anteriormente Dashboard CRM).
 * Renderiza el componente cliente interactivo.
 */
export default function PaginaReportes() {
  return <CRMClient />;
}
