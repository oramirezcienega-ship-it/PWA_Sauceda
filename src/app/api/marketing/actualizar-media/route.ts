import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, url_imagen, titulo, sugerencia_visual } = body;

    if (!id || !url_imagen) {
      return NextResponse.json({ error: "Faltan parámetros requeridos (id, url_imagen)" }, { status: 400 });
    }

    const sb = supabaseServidor();

    // Consultar el registro actual si no vienen titulo o sugerencia_visual
    let tituloBanner = titulo;
    let sugerenciaBanner = sugerencia_visual;

    if (!tituloBanner || !sugerenciaBanner) {
      const { data: current } = await sb
        .from("publicaciones_programadas")
        .select("titulo, sugerencia_visual")
        .eq("id", id)
        .single();
      if (current) {
        tituloBanner = tituloBanner || current.titulo || "SAUCEDA BIENES RAÍCES";
        sugerenciaBanner = sugerenciaBanner || current.sugerencia_visual || "";
      }
    }

    tituloBanner = tituloBanner || "SAUCEDA BIENES RAÍCES";
    sugerenciaBanner = sugerenciaBanner || "";

    // Construir la URL del Banner Vendedor Profesional usando Cloudinary / Overlay Engine nativo
    // Si la imagen ya viene procesada, se usa directamente; si es de Replicate se genera el Banner
    let finalMediaUrl = url_imagen;

    if (url_imagen.includes("replicate.delivery") || url_imagen.includes("replicate.com")) {
      const encodedPhoto = encodeURIComponent(url_imagen);
      const encodedTitulo = encodeURIComponent(tituloBanner);
      const encodedSub = encodeURIComponent("Instalación en 1 día • Garantía por escrito");
      
      // Renderizador dinámico de Banner Vendedor SAUCEDA
      finalMediaUrl = `https://crm-staging.saucedamx.com/api/marketing/generar-banner?foto=${encodedPhoto}&titulo=${encodedTitulo}&sub=${encodedSub}`;
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
