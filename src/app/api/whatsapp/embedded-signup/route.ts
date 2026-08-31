import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Endpoint que procesa la finalización del Embedded Signup de Meta con WhatsApp Coexistence:
 * 1. Recibe el código de autorización temporal (OAuth code) generado por el SDK de Facebook en el navegador.
 * 2. Intercambia el código por el Access Token permanente/larga duración en Meta Graph API.
 * 3. Suscribe el WABA a la aplicación para asegurar la recepción de webhooks de mensajes.
 * 4. Consulta los metadatos y estado del número de teléfono en Meta.
 * 5. Registra el número en la Cloud API de WhatsApp para habilitar la mensajería en coexistencia.
 * 6. Guarda los identificadores vinculados en la base de datos (configuracion_agente).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar permisos de administrador
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "No autorizado. Se requieren permisos de administrador." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { code, wabaId, phoneNumberId } = body as {
      code?: string;
      wabaId?: string;
      phoneNumberId?: string;
    };

    if (!code && !phoneNumberId && !wabaId) {
      return NextResponse.json(
        { ok: false, error: "Faltan parámetros requeridos (code, wabaId o phoneNumberId)." },
        { status: 400 }
      );
    }

    const appId =
      process.env.NEXT_PUBLIC_META_APP_ID ||
      process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

    const appSecret =
      process.env.META_APP_SECRET ||
      process.env.FACEBOOK_APP_SECRET ||
      process.env.WHATSAPP_APP_SECRET;

    let accessToken = process.env.WHATSAPP_TOKEN || "";
    let tokenIntercambiado = false;

    // 2. Si se recibió código temporal, intercambiarlo por Access Token en Meta Graph API
    if (code) {
      if (!appId || !appSecret) {
        console.warn("[Embedded Signup] Falta META_APP_ID o META_APP_SECRET en el entorno para intercambiar el código.");
      } else {
        try {
          const tokenUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
          const tokenRes = await fetch(tokenUrl);
          const tokenData = await tokenRes.json();

          if (tokenRes.ok && tokenData.access_token) {
            accessToken = tokenData.access_token;
            tokenIntercambiado = true;
            console.log("[Embedded Signup] Token de acceso intercambiado exitosamente desde Meta.");
          } else {
            console.error("[Embedded Signup] Error al intercambiar código por token en Meta:", tokenData);
          }
        } catch (tokenErr) {
          console.error("[Embedded Signup] Excepción al intercambiar token:", tokenErr);
        }
      }
    }

    const bearerToken = accessToken || process.env.WHATSAPP_TOKEN || "";

    // 3. Suscribir WABA a la aplicación (Subscribed Apps)
    let wabaSuscrito = false;
    let errorSuscripcionWaba = "";
    if (wabaId && bearerToken) {
      try {
        const subRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
          },
        });
        const subData = await subRes.json();
        if (subRes.ok && subData.success) {
          wabaSuscrito = true;
          console.log(`[Embedded Signup] WABA ${wabaId} suscrito exitosamente a webhooks.`);
        } else {
          errorSuscripcionWaba = subData.error?.message || "No se pudo suscribir WABA a la app.";
          console.warn(`[Embedded Signup] Advertencia al suscribir WABA ${wabaId}:`, subData);
        }
      } catch (subErr: any) {
        errorSuscripcionWaba = subErr.message || "Error de red al suscribir WABA.";
        console.error("[Embedded Signup] Error al suscribir WABA:", subErr);
      }
    }

    // 4. Obtener información y estado del número de teléfono en Meta
    let infoNumero: any = null;
    let errorInfoNumero = "";
    if (phoneNumberId && bearerToken) {
      try {
        const phoneUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status`;
        const phoneRes = await fetch(phoneUrl, {
          headers: { Authorization: `Bearer ${bearerToken}` },
        });
        const phoneData = await phoneRes.json();
        if (phoneRes.ok) {
          infoNumero = phoneData;
        } else {
          errorInfoNumero = phoneData.error?.message || "No se pudo obtener información del número.";
          console.warn(`[Embedded Signup] Error al consultar número ${phoneNumberId}:`, phoneData);
        }
      } catch (phoneErr: any) {
        errorInfoNumero = phoneErr.message || "Error al consultar número telefónico.";
      }
    }

    // 5. Registrar número en WhatsApp Cloud API (indispensable para activar mensajería)
    let numeroRegistrado = false;
    let errorRegistroNumero = "";
    if (phoneNumberId && bearerToken) {
      try {
        const regRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/register`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: "000000", // PIN por defecto de Cloud API para coexistencia
          }),
        });
        const regData = await regRes.json();
        if (regRes.ok && regData.success) {
          numeroRegistrado = true;
          console.log(`[Embedded Signup] Número ${phoneNumberId} registrado exitosamente en WhatsApp Cloud API.`);
        } else {
          // Si ya estaba registrado o es modo coexistencia activo, puede responder con success o aviso
          if (regData.error?.code === 133010 || regData.error?.error_subcode === 2388091) {
            numeroRegistrado = true; // Ya registrado previamente
          } else {
            errorRegistroNumero = regData.error?.message || "Aviso en registro de número.";
            console.warn(`[Embedded Signup] Registro de número ${phoneNumberId}:`, regData);
          }
        }
      } catch (regErr: any) {
        errorRegistroNumero = regErr.message || "Error en registro de número.";
      }
    }

    // 6. Guardar / persistir identificadores en public.configuracion_agente
    try {
      const sb = supabaseServidor();
      const registrosAGuardar: Array<{ clave: string; valor: string }> = [];

      if (wabaId) {
        registrosAGuardar.push({ clave: "whatsapp_waba_id", valor: wabaId });
      }
      if (phoneNumberId) {
        registrosAGuardar.push({ clave: "whatsapp_phone_number_id", valor: phoneNumberId });
      }
      if (infoNumero?.display_phone_number) {
        registrosAGuardar.push({ clave: "whatsapp_display_phone_number", valor: infoNumero.display_phone_number });
      }
      if (infoNumero?.verified_name) {
        registrosAGuardar.push({ clave: "whatsapp_verified_name", valor: infoNumero.verified_name });
      }
      if (tokenIntercambiado && accessToken) {
        registrosAGuardar.push({ clave: "whatsapp_oauth_token", valor: accessToken });
      }
      registrosAGuardar.push({ clave: "whatsapp_coexistencia_activa", valor: "true" });
      registrosAGuardar.push({ clave: "whatsapp_last_sync", valor: new Date().toISOString() });

      for (const item of registrosAGuardar) {
        await sb
          .from("configuracion_agente")
          .upsert({ clave: item.clave, valor: item.valor, updated_at: new Date().toISOString() }, { onConflict: "clave" });
      }
    } catch (dbErr) {
      console.error("[Embedded Signup] Error al guardar configuraciones en base de datos:", dbErr);
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Proceso de WhatsApp Coexistence procesado correctamente.",
      wabaId: wabaId || process.env.WHATSAPP_WABA_ID || null,
      phoneNumberId: phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      tokenIntercambiado,
      wabaSuscrito,
      numeroRegistrado,
      infoNumero,
      advertencias: {
        errorSuscripcionWaba: errorSuscripcionWaba || undefined,
        errorInfoNumero: errorInfoNumero || undefined,
        errorRegistroNumero: errorRegistroNumero || undefined,
      },
    });
  } catch (err: any) {
    console.error("[Embedded Signup] Error general:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno al procesar el Embedded Signup." },
      { status: 500 }
    );
  }
}
