import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { registrarLeadMessenger, registrarLeadInstagram, type MensajeMessenger } from "@/features/captacion/messenger";

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
    
    if (payload.object === "page" || payload.object === "instagram") {
      const isInstagram = payload.object === "instagram";
      for (const entry of payload.entry ?? []) {
        const messagingEvents = entry.messaging ?? [];
        for (const event of messagingEvents) {
          // Procesar mensajes, postbacks o referral directo
          if (event.message || event.postback || event.referral) {
            const senderId = event.sender?.id;
            const recipientId = event.recipient?.id;
            
            if (senderId && recipientId) {
              const text = event.message?.text || event.postback?.title || event.postback?.payload || "";
              const messageId = event.message?.mid || "";
              
              const msg: MensajeMessenger = {
                senderId,
                recipientId,
                mensaje: text,
                messageId,
              };
              
              const pageToken = isInstagram
                ? (process.env.INSTAGRAM_PAGE_TOKEN || process.env.MESSENGER_PAGE_TOKEN)
                : process.env.MESSENGER_PAGE_TOKEN;

              // 1. Consultar perfil de Facebook/Instagram Graph API para obtener el nombre real
              if (pageToken) {
                try {
                  const perfilUrl = isInstagram
                    ? `https://graph.facebook.com/v21.0/${senderId}?fields=username&access_token=${pageToken}`
                    : `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name&access_token=${pageToken}`;
                  
                  const perfilRes = await fetch(perfilUrl);
                  if (perfilRes.ok) {
                    const perfil = await perfilRes.json();
                    if (isInstagram) {
                      if (perfil.username) {
                        msg.nombre = perfil.username;
                      }
                    } else {
                      const nombreCompleto = [perfil.first_name, perfil.last_name]
                        .filter(Boolean)
                        .join(" ");
                      if (nombreCompleto) {
                        msg.nombre = nombreCompleto;
                      }
                    }
                  } else {
                    const errorText = await perfilRes.text();
                    console.error(`[Meta API] Error al obtener perfil del remitente ${senderId} (status ${perfilRes.status}):`, errorText);
                  }
                } catch (profileErr) {
                  console.error("Error al obtener perfil del remitente en Webhook Social:", profileErr);
                }
              }

              // 2. Extraer atribución de campañas (Referral / Meta Ads)
              const referral = event.message?.referral || event.postback?.referral || event.referral;
              if (referral) {
                // Fallback con el título del anuncio si viene en ads_context_data
                if (referral.ads_context_data?.ad_title) {
                  msg.ad_name = referral.ads_context_data.ad_title;
                }

                const adId = referral.ad_id;
                if (adId && pageToken) {
                  try {
                    const adUrl = `https://graph.facebook.com/v21.0/${adId}?fields=name,campaign{name},adset{name}&access_token=${pageToken}`;
                    const adRes = await fetch(adUrl);
                    if (adRes.ok) {
                      const adData = await adRes.json();
                      if (adData.name) msg.ad_name = adData.name;
                      if (adData.campaign?.name) msg.campaign_name = adData.campaign.name;
                      if (adData.adset?.name) msg.adset_name = adData.adset.name;
                    } else {
                      const errorText = await adRes.text();
                      console.warn(`[Meta API] No se pudo consultar ad_id ${adId} (status ${adRes.status}):`, errorText);
                    }
                  } catch (adErr) {
                    console.error("Error al consultar detalles de ad_id en Graph API:", adErr);
                  }
                }
              }
              
              if (isInstagram) {
                await registrarLeadInstagram(msg);
              } else {
                await registrarLeadMessenger(msg);
              }
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
