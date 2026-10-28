import type { SupabaseClient } from "@supabase/supabase-js";
import { costoReferenciaOferta } from "@/lib/solicitudes-proveedor";

/**
 * Costo del proveedor a partir de lo que ya se le cotizó al cliente, para no volver a
 * capturarlo al coordinar o programar el servicio. Se busca, en orden:
 *  1. La última Cotización Express enviada (producto + variación, p. ej. "hasta 12 tubos").
 *  2. La última cotización formal con conceptos ligados a un producto del catálogo.
 *  3. El producto de la línea de negocio del expediente y la cantidad que dijo el cliente
 *     ("8 tubos", "1100 litros", "40 m²").
 * Con el producto y la cantidad, el costo sale de la oferta de cada proveedor (catálogo).
 */
export interface CotizadoCliente {
  productoId: string;
  productoNombre: string;
  cantidad: number | null;
  /** Lo que se le cotizó al cliente (precio de venta); null si no se sabe. */
  precio: number | null;
  /** De dónde salió, para mostrarlo: "Cotización Express · Mantenimiento de calentador solar · hasta 12 tubos". */
  origen: string;
}

export async function loCotizadoAlCliente(
  sb: SupabaseClient,
  ids: { expedienteId: string | null; prospectoId: string | null }
): Promise<CotizadoCliente | null> {
  if (!ids.expedienteId && !ids.prospectoId) return null;

  // 1. Cotización Express
  let qa = sb.from("actividades").select("titulo, detalle").eq("tipo", "cotizacion_express");
  qa = ids.expedienteId && ids.prospectoId
    ? qa.or(`expediente_id.eq.${ids.expedienteId},prospecto_id.eq.${ids.prospectoId}`)
    : ids.expedienteId
    ? qa.eq("expediente_id", ids.expedienteId)
    : qa.eq("prospecto_id", ids.prospectoId!);
  const { data: express } = await qa.order("created_at", { ascending: false }).limit(1);
  const det = String(express?.[0]?.detalle || "");
  const prodExpress = det.match(/\[producto:([^\]]+)\]/)?.[1];
  if (prodExpress) {
    const cant = Number(det.match(/\[cantidad:([\d.]+)\]/)?.[1] || 0) || null;
    const precio = Number(det.match(/\[precio:([\d.]+)\]/)?.[1] || 0) || null;
    const { data: p } = await sb.from("productos_servicios").select("nombre").eq("id", prodExpress).maybeSingle();
    return {
      productoId: prodExpress,
      productoNombre: p?.nombre || "",
      cantidad: cant,
      precio: precio ?? (await precioCatalogo(sb, prodExpress, cant)),
      origen: String(express![0].titulo || "Cotización Express"),
    };
  }

  // 2. Cotización formal
  let qc = sb.from("cotizaciones").select("id, estatus, precio_final");
  qc = ids.expedienteId && ids.prospectoId
    ? qc.or(`expediente_id.eq.${ids.expedienteId},prospecto_id.eq.${ids.prospectoId}`)
    : ids.expedienteId
    ? qc.eq("expediente_id", ids.expedienteId)
    : qc.eq("prospecto_id", ids.prospectoId!);
  const { data: cots } = await qc.neq("estatus", "cancelada").order("created_at", { ascending: false }).limit(3);
  for (const c of cots || []) {
    const { data: conc } = await sb
      .from("cotizacion_conceptos")
      .select("producto_servicio_id, cantidad, productos_servicios:producto_servicio_id ( nombre )")
      .eq("cotizacion_id", c.id)
      .not("producto_servicio_id", "is", null)
      .limit(1);
    const k: any = conc?.[0];
    if (k) {
      return {
        productoId: k.producto_servicio_id,
        productoNombre: k.productos_servicios?.nombre || "",
        cantidad: Number(k.cantidad || 0) || null,
        precio: Number((c as any).precio_final || 0) || null,
        origen: `Cotización ${c.id} · ${k.productos_servicios?.nombre || "producto"}`,
      };
    }
  }

  // 3. Línea de negocio del expediente + cantidad que dijo el cliente
  if (!ids.expedienteId) return null;
  const { data: exp } = await sb.from("expedientes").select("tipo_negocio, necesidad").eq("id", ids.expedienteId).maybeSingle();
  if (!exp?.tipo_negocio) return null;
  const { data: prods } = await sb
    .from("productos_servicios")
    .select("id, nombre")
    .eq("tipo_negocio", exp.tipo_negocio)
    .eq("activo", true)
    .limit(2);
  if (!prods || prods.length !== 1) return null;
  const m = String(exp.necesidad || "").match(/(\d+(?:[.,]\d+)?)\s*(tubos?|litros?|lts?\b|l\b|m2|m²|metros)/i);
  const cantidad = m ? Number(m[1].replace(",", ".")) : null;
  return {
    productoId: prods[0].id,
    productoNombre: prods[0].nombre,
    cantidad,
    precio: await precioCatalogo(sb, prods[0].id, cantidad),
    origen: `Lo que pidió el cliente · ${prods[0].nombre}${m ? ` · ${m[0]}` : ""}`,
  };
}

