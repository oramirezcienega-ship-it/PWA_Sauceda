import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { responderConIA } from "@/lib/ia/agente";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && authHeader !== expectedToken) {
    console.warn("[IA Background Route] Intento de acceso no autorizado.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { telefono, expedienteId } = body;

    if (!telefono) {
      return NextResponse.json({ error: "Falta el parámetro telefono" }, { status: 400 });
    }

    console.log(`[IA Background Route] Procesando para teléfono: ${telefono}, expediente: ${expedienteId}`);
    const host = request.headers.get("host") || undefined;
    const sb = supabaseServidor();
    await responderConIA(sb, { telefono, expedienteId, host });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[IA Background Route] Error ejecutando responderConIA:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
