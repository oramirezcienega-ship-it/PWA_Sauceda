import { NextResponse } from "next/server";
import { procesarReporteVoiceBot, type ReporteVoiceBot, obtenerAgenteDisponible, actualizarLlamada } from "@/features/conmutador/service";
import { normalizarTelefono } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Webhook Voice Bot recibido:", JSON.stringify(body, null, 2));

    const messageType = body.message?.type || body.type || "";

    // 1. Interceptar petición inicial del asistente (assistant-request)
    if (messageType === "assistant-request") {
      const agente = await obtenerAgenteDisponible();
      const sofiaId = "14da6807-3c45-4d75-94a0-d7bfc04c97e3";

      if (agente) {
        console.log(`[Vapi Assistant Request] Agente disponible: ${agente.nombre}. Configurando transferencia inmediata.`);
        
        return NextResponse.json({
          assistant: {
            id: sofiaId, // Vapi heredará toda la configuración de Sofía (herramientas, voz, etc.)
            firstMessage: `Hola, bienvenido a Sauceda Bienes Raíces. Te estoy transfiriendo de inmediato con nuestro asesor de guardia, ${agente.nombre}. Por favor no cuelgues.`,
            model: {
              messages: [
                {
                  role: "system",
                  content: `You are Sofía, a virtual assistant for Sauceda Bienes Raíces. An agent is available right now. Your ONLY task is to speak the first message and IMMEDIATELY call your transfer tool 'transferir_a_asesor' to transfer the customer. Do not ask any questions or wait for their reply. Just execute the transfer tool 'transferir_a_asesor' immediately.`
                }
              ]
            }
          }
        });
      } else {
        console.log("[Vapi Assistant Request] No hay agentes disponibles. Usando perfilado de Sofía por defecto.");
        return NextResponse.json({
          assistantId: sofiaId
        });
      }
    }

    // 2. Si es una petición de destino de transferencia (transfer-destination-request)
    if (messageType === "transfer-destination-request" || messageType === "transfer-destination") {
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
      
      let numeroDestino = "524774654700"; 
      let nombreDestino = "Oficina Principal (Sauceda)";
      
      if (agente && agente.telefono_desvio) {
        numeroDestino = agente.telefono_desvio;
        nombreDestino = agente.nombre;
      }
      
      const telCanon = normalizarTelefono(numeroDestino);
      const telE164 = telCanon.startsWith("+") ? telCanon : `+${telCanon}`;

      console.log(`[Vapi Webhook Transfer] Desviando llamada a: ${telE164} (${nombreDestino}) con TwilioCallSid: ${twilioCallSid}`);

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
    }

    // Determinar origen del mensaje (Vapi.ai o payload genérico)
    const callObj = body.message?.call || body.call || {};
    const customerObj = callObj.customer || body.customer || {};
    const analysisObj = callObj.analysis || body.analysis || {};
    const artifactObj = body.message?.artifact || callObj.artifact || body.artifact || {};
    
    // Extraer structuredOutputs de Vapi (bc34d73f-f4b6-4d56-9cb9-d42d669c3685 -> result)
    const structuredOutputsObj = 
      body.message?.artifact?.structuredOutputs || 
      callObj.artifact?.structuredOutputs || 
      body.artifact?.structuredOutputs || 
      {};
      
    let structuredOutputsMerged = {};
    for (const key in structuredOutputsObj) {
      if (structuredOutputsObj[key]?.result) {
        structuredOutputsMerged = { ...structuredOutputsMerged, ...structuredOutputsObj[key].result };
      }
    }

    const structuredObj = {
      ...analysisObj.structuredData,
      ...artifactObj.structuredData,
      ...(body.message?.analysis?.structuredData),
      ...(body.message?.artifact?.structuredData),
      ...(body.message?.call?.artifact?.structuredData),
      ...body.structuredData,
      ...structuredOutputsMerged
    };

    // 1. Extraer identificadores y teléfono
    const twilioCallSid = 
      callObj.twilioCallSid || 
      body.message?.call?.twilioCallSid || 
      callObj.id || 
      body.message?.call?.id || 
      body.twilioCallSid || 
      body.callSid || 
      "";
      
    let clienteTelefono = 
      customerObj.number || 
      body.message?.customer?.number || 
      body.message?.call?.customer?.number || 
      body.call?.customer?.number || 
      body.clienteTelefono || 
      body.phone || 
      body.customerPhone || 
      "";
    
    // Si es una llamada de prueba web desde el Dashboard de Vapi, no viene número de teléfono. Asignamos uno ficticio.
    if (!clienteTelefono) {
      clienteTelefono = "+520000000000";
    }
    
    // 2. Extraer textos y grabación (pueden venir a nivel de message o en call o dentro de artifact)
    const transcripcion = 
      body.message?.artifact?.transcript || 
      callObj.artifact?.transcript || 
      artifactObj.transcript || 
      body.artifact?.transcript || 
      body.message?.transcript || 
      callObj.transcript || 
      body.transcripcion || 
      body.transcript || 
      "";

    const resumen = 
      analysisObj.summary || 
      callObj.analysis?.summary || 
      body.message?.analysis?.summary || 
      body.message?.artifact?.summary || 
      callObj.artifact?.summary || 
      artifactObj.summary || 
      body.artifact?.summary || 
      body.message?.summary || 
      callObj.summary || 
      body.resumen || 
      body.summary || 
      "";

    const grabacionUrl = 
      body.message?.artifact?.recording?.url || 
      callObj.artifact?.recording?.url || 
      artifactObj.recording?.url || 
      body.artifact?.recording?.url || 
      body.message?.recordingUrl || 
      callObj.recordingUrl || 
      body.grabacionUrl || 
      body.recordingUrl || 
      "";

    // 3. Extraer datos estructurados perfilados (soportando mayúsculas y minúsculas)
    const nombre = 
      structuredObj.nombre || 
      structuredObj.Nombre || 
      structuredObj.name || 
      structuredObj.Name || 
      structuredObj.fullname || 
      structuredObj.FullName || 
      structuredObj.cliente || 
      structuredObj.Cliente || 
      "";

    const correo = 
      structuredObj.correo || 
      structuredObj.Correo || 
      structuredObj.email || 
      structuredObj.Email || 
      structuredObj.mail || 
      structuredObj.Mail || 
      "";

    const necesidad = 
      structuredObj.necesidad || 
      structuredObj.Necesidad || 
      structuredObj.need || 
      structuredObj.Need || 
      structuredObj.mensaje || 
      structuredObj.Mensaje || 
      structuredObj.message || 
      structuredObj.Message || 
      "";

    const tipoCredito = 
      structuredObj.tipoCredito || 
      structuredObj.TipoCredito || 
      structuredObj.tipo_credito || 
      structuredObj.Tipo_Credito || 
      structuredObj.creditType || 
      structuredObj.CreditType || 
      "";
    
    const valorEstimadoRaw = 
      structuredObj.valorEstimado ?? 
      structuredObj.ValorEstimado ?? 
      structuredObj.estimatedValue ?? 
      structuredObj.EstimatedValue ?? 
      structuredObj.valor ?? 
      structuredObj.Valor;
    const valorEstimado = valorEstimadoRaw !== undefined ? Number(valorEstimadoRaw) || 0 : undefined;

    const saldoDeudaRaw = 
      structuredObj.saldoDeuda ?? 
      structuredObj.SaldoDeuda ?? 
      structuredObj.debtBalance ?? 
      structuredObj.DebtBalance ?? 
      structuredObj.saldo ?? 
      structuredObj.Saldo;
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
      grabacionUrl: grabacionUrl || undefined,
      datosPerfilados: {
        nombre: nombre || undefined,
        correo: correo || undefined,
        necesidad: necesidad || undefined,
        tipoCredito: tipoCredito || undefined,
        valorEstimado,
        saldoDeuda,
        rawPayload: body,
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
