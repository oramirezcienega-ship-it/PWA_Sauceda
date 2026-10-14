import { NextRequest, NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { registrarVistoAutorizacion } from "@/lib/cotizacion-telegram";

export const dynamic = "force-dynamic";

/**
 * Botón "Ver cotización" del mensaje de autorización de costo por Telegram.
 * Registra que el destinatario la abrió y lo redirige al documento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { cotizacionId: string; token: string } }
) {
  const base = process.env.SITE_URL || request.nextUrl.origin;
  try {
    const r = await registrarVistoAutorizacion(supabaseServidor(), decodeURIComponent(params.cotizacionId), params.token);
    if (r.tokenCotizacion) {
      return NextResponse.redirect(`${base}/cotizacion/${r.tokenCotizacion}?vista=documento`);
    }
  } catch (err) {
    console.error("[Telegram] Error al registrar visto de autorización:", err);
  }
  return new NextResponse("Esta cotización ya no está disponible.", { status: 404 });
}
