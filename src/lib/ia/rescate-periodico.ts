import { supabaseServidor } from "@/lib/supabase/server";
import { rescatarConversacionesSinRespuesta } from "@/lib/ia/rescate";

/** Revisión periódica de chats sin respuesta (se inicia desde src/instrumentation.ts). */
const PRIMERA_REVISION_MS = 60 * 1000; // deja que el contenedor viejo termine de salir
const INTERVALO_MS = 2 * 60 * 1000;

export function iniciarRescateIA(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.IA_RESCATE === "off") return;
  // Staging comparte base de datos; solo producción rescata conversaciones.
  const sitio = process.env.SITE_URL ?? "";
  if (sitio.includes("sslip.io") || sitio.includes("192.168.100.253")) return;

  let corriendo = false;
  const revisar = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      const r = await rescatarConversacionesSinRespuesta(supabaseServidor(), { maximo: 3 });
      if (r.rescatadas.length > 0) {
        console.log(`[IA Rescate] Rescatadas: ${r.rescatadas.join(", ")}`);
      }
    } catch (err) {
      console.error("[IA Rescate] Error en la revisión periódica:", err);
    } finally {
      corriendo = false;
    }
  };

  setTimeout(() => {
    void revisar();
    setInterval(() => void revisar(), INTERVALO_MS).unref?.();
  }, PRIMERA_REVISION_MS).unref?.();
}
