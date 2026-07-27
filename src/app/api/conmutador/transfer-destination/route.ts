import { NextResponse } from "next/server";
import { obtenerAgenteDisponible, actualizarLlamada } from "@/features/conmutador/service";
import { normalizarTelefono } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any = {};

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("form")) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    console.log("Petición de transferencia de Vapi recibida:", JSON.stringify(body, null, 2));

    // Extraer twilioCallSid
    const callObj = body.message?.call || body.call || {};
    const twilioCallSid = 
      callObj.twilioCallSid || 
      body.message?.call?.twilioCallSid || 
      callObj.id || 
      body.message?.call?.id || 
      body.twilioCallSid || 
      body.callSid || 
      "";

    const agente = await obtenerAgenteDisponible();

    if (!agente || !agente.telefono_desvio) {
      // Si no hay agente disponible, no se puede transferir.
      // Retornar 503 para que Vapi maneje el fin de la llamada graciosamente.
      console.log("[Vapi Transfer] No hay agentes disponibles para transferencia.");
      return NextResponse.json(
        { error: "No hay asesores disponibles en este momento." },
        { status: 503 }
      );
    }

    const numeroDestino = agente.telefono_desvio;
    const nombreDestino = agente.nombre;

    // Normalizar a formato E.164 (+52XXXXXXXXXX)
    const telCanon = normalizarTelefono(numeroDestino);
    const telE164 = telCanon.startsWith("+") ? telCanon : `+${telCanon}`;

    console.log(`[Vapi Transfer] Desviando llamada a: ${telE164} (${nombreDestino}) con TwilioCallSid: ${twilioCallSid}`);

    // Asociar el agente a la llamada en la base de datos
    if (twilioCallSid && agente.id) {
      await actualizarLlamada(twilioCallSid, {
        estado: "transferring",
        agenteId: agente.id,
      });
    }

    return NextResponse.json({
      destination: {
        type: "number",
        number: telE164,
      }
    });
  } catch (error) {
    console.error("Error en API transfer-destination:", error);
    return NextResponse.json(
      { error: "Error interno del servidor al procesar el destino" },
      { status: 500 }
    );
  }
}
