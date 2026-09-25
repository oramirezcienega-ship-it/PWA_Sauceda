import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Endpoint para subir imágenes (PNG, JPG, WebP) y videos (MP4, MOV, WebM)
 * asignándolos directamente a una publicación de marketing con prevalidación técnica.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const id = formData.get("id") as string;
    const file = formData.get("file") as File;
    const forzarFormato = formData.get("tipo_formato") as string | null;
    const metadatosRaw = formData.get("metadatos") as string | null;

    if (!id || !file) {
      return NextResponse.json(
        { error: "Se requiere el ID de la publicación y el archivo multimedia" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "";
    const fileName = file.name || "";
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "";

    const esVideo =
      mimeType.startsWith("video/") ||
      ["mp4", "mov", "webm", "m4v"].includes(fileExt);

    const esImagen =
      mimeType.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp"].includes(fileExt);

    if (!esVideo && !esImagen) {
      return NextResponse.json(
        {
          error:
            "El archivo seleccionado no es compatible. Formatos permitidos: Video (MP4, MOV, WebM) o Imagen (PNG, JPG, WebP).",
        },
        { status: 400 }
      );
    }

    // Límite de tamaño: 120 MB para videos, 20 MB para imágenes
    const maxBytes = esVideo ? 120 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      const maxMb = esVideo ? 120 : 20;
      return NextResponse.json(
        {
          error: `El archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB, superando el límite máximo permitido de ${maxMb} MB.`,
        },
        { status: 400 }
      );
    }

    // Resolver extensión normalizada
    let ext = fileExt;
    if (!ext) {
      if (mimeType.includes("quicktime")) ext = "mov";
      else if (mimeType.includes("mp4")) ext = "mp4";
      else if (mimeType.includes("webm")) ext = "webm";
      else if (mimeType.includes("jpeg")) ext = "jpg";
      else if (mimeType.includes("png")) ext = "png";
      else if (mimeType.includes("webp")) ext = "webp";
      else ext = esVideo ? "mp4" : "png";
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sb = supabaseServidor();

    const host =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      "crm.saucedamx.com";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const origin = `${proto}://${host}`;

    let urlFinal = "";
    const carpeta = esVideo ? "videos" : "artes";
    const storagePath = `marketing/${carpeta}/${id}_${Date.now()}.${ext}`;

    // 1. Subir a Supabase Storage (Bucket público expedientes-fotos)
    try {
      const effectiveContentType =
        mimeType || (esVideo ? `video/${ext}` : `image/${ext}`);

      const { data: uploadData, error: uploadError } = await sb.storage
        .from("expedientes-fotos")
        .upload(storagePath, buffer, {
          contentType: effectiveContentType,
          upsert: true,
        });

      if (!uploadError && uploadData) {
        const { data: urlData } = sb.storage
          .from("expedientes-fotos")
          .getPublicUrl(uploadData.path);
        urlFinal = urlData.publicUrl;
      } else if (uploadError) {
        console.warn("[Subir Media] Error en Storage upload:", uploadError.message);
      }
    } catch (e: any) {
      console.warn("[Subir Media] Storage falló:", e?.message || e);
    }

    // 2. Si Storage no resolvió y es imagen pequeña, fallback a Data URI
    if (!urlFinal && esImagen) {
      const base64 = buffer.toString("base64");
      urlFinal = `data:${mimeType || "image/png"};base64,${base64}`;
    }

    if (!urlFinal) {
      return NextResponse.json(
        {
          error:
            "No fue posible guardar el archivo en el almacenamiento en la nube (Storage). Verifica tu conexión o intenta nuevamente.",
        },
        { status: 500 }
      );
    }

    // 3. Consultar publicación actual para preservar diseno_banner y ajustar tipo_formato
    const { data: postActual } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("id", id)
      .single();

    let nuevoTipoFormato = postActual?.tipo_formato || "imagen";
    if (forzarFormato && ["video", "reel", "imagen", "carrusel"].includes(forzarFormato)) {
      nuevoTipoFormato = forzarFormato;
    } else if (esVideo) {
      if (
        postActual?.plataforma === "tiktok" ||
        nuevoTipoFormato === "reel" ||
        nuevoTipoFormato === "imagen"
      ) {
        nuevoTipoFormato = "reel";
      } else {
        nuevoTipoFormato = "video";
      }
    }

    let metadatosParsed: any = null;
    if (metadatosRaw) {
      try {
        metadatosParsed = JSON.parse(metadatosRaw);
      } catch {}
    }

    const nuevoDisenoBanner = {
      ...(postActual?.diseno_banner || {}),
      ...(esVideo
        ? {
            video_url: urlFinal,
            video_metadata: metadatosParsed,
            es_video_subido: true,
          }
        : {
            es_video_subido: false,
          }),
    };

    // 4. Actualizar la publicación en Supabase
    const { data: updatedPost, error: updateError } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: urlFinal,
        tipo_formato: nuevoTipoFormato,
        diseno_banner: nuevoDisenoBanner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error al actualizar publicación en Supabase:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url_imagen: urlFinal,
      tipo_formato: nuevoTipoFormato,
      es_video: esVideo,
      metadatos: metadatosParsed,
      data: updatedPost,
    });
  } catch (err: any) {
    console.error("Error interno en subir-arte / subir-video:", err);
    return NextResponse.json(
      { error: err.message || "Error al procesar archivo multimedia" },
      { status: 500 }
    );
  }
}
