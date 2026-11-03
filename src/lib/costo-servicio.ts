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

export interface OpcionesCotizadoCliente {
  expedienteId: string | null;
  prospectoId: string | null;
  productoId?: string | null;
  cantidad?: number | null;
  textoReferencia?: string | null;
}

export async function loCotizadoAlCliente(
  sb: SupabaseClient,
  ids: OpcionesCotizadoCliente
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

  // 3. Si se pasó productoId explícito
  if (ids.productoId) {
    const { data: p } = await sb
      .from("productos_servicios")
      .select("id, nombre, precio_unitario, tarifas_capacidad, cantidad_minima")
      .eq("id", ids.productoId)
      .maybeSingle();
    if (p) {
      let cant = ids.cantidad ?? null;
      if (!cant && (ids.textoReferencia || ids.expedienteId)) {
        const txt = `${ids.textoReferencia || ""}`;
        const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(tubos?|litros?|lts?\b|l\b|m2|m²|metros)/i);
        if (m) cant = Number(m[1].replace(",", "."));
      }
      return {
        productoId: p.id,
        productoNombre: p.nombre,
        cantidad: cant,
        precio: await precioCatalogo(sb, p.id, cant),
        origen: `Producto asignado · ${p.nombre}${cant ? ` · ${cant}` : ""}`,
      };
    }
  }

  // 4. Línea de negocio del expediente + necesidad del cliente
  if (!ids.expedienteId) return null;
  const { data: exp } = await sb.from("expedientes").select("tipo_negocio, necesidad").eq("id", ids.expedienteId).maybeSingle();
  if (!exp?.tipo_negocio) return null;

  const { data: prods } = await sb
    .from("productos_servicios")
    .select("id, nombre, descripcion, precio_unitario, tarifas_capacidad, cantidad_minima")
    .eq("tipo_negocio", exp.tipo_negocio)
    .eq("activo", true);
  if (!prods || prods.length === 0) return null;

  const textoBusqueda = `${ids.textoReferencia || ""} ${exp.necesidad || ""}`.toLowerCase();
  const m = textoBusqueda.match(/(\d+(?:[.,]\d+)?)\s*(tubos?|litros?|lts?\b|l\b|m2|m²|metros)/i);
  const cantidad = ids.cantidad ?? (m ? Number(m[1].replace(",", ".")) : null);

  let mejorProd = prods[0];
  if (prods.length > 1) {
    let mejorPuntaje = -1;
    for (const p of prods) {
      let score = 0;
      const nombre = (p.nombre || "").toLowerCase();
      const desc = (p.descripcion || "").toLowerCase();
      const palabras = nombre.split(/[\s,.-]+/).filter((w) => w.length > 3);
      for (const w of palabras) {
        if (textoBusqueda.includes(w)) score += 3;
      }
      if (textoBusqueda.includes("mantenimiento") && nombre.includes("mantenimiento")) score += 10;
      if (textoBusqueda.includes("instalaci") && nombre.includes("instalaci")) score += 10;
      if (textoBusqueda.includes("reparaci") && nombre.includes("reparaci")) score += 10;
      if (textoBusqueda.includes("lavado") && (nombre.includes("lavado") || desc.includes("lavado"))) score += 5;
      if (score > mejorPuntaje) {
        mejorPuntaje = score;
        mejorProd = p;
      }
    }
  }

  let precio = await precioCatalogo(sb, mejorProd.id, cantidad);

  // Si el catálogo no arrojó precio pero en las actividades de Sofía quedó asentado un precio acordado
  if (!precio && ids.expedienteId) {
    const { data: acts } = await sb
      .from("actividades")
      .select("detalle")
      .eq("expediente_id", ids.expedienteId)
      .order("created_at", { ascending: false })
      .limit(6);
    for (const a of acts || []) {
      const pm =
        String(a.detalle || "").match(/precio(?:\s+oficial)?(?:\s+de)?\s*\$([0-9,]+)/i) ||
        String(a.detalle || "").match(/\$([0-9,]+(?:\.\d{2})?)\s*(?:MXN|todo incluido)/i);
      if (pm) {
        const val = Number(pm[1].replace(/,/g, "")) || null;
        if (val && val > 0) {
          precio = val;
          break;
        }
      }
    }
  }

  return {
    productoId: mejorProd.id,
    productoNombre: mejorProd.nombre,
    cantidad,
    precio,
    origen: `Lo que pidió el cliente · ${mejorProd.nombre}${m ? ` · ${m[0]}` : cantidad ? ` · ${cantidad}` : ""}`,
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
