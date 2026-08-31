import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

/**
 * POST /api/whatsapp/set-pin
 * 
 * Registra o actualiza el PIN de 6 dígitos en Meta Cloud API para habilitar
 * el modo Coexistencia al iniciar sesión en la App Móvil de WhatsApp Business.
 */
export async function POST(request: Request) {
  try {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { pin, token: tokenManual, phoneId: phoneIdManual, wabaId: wabaIdManual } = body;

    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, error: "El PIN debe ser exactamente de 6 dígitos numéricos (ej. 123456)." },
        { status: 400 }
      );
    }

    const sb = supabaseServidor();
    const { data: dbConfigs } = await sb
      .from("configuracion_agente")
      .select("clave, valor")
      .in("clave", ["whatsapp_phone_number_id", "whatsapp_waba_id", "whatsapp_oauth_token"]);

    const mapaDb = (dbConfigs || []).reduce<Record<string, string>>((acc, item) => {
      acc[item.clave] = item.valor;
      return acc;
    }, {});

    const phoneId = phoneIdManual || mapaDb.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const wabaId = wabaIdManual || mapaDb.whatsapp_waba_id || process.env.WHATSAPP_WABA_ID;
    const token = tokenManual || mapaDb.whatsapp_oauth_token || process.env.WHATSAPP_TOKEN;

    if (!phoneId) {
      return NextResponse.json({ ok: false, error: "Falta el WhatsApp Phone Number ID." }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Falta el Token de acceso de Meta." }, { status: 400 });
    }

    // 1. Registrar PIN de 6 dígitos en Meta Cloud API
    const regRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: pin,
      }),
    });

    const regData = await regRes.json();
    console.log("[Meta /register PIN Response]", regData);

    if (!regRes.ok || regData.error) {
      return NextResponse.json(
        {
          ok: false,
          error: regData.error?.message || "No se pudo registrar el PIN en Meta Cloud API.",
          detalles: regData.error,
        },
        { status: 400 }
      );
    }

    // 2. Suscribir WABA a Webhooks (si tenemos wabaId)
    if (wabaId) {
      try {
        await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (subErr) {
        console.warn("[Meta subscribed_apps warning]", subErr);
      }
    }

    // 3. Guardar en Base de Datos
    const upserts = [
      { clave: "whatsapp_phone_number_id", valor: phoneId },
      { clave: "whatsapp_pin_configurado", valor: "true" },
      { clave: "whatsapp_coexistencia_activa", valor: "true" },
      { clave: "whatsapp_last_sync", valor: new Date().toISOString() },
    ];

    if (tokenManual) {
      upserts.push({ clave: "whatsapp_oauth_token", valor: tokenManual });
    }
    if (wabaId) {
      upserts.push({ clave: "whatsapp_waba_id", valor: wabaId });
    }

    for (const item of upserts) {
      await sb.from("configuracion_agente").upsert(
        { clave: item.clave, valor: item.valor, updated_at: new Date().toISOString() },
        { onConflict: "clave" }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: `PIN de 6 dígitos (${pin}) registrado exitosamente en Meta Cloud API. Ya puedes abrir WhatsApp Business en el móvil e ingresar este PIN.`,
    });
  } catch (error: any) {
    console.error("Error en /api/whatsapp/set-pin:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Error interno del servidor al registrar PIN." },
      { status: 500 }
    );
  }
}
