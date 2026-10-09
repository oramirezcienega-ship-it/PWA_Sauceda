import { supabaseServidor } from "../../src/lib/supabase/server";
import { responderConIA } from "../../src/lib/ia/agente";
import { ultimoEntranteId } from "../../src/lib/ia/disparo";

/**
 * Netlify Background Function para el procesamiento asíncrono de la respuesta de la IA.
 * Nota: El sufijo "-background" en el nombre del archivo le indica a Netlify que debe
 * ejecutar esta función en segundo plano, permitiendo un tiempo de ejecución de hasta 15 minutos.
 */
export const handler = async (event: any, context: any) => {
  // Las background functions de Netlify reciben peticiones asíncronas
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Verificación de seguridad básica con el token CRON_SECRET
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.warn("[Netlify Background] Intento de acceso no autorizado al endpoint de fondo.");
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const { telefono, expedienteId, entranteId } = JSON.parse(event.body || "{}");
    
    if (!telefono) {
      return { statusCode: 400, body: "Falta el parámetro telefono" };
    }

    console.log(`[Netlify Background] Iniciando procesamiento asíncrono para el teléfono: ${telefono}, expediente: ${expedienteId}`);
    
    const sb = supabaseServidor();

    // Consolidar ráfagas: esperar 3 s y ceder si el cliente mandó otro mensaje
    // (esa invocación más reciente responderá a todo el hilo).
    if (entranteId) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const ultimo = await ultimoEntranteId(sb, telefono);
      if (ultimo && ultimo !== entranteId) {
        console.log(`[Netlify Background] Cediendo turno al mensaje más reciente de ${telefono}`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, cedido: true }) };
      }
    }

    await responderConIA(sb, { telefono, expedienteId });
    
    console.log(`[Netlify Background] Procesamiento de IA finalizado con éxito para ${telefono}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[Netlify Background] Error ejecutando responderConIA en segundo plano:", err);
    return { statusCode: 500, body: String(err) };
  }
};
