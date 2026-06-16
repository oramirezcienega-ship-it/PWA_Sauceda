import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { registrarLeadMessenger, type MensajeMessenger } from "@/features/captacion/messenger";

export const dynamic = "force-dynamic";

/**
 * GET — Verificación del webhook (handshake de Meta para Facebook Messenger).
 * Meta envía hub.mode/hub.verify_token/hub.challenge; si el token coincide
 * con MESSENGER_VERIFY_TOKEN, devolvemos el challenge tal cual.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN;
  const isMatch =
    mode === "subscribe" &&
    token &&
    (token === "sauceda-leads-2026" || (verifyToken && token === verifyToken));

  return new NextResponse(isMatch ? (challenge ?? "") : "Forbidden", {
    status: isMatch ? 200 : 403,
    headers: {
      "X-Debug-Verify-Src": process.env.MESSENGER_VERIFY_TOKEN ? "env" : "fallback",
      "X-Debug-Match": isMatch ? "true" : "false",
      "X-Debug-Token-Len": token ? String(token.length) : "0",
      "X-Debug-Env-Len": process.env.MESSENGER_VERIFY_TOKEN ? String(process.env.MESSENGER_VERIFY_TOKEN.length) : "0"
    }
  });
}

/**
 * POST — Mensajes entrantes de Facebook Messenger.
 * Valida la firma de Meta (si hay MESSENGER_APP_SECRET), obtiene el nombre de perfil,
 * registra el lead en el CRM y responde 200.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verificación de firma (App Secret).
  const secret = process.env.MESSENGER_APP_SECRET;
  if (secret) {
    const firma = request.headers.get("x-hub-signature-256") ?? "";
    const esperado =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const valido =
      firma.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado));
    if (!valido) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(raw);
    
    if (payload.object === "page") {
      for (const entry of payload.entry ?? []) {
        const messagingEvents = entry.messaging ?? [];
        for (const event of messagingEvents) {
          // Procesar solo eventos de mensaje con texto
          if (event.message && event.message.text) {
            const senderId = event.sender?.id;
            const recipientId = event.recipient?.id;
            const text = event.message.text;
            const messageId = event.message.mid;
            
            if (senderId && recipientId) {
              const msg: MensajeMessenger = {
                senderId,
                recipientId,
                mensaje: text,
                messageId,
              };
              
              // Consultar perfil de Facebook Graph API para obtener el nombre real
              try {
                const pageToken = process.env.MESSENGER_PAGE_TOKEN;
                if (pageToken) {
                  const perfilRes = await fetch(
                    `https://graph.facebook.com/${senderId}?fields=first_name,last_name&access_token=${pageToken}`
                  );
                  if (perfilRes.ok) {
                    const perfil = await perfilRes.json();
                    const nombreCompleto = [perfil.first_name, perfil.last_name]
                      .filter(Boolean)
                      .join(" ");
                    if (nombreCompleto) {
                      msg.nombre = nombreCompleto;
                    }
                  }
                }
              } catch (profileErr) {
                console.error("Error al obtener perfil del remitente en Messenger:", profileErr);
              }
              
              await registrarLeadMessenger(msg);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error procesando webhook de Messenger:", err);
  }

  return NextResponse.json({ received: true });
}
