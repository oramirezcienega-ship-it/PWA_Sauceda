import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();

    // 1. Raw comisiones
    const { data: rawCom, error: errRawCom } = await sb
      .from("comisiones")
      .select("*")
      .order("fecha", { ascending: false });

    // 2. Comisiones con perfiles:asesor_id
    const { data: joinCom, error: errJoinCom } = await sb
      .from("comisiones")
      .select("*, perfiles:asesor_id(nombre, telefono)")
      .order("fecha", { ascending: false });

    // 3. Comisiones pagos query
    const { data: pagos, error: errPagos } = await sb
      .from("comisiones_pagos")
      .select(`
        id,
        asesor_id,
        fecha_pago,
        monto,
        metodo_pago,
        referencia,
        comprobante_url,
        notas,
        created_at,
        updated_at,
        perfiles:asesor_id(nombre),
        detalles:comisiones_pagos_detalle(
          id,
          pago_id,
          comision_id,
          monto_aplicado,
          created_at
        )
      `);

    // 4. Cotizaciones query
    const { data: cotizaciones, error: errCot } = await sb
      .from("cotizaciones")
      .select("id, token, servicio_tipo, cliente_nombre_personalizado, prospecto_id")
      .limit(5);

    // 5. Perfiles query directa
    const asesorIds = Array.from(new Set((rawCom || []).map((r: any) => r.asesor_id).filter(Boolean)));
    const { data: perfilesDirectos, error: errPerfiles } = await sb
      .from("perfiles")
      .select("id, nombre, telefono")
      .in("id", asesorIds);

    return NextResponse.json({
      status: "ok",
      rawComisiones: {
        count: rawCom?.length || 0,
        error: errRawCom?.message || null,
        sample: rawCom?.[0] || null,
      },
      joinComisiones: {
        count: joinCom?.length || 0,
        error: errJoinCom?.message || null,
      },
      pagos: {
        count: pagos?.length || 0,
        error: errPagos?.message || null,
      },
      cotizaciones: {
        count: cotizaciones?.length || 0,
        error: errCot?.message || null,
      },
      perfilesDirectos: {
        count: perfilesDirectos?.length || 0,
        error: errPerfiles?.message || null,
        data: perfilesDirectos || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

