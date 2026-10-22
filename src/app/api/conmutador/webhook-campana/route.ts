import { NextResponse } from "next/server";
import { sincronizarConVapi } from "@/features/llamadas-ia/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/conmutador/webhook-campana
 * Server URL de las llamadas IA salientes. El payload solo se usa como aviso:
 * el resultado se lee de la API de Vapi con nuestra llave (no se confía en el cuerpo),
 * y solo se procesan llamadas que existen en llamadas_campana.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tipo = body.message?.type || "";
    const callId = body.message?.call?.id || "";

    if (tipo === "end-of-call-report" && callId) {
      const r = await sincronizarConVapi(callId);
      if (!r.ok) console.warn(`[webhook-campana] ${callId}: ${r.error}`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en webhook-campana:", error);
    return NextResponse.json({ ok: true });
  }
}
