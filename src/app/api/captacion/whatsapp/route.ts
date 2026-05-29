import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import {
  extraerMensajes,
  registrarLeadWhatsApp,
} from "@/features/captacion/whatsapp";

// Webhook de captación de WhatsApp (Meta Cloud API).
export const dynamic = "force-dynamic";

/**
 * GET — Verificación del webhook (handshake de Meta).
 * Meta envía hub.mode/hub.verify_token/hub.challenge; si el token coincide
 * con WHATSAPP_VERIFY_TOKEN, devolvemos el challenge tal cual.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST — Mensajes entrantes.
 * Valida la firma de Meta (si hay WHATSAPP_APP_SECRET), parsea los mensajes
 * y registra cada uno como lead. Siempre responde 200 para evitar reintentos
 * en bucle por errores de parseo.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verificación de firma (recomendada).
  const secret = process.env.WHATSAPP_APP_SECRET;
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
    const mensajes = extraerMensajes(payload);
    for (const mensaje of mensajes) {
      await registrarLeadWhatsApp(mensaje);
    }
  } catch (err) {
    console.error("Error procesando webhook de WhatsApp:", err);
  }

  return NextResponse.json({ received: true });
}
