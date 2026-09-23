import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, url_imagen, titulo } = body;

    if (!id || !url_imagen) {
      return NextResponse.json({ error: "Faltan parámetros requeridos (id, url_imagen)" }, { status: 400 });
    }

    const sb = supabaseServidor();

    // Obtener título y diseno_banner de la publicación
    const { data: post } = await sb
      .from("publicaciones_programadas")
      .select("titulo, diseno_banner")
      .eq("id", id)
      .single();

    const tituloPost = titulo || post?.titulo || "SAUCEDA BIENES RAÍCES Y CONSTRUCCIÓN";
    const diseno = (post?.diseno_banner as any) || {};

    // Preservar la fotografía limpia de Flux / Replicate sin sellos ni textos SVG superpuestos.
    // Si la URL entrante contenía un generar-banner anterior, rescatamos la foto pura.
    let finalMediaUrl = url_imagen;
    if (typeof url_imagen === "string" && url_imagen.includes("generar-banner")) {
      try {
        const parsed = new URL(url_imagen);
        const fotoPura = parsed.searchParams.get("foto");
        if (fotoPura) finalMediaUrl = fotoPura;
      } catch {
        const match = url_imagen.match(/foto=([^&]+)/);
        if (match && match[1]) finalMediaUrl = decodeURIComponent(match[1]);
      }
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: finalMediaUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error al actualizar media en Supabase desde API:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error interno en api/marketing/actualizar-media:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
