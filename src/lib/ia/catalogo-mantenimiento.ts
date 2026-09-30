import type { SupabaseClient } from "@supabase/supabase-js";
import { formatoPesos } from "@/lib/formato";

/**
 * Productos de mantenimiento de tinacos y cisternas del catálogo (Productos y Servicios).
 * Sofía arma su script con lo que dice el producto (qué incluye, propuesta de valor,
 * ficha/facts, garantía, precio y fotos), así que basta editar el producto para cambiarlo.
 */

export type ServicioMant = "cisternas" | "tinacos";

export const ETIQUETA_SERVICIO_MANT: Record<ServicioMant, string> = {
  cisternas: "Mantenimiento de cisternas",
  tinacos: "Limpieza y mantenimiento de tinacos",
};

export interface FotoMant {
  url: string;
  tipo?: string;
  titulo?: string;
  descripcion?: string;
}

export interface ProductoMant {
  id: string;
  servicio: ServicioMant;
  nombre: string;
  precio: number;
  descripcion: string;
  descripcionValor: string;
  especificaciones: string;
  garantia: string;
  fotos: FotoMant[];
  /** Escalones de precio por capacidad (sólo los que tienen precio), ascendentes. */
  tarifas: { hastaLitros: number; precio: number }[];
  /** Si es false, Sofía no usa su información. */
  aptoParaIa: boolean;
}

export function servicioDeTipoNegocio(tipo?: string | null): ServicioMant | null {
  if (tipo === "construccion-mantenimiento-tinacos") return "tinacos";
  if (tipo === "construccion-mantenimiento-cisternas") return "cisternas";
  return null;
}

function servicioDeNombre(nombre: string): ServicioMant | null {
  const n = (nombre || "").toLowerCase();
  if (n.includes("tinaco")) return "tinacos";
  if (n.includes("cisterna") || n.includes("aljibe")) return "cisternas";
  return null;
}

export async function cargarServiciosMantenimiento(
  sb: SupabaseClient
): Promise<Partial<Record<ServicioMant, ProductoMant>>> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, precio_unitario, descripcion, descripcion_valor, especificaciones, plantilla_garantia, fotos, apto_para_ia, activo, tarifas_capacidad")
    .or("nombre.ilike.%tinaco%,nombre.ilike.%cisterna%,nombre.ilike.%aljibe%");

  const out: Partial<Record<ServicioMant, ProductoMant>> = {};
  for (const f of data || []) {
    if (f.activo === false) continue;
    const servicio = servicioDeNombre(f.nombre);
    if (!servicio || out[servicio]) continue;
    out[servicio] = {
      id: f.id,
      servicio,
      nombre: f.nombre,
      precio: Number(f.precio_unitario || 0),
      descripcion: f.descripcion || "",
      descripcionValor: f.descripcion_valor || "",
      especificaciones: f.especificaciones || "",
      garantia: f.plantilla_garantia || "",
      fotos: (Array.isArray(f.fotos) ? f.fotos : []).filter((x: any) => x && /^https?:\/\//i.test(x.url || "")),
      tarifas: (Array.isArray(f.tarifas_capacidad) ? f.tarifas_capacidad : [])
        .map((t: any) => ({ hastaLitros: Math.round(Number(t?.hasta_litros)), precio: Number(t?.precio) }))
        .filter((t: any) => t.hastaLitros > 0 && Number.isFinite(t.precio) && t.precio > 0)
        .sort((a: any, b: any) => a.hastaLitros - b.hastaLitros),
      aptoParaIa: f.apto_para_ia !== false,
    };
  }
  return out;
}

/** Bloque de información oficial del servicio para el prompt de Sofía. */
export function fichaServicioParaPrompt(prod: ProductoMant | undefined): string {
  if (!prod || !prod.aptoParaIa) {
    return "  (No hay información oficial cargada de este servicio: NO des precio ni detalles técnicos; dile que un asesor se los confirma.)";
  }
  return [
    `  Servicio: ${prod.nombre}`,
    prod.tarifas.length > 0
      ? `  TARIFAS POR CAPACIDAD (precio por depósito). Elige el PRIMER escalón cuya capacidad sea mayor o igual a los litros del cliente; si tiene varios, multiplica por la cantidad y muestra el total:\n${prod.tarifas
          .map((t) => `    - Hasta ${t.hastaLitros.toLocaleString("es-MX")} L: ${formatoPesos(t.precio)} MXN`)
          .join("\n")}\n    Si los litros superan el último escalón, NO des precio: un asesor lo confirma. Mientras el cliente no diga la capacidad, menciona solo "desde ${formatoPesos(prod.tarifas[0].precio)} MXN" (el escalón menor).`
      : prod.precio > 0
      ? `  Precio base: ${formatoPesos(prod.precio)} MXN`
      : "  Precio: no disponible (NO des precio; un asesor lo confirma)",
    prod.descripcion.trim() ? `  Qué incluye y qué no incluye: ${prod.descripcion.trim()}` : "",
    prod.descripcionValor.trim() ? `  Propuesta de valor: ${prod.descripcionValor.trim()}` : "",
    prod.especificaciones.trim() ? `  Datos técnicos y facts:\n${prod.especificaciones.trim().split("\n").map((l) => `    ${l}`).join("\n")}` : "",
    prod.garantia.trim() ? `  Garantía: ${prod.garantia.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
