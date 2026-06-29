import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { obtenerHoraLocalMX } from "@/features/conmutador/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();
    
    // Consultar perfiles
    const { data: perfiles, error: errPerfiles } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, disponible_llamadas, telefono_desvio, horarios_guardia");

    if (errPerfiles) {
      return NextResponse.json({ error: errPerfiles.message }, { status: 500 });
    }

    const { data: prospectos } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, asesor_id, estatus, calificacion, created_at");

    const { data: expedientes } = await sb
      .from("expedientes")
      .select("id, cliente, prospecto_id, asesor_id, etapa, creado_en");

    // Consultar últimas 5 llamadas
    const { data: llamadas, error: errLlamadas } = await sb
      .from("llamadas_conmutador")
      .select("twilio_call_sid, cliente_telefono, estado, agente_id, created_at, datos_perfilados")
      .order("created_at", { ascending: false })
      .limit(5);

    if (errLlamadas) {
      return NextResponse.json({ error: errLlamadas.message }, { status: 500 });
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
      llamadas,
      prospectos,
      expedientes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
