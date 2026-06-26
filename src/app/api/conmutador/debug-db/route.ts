import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { obtenerHoraLocalMX } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();
    const { data: perfiles, error } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, disponible_llamadas, telefono_desvio, horarios_guardia");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const d = new Date();
    const formDia = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      weekday: "long",
    });
    const diaSemanaRaw = formDia.format(d).toLowerCase();
    const horaLocal = obtenerHoraLocalMX();

    return NextResponse.json({
      horaLocal,
      diaSemanaRaw,
      perfiles,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
