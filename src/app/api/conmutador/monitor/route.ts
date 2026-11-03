import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VAPI_URL = "https://api.vapi.ai";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta id de llamada" }, { status: 400 });
    }

    const sb = supabaseServidor();
    const { data: ll } = await sb.from("llamadas_campana").select("*").eq("id", id).maybeSingle();

    if (!ll || !ll.vapi_call_id) {
      return NextResponse.json({ ok: false, error: "Llamada no encontrada o sin Vapi ID" }, { status: 404 });
    }

    const datos = (typeof ll.datos === "object" && ll.datos !== null ? ll.datos : {}) as Record<string, any>;
    if (datos.monitor?.listenUrl) {
      return NextResponse.json({ ok: true, listenUrl: datos.monitor.listenUrl });
    }

    // Consultar Vapi API si no está en cache
    const vapiKey = process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return NextResponse.json({ ok: false, error: "Falta VAPI_API_KEY" }, { status: 500 });
    }

    const res = await fetch(`${VAPI_URL}/call/${ll.vapi_call_id}`, {
      headers: { Authorization: `Bearer ${vapiKey}`, "User-Agent": "Sauceda-CRM/1.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "No se pudo consultar Vapi" }, { status: 500 });
    }

    const callObj = await res.json();
    const listenUrl = callObj.monitor?.listenUrl || null;

    if (listenUrl) {
      await sb
        .from("llamadas_campana")
        .update({
          datos: { ...datos, monitor: callObj.monitor },
        })
        .eq("id", id);
    }

    return NextResponse.json({ ok: true, listenUrl });
  } catch (error) {
    console.error("Error en /api/conmutador/monitor:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
