import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const id = formData.get("id") as string;
    const file = formData.get("file") as File;

    if (!id || !file) {
      return NextResponse.json(
        { error: "Se requiere el ID de la publicación y el archivo de imagen" },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    const mimeType = file.type || "image/png";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "El archivo seleccionado debe ser una imagen válida (PNG, JPG, WebP)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sb = supabaseServidor();

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "crm.saucedamx.com";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const origin = `${proto}://${host}`;

    let urlFinal = "";

    // 1. Intentar subir a Supabase Storage si está configurado
    try {
      const ext = mimeType.split("/")[1] || "png";
      const storagePath = `marketing/${id}_${Date.now()}.${ext}`;

      const { data: uploadData, error: uploadError } = await sb.storage
        .from("expedientes-fotos")
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!uploadError && uploadData) {
        const { data: urlData } = sb.storage
          .from("expedientes-fotos")
          .getPublicUrl(uploadData.path);
        urlFinal = urlData.publicUrl;
      }
    } catch (e) {
      console.warn("[Subir Arte] Storage no disponible, usando fallback en base de datos:", e);
    }

    // 2. Si Storage falló o no resolvió, usar Base64 con endpoint público del CRM
    if (!urlFinal) {
      const base64 = buffer.toString("base64");
      // Almacenamos el data URI directamente para visualización instantánea y servicio vía /api/marketing/imagen/[id]
      urlFinal = `data:${mimeType};base64,${base64}`;
    }

    // 3. Actualizar la publicación en Supabase
    const { data: updatedPost, error: updateError } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: urlFinal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error al actualizar url_imagen en Supabase:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url_imagen: urlFinal,
      public_url: `${origin}/api/marketing/imagen/${id}`,
      data: updatedPost,
    });
  } catch (err: any) {
    console.error("Error interno al subir arte de publicación:", err);
    return NextResponse.json(
      { error: err.message || "Error al procesar archivo de imagen" },
      { status: 500 }
    );
  }
}
