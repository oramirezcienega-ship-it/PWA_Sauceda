import { NextResponse } from "next/server";
import { obtenerAgenteDisponible, registrarInicioLlamada } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any = {};

    // Twilio puede enviar JSON o x-www-form-urlencoded
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    const callSid = body.CallSid || body.callSid || "";
    const from = body.From || body.from || "";
    const to = body.To || body.to || ""; // El número de Twilio que recibe la llamada

    if (!callSid) {
      return NextResponse.json({ error: "Falta CallSid" }, { status: 400 });
    }

    // Registrar el inicio de la llamada en la base de datos
    await registrarInicioLlamada({
      twilioCallSid: callSid,
      clienteTelefono: from,
      tipo: "entrante",
      estado: "ringing",
    });

    // Desviar directamente al Voice Bot de Vapi (Sofía)
    const vapiSipUri = process.env.VAPI_SIP_URI || "sip:sauceda@sip.vapi.ai";
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${vapiSipUri}</Sip>
  </Dial>
</Response>`;

    return new NextResponse(xmlResponse, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error en API validar-horario:", error);
    
    // TwiML de fallback por si algo falla
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">Lo sentimos, ocurrió un problema al procesar su llamada. Por favor intente más tarde.</Say>
</Response>`;
    return new NextResponse(errorXml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

// Permitir GET para pruebas rápidas
export async function GET() {
  try {
    const agente = await obtenerAgenteDisponible();
    return NextResponse.json({
      modo_prueba: true,
      agente_disponible: agente || "Ninguno disponible en este momento",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
