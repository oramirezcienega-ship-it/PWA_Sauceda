import { Encabezado } from "@/components/Encabezado";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import { WhatsAppAdminClient } from "@/components/WhatsAppAdminClient";

export const dynamic = "force-dynamic";

/**
 * Panel de Gestión de WhatsApp:
 * - Conexión & Coexistencia (Embedded Signup de Meta con soporte para WhatsApp Business Móvil + Cloud API)
 * - Plantillas de Mensajes de Meta
 */
export default async function PaginaWhatsApp() {
  const r = await listarPlantillasWhatsApp();

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-4xl px-4 pt-5">
        <div className="mb-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            WhatsApp Business & Cloud API
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            Gestiona la vinculación de tu número en modo Coexistencia (app móvil + web) y consulta tus plantillas de mensajes.
          </p>
        </div>

        <WhatsAppAdminClient plantillasResult={r} />
      </div>
    </main>
  );
}
