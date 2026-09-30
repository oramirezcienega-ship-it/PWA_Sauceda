import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint de integración para n8n:
 *
 * GET /api/infonavit/eventos
 * Retorna los eventos pendientes de procesar generados por el módulo
 * de compraventa INFONAVIT (cambio de etapas, bienvenida, rechazo de docs).
 *
 * POST /api/infonavit/eventos
 * Marca un evento como procesado y opcionalmente registra el mensaje
 * enviado en la tabla mensajes_whatsapp para mantener el historial del CRM.
 */

export async function GET(request: NextRequest) {
  try {
    const sb = supabaseServidor();
    const { searchParams } = new URL(request.url);
    const limite = parseInt(searchParams.get("limite") || "20", 10);

    const { data: eventos, error } = await sb
      .from("ot_infonavit_eventos")
      .select("*")
      .eq("procesado", false)
      .order("created_at", { ascending: true })
      .limit(limite);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, eventos: eventos || [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = supabaseServidor();
    const body = await request.json();
    const { eventoId, exito, errorDetalle, mensajeRegistrar } = body;

    if (!eventoId) {
      return NextResponse.json({ ok: false, error: "eventoId es requerido." }, { status: 400 });
    }

    // 1. Actualizar el estado del evento
    await sb
      .from("ot_infonavit_eventos")
      .update({
        procesado: Boolean(exito),
        procesado_at: new Date().toISOString(),
        error: errorDetalle || null,
      })
      .eq("id", eventoId);

    // 2. Si viene mensaje para registrar en mensajes_whatsapp
    if (mensajeRegistrar && mensajeRegistrar.telefono && mensajeRegistrar.texto) {
      await sb.from("mensajes_whatsapp").insert({
        telefono: mensajeRegistrar.telefono,
        prospecto_id: mensajeRegistrar.prospectoId || null,
        expediente_id: mensajeRegistrar.expedienteId || null,
        direccion: "out",
        texto: mensajeRegistrar.texto,
        estado: exito ? "enviado" : "error",
        wa_message_id: mensajeRegistrar.waMessageId || null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
