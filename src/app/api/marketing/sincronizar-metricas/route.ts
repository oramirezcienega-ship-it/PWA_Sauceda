import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, inversion_ads, impresiones, clics, leads_generados, meta_ad_id } = body;

    if (!id) {
      return NextResponse.json({ error: "El parámetro 'id' de la publicación es obligatorio." }, { status: 400 });
    }

    const inv = Number(inversion_ads || 0);
    const leads = Number(leads_generados || 0);
    const cpl = leads > 0 ? Number((inv / leads).toFixed(2)) : 0;
    
    // Cálculo automático de Score de Rendimiento (0 a 100)
    let roi_score = 0;
    if (leads > 0) {
      roi_score = Math.min(100, Math.round((leads * 20) - (cpl * 0.5)));
    }

    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        inversion_ads: inv,
        impresiones: Number(impresiones || 0),
        clics: Number(clics || 0),
        leads_generados: leads,
        cpl,
        roi_score,
        meta_ad_id: meta_ad_id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error al sincronizar métricas desde API:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Error en /api/marketing/sincronizar-metricas:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
