import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";
import { listarComisiones, obtenerResumenEstadoCuenta } from "@/app/actions/comisiones";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseServidor();

    // 1. Probar usuarioActual
    let usuario = null;
    let errUser = null;
    try {
      usuario = await usuarioActual();
    } catch (e: any) {
      errUser = e.message || String(e);
    }

    // 2. Probar listarComisiones directamente
    let comisionesAction = null;
    let errAction = null;
    try {
      comisionesAction = await listarComisiones();
    } catch (e: any) {
      errAction = e.message || String(e);
    }

    // 3. Probar obtenerResumenEstadoCuenta directamente
    let resumenAction = null;
    let errResumen = null;
    try {
      resumenAction = await obtenerResumenEstadoCuenta();
    } catch (e: any) {
      errResumen = e.message || String(e);
    }

    // 4. Probar paso a paso el enriquecimiento interno sin requireAdmin
    const { data: rows, error: errRows } = await sb
      .from("comisiones")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    const asesorIds = Array.from(new Set((rows || []).map((r: any) => r.asesor_id).filter(Boolean)));
    const remisionIds = Array.from(new Set((rows || []).map((r: any) => r.remision_factura_id).filter(Boolean)));
    const reciboIds = Array.from(new Set((rows || []).map((r: any) => r.recibo_pago_id).filter(Boolean)));
    const cotizacionIds = Array.from(new Set((rows || []).map((r: any) => r.cotizacion_id).filter(Boolean)));
    const ordenTrabajoIds = Array.from(new Set((rows || []).map((r: any) => r.orden_trabajo_id).filter(Boolean)));

    const [resPerfiles, resRemisiones, resRecibos, resCotizaciones, resOrdenes] = await Promise.all([
      asesorIds.length > 0
        ? sb.from("perfiles").select("id, nombre, telefono").in("id", asesorIds)
        : Promise.resolve({ data: [] }),
      remisionIds.length > 0
        ? sb.from("remisiones_facturas").select("id, folio, tipo, fecha, monto_subtotal, monto_total").in("id", remisionIds)
        : Promise.resolve({ data: [] }),
      reciboIds.length > 0
        ? sb.from("recibos_pago").select("id, folio, concepto, monto, fecha_pago, cliente_nombre").in("id", reciboIds)
        : Promise.resolve({ data: [] }),
      cotizacionIds.length > 0
        ? sb.from("cotizaciones").select("id, token, servicio_tipo, prospecto_id").in("id", cotizacionIds)
        : Promise.resolve({ data: [] }),
      ordenTrabajoIds.length > 0
        ? sb.from("ordenes_trabajo").select("id, folio, titulo").in("id", ordenTrabajoIds)
        : Promise.resolve({ data: [] }),
    ]);

    const mapPerf = new Map<string, any>((resPerfiles.data || []).map((p: any) => [p.id, p]));
    const mapRem = new Map<string, any>((resRemisiones.data || []).map((r: any) => [r.id, r]));
    const mapRec = new Map<string, any>((resRecibos.data || []).map((r: any) => [r.id, r]));
    const mapCot = new Map<string, any>((resCotizaciones.data || []).map((r: any) => [r.id, r]));
    const mapOt = new Map<string, any>((resOrdenes.data || []).map((r: any) => [r.id, r]));

    const listaEnriquecida = (rows || []).map((row: any) => {
      const perf = row.asesor_id ? mapPerf.get(row.asesor_id) : null;
      const rem = row.remision_factura_id ? mapRem.get(row.remision_factura_id) : null;
      const rec = row.recibo_pago_id ? mapRec.get(row.recibo_pago_id) : null;
      const cot = row.cotizacion_id ? mapCot.get(row.cotizacion_id) : null;
      const ot = row.orden_trabajo_id ? mapOt.get(row.orden_trabajo_id) : null;

      return {
        id: row.id,
        folio: rem?.folio || rec?.folio || ot?.folio || "S/F",
        tipo: rem?.tipo || (row.recibo_pago_id ? "recibo" : "remision"),
        asesorNombre: perf?.nombre || "Sin Asesor",
        montoVenta: Number(row.monto_venta || 0),
        montoComision: Number(row.monto_comision || 0),
        saldoPendiente: Number(row.saldo_pendiente || 0),
        estatus: row.estatus,
      };
    });

    return NextResponse.json({
      status: "ok",
      auth: {
        usuario,
        error: errUser,
      },
      listarComisionesAction: {
        count: comisionesAction?.length || 0,
        error: errAction,
        data: comisionesAction || [],
      },
      resumenAction: {
        data: resumenAction,
        error: errResumen,
      },
      enriquecimientoInterno: {
        rowsCount: rows?.length || 0,
        errRows: errRows?.message || null,
        errPerfiles: (resPerfiles as any)?.error?.message || null,
        errRemisiones: (resRemisiones as any)?.error?.message || null,
        errRecibos: (resRecibos as any)?.error?.message || null,
        errCotizaciones: (resCotizaciones as any)?.error?.message || null,
        errOrdenes: (resOrdenes as any)?.error?.message || null,
        listaEnriquecida,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

