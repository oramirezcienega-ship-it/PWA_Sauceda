import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();

    // 1. Obtener enrollments que respondieron
    const { data: enrollments, error: errEn } = await sb
      .from("sequence_enrollments")
      .select("id, nombre, phone, status, razon_salida, step_actual, enrolled_at, ultimo_contacto_at")
      .eq("status", "salido")
      .eq("razon_salida", "respondio");

    if (errEn) return NextResponse.json({ error: errEn.message }, { status: 500 });

    const result = [];

    for (const en of enrollments || []) {
      // Obtener todas las acciones para este enrollment
      const { data: acciones, error: errAc } = await sb
        .from("sequence_actions")
        .select("*")
        .eq("enrollment_id", en.id);

      result.push({
        enrollmentName: en.nombre,
        enrollmentPhone: en.phone,
        enrolledAt: en.enrolled_at,
        ultimoContactoAt: en.ultimo_contacto_at,
        acciones: acciones || [],
        accionesCount: acciones?.length || 0,
        errAc: errAc ? errAc.message : null
      });
    }

    // 2. Muestra de todas las acciones
    const { data: todasAcciones } = await sb
      .from("sequence_actions")
      .select("id, canal, status, enviado_at, enrollment_id")
      .limit(100);

    return NextResponse.json({
      success: true,
      leadsRespondieron: result,
      todasAccionesMuestra: todasAcciones || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
