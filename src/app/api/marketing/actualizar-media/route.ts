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

    let finalMediaUrl = url_imagen;
    if (url_imagen.includes("replicate.delivery") || url_imagen.includes("replicate.com")) {
      const encodedFoto = encodeURIComponent(url_imagen);
      const encodedTitulo = encodeURIComponent(diseno.titulo_ad || tituloPost);
      const encodedSub = encodeURIComponent(diseno.subtitulo_ad || "Cotiza hoy al WhatsApp 477 465 4700 • León, Guanajuato");
      
      const sellos = diseno.sellos || [];
      const s1Top = encodeURIComponent(sellos[0]?.texto_top || "GARANTÍA");
      const s1Bot = encodeURIComponent(sellos[0]?.texto_bottom || "10 AÑOS");
      const s1Color = encodeURIComponent(sellos[0]?.color_fondo || "#0A192F");

      const s2Top = encodeURIComponent(sellos[1]?.texto_top || "MARCA");
      const s2Bot = encodeURIComponent(sellos[1]?.texto_bottom || "GTO");
      const s2Color = encodeURIComponent(sellos[1]?.color_fondo || "#1A365D");

      const s3Top = encodeURIComponent(sellos[2]?.texto_top || "CALIDAD");
      const s3Bot = encodeURIComponent(sellos[2]?.texto_bottom || "PRO 100%");
      const s3Color = encodeURIComponent(sellos[2]?.color_fondo || "#C53030");

      const ctaTexto = encodeURIComponent(diseno.cta_texto || "WhatsApp Directo:");
      const telefono = encodeURIComponent(diseno.telefono_contacto || "477 465 4700");
      const colorDestacado = encodeURIComponent(diseno.color_destacado || "#C53030");

      finalMediaUrl = `https://crm-staging.saucedamx.com/api/marketing/generar-banner?foto=${encodedFoto}&titulo=${encodedTitulo}&sub=${encodedSub}&sello1_top=${s1Top}&sello1_bot=${s1Bot}&sello1_color=${s1Color}&sello2_top=${s2Top}&sello2_bot=${s2Bot}&sello2_color=${s2Color}&sello3_top=${s3Top}&sello3_bot=${s3Bot}&sello3_color=${s3Color}&cta_texto=${ctaTexto}&telefono=${telefono}&color=${colorDestacado}`;
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
