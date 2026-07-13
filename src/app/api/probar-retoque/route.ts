import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { generarMensajeRetoque } from "@/lib/ia/agente";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const telefono = searchParams.get("telefono");
    const expedienteId = searchParams.get("expedienteId");
    const dryRun = searchParams.get("dryRun") !== "false"; // default true

    if (!telefono || !expedienteId) {
      return NextResponse.json(
        {
          error:
            "Faltan parámetros obligatorios. Uso: /api/probar-retoque?telefono=XXXX&expedienteId=EXP-XXX[&dryRun=false]",
        },
        { status: 400 }
      );
    }

    const sb = supabaseServidor();

    // 1. Obtener expediente
    const { data: exp, error: errExp } = await sb
      .from("expedientes")
      .select("*")
      .eq("id", expedienteId)
      .maybeSingle();

    if (errExp || !exp) {
      return NextResponse.json(
        { error: `Expediente no encontrado: ${errExp?.message || ""}` },
        { status: 404 }
      );
    }

    // 2. Obtener historial de mensajes
    const { data: mensajes, error: errMsgs } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, created_at, agente, texto")
      .eq("expediente_id", expedienteId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (errMsgs) {
      return NextResponse.json(
        { error: `Error al leer mensajes: ${errMsgs.message}` },
        { status: 500 }
      );
    }

    // 3. Generar mensaje de retoque con IA
    console.log(`Generando mensaje de retoque para ${telefono} (${expedienteId})...`);
    const textoRetoque = await generarMensajeRetoque(sb, telefono, expedienteId);

    if (!textoRetoque) {
      return NextResponse.json({
        ok: false,
        mensaje: "No se pudo generar el mensaje de retoque (la IA devolvió un texto vacío o la IA está inactiva).",
        expediente: exp,
        mensajesRecientes: mensajes,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        textoRetoqueGenerado: textoRetoque,
        explicacion: "Se generó el mensaje de retoque correctamente, pero no se envió porque dryRun=true.",
        expediente: exp,
        mensajesRecientes: mensajes,
      });
    }

    // 4. Enviar el retoque real por WhatsApp
    console.log(`Enviando mensaje de retoque real a ${telefono}...`);
    const waRes = await enviarWhatsAppTexto(telefono, textoRetoque);

    if (!waRes.ok) {
      return NextResponse.json({
        ok: false,
        dryRun: false,
        errorEnvio: waRes.error,
        textoRetoqueGenerado: textoRetoque,
      });
    }

    // 5. Registrar el mensaje saliente en la BD
    await sb.from("mensajes_whatsapp").insert({
      telefono: telefono,
      texto: textoRetoque,
      direccion: "out",
      expediente_id: expedienteId,
      prospecto_id: exp.prospecto_id || null,
      estado: "enviado",
      agente: "IA (Retoque)",
      wa_message_id: waRes.messageId || null,
    });

    // 6. Registrar actividad
    await registrarActividad(sb, {
      expedienteId: expedienteId,
      tipo: "sistema",
      titulo: "Retoque automático enviado (IA)",
      detalle: textoRetoque,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      textoRetoqueGenerado: textoRetoque,
      whatsappResult: waRes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
