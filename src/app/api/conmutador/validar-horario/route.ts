import { NextResponse } from "next/server";
import { obtenerAgenteDisponible, registrarInicioLlamada, actualizarLlamada } from "@/features/conmutador/service";
import { normalizarTelefono } from "@/lib/telefono";

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

    // Ignorar status callbacks de llamadas finalizadas para evitar reiniciar la lógica
    const callStatus = body.CallStatus || body.callStatus || "";
    if (["completed", "busy", "no-answer", "canceled", "failed"].includes(callStatus.toLowerCase())) {
      console.log(`[validar-horario] Ignorando status callback de llamada finalizada: ${callSid} (${callStatus})`);
      return NextResponse.json({ ok: true });
    }

    // Registrar el inicio de la llamada en la base de datos
    await registrarInicioLlamada({
      twilioCallSid: callSid,
      clienteTelefono: from,
      tipo: "entrante",
      estado: "ringing",
    });

    // Consultar si hay un agente de guardia disponible en este horario
    const agente = await obtenerAgenteDisponible();

    let xmlResponse = "";

    if (agente && agente.telefono_desvio) {
      const telCanon = normalizarTelefono(agente.telefono_desvio);
      const telE164 = telCanon.startsWith("+") ? telCanon : `+${telCanon}`;

      console.log(`[Twilio Direct Dial] Agente disponible: ${agente.nombre}. Desviando llamada directamente a: ${telE164}`);

      // Registrar en base de datos que se está desviando a este agente
      await actualizarLlamada(callSid, {
        estado: "transferring",
        agenteId: agente.id,
      });

      // Caller ID para el dial al agente. Configurable vía TWILIO_CALLER_ID
      // (debe ser un número propio o verificado en Twilio); si no está definido,
      // se usa el número de Twilio que recibió la llamada.
      let callerIdAttr = "";
      const callerIdConfigurado = process.env.TWILIO_CALLER_ID || "";
      if (callerIdConfigurado) {
        const cidCanon = normalizarTelefono(callerIdConfigurado);
        const cidE164 = cidCanon.startsWith("+") ? cidCanon : `+${cidCanon}`;
        callerIdAttr = ` callerId="${cidE164}"`;
      } else if (to) {
        const toCanon = normalizarTelefono(to);
        const toE164 = toCanon.startsWith("+") ? toCanon : `+${toCanon}`;
        callerIdAttr = ` callerId="${toE164}"`;
      }

      // Usar URL absoluta para el action del Dial — Twilio la requiere para callbacks de grabación
      const baseUrl = process.env.SITE_URL || "https://app.saucedamx.com";
      const callbackUrl = `${baseUrl}/api/conmutador/webhook-evento?parentCallSid=${callSid}`;

      // TwiML con bienvenida profesional y dial directo al celular del asesor (usando número de Sauceda como Caller ID)
      // El "action" redirige al VoiceBot si el asesor no contesta (ver webhook-evento/route.ts)
      xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Gracias por llamar a Sauceda Bienes Raíces, soluciones integrales de bienes raíces. Le informamos que, para su seguridad, sus datos personales están protegidos de acuerdo con nuestro aviso de privacidad, lo invitamos a conocer nuestro aviso de privacidad en saucedamx.com. Para brindarle la mejor atención, transferiremos su llamada de inmediato con un asesor. Agradecemos su preferencia y su valiosa espera.</Say>
  <Dial${callerIdAttr} record="record-from-answer" action="${callbackUrl}" recordingStatusCallback="${callbackUrl}">${telE164}</Dial>
</Response>`;
    } else {
      console.log("[Twilio Direct Dial] No hay agentes de guardia disponibles. Desviando a Voice Bot (Sofía) en Vapi.");

      const vapiSipUri = process.env.VAPI_SIP_URI || "sip:sauceda@sip.vapi.ai";

      // TwiML: saludo primero, luego Vapi
      xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Gracias por llamar a Sauceda Bienes Raíces, soluciones integrales de bienes raíces. Le informamos que, para su seguridad, sus datos personales están protegidos de acuerdo con nuestro aviso de privacidad, lo invitamos a conocer nuestro aviso de privacidad en saucedamx.com. En este momento nuestros asesores no están disponibles, por lo que le atenderá nuestro asistente virtual.</Say>
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
  <Say language="es-MX" voice="Polly.Mia-Neural">Lo sentimos, ocurrió un problema al procesar su llamada. Por favor intente más tarde.</Say>
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
