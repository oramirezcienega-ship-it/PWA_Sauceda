import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import sharp from "sharp";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawId = (await params)?.id || "";
    const cleanId = rawId.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    if (!cleanId) {
      return new Response("ID de publicación no proporcionado", { status: 400 });
    }

    const sb = supabaseServidor();
    const { data: post, error } = await sb
      .from("publicaciones_programadas")
      .select("url_imagen")
      .eq("id", cleanId)
      .maybeSingle();

    if (error || !post || !post.url_imagen) {
      return new Response("Imagen no encontrada", { status: 404 });
    }

    let url = post.url_imagen;

    // Si es un data URI en base64 (ej. arte cargado directamente desde Canva)
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const rawBuffer = Buffer.from(match[2], "base64");
        try {
          const jpegBuffer = await sharp(rawBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
          return new Response(jpegBuffer, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          return new Response(rawBuffer, {
            headers: {
              "Content-Type": match[1],
              "Cache-Control": "no-cache",
            },
          });
        }
      }
    }

    // Si contiene un banner SVG generado anteriormente, extraer la foto limpia
    if (url.includes("/api/marketing/generar-banner?foto=")) {
      const match = url.match(/foto=([^&]+)/);
      if (match && match[1]) {
        url = decodeURIComponent(match[1]);
      }
    }

    // Intentar servir la imagen convertida a JPEG directamente para Instagram y Meta Graph API
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
        const arrayBuf = await imgRes.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuf);

        // Convertir automáticamente a JPEG para compatibilidad universal con Meta e Instagram
        try {
          const jpegBuffer = await sharp(inputBuffer)
            .jpeg({ quality: 92, mozjpeg: true })
            .toBuffer();

          return new Response(jpegBuffer, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (sharpErr) {
          console.warn("[Proxy Imagen] Falló conversión con sharp, sirviendo buffer original:", sharpErr);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          return new Response(inputBuffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-cache",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
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
