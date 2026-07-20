import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.nextUrl.searchParams.get("token");
  const sb = supabaseServidor();

  const { data: exp, error } = await sb
    .from("expedientes")
    .select("session_token_client, token_expiration, status_proceso, hay_litigios, litigios_bloqueado")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !exp) {
    return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
  }

  if (!token || exp.session_token_client !== token) {
    return NextResponse.json({ error: "token_invalido" }, { status: 401 });
  }

  if (exp.token_expiration && new Date(exp.token_expiration) < new Date()) {
    return NextResponse.json({ error: "token_expirado" }, { status: 401 });
  }

  if (exp.status_proceso !== "formulario_recibido") {
    return NextResponse.json({ error: "Ya confirmado" }, { status: 400 });
  }

  if (exp.litigios_bloqueado) {
    return NextResponse.json({ error: "Bloqueado por litigios. Espera revisión del asesor." }, { status: 403 });
  }

  const { error: updateError } = await sb
    .from("expedientes")
    .update({
      status_proceso: "informacion_confirmada",
      fecha_confirmacion: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Disparar webhook n8n si está configurado
  const n8nUrl = process.env.N8N_WEBHOOK_CONFIRMACION;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expediente_id: params.id, evento: "informacion_confirmada" }),
      });
    } catch {
      // No bloquear si n8n falla
    }
  }

  return NextResponse.json({ ok: true, status: "informacion_confirmada" });
}
