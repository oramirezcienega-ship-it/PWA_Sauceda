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

/** Envía un mensaje de texto por WhatsApp. Devuelve el resultado. */
export async function enviarWhatsAppTexto(
  telefono: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);
    if (!token || !phoneId) {
      return {
        ok: false,
        error: "WhatsApp no está configurado (faltan credenciales).",
      };
    }
    if (!to) return { ok: false, error: "Teléfono inválido." };

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
      const detalle = await res.text();
      console.error("WhatsApp no enviado:", res.status, detalle);
      return {
        ok: false,
        error:
          res.status === 400 || res.status === 401
            ? "Meta rechazó el envío. Suele ser que el cliente no te ha escrito en las últimas 24 h (se requiere plantilla) o el número no está habilitado."
            : `Meta respondió con error ${res.status}.`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error al enviar WhatsApp:", err);
    return { ok: false, error: "Error de red al enviar el WhatsApp." };
  }
}

/**
 * Envía un mensaje por WhatsApp usando una PLANTILLA aprobada (best-effort).
 * Sirve para el primer contacto "en frío" (fuera de la ventana de 24 h).
 *
 *  - parametrosCuerpo: valores para los {{1}}, {{2}}, … del cuerpo.
 *  - urlBotonParam: si la plantilla tiene un botón de URL dinámica, este es
 *    el valor de su parámetro (p. ej. el token del portal). Opcional.
 */
export async function enviarWhatsAppPlantilla(
  telefono: string,
  plantilla: string,
  idioma: string,
  parametrosCuerpo: string[] = [],
  urlBotonParam?: string,
): Promise<void> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);
    if (!token || !phoneId || !to || !plantilla) return;

    const components: Record<string, unknown>[] = [];
    if (parametrosCuerpo.length > 0) {
      components.push({
        type: "body",
        parameters: parametrosCuerpo.map((text) => ({ type: "text", text })),
      });
    }
    if (urlBotonParam) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: urlBotonParam }],
      });
    }

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
          type: "template",
          template: {
            name: plantilla,
            language: { code: idioma },
            ...(components.length ? { components } : {}),
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(
        "WhatsApp (plantilla) no enviado:",
        res.status,
        await res.text(),
      );
    }
  } catch (err) {
    console.error("Error al enviar WhatsApp (plantilla):", err);
  }
}
