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

    // Obtener título de la publicación si no viene en el body
    let tituloPost = titulo;
    if (!tituloPost) {
      const { data: post } = await sb
        .from("publicaciones_programadas")
        .select("titulo")
        .eq("id", id)
        .single();
      if (post && post.titulo) {
        tituloPost = post.titulo;
      }
    }
    tituloPost = tituloPost || "SAUCEDA BIENES RAÍCES Y CONSTRUCCIÓN";

    // Si la imagen viene de Replicate, componer el Banner Vendedor VIPROCOSA de SAUCEDA
    let finalMediaUrl = url_imagen;
    if (url_imagen.includes("replicate.delivery") || url_imagen.includes("replicate.com")) {
      const encodedFoto = encodeURIComponent(url_imagen);
      const encodedTitulo = encodeURIComponent(tituloPost);
      const encodedSub = encodeURIComponent("Cotiza hoy al WhatsApp 477 465 4700 • León, Guanajuato");
      
      finalMediaUrl = `https://crm-staging.saucedamx.com/api/marketing/generar-banner?foto=${encodedFoto}&titulo=${encodedTitulo}&sub=${encodedSub}`;
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
