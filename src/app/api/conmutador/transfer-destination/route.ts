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
    
    // Si no hay agente de guardia activo, usamos el número principal de Sauceda
    let numeroDestino = "524774654700"; 
    let nombreDestino = "Oficina Principal (Sauceda)";
    
    if (agente && agente.telefono_desvio) {
      numeroDestino = agente.telefono_desvio;
      nombreDestino = agente.nombre;
    }
    
    // Normalizar a formato E.164 (+52XXXXXXXXXX)
    const telCanon = normalizarTelefono(numeroDestino);
    const telE164 = telCanon.startsWith("+") ? telCanon : `+${telCanon}`;

    console.log(`[Vapi Transfer] Desviando llamada a: ${telE164} (${nombreDestino}) con TwilioCallSid: ${twilioCallSid}`);

    // Si tenemos el SID de la llamada y un agente, asociamos el agente y actualizamos el estado
    if (twilioCallSid && agente?.id) {
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