/** Precio de venta del catálogo para la cantidad: el escalón que la cubre, o precio unitario × cantidad. */
async function precioCatalogo(sb: SupabaseClient, productoId: string, cantidad: number | null): Promise<number | null> {
  const { data } = await sb.from("productos_servicios").select("precio_unitario, tarifas_capacidad, cantidad_minima").eq("id", productoId).maybeSingle();
  if (!data) return null;
  const escalones = (Array.isArray(data.tarifas_capacidad) ? data.tarifas_capacidad : [])
    .map((t: any) => ({ hasta: Number(t?.hasta_litros ?? t?.hastaLitros), precio: Number(t?.precio) }))
    .filter((t: any) => t.hasta > 0 && t.precio > 0)
    .sort((a: any, b: any) => a.hasta - b.hasta);
  if (escalones.length) {
    if (!cantidad) return escalones.length === 1 ? escalones[0].precio : null;
    return (escalones.find((t: any) => cantidad <= t.hasta) ?? escalones[escalones.length - 1]).precio;
  }
  const unit = Number(data.precio_unitario || 0);
  if (!(unit > 0)) return null;
  return Math.round(unit * Math.max(cantidad || 1, Number(data.cantidad_minima || 0)) * 100) / 100;
}

/**
 * Proveedores ligados al producto cotizado (catálogo), en el orden en que se sugieren:
 * el preferido primero y luego el de menor costo.
 */
export async function proveedoresDelProducto(sb: SupabaseClient, cotizado: CotizadoCliente): Promise<string[]> {
  const { data } = await sb
    .from("proveedor_productos")
    .select("proveedor_id, preferido, costo_unitario, costos_volumen, tarifas_capacidad, cantidad_minima, monto_minimo")
    .eq("producto_id", cotizado.productoId)
    .eq("activo", true);
  return (data || [])
    .map((o: any) => ({ id: o.proveedor_id as string, preferido: o.preferido === true, costo: costoReferenciaOferta(o, cotizado.cantidad) }))
    .sort(
      (a, b) =>
        Number(b.preferido) - Number(a.preferido) ||
        (a.costo ?? Number.MAX_SAFE_INTEGER) - (b.costo ?? Number.MAX_SAFE_INTEGER)
    )
    .map((o) => o.id);
}

/** Costo de cada proveedor que ofrece el producto, para la cantidad cotizada. */
export async function costosProveedoresDe(
  sb: SupabaseClient,
  cotizado: CotizadoCliente
): Promise<Record<string, number>> {
  const [{ data: provProds }, { data: prod }] = await Promise.all([
    sb
      .from("proveedor_productos")
      .select("proveedor_id, costo_unitario, costos_volumen, tarifas_capacidad, cantidad_minima, monto_minimo")
      .eq("producto_id", cotizado.productoId)
      .eq("activo", true),
    sb
      .from("productos_servicios")
      .select("costo_unitario, tarifas_capacidad, cantidad_minima")
      .eq("id", cotizado.productoId)
      .maybeSingle(),
  ]);

  const costoBaseProd = prod ? costoReferenciaOferta(prod as any, cotizado.cantidad) : null;
  const out: Record<string, number> = {};
  for (const o of provProds || []) {
    const c = costoReferenciaOferta(o as any, cotizado.cantidad) || costoBaseProd;
    if (c && c > 0) out[(o as any).proveedor_id] = c;
  }
  return out;
}
