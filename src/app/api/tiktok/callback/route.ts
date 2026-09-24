import { NextRequest, NextResponse } from "next/server";
import { obtenerCredencialesTikTok } from "@/lib/tiktok-publicador";
import { supabaseServidor } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "app.saucedamx.com";
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/tiktok/callback`;

  if (error || !code) {
    const errorMsg = errorDescription || error || "Autorización cancelada o denegada en TikTok";
    return NextResponse.redirect(
      new URL(`/admin/publicaciones?error_tiktok=${encodeURIComponent(errorMsg)}`, baseUrl)
    );
  }

  const creds = await obtenerCredencialesTikTok();
  const clientKey = creds?.clientKey || process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = creds?.clientSecret || process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    return NextResponse.redirect(
      new URL(
        `/admin/publicaciones?error_tiktok=${encodeURIComponent("Faltan credenciales de App en el servidor")}`,
        baseUrl
      )
    );
  }

  try {
    // Intercambiar código por access_token en TikTok v2
    const tokenParams = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error?.code !== "ok" && !tokenData.data?.access_token) {
      const msg = tokenData.error?.message || tokenData.message || "Error al obtener token de TikTok";
      return NextResponse.redirect(
        new URL(`/admin/publicaciones?error_tiktok=${encodeURIComponent(msg)}`, baseUrl)
      );
    }

    const { access_token, open_id, refresh_token } = tokenData.data;

    // Guardar tokens en configuracion_agente de Supabase
    const sb = supabaseServidor();
    const updates = [
      { clave: "tiktok_access_token", valor: access_token },
      ...(open_id ? [{ clave: "tiktok_open_id", valor: open_id }] : []),
      ...(refresh_token ? [{ clave: "tiktok_refresh_token", valor: refresh_token }] : []),
    ];

    for (const item of updates) {
      await sb.from("configuracion_agente").upsert(item, { onConflict: "clave" });
    }

    return NextResponse.redirect(
      new URL(`/admin/publicaciones?tiktok_conectado=1`, baseUrl)
    );
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(
        `/admin/publicaciones?error_tiktok=${encodeURIComponent(err?.message || "Excepción de conexión con TikTok")}`,
        baseUrl
      )
    );
  }
}
