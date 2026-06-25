import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();
    
    // 1. Obtener últimas 5 llamadas
    const { data: llamadas, error: errLlamadas } = await sb
      .from("llamadas_conmutador")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    // 2. Obtener expediente de prueba
    const { data: expedientes, error: errExpedientes } = await sb
      .from("expedientes")
      .select("*")
      .eq("telefono", "520000000000")
      .limit(2);

    // 3. Obtener prospecto de prueba
    const { data: prospectos, error: errProspectos } = await sb
      .from("prospectos")
      .select("*")
      .eq("telefono", "520000000000")
      .limit(2);

    return NextResponse.json({
      llamadas,
      errLlamadas,
      expedientes,
      errExpedientes,
      prospectos,
      errProspectos,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
