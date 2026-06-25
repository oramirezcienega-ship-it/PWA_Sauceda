import { NextResponse } from "next/server";
import { procesarReporteVoiceBot, type ReporteVoiceBot } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Webhook Voice Bot recibido:", JSON.stringify(body, null, 2));

    // Determinar origen del mensaje (Vapi.ai o payload genérico)
    const callObj = body.message?.call || body.call || {};
    const customerObj = callObj.customer || body.customer || {};
    const analysisObj = callObj.analysis || body.analysis || {};
    const structuredObj = analysisObj.structuredData || body.structuredData || {};

    // 1. Extraer identificadores y teléfono
    const twilioCallSid = callObj.twilioCallSid || body.twilioCallSid || callObj.id || body.callSid || "";
    let clienteTelefono = customerObj.number || body.clienteTelefono || body.phone || body.customerPhone || "";
    
    // Si es una llamada de prueba web desde el Dashboard de Vapi, no viene número de teléfono. Asignamos uno ficticio.
    if (!clienteTelefono) {
      clienteTelefono = "+520000000000";
    }
    
    // 2. Extraer textos
    const transcripcion = callObj.transcript || body.transcripcion || body.transcript || "";
    const resumen = callObj.summary || body.resumen || body.summary || "";

    // 3. Extraer datos estructurados perfilados
    const nombre = structuredObj.nombre || structuredObj.name || structuredObj.fullname || "";
    const correo = structuredObj.correo || structuredObj.email || structuredObj.mail || "";
    const necesidad = structuredObj.necesidad || structuredObj.need || structuredObj.mensaje || structuredObj.message || "";
    const tipoCredito = structuredObj.tipoCredito || structuredObj.tipo_credito || structuredObj.creditType || "";
    
    const valorEstimadoRaw = structuredObj.valorEstimado ?? structuredObj.estimatedValue ?? structuredObj.valor;
    const valorEstimado = valorEstimadoRaw !== undefined ? Number(valorEstimadoRaw) || 0 : undefined;

    const saldoDeudaRaw = structuredObj.saldoDeuda ?? structuredObj.debtBalance ?? structuredObj.saldo;
    const saldoDeuda = saldoDeudaRaw !== undefined ? Number(saldoDeudaRaw) || 0 : undefined;

    if (!twilioCallSid || !clienteTelefono) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (twilioCallSid o clienteTelefono)" },
        { status: 400 }
      );
    }

    const reporte: ReporteVoiceBot = {
      twilioCallSid,
      clienteTelefono,
      transcripcion,
      resumen,
      datosPerfilados: {
        nombre: nombre || undefined,
        correo: correo || undefined,
        necesidad: necesidad || undefined,
        tipoCredito: tipoCredito || undefined,
        valorEstimado,
        saldoDeuda,
      },
    };

    // Procesar reporte de IA y crear/actualizar prospecto + expediente
    const token = await procesarReporteVoiceBot(reporte);

    return NextResponse.json({
      ok: true,
      mensaje: "Reporte procesado con éxito",
      token_cliente: token,
    });
  } catch (error) {
    console.error("Error en API webhook-voicebot:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
