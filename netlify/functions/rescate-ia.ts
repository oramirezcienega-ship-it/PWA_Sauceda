import { supabaseServidor } from "../../src/lib/supabase/server";
import { rescatarConversacionesSinRespuesta } from "../../src/lib/ia/rescate";

/**
 * Netlify Scheduled Function (programada en netlify.toml).
 * Vuelve a intentar la respuesta de Sofía en conversaciones que quedaron sin
 * contestar. Máximo 2 por corrida para no rebasar el límite de 30 s.
 */
export const handler = async () => {
  try {
    const r = await rescatarConversacionesSinRespuesta(supabaseServidor(), { maximo: 2 });
    if (r.rescatadas.length > 0) {
      console.log(`[IA Rescate] Rescatadas: ${r.rescatadas.join(", ")}`);
    }
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (err) {
    console.error("[IA Rescate] Error:", err);
    return { statusCode: 500, body: String(err) };
  }
};
