import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, url_imagen } = body;

    if (!id || !url_imagen) {
      return NextResponse.json({ error: "Faltan parámetros requeridos (id, url_imagen)" }, { status: 400 });
    }

    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen,
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
