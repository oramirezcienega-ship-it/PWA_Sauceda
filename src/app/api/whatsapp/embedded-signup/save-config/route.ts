import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/embedded-signup/save-config
 * Guarda los IDs de configuración de Meta en la base de datos (configuracion_agente).
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { appId, configId, appSecret } = body as {
      appId?: string;
      configId?: string;
      appSecret?: string;
    };

    const sb = supabaseServidor();
    const ahora = new Date().toISOString();

    if (appId) {
      await sb
        .from("configuracion_agente")
        .upsert({ clave: "meta_app_id", valor: appId.trim(), updated_at: ahora }, { onConflict: "clave" });
    }
    if (configId) {
      await sb
        .from("configuracion_agente")
        .upsert({ clave: "whatsapp_config_id", valor: configId.trim(), updated_at: ahora }, { onConflict: "clave" });
    }
    if (appSecret) {
      await sb
        .from("configuracion_agente")
        .upsert({ clave: "meta_app_secret", valor: appSecret.trim(), updated_at: ahora }, { onConflict: "clave" });
    }

    return NextResponse.json({ ok: true, mensaje: "Configuración guardada exitosamente." });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Error al guardar." }, { status: 500 });
  }
}
