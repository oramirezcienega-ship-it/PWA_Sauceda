import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Falta el parámetro url" }, { status: 400 });
    }

    // Seguridad: Solo permitir peticiones a api.twilio.com por seguridad
    if (!url.startsWith("https://api.twilio.com/")) {
      return NextResponse.json({ error: "URL no permitida" }, { status: 403 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "Credenciales de Twilio no configuradas en el servidor" }, { status: 500 });
    }

    // Configurar cabecera de autenticación básica para Twilio
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    
    console.log(`[Twilio Audio Proxy] Solicitando grabación a Twilio: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      console.error(`[Twilio Audio Proxy] Error al obtener audio (${response.status}):`, await response.text());
      return NextResponse.json({ error: "No se pudo recuperar el archivo de audio de Twilio" }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("[Twilio Audio Proxy] Error interno:", error);
    return NextResponse.json({ error: "Error interno en el servidor proxy de audio" }, { status: 500 });
  }
}
