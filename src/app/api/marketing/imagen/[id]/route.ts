import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new Response("ID de publicación no proporcionado", { status: 400 });
    }

    const sb = supabaseServidor();
    const { data: post, error } = await sb
      .from("publicaciones_programadas")
      .select("url_imagen")
      .eq("id", id)
      .maybeSingle();

    if (error || !post || !post.url_imagen) {
      return new Response("Imagen no encontrada", { status: 404 });
    }

    let url = post.url_imagen;

    // Si es un data URI en base64 (ej. arte cargado directamente desde Canva)
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], "base64");
        return new Response(buffer, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Si contiene un banner SVG generado anteriormente, extraer la foto limpia
    if (url.includes("/api/marketing/generar-banner?foto=")) {
      const match = url.match(/foto=([^&]+)/);
      if (match && match[1]) {
        url = decodeURIComponent(match[1]);
      }
    }

    // Redirección directa a la URL pública de la imagen
    return NextResponse.redirect(url, { status: 307 });
  } catch (err: any) {
    console.error("Error al servir imagen de publicación:", err);
    return new Response("Error interno al servir imagen", { status: 500 });
  }
}
