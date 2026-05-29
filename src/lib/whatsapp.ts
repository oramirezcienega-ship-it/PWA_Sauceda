/**
 * Envío SALIENTE de mensajes por WhatsApp (Meta Cloud API). Best-effort:
 * si no hay credenciales configuradas o falla el envío, no interrumpe la
 * operación principal.
 *
 * Variables de entorno necesarias:
 *  - WHATSAPP_TOKEN            (token de acceso de la app de WhatsApp)
 *  - WHATSAPP_PHONE_NUMBER_ID  (ID del número emisor)
 *
 * Nota de Meta: el texto libre solo se entrega dentro de la ventana de 24 h
 * (cuando el cliente escribió primero). Para contactos fuera de esa ventana
 * se requiere una plantilla aprobada.
 */

const API_VERSION = "v21.0";

/** Normaliza un teléfono mexicano a formato internacional (52 + 10 dígitos). */
function normalizarTelefono(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d;
  if (d.length === 10) return "52" + d;
  return d;
}

/** Envía un mensaje de texto por WhatsApp (best-effort). */
export async function enviarWhatsAppTexto(
  telefono: string,
  texto: string,
): Promise<void> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);
    if (!token || !phoneId || !to) return;

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body: texto },
        }),
      },
    );
    if (!res.ok) {
      console.error("WhatsApp no enviado:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Error al enviar WhatsApp:", err);
  }
}
