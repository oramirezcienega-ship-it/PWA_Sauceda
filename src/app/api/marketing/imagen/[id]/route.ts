import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Procesa un buffer de imagen para garantizar cumplimiento estricto con Meta Instagram API:
 * 1. Limita dimensiones máximas para que no exceda 1440px y sea ligero.
 * 2. Asegura que la relación de aspecto esté entre 4:5 (0.80) y 1.91:1 (1.91) rellenando con blanco si es necesario.
 * 3. Convierte a JPEG de alta fidelidad (calidad 92 con mozjpeg).
 */
async function procesarBufferParaInstagram(buf: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  let pipeline = sharp(buf);
  const meta = await pipeline.metadata();

  if (meta.width && meta.height) {
    // Si la imagen es excesivamente grande, redimensionar manteniendo proporción
    if (meta.width > 1920 || meta.height > 1920) {
      pipeline = pipeline.resize({
        width: 1440,
        height: 1440,
        fit: "inside",
        withoutEnlargement: true,
      });
      const resizedBuf = await pipeline.toBuffer();
      pipeline = sharp(resizedBuf);
    }

    const currentMeta = await pipeline.metadata();
    const w = currentMeta.width || 1080;
    const h = currentMeta.height || 1080;
    const ratio = w / h;

    // Instagram Feed exige que la relación de aspecto esté estrictamente entre 4:5 (0.80) y 1.91:1 (1.91)
    if (ratio < 0.8) {
      // Demasiado vertical (ej. 9:16 = 0.5625): expandir horizontalmente con fondo blanco para llegar a 4:5 (0.80)
      const targetW = Math.round(h * 0.8);
      const padX = Math.round((targetW - w) / 2);
      pipeline = pipeline.extend({
        top: 0,
        bottom: 0,
        left: padX,
        right: padX,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
    } else if (ratio > 1.91) {
      // Demasiado panorámica (> 1.91): expandir verticalmente con fondo blanco para llegar a 1.91:1
      const targetH = Math.round(w / 1.91);
      const padY = Math.round((targetH - h) / 2);
      pipeline = pipeline.extend({
        top: padY,
        bottom: padY,
        left: 0,
        right: 0,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
    }
  }

  return await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawId = (await params)?.id || "";
    const cleanId = rawId.replace(/\.(jpg|jpeg|png|webp)$/i, "");

    const urlObj = new URL(req.url);
    const queryUrl = urlObj.searchParams.get("url");

    let url = "";

    // 1. Si se pasó la URL original como parámetro, usarla directamente.
    // Esto desacopla el proxy de la base de datos y permite servir imágenes en Staging y Producción
    // sin fallar con 404 si la publicación no existe en la BD del host actual.
    if (queryUrl && (queryUrl.startsWith("http://") || queryUrl.startsWith("https://"))) {
      url = queryUrl;
    } else if (cleanId) {
      const sb = supabaseServidor();
      const { data: post, error } = await sb
        .from("publicaciones_programadas")
        .select("url_imagen")
        .eq("id", cleanId)
        .maybeSingle();

      if (error || !post || !post.url_imagen) {
        return new Response("Imagen no encontrada", { status: 404 });
      }

      url = post.url_imagen;
    } else {
      return new Response("ID de publicación o URL no proporcionados", { status: 400 });
    }

    // 2. Si es un data URI en base64 (ej. arte cargado directamente desde Canva o archivo local)
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const rawBuffer = Buffer.from(match[2], "base64");
        try {
          const jpegBuffer = await procesarBufferParaInstagram(rawBuffer);
          return new Response(new Uint8Array(jpegBuffer), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          return new Response(new Uint8Array(rawBuffer), {
            headers: {
              "Content-Type": match[1],
              "Cache-Control": "no-cache",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
    }

    // 3. Si contiene un banner SVG generado anteriormente, extraer la foto limpia subyacente
    if (url.includes("/api/marketing/generar-banner?foto=")) {
      const match = url.match(/foto=([^&]+)/);
      if (match && match[1]) {
        url = decodeURIComponent(match[1]);
      }
    }

    // 4. Si es una URL de Unsplash, forzar fm=jpg
    if (url.includes("images.unsplash.com")) {
      try {
        const u = new URL(url);
        u.searchParams.set("fm", "jpg");
        u.searchParams.delete("auto");
        url = u.toString();
      } catch {}
    }

    // 5. Descargar la imagen y procesarla con sharp para servir JPEG 100% compatible con Meta e Instagram
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const imgRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (CRM Sauceda Image Proxy)",
          Accept: "image/*,*/*",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuf);

        try {
          const jpegBuffer = await procesarBufferParaInstagram(inputBuffer);
          return new Response(new Uint8Array(jpegBuffer), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (sharpErr) {
          console.warn("[Proxy Imagen] Falló conversión con sharp, sirviendo buffer original:", sharpErr);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          return new Response(new Uint8Array(inputBuffer), {
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
