import { NextResponse } from "next/server";
import { obtenerAgenteDisponible } from "@/features/conmutador/service";
import { normalizarTelefono } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
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

    console.log(`[Vapi Transfer] Desviando llamada a: ${telE164} (${nombreDestino})`);

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
