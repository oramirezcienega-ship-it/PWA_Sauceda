import type { SupabaseClient } from "@supabase/supabase-js";
import { variantesTelefono } from "@/lib/telefono";

/**
 * Entrega de la respuesta de Sofía a la Background Function de Netlify.
 *
 * El webhook de Meta corre como función síncrona de Netlify (límite ~10 s).
 * Un lead nuevo (crear prospecto/expediente + bienvenida + espera de ráfaga +
 * llamada a la IA) puede pasar de ese límite y Netlify corta el proceso antes
 * de enviar el WhatsApp, sin dejar rastro. Por eso la respuesta se delega a
 * `netlify/functions/responder-background` (hasta 15 min) y el webhook
 * contesta a Meta de inmediato.
 */

/** Id del mensaje entrante más reciente del hilo (para consolidar ráfagas). */
export async function ultimoEntranteId(
  sb: SupabaseClient,
  telefono: string,
): Promise<string | null> {
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("id")
    .in("telefono", variantesTelefono(telefono))
    .eq("direccion", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Intenta delegar la respuesta a la Background Function.
 * Devuelve true solo si Netlify aceptó la invocación (202); en cualquier otro
 * caso el llamador debe responder en línea como respaldo.
 */
export async function delegarRespuestaIA(
  sb: SupabaseClient,
  telefono: string,
  expedienteId?: string | null,
): Promise<boolean> {
  const secreto = process.env.CRON_SECRET;
  const base = (process.env.URL || process.env.SITE_URL || "").replace(/\/$/, "");
  if (!secreto || !base) return false;

  try {
    const entranteId = await ultimoEntranteId(sb, telefono);
    const res = await fetch(`${base}/.netlify/functions/responder-background`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secreto}`,
      },
      body: JSON.stringify({ telefono, expedienteId: expedienteId ?? null, entranteId }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 202) return true;
    console.warn(`[IA Disparo] La función de fondo respondió ${res.status}; se responde en línea.`);
  } catch (err) {
    console.warn("[IA Disparo] No se pudo delegar a la función de fondo; se responde en línea.", err);
  }
  return false;
}
