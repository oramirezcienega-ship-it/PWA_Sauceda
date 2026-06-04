import { Encabezado } from "@/components/Encabezado";
import { Conversaciones } from "@/components/Conversaciones";

export const dynamic = "force-dynamic";

/** Bandeja de conversaciones de WhatsApp (chat bidireccional). */
export default function PaginaConversaciones() {
  return (
    <main className="min-h-screen pb-6">
      <Encabezado />
      <div className="mx-auto max-w-6xl px-4 pt-5">
        <div className="mb-4">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Conversaciones
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            Mensajes de WhatsApp con tus clientes. Responde con texto dentro de
            la ventana de 24 h; fuera de ella, usa una plantilla aprobada.
          </p>
        </div>
        <Conversaciones />
      </div>
    </main>
  );
}
