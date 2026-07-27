import { NextResponse } from "next/server";
import { actualizarLlamada } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

// TwiML para redirigir al VoiceBot cuando el asesor no contestó
function twimlFallbackVoiceBot(): NextResponse {
  const vapiSipUri = process.env.VAPI_SIP_URI || "sip:sauceda@sip.vapi.ai";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">El asesor no está disponible en este momento. Le conectaremos con nuestro asistente virtual para que pueda ayudarle.</Say>
  <Dial>
    <Sip>${vapiSipUri}</Sip>
  </Dial>
</Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any = {};

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    const { searchParams } = new URL(request.url);
    const parentCallSidQuery = searchParams.get("parentCallSid");

    const callSid = parentCallSidQuery || body.CallSid || body.callSid || "";
    const dialCallStatus = body.DialCallStatus || body.dialCallStatus || "";
    const callStatus = dialCallStatus || body.CallStatus || body.callStatus || "";
    const duration = body.DialCallDuration || body.CallDuration || body.callDuration || body.duration;
    const recordingUrl = body.RecordingUrl || body.recordingUrl || "";
    const agenteId = body.agenteId || body.AgenteId || undefined;

    if (!callSid) {
      return NextResponse.json({ error: "Falta CallSid" }, { status: 400 });
    }

    const duracionSegundos = duration !== undefined ? parseInt(String(duration), 10) : undefined;

    // Actualizar log en base de datos
    await actualizarLlamada(callSid, {
      estado: callStatus,
      duracion: isNaN(duracionSegundos as number) ? undefined : duracionSegundos,
      grabacionUrl: recordingUrl || undefined,
      agenteId: agenteId,
    });

    // Si Twilio llama este endpoint como "action" del <Dial> (después de que el asesor
    // no contesta o la llamada termina), devolver TwiML para no dejar al cliente sin audio.
    // La presencia de DialCallStatus indica que es un callback de acción <Dial>.
    if (dialCallStatus) {
      const estadoFallido = ["no-answer", "busy", "failed", "canceled"].includes(
        dialCallStatus.toLowerCase()
      );
      if (estadoFallido) {
        console.log(`[webhook-evento] Asesor no contestó (${dialCallStatus}). Redirigiendo a VoiceBot.`);
        return twimlFallbackVoiceBot();
      }
      // Llamada completada normalmente → respuesta TwiML vacía
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
        headers: { "Content-Type": "text/xml" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en API webhook-evento:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
