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
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
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

    // Intentar servir la imagen directamente (proxy buffer) para garantizar entrega y evitar bloqueos de CSP/CORS/Referer
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const imgRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (CRM Sauceda Image Proxy)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") || "image/webp";
        const arrayBuf = await imgRes.arrayBuffer();
        return new Response(Buffer.from(arrayBuf), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    } catch (fetchErr) {
      console.warn("[Proxy Imagen] Falló proxy directo, usando redirect fallback:", fetchErr);
    }

    // Redirección fallback si falló la descarga en servidor
    return NextResponse.redirect(url, { status: 307 });
  } catch (err: any) {
    console.error("Error al servir imagen de publicación:", err);
    return new Response("Error interno al servir imagen", { status: 500 });
  }
}
