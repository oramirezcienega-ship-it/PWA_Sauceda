import { NextResponse } from "next/server";

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

    const fromNumber = process.env.TWILIO_PHONE_NUMBER || "";

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Llamada iniciada desde el CRM Sauceda. Conectando con el prospecto...</Say>
  <Dial callerId="${fromNumber}" record="record-from-answer-dual" action="/api/conmutador/webhook-evento" recordingStatusCallback="/api/conmutador/webhook-evento">
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
