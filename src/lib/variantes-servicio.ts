import type { SupabaseClient } from "@supabase/supabase-js";
import { costosCapacidadAJson, normalizarCostosCapacidad, type CostoCapacidad } from "@/lib/tarifas-capacidad";

/**
 * Variantes (capacidades) de un servicio — migración 0156.
 *
 * producto_variantes y oferta_variante_costos son la relación oficial: el catálogo define
 * qué capacidades existen y cada proveedor solo pone su costo a esas capacidades.
 * Los JSON tarifas_capacidad (producto y oferta) se mantienen como copia para los lectores
 * existentes (Sofía, solicitudes, cotizador); esta función los deja alineados.
 */

function tarifasCatalogo(raw: unknown): { hasta: number; precio: number | null }[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<number>();
  return raw
    .map((t: any) => {
      const precio = t?.precio === null || t?.precio === undefined || t?.precio === "" ? null : Number(t.precio);
      return {
        hasta: Math.round(Number(t?.hasta_litros ?? t?.hastaLitros)),
        precio: precio !== null && Number.isFinite(precio) && precio >= 0 ? precio : null,
      };
    })
    .filter((t) => Number.isFinite(t.hasta) && t.hasta > 0 && !vistos.has(t.hasta) && vistos.add(t.hasta));
}

/** Capacidades que define el catálogo para el servicio, ascendentes. */
export async function capacidadesDeProducto(sb: SupabaseClient, productoId: string): Promise<number[]> {
  const { data } = await sb.from("producto_variantes").select("hasta").eq("producto_id", productoId).order("hasta");
  return (data || []).map((v: any) => Number(v.hasta));
}

/** Deja solo los costos de capacidades que existen en el catálogo (el proveedor no inventa capacidades). */
export function filtrarCostosACapacidades(costos: unknown, capacidades: number[]): CostoCapacidad[] {
  const validas = new Set(capacidades);
  return normalizarCostosCapacidad(costos).filter((c) => validas.has(c.hastaLitros));
}

/**
 * Sincroniza las variantes del servicio con su JSON del catálogo (crea, actualiza precio y borra las
 * que ya no están) y reconstruye el costo de cada proveedor por variante. Los costos de capacidades
 * que ya no existen se quitan también del JSON de la oferta.
 */
export async function sincronizarVariantes(sb: SupabaseClient, productoId: string): Promise<void> {
  const { data: prod, error: errProd } = await sb
    .from("productos_servicios")
    .select("tarifas_capacidad")
    .eq("id", productoId)
    .maybeSingle();
  if (errProd || !prod) return;

  const tarifas = tarifasCatalogo(prod.tarifas_capacidad);
  const ahora = new Date().toISOString();
  if (tarifas.length > 0) {
    const { error } = await sb.from("producto_variantes").upsert(
      tarifas.map((t) => ({ producto_id: productoId, hasta: t.hasta, precio_venta: t.precio, updated_at: ahora })),
      { onConflict: "producto_id,hasta" }
    );
    if (error) throw new Error(`No se pudieron guardar las capacidades del servicio: ${error.message}`);
  }
  let borrar = sb.from("producto_variantes").delete().eq("producto_id", productoId);
  if (tarifas.length > 0) borrar = borrar.not("hasta", "in", `(${tarifas.map((t) => t.hasta).join(",")})`);
  await borrar;

  const { data: variantes } = await sb.from("producto_variantes").select("id, hasta").eq("producto_id", productoId);
  const idPorHasta = new Map((variantes || []).map((v: any) => [Number(v.hasta), v.id as string]));

  const { data: ofertas } = await sb.from("proveedor_productos").select("id, tarifas_capacidad").eq("producto_id", productoId);
  for (const o of ofertas || []) {
    const todos = normalizarCostosCapacidad(o.tarifas_capacidad);
    const validos = todos.filter((c) => idPorHasta.has(c.hastaLitros));
    if (validos.length !== todos.length) {
      await sb.from("proveedor_productos").update({ tarifas_capacidad: costosCapacidadAJson(validos) }).eq("id", o.id);
    }
    await sb.from("oferta_variante_costos").delete().eq("oferta_id", o.id);
    if (validos.length > 0) {
      await sb.from("oferta_variante_costos").insert(
        validos.map((c) => ({ oferta_id: o.id, variante_id: idPorHasta.get(c.hastaLitros), costo: c.costo, updated_at: ahora }))
      );
    }
  }
}
