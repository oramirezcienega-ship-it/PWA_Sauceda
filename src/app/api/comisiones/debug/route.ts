import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();

    const { data: comisiones, error: errCom, count: countCom } = await sb
      .from("comisiones")
      .select("*", { count: "exact" });

    const { data: remisiones, error: errRem, count: countRem } = await sb
      .from("remisiones_facturas")
      .select("id, folio, tipo, monto_total", { count: "exact" });

    const { data: recibos, error: errRec, count: countRec } = await sb
      .from("recibos_pago")
      .select("id, folio, monto", { count: "exact" });

    const { data: reglas, error: errReg, count: countReg } = await sb
      .from("comisiones_reglas")
      .select("*", { count: "exact" });

    const { data: perfilesAsesores } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo");

    return NextResponse.json({
      status: "ok",
      comisiones: {
        total: countCom ?? comisiones?.length ?? 0,
        error: errCom?.message || null,
        data: comisiones || [],
      },
      remisiones: {
        total: countRem ?? remisiones?.length ?? 0,
        error: errRem?.message || null,
        data: remisiones || [],
      },
      recibos: {
        total: countRec ?? recibos?.length ?? 0,
        error: errRec?.message || null,
        data: recibos || [],
      },
      reglas: {
        total: countReg ?? reglas?.length ?? 0,
        error: errReg?.message || null,
      },
      perfilesAsesores: perfilesAsesores || [],
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
