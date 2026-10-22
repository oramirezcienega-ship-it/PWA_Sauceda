"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import { estandarDeServicio } from "@/lib/estandar-servicio";
import { formatoEscalon, medidaTarifa } from "@/lib/tarifas-capacidad";

/**
 * Salud del catálogo de servicios y proveedores (fase 4): márgenes por proveedor y capacidad,
 * precios vencidos, capacidades sin cotizar o sin precio, cambios sin aprobar, estándar sin
 * confirmar y servicios sin modelo de negocio o sin estándar.
 */

export type SeveridadAlerta = "alta" | "media" | "baja";

export interface AlertaCatalogo {
  clave: string;
  severidad: SeveridadAlerta;
  tipo: string;
  productoId: string;
  productoNombre: string;
  proveedorNombre?: string;
  detalle: string;
}

/** Margen de un proveedor en una capacidad (o en el precio unitario); el umbral lo decide la pantalla. */
export interface MargenProveedor {
  productoId: string;
  productoNombre: string;
  proveedorNombre: string;
  concepto: string;
  costo: number;
  venta: number;
  pct: number;
}

const DIAS_AVISO_VIGENCIA = 15;

export async function obtenerAlertasCatalogo(): Promise<{ alertas: AlertaCatalogo[]; margenes: MargenProveedor[] }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const [{ data: productos }, { data: variantes }, { data: ofertas }, { data: costos }] = await Promise.all([
    sb
      .from("productos_servicios")
      .select(
        "id, nombre, activo, tipo, tipo_negocio, precio_unitario, tarifa_medida, estandar_proceso, estandar_incluye, estandar_garantia_anios, estandar_garantia, estandar_tiempo"
      )
      .eq("activo", true)
      .eq("es_servicio_especial", false),
    sb.from("producto_variantes").select("id, producto_id, hasta, precio_venta"),
    sb
      .from("proveedor_productos")
      .select(
        "id, producto_id, proveedor_id, costo_unitario, vigencia_precio, pendiente_revision, cumple_estandar, activo, proveedores:proveedor_id ( nombre, activo, vigencia_precios )"
      )
      .eq("activo", true),
    sb.from("oferta_variante_costos").select("oferta_id, variante_id, costo"),
  ]);

  const alertas: AlertaCatalogo[] = [];
  const margenes: MargenProveedor[] = [];
  const prodPorId = new Map((productos || []).map((p: any) => [p.id as string, p]));
  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);
  const limiteIso = new Date(hoy.getTime() + DIAS_AVISO_VIGENCIA * 86400000).toISOString().slice(0, 10);

  const ofertasActivas = (ofertas || []).filter((o: any) => prodPorId.has(o.producto_id) && o.proveedores?.activo !== false);
  const variantesPorProducto = new Map<string, any[]>();
  for (const v of variantes || []) {
    if (!prodPorId.has(v.producto_id)) continue;
    const lista = variantesPorProducto.get(v.producto_id) || [];
    lista.push(v);
    variantesPorProducto.set(v.producto_id, lista);
  }
  const costosPorOferta = new Map<string, Map<string, number>>();
  for (const c of costos || []) {
    const m = costosPorOferta.get(c.oferta_id) || new Map<string, number>();
    m.set(c.variante_id, Number(c.costo));
    costosPorOferta.set(c.oferta_id, m);
  }

  // ---------- Por servicio ----------
  for (const p of productos || []) {
    if (p.tipo === "insumo" || p.tipo === "concepto_obra") continue;
    if (!p.tipo_negocio) {
      alertas.push({
        clave: `modelo-${p.id}`,
        severidad: "baja",
        tipo: "Sin modelo de negocio",
        productoId: p.id,
        productoNombre: p.nombre,
        detalle: "No está ligado a un modelo de negocio: no se agrupa ni lo encuentra Sofía por negocio.",
      });
    }
    const ofertasProd = ofertasActivas.filter((o: any) => o.producto_id === p.id);
    if (ofertasProd.length > 0 && !estandarDeServicio(p)) {
      alertas.push({
        clave: `estandar-${p.id}`,
        severidad: "baja",
        tipo: "Sin estándar SAUCEDA",
        productoId: p.id,
        productoNombre: p.nombre,
        detalle: "Tiene proveedores pero no define proceso, garantía ni tiempo estándar.",
      });
    }
    const medida = medidaTarifa(p.tarifa_medida);
    for (const v of (variantesPorProducto.get(p.id) || []).sort((a, b) => a.hasta - b.hasta)) {
      const etiqueta = formatoEscalon(Number(v.hasta), medida);
      const cotizada = ofertasProd.some((o: any) => costosPorOferta.get(o.id)?.has(v.id));
      if (!cotizada) {
        alertas.push({
          clave: `sincotizar-${v.id}`,
          severidad: "media",
          tipo: "Capacidad sin cotizar",
          productoId: p.id,
          productoNombre: p.nombre,
          detalle: `${etiqueta}: ningún proveedor activo le ha puesto costo.`,
        });
      }
      if (v.precio_venta === null) {
        alertas.push({
          clave: `sinprecio-${v.id}`,
          severidad: cotizada ? "media" : "baja",
          tipo: "Capacidad sin precio de venta",
          productoId: p.id,
          productoNombre: p.nombre,
          detalle: `${etiqueta}: no tiene precio de venta; Sofía y el cotizador no la pueden cotizar.`,
        });
      }
    }
  }

  // ---------- Por proveedor ----------
  const vigenciaRevisada = new Set<string>();
  for (const o of ofertasActivas as any[]) {
    const p: any = prodPorId.get(o.producto_id);
    const proveedorNombre = o.proveedores?.nombre || "Proveedor";
    const base = { productoId: p.id, productoNombre: p.nombre, proveedorNombre };

    // La vigencia es del proveedor: una alerta por proveedor, no por cada servicio.
    const vigencia = o.proveedores?.vigencia_precios || null;
    if (vigencia && !vigenciaRevisada.has(o.proveedor_id)) {
      vigenciaRevisada.add(o.proveedor_id);
      const general = { ...base, productoNombre: "Todos sus servicios" };
      if (vigencia < hoyIso) {
        alertas.push({ ...general, clave: `vencido-${o.proveedor_id}`, severidad: "alta", tipo: "Precios vencidos", detalle: `Sus precios vencieron el ${vigencia}.` });
      } else if (vigencia <= limiteIso) {
        alertas.push({ ...general, clave: `porvencer-${o.proveedor_id}`, severidad: "media", tipo: "Precios por vencer", detalle: `Sus precios vencen el ${vigencia}.` });
      }
    }
    if (o.pendiente_revision) {
      alertas.push({
        ...base,
        clave: `revision-${o.id}`,
        severidad: "media",
        tipo: "Cambios sin aprobar",
        detalle: "Actualizó su oferta desde su link; su costo no se usa hasta aprobarlo.",
      });
    }
    if (estandarDeServicio(p) && !o.cumple_estandar) {
      alertas.push({
        ...base,
        clave: `confirmar-${o.id}`,
        severidad: "media",
        tipo: "Estándar sin confirmar",
        detalle: "No ha confirmado que trabaja con el estándar SAUCEDA del servicio.",
      });
    }

    const vars = variantesPorProducto.get(p.id) || [];
    const costosOferta = costosPorOferta.get(o.id);
    if (vars.length > 0 && costosOferta) {
      const medida = medidaTarifa(p.tarifa_medida);
      for (const v of vars) {
        const costo = costosOferta.get(v.id);
        const venta = v.precio_venta === null ? null : Number(v.precio_venta);
        if (costo === undefined || venta === null || !(venta > 0)) continue;
        margenes.push({
          ...base,
          concepto: formatoEscalon(Number(v.hasta), medida),
          costo,
          venta,
          pct: Math.round(((venta - costo) / venta) * 1000) / 10,
        });
      }
    } else if (Number(o.costo_unitario) > 0 && Number(p.precio_unitario) > 0) {
      const venta = Number(p.precio_unitario);
      const costo = Number(o.costo_unitario);
      margenes.push({ ...base, concepto: "Precio unitario", costo, venta, pct: Math.round(((venta - costo) / venta) * 1000) / 10 });
    }
  }

  const orden: Record<SeveridadAlerta, number> = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad] || a.productoNombre.localeCompare(b.productoNombre, "es"));
  margenes.sort((a, b) => a.pct - b.pct);
  return { alertas, margenes };
}
