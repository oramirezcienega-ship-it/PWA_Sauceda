import { supabaseServidor } from "../../src/lib/supabase/server";
import { procesarBusquedaWeb } from "../../src/lib/asesoria/ia-busqueda";

/**
 * Netlify Background Function: procesa una búsqueda de casas en internet
 * (`busquedas_web`) con IA. El sufijo "-background" le da hasta 15 minutos.
 * La dispara la server action `iniciarBusquedaWeb` con el token CRON_SECRET.
 */
export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const { id } = JSON.parse(event.body || "{}");
    if (!id || typeof id !== "string") return { statusCode: 400, body: "Falta id" };
    await procesarBusquedaWeb(supabaseServidor(), id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[busqueda-web-background]", err);
    return { statusCode: 500, body: String(err) };
  }
};
