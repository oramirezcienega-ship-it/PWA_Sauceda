import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Conexión de audio WebRTC establecida con el CRM Sauceda.</Say>
</Response>`;

    return new NextResponse(xml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error en voice-client-twiml:", error);
    return new NextResponse("<Response><Hangup/></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
