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

    if (agente) {
      return NextResponse.json({
        disponible: true,
        agente_id: agente.id,
        agente_nombre: agente.nombre,
        telefono_desvio: agente.telefono_desvio,
      });
    }

    return NextResponse.json({
      disponible: false,
    });
  } catch (error) {
    console.error("Error en API validar-horario:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
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
