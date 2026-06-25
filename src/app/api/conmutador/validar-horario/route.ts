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

    // Consultar agente de guardia disponible en horario laboral
    const agente = await obtenerAgenteDisponible();

    let xmlResponse = "";

    if (agente) {
      // 1. Registrar en BD que la llamada se desvió a este agente
      const { actualizarLlamada } = await import("@/features/conmutador/service");
      await actualizarLlamada(callSid, {
        estado: "in-progress",
        agenteId: agente.id,
      });

      // 2. Generar TwiML para desviar al celular del agente con grabación activa.
      // Forzamos callerId con el número de Twilio para que funcione en cuentas Trial.
      xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">Bienvenido a Sauceda Bienes Raíces. Transfiriendo su llamada con nuestro asesor de guardia, ${agente.nombre}.</Say>
  <Dial callerId="${to}" record="record-from-answer-dual" recordingStatusCallback="/api/conmutador/webhook-evento">
    <Number>${agente.telefono_desvio}</Number>
  </Dial>
</Response>`;
    } else {
      // 3. Si no hay agente disponible, desviar al Voice Bot de Vapi
      const vapiSipUri = process.env.VAPI_SIP_URI || "sip:sauceda@sip.vapi.ai";
      xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">Gracias por comunicarse a Sauceda Bienes Raíces. En este momento nuestros asesores están ocupados. Le transferiremos con Sofía, nuestra asistente virtual de guardia, para tomar sus datos.</Say>
  <Dial>
    <Sip>${vapiSipUri}</Sip>
  </Dial>
</Response>`;
    }

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
