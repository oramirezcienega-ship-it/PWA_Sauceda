/**
 * Envío SALIENTE de mensajes por Instagram Direct Messages (Meta Graph API).
 *
 * Variables de entorno necesarias:
 *  - INSTAGRAM_PAGE_TOKEN / MESSENGER_PAGE_TOKEN (token de acceso de la página de Facebook vinculada)
 */

const API_VERSION = "v21.0";

/** Envía un mensaje de texto por Instagram DM. Devuelve el resultado. */
export async function enviarInstagramTexto(
  igsid: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = process.env.INSTAGRAM_PAGE_TOKEN || process.env.MESSENGER_PAGE_TOKEN;
    if (!token) {
      return {
        ok: false,
        error: "Instagram no está configurado (falta INSTAGRAM_PAGE_TOKEN / MESSENGER_PAGE_TOKEN).",
      };
    }
    if (!igsid) return { ok: false, error: "IGSID inválido." };

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/me/messages?access_token=${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: igsid },
          message: { text: texto },
        }),
      },
    );

    if (!res.ok) {
      const detalle = await res.text();
      console.error("Instagram no enviado:", res.status, detalle);
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
    console.error("Error al enviar Instagram:", err);
    return { ok: false, error: "Error de red al enviar el mensaje por Instagram." };
  }
}
