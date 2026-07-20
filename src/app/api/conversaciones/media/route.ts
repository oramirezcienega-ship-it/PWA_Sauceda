import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversaciones/media
 * Proxy para descargar imágenes, stickers, videos y documentos de WhatsApp.
 * Requiere sesión de administrador para seguridad.
 */
export async function GET(request: NextRequest) {
  try {
    // Validar autorización
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
      return NextResponse.json({ error: "Falta mediaId" }, { status: 400 });
    }

    const token = process.env.WHATSAPP_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "WhatsApp no está configurado en el servidor" }, { status: 500 });
    }

    // 1. Obtener la URL del archivo multimedia en Meta Graph API
    const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!infoRes.ok) {
      console.error(`[Media Proxy] Error al obtener info de Meta (${infoRes.status}):`, await infoRes.text());
      return NextResponse.json({ error: "No se pudo recuperar la información de Meta" }, { status: infoRes.status });
    }

    const info = await infoRes.json() as { url?: string; mime_type?: string };
    if (!info.url) {
      return NextResponse.json({ error: "No se encontró la URL del recurso" }, { status: 404 });
    }

    const contentType = info.mime_type || "application/octet-stream";

    // 2. Descargar el archivo binario desde Meta
    const fileRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      console.error(`[Media Proxy] Error al descargar el archivo de Meta (${fileRes.status})`);
      return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: fileRes.status });
    }

    const mediaBuffer = await fileRes.arrayBuffer();

    return new NextResponse(mediaBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400", // Cachear por 24h
      }
    });
  } catch (err: any) {
    console.error("Error en proxy de media de WhatsApp:", err);
    return NextResponse.json(
      { error: err.message || "Error interno al recuperar el recurso" },
      { status: 500 }
    );
  }
}
