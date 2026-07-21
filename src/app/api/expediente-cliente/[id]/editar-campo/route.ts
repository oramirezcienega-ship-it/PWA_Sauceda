import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

// Campos que el cliente puede editar directamente (los demás requieren asesor)
const CAMPOS_EDITABLES_PROMO = new Set([
  "calle",
  "numero_exterior",
  "colonia",
  "ciudad",
  "estado",
  "metros_construccion",
  "metros_terreno",
  "anio_construccion",
  "num_recamaras",
  "num_banos",
  "estado_conservacion",
  "servicios",
  "propiedad_ocupada",
  "nombre_ocupante",
  "tiene_adeudos",
  "descripcion_adeudos",
  "horario_fotos",
  "disponible_firma",
  "comentarios",
]);

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.nextUrl.searchParams.get("token");
  const sb = supabaseServidor();

  const { data: exp, error } = await sb
    .from("expedientes")
    .select("session_token_client, token_expiration, asesor_id, cliente")
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

  const body = await req.json() as { campo: string; valor: unknown };
  const { campo, valor } = body;

  if (!campo || !CAMPOS_EDITABLES_PROMO.has(campo)) {
    return NextResponse.json({ error: "Campo no editable" }, { status: 400 });
  }

  // Actualizar en promociones_expedientes
  const { error: updateError } = await sb
    .from("promociones_expedientes")
    .update({ [campo]: valor, updated_at: new Date().toISOString() })
    .eq("expediente_id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Notificar al asesor vía n8n si está configurado
  const n8nUrl = process.env.N8N_WEBHOOK_EDICION_CLIENTE;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expediente_id: params.id,
          evento: "cliente_edito_campo",
          campo,
          valor,
          cliente: exp.cliente,
        }),
      });
    } catch {
      // No bloquear
    }
  }

  return NextResponse.json({ ok: true, campo });
}
