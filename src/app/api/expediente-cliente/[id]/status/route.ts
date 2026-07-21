import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

const STATUS_VALIDOS = [
  "formulario_recibido",
  "informacion_confirmada",
  "fotos_agendadas",
  "fotos_completadas",
  "en_catalogo",
  "primer_interesado",
  "visita_agendada",
  "loi_firmada",
  "en_tramite_legal",
  "en_notaria",
  "operacion_cerrada",
] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Este endpoint es para asesores/n8n — usa API key interna
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json() as {
    status: string;
    fecha_fotos_agendadas?: string;
    fecha_cierre_estimada?: string;
    litigios_bloqueado?: boolean;
  };

  if (!STATUS_VALIDOS.includes(body.status as (typeof STATUS_VALIDOS)[number])) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { status_proceso: body.status };
  if (body.fecha_fotos_agendadas) updateData.fecha_fotos_agendadas = body.fecha_fotos_agendadas;
  if (body.fecha_cierre_estimada) updateData.fecha_cierre_estimada = body.fecha_cierre_estimada;
  if (body.litigios_bloqueado !== undefined) updateData.litigios_bloqueado = body.litigios_bloqueado;

  const sb = supabaseServidor();
  const { error } = await sb
    .from("expedientes")
    .update(updateData)
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: body.status });
}
