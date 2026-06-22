/**
 * Integración con Twilio para el envío de mensajes SMS (best-effort).
 *
 * Variables de entorno requeridas:
 *  - TWILIO_ACCOUNT_SID
 *  - TWILIO_AUTH_TOKEN
 *  - TWILIO_PHONE_NUMBER
 */

/** Normaliza un teléfono al formato E.164 (ej. +521234567890). */
function normalizarTelefonoE164(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("52") && d.length >= 12) return "+" + d;
  if (d.length === 10) return "+52" + d;
  return "+" + d;
}

/** Envía un mensaje SMS usando Twilio REST API. */
export async function enviarSMS(
  telefono: string,
  mensaje: string,
): Promise<{ ok: boolean; error?: string; messageSid?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        ok: false,
        error: "Twilio no está configurado (faltan variables de entorno).",
      };
    }

    const to = normalizarTelefonoE164(telefono);
    if (!to || to.length < 10) {
      return {
        ok: false,
        error: `Teléfono inválido para SMS: ${telefono}`,
      };
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", fromNumber);
    params.append("Body", mensaje);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const detalle = await res.json();

    if (!res.ok) {
      console.error("Twilio SMS no enviado:", res.status, detalle);
      return {
        ok: false,
        error: detalle.message || `Twilio respondió con error ${res.status}.`,
      };
    }

    return { ok: true, messageSid: detalle.sid };
  } catch (err) {
    console.error("Error al enviar SMS por Twilio:", err);
    return { ok: false, error: "Error de red al enviar SMS." };
  }
}
