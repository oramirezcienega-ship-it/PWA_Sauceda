import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import { FinanzasClient } from "@/components/finanzas/FinanzasClient";

export const metadata = {
  title: "Finanzas & Contabilidad | CRM SAUCEDA",
  description: "Módulo principal de Finanzas, Estado de Resultados, Balance General y Flujo de Efectivo con partida doble automática."
};

export default async function FinanzasPage() {
  await requireAdministrador();

  return <FinanzasClient />;
}
