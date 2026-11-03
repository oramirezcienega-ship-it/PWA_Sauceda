import { NextResponse } from "next/server";
import { generarTwilioVoiceToken } from "@/lib/twilio-voice-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identity = searchParams.get("identity") || "oscar";

    const res = generarTwilioVoiceToken(identity);
    return NextResponse.json({ ok: true, ...res });
  } catch (error) {
    console.error("Error al generar voice token:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo generar el token de voz WebRTC." },
      { status: 500 }
    );
  }
}
