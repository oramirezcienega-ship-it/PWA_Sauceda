import { analizarPendientes } from "../../src/features/llamadas-ia/sugerencias";

/**
 * Netlify Background Function: la IA analiza las llamadas sugeridas pendientes
 * (prioridad, hora y gancho). El sufijo "-background" le da hasta 15 minutos.
 * La dispara la server action `analizarSugerenciasIA` con el token CRON_SECRET.
 */
export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const r = await analizarPendientes();
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...r }) };
  } catch (err) {
    console.error("[sugerencias-llamadas-background]", err);
    return { statusCode: 500, body: String(err) };
  }
};
