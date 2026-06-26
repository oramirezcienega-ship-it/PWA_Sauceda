import { NextResponse } from "next/server";
import { normalizarTelefono } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cliente = searchParams.get("cliente");

    if (!cliente) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">Error. No se especificó el número del cliente.</Say>
</Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Obtener el CallSid del padre (asesor)
    let parentCallSid = "";
    if (request.method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const body = await request.json();
          parentCallSid = body.CallSid || body.callSid || "";
        } catch {}
      } else if (contentType.includes("form")) {
        try {
          const formData = await request.formData();
          parentCallSid = (formData.get("CallSid") || formData.get("callSid") || "") as string;
        } catch {}
      }
    }

    const rawFromNumber = process.env.TWILIO_PHONE_NUMBER || "+524774654700";
    const fromCanon = normalizarTelefono(rawFromNumber);
    const fromNumber = fromCanon ? (fromCanon.startsWith("+") ? fromCanon : `+${fromCanon}`) : "+524774654700";

    const callbackUrl = parentCallSid 
      ? `/api/conmutador/webhook-evento?parentCallSid=${parentCallSid}`
      : "/api/conmutador/webhook-evento";

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Llamada iniciada desde el CRM Sauceda. Conectando con el prospecto...</Say>
  <Dial callerId="${fromNumber}" record="record-from-answer-dual" action="${callbackUrl}" recordingStatusCallback="${callbackUrl}">
    <Number>${cliente}</Number>
  </Dial>
</Response>`;

    return new NextResponse(xmlResponse, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error en API outbound-twiml:", error);
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">Ocurrió un error en el conmutador al conectar la llamada.</Say>
</Response>`;
    return new NextResponse(errorXml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
