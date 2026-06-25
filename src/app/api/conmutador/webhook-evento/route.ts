import { NextResponse } from "next/server";
import { actualizarLlamada } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

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

    const callSid = body.CallSid || body.callSid || "";
    const callStatus = body.CallStatus || body.callStatus || "";
    const duration = body.CallDuration || body.callDuration || body.duration;
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en API webhook-evento:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
