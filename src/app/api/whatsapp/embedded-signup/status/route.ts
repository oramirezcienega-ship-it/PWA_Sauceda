import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

/**
 * GET /api/whatsapp/embedded-signup/status
 *
 * Devuelve el estado actual de la conexión de WhatsApp, identificadores registrados,
 * variables de entorno configuradas y métricas de salud del número en Meta.
 */
export async function GET() {
  try {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const sb = supabaseServidor();
    const { data: dbConfigs } = await sb
      .from("configuracion_agente")
      .select("clave, valor")
      .in("clave", [
        "whatsapp_waba_id",
        "whatsapp_phone_number_id",
        "whatsapp_display_phone_number",
        "whatsapp_verified_name",
        "whatsapp_coexistencia_activa",
        "whatsapp_last_sync",
        "whatsapp_oauth_token",
      ]);

    const mapaDb = (dbConfigs || []).reduce<Record<string, string>>((acc, item) => {
      acc[item.clave] = item.valor;
      return acc;
    }, {});

    const phoneId = mapaDb.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const wabaId = mapaDb.whatsapp_waba_id || process.env.WHATSAPP_WABA_ID || "";
    const token = mapaDb.whatsapp_oauth_token || process.env.WHATSAPP_TOKEN || "";

    const appId =
      process.env.NEXT_PUBLIC_META_APP_ID ||
      process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
      "";

    const configId =
      process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID ||
      process.env.WHATSAPP_CONFIG_ID ||
      "";

    let estadoMeta: any = null;
    let errorMeta = "";

    if (phoneId && token) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (res.ok) {
          estadoMeta = data;
        } else {
          errorMeta = data.error?.message || "Error al consultar estado en Meta.";
        }
      } catch (err: any) {
        errorMeta = err.message || "Error de red al conectar con Meta.";
      }
    }

    return NextResponse.json({
      ok: true,
      config: {
        appIdConfigurado: !!appId,
        appId: appId || null,
        configIdConfigurado: !!configId,
        configId: configId || null,
        phoneId: phoneId || null,
        wabaId: wabaId || null,
        tokenConfigurado: !!token,
        coexistenciaActiva: mapaDb.whatsapp_coexistencia_activa === "true",
        lastSync: mapaDb.whatsapp_last_sync || null,
        displayName: mapaDb.whatsapp_display_phone_number || estadoMeta?.display_phone_number || null,
        verifiedName: mapaDb.whatsapp_verified_name || estadoMeta?.verified_name || null,
      },
      meta: {
        enVivo: !!estadoMeta,
        detalles: estadoMeta,
        error: errorMeta || undefined,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Error interno." }, { status: 500 });
  }
}
