import crypto from "crypto";

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Genera un Access Token firmado para Twilio Voice WebRTC SDK.
 * Permite que el navegador (ej. con AirPods) se registre como cliente receptor/emisor de llamadas.
 */
export function generarTwilioVoiceToken(identity = "oscar"): { token: string; identity: string; expiraEn: number } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    throw new Error(
      "Faltan variables de entorno de Twilio Voice (TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID)."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = 3600 * 4; // 4 horas de sesión activa
  const exp = now + ttl;

  const header = {
    typ: "JWT",
    alg: "HS256",
    cty: "twilio-fpa;v=1",
  };

  const payload = {
    jti: `${apiKey}-${now}-${Math.random().toString(36).slice(2, 7)}`,
    iss: apiKey,
    sub: accountSid,
    iat: now,
    nbf: now,
    exp: exp,
    grants: {
      identity: identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: appSid },
      },
    },
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const toSign = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto.createHmac("sha256", apiSecret).update(toSign).digest();
  const signatureEncoded = base64UrlEncode(signature);

  return {
    token: `${toSign}.${signatureEncoded}`,
    identity,
    expiraEn: exp,
  };
}
