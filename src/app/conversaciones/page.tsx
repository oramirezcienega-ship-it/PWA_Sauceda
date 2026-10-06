import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { Conversaciones } from "@/components/Conversaciones";
import { listarConversaciones } from "@/app/actions/conversaciones";
import type { ConversacionResumen } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Lista precargada en el servidor: llega junto con el HTML (streaming) y no
 * espera en la fila de server actions del navegador, donde compite con la
 * campana, la barra de actividades y demás cargas iniciales.
 */
async function BandejaPrecargada() {
  let inicial: ConversacionResumen[] | undefined;
  try {
    inicial = await listarConversaciones();
  } catch {
    // Si falla, el componente cliente la carga por su cuenta.
  }
  return <Conversaciones inicial={inicial} />;
}

/** Esqueleto mientras llega la bandeja. */
function EsqueletoBandeja() {
  return (
    <div className="space-y-1.5 animate-pulse" aria-label="Cargando conversaciones">
      <div className="h-9 rounded-lg bg-carbon/5" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="h-[76px] rounded-lg border border-carbon/5 bg-white" />
      ))}
    </div>
  );
}

/** Bandeja de conversaciones de WhatsApp (chat bidireccional). */
export default function PaginaConversaciones() {
  return (
    <main className="min-h-screen pb-2 sm:pb-6">
      <Encabezado />
      <div className="mx-auto w-full max-w-[2400px] px-1.5 sm:px-6 xl:px-8 pt-1.5 sm:pt-5">
        {/* En móvil se omite el título: el espacio es para la bandeja. */}
        <div className="mb-3 hidden sm:block">
          <h1 className="font-titular text-2xl md:text-3xl font-semibold text-verde-profundo">
            Conversaciones
          </h1>
          <p className="mt-0.5 text-sm text-carbon/60">
            Mensajes de WhatsApp con tus clientes. Responde con texto dentro de la ventana de 24 h; fuera de ella, usa una plantilla aprobada.
          </p>
        </div>
        <Suspense fallback={<EsqueletoBandeja />}>
          <BandejaPrecargada />
        </Suspense>
      </div>
    </main>
  );
}
