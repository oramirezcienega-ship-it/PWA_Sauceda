/**
 * Envío SALIENTE de mensajes por Facebook Messenger (Meta Graph API).
 *
 * Variables de entorno necesarias:
 *  - MESSENGER_PAGE_TOKEN  (token de acceso de la página de Facebook)
 */

const API_VERSION = "v21.0";

/** Envía un mensaje de texto por Facebook Messenger. Devuelve el resultado. */
export async function enviarMessengerTexto(
  psid: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = process.env.MESSENGER_PAGE_TOKEN;
    if (!token) {
      return {
        ok: false,
        error: "Messenger no está configurado (falta MESSENGER_PAGE_TOKEN).",
      };
    }
    if (!psid) return { ok: false, error: "PSID inválido." };

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/me/messages?access_token=${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: psid },
          message: { text: texto },
        }),
      },
    );

    if (!res.ok) {
      const detalle = await res.text();
      console.error("Messenger no enviado:", res.status, detalle);
      let errorMsg = "";
      try {
        errorMsg = JSON.parse(detalle)?.error?.message ?? "";
      } catch {
        // non-JSON
      }
      return {
        ok: false,
        error: errorMsg || `Meta respondió con error ${res.status}.`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error al enviar Messenger:", err);
    return { ok: false, error: "Error de red al enviar el mensaje por Messenger." };
  }
}
