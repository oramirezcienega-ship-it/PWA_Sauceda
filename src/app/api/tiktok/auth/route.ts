import { NextRequest, NextResponse } from "next/server";
import { obtenerCredencialesTikTok } from "@/lib/tiktok-publicador";

export async function GET(req: NextRequest) {
  const creds = await obtenerCredencialesTikTok();
  const clientKey = creds?.clientKey || process.env.TIKTOK_CLIENT_KEY;

  if (!clientKey) {
    return NextResponse.json(
      { error: "No se ha configurado el Client Key de TikTok en el sistema." },
      { status: 400 }
    );
  }

  // Determinar la URL base actual (host público)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "app.saucedamx.com";
  const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/tiktok/callback`;

  const csrfState = Math.random().toString(36).substring(2);

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", csrfState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("tiktok_csrf_state", csrfState, {
    maxAge: 60 * 10,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
