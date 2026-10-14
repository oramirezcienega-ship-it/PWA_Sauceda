import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cierre de la orden de trabajo: mientras la OT está pendiente o en proceso, sus
 * recibos de pago y comisiones se pueden editar, cancelar o eliminar. Cuando la OT
 * queda "completada" se dan por buenos y quedan fijos. Para corregir algo, un
 * administrador reabre la orden (la regresa a "En proceso").
 *
 * Se pueden seguir emitiendo recibos nuevos en una OT completada (cobros pendientes).
 */

export const ESTATUS_OT_CERRADA = "completada";

/** Folios de las órdenes completadas entre las indicadas: Map<otId, folio>. */
export async function ordenesCerradas(sb: SupabaseClient, otIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(otIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const { data } = await sb.from("ordenes_trabajo").select("id, folio, estatus").in("id", ids);
  return new Map(
    (data || []).filter((o: any) => o.estatus === ESTATUS_OT_CERRADA).map((o: any) => [o.id as string, (o.folio as string) || "OT"])
  );
}

export function mensajeOtCerrada(folio: string, que: "recibos" | "comisiones"): string {
  return `La orden ${folio} ya está completada: sus ${que} quedaron cerrados y no se pueden modificar. Si hay que corregir algo, un administrador debe reabrir la orden (regresarla a "En proceso").`;
}

/**
 * Comisiones (de las indicadas) que pertenecen a una OT completada, ya sea
 * directamente, por su recibo de pago o por su remisión. Map<comisionId, folioOT>.
 */
export async function comisionesCerradas(sb: SupabaseClient, comisionIds: string[]): Promise<Map<string, string>> {
  if (comisionIds.length === 0) return new Map();
  const { data: coms } = await sb
    .from("comisiones")
    .select("id, orden_trabajo_id, recibo_pago_id, remision_factura_id")
    .in("id", comisionIds);
  if (!coms || coms.length === 0) return new Map();

  const reciboIds = Array.from(new Set(coms.map((c: any) => c.recibo_pago_id).filter(Boolean)));
  const remisionIds = Array.from(new Set(coms.map((c: any) => c.remision_factura_id).filter(Boolean)));
  const [recibosRes, remisionesRes] = await Promise.all([
    reciboIds.length
      ? sb.from("recibos_pago").select("id, orden_trabajo_id").in("id", reciboIds)
      : Promise.resolve({ data: [] as any[] }),
    remisionIds.length
      ? sb.from("remisiones_facturas").select("id, orden_trabajo_id").in("id", remisionIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const otDeRecibo = new Map((recibosRes.data || []).map((r: any) => [r.id, r.orden_trabajo_id]));
  const otDeRemision = new Map((remisionesRes.data || []).map((r: any) => [r.id, r.orden_trabajo_id]));

  const otPorComision = new Map<string, string>();
  for (const c of coms as any[]) {
    const ot = c.orden_trabajo_id || otDeRecibo.get(c.recibo_pago_id) || otDeRemision.get(c.remision_factura_id);
    if (ot) otPorComision.set(c.id, ot);
  }

  const cerradas = await ordenesCerradas(sb, Array.from(otPorComision.values()));
  const out = new Map<string, string>();
  otPorComision.forEach((ot, comisionId) => {
    const folio = cerradas.get(ot);
    if (folio) out.set(comisionId, folio);
  });
  return out;
}

/** Error listo para devolver si alguna de las comisiones está cerrada; null si todas se pueden modificar. */
export async function errorSiComisionesCerradas(sb: SupabaseClient, comisionIds: string[]): Promise<string | null> {
  const cerradas = await comisionesCerradas(sb, comisionIds);
  if (cerradas.size === 0) return null;
  const folios = Array.from(new Set(Array.from(cerradas.values())));
  if (comisionIds.length === 1) return mensajeOtCerrada(folios[0], "comisiones");
  return `${cerradas.size} de las comisiones seleccionadas pertenecen a órdenes ya completadas (${folios.join(", ")}) y quedaron cerradas. Quítalas de la selección o pide a un administrador que reabra la orden.`;
}
