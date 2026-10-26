import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Productos de seguridad del catálogo (Productos y Servicios con tipo de negocio 'seguridad').
 * La familia es la Categoría del producto (ej. "Videoporteros e interfones", "Cerraduras eléctricas"):
 * para crear una familia nueva basta con dar de alta productos con esa categoría.
 * Sólo cuentan los productos activos y con precio de venta.
 */

export interface FotoSeguridad {
  url: string;
  tipo?: string;
  titulo?: string;
}

export interface ProductoSeguridad {
  id: string;
  nombre: string;
  familia: string;
  precio: number;
  /** Costo del proveedor (interno). */
  costo: number;
  gama: string;
  descripcion: string;
  descripcionValor: string;
  especificaciones: string;
  fotos: FotoSeguridad[];
  /** Si es false, Sofía no lo ofrece (el asesor sí puede usarlo desde el chat). */
  aptoParaIa: boolean;
}

export interface FamiliaSeguridad {
  clave: string;
  nombre: string;
  productos: ProductoSeguridad[];
}

/** Máximo de opciones que caben en una imagen comparativa. */
export const MAX_OPCIONES_COMPARATIVA = 4;

/** Clave estable de una familia a partir de su nombre ("Cerraduras eléctricas" → "cerraduras-electricas"). */
export function claveFamilia(nombre: string): string {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Familias de seguridad con sus productos (ordenados de menor a mayor precio). */
export async function cargarFamiliasSeguridad(sb: SupabaseClient, opciones: { soloAptosIa?: boolean } = {}): Promise<FamiliaSeguridad[]> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, categoria, precio_unitario, costo_unitario, gama, descripcion, descripcion_valor, especificaciones, fotos, apto_para_ia, activo")
    .eq("tipo_negocio", "seguridad")
    .eq("activo", true)
    .gt("precio_unitario", 0);

  const familias = new Map<string, FamiliaSeguridad>();
  for (const f of data || []) {
    if (opciones.soloAptosIa && f.apto_para_ia === false) continue;
    const nombreFamilia = (f.categoria || "").trim() || "Seguridad";
    const clave = claveFamilia(nombreFamilia);
    if (!familias.has(clave)) familias.set(clave, { clave, nombre: nombreFamilia, productos: [] });
    familias.get(clave)!.productos.push({
      id: f.id,
      nombre: f.nombre,
      familia: nombreFamilia,
      precio: Number(f.precio_unitario || 0),
      costo: Number(f.costo_unitario || 0),
      gama: f.gama || "estandar",
      descripcion: f.descripcion || "",
      descripcionValor: f.descripcion_valor || "",
      especificaciones: f.especificaciones || "",
      fotos: (Array.isArray(f.fotos) ? f.fotos : []).filter((x: any) => x && /^https?:\/\//i.test(x.url || "")),
      aptoParaIa: f.apto_para_ia !== false,
    });
  }
  const out = Array.from(familias.values());
  for (const fam of out) fam.productos.sort((a, b) => a.precio - b.precio);
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Busca una familia por su clave o su nombre (como lo devuelva Sofía). */
export function buscarFamilia(familias: FamiliaSeguridad[], valor: unknown): FamiliaSeguridad | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const clave = claveFamilia(valor);
  return familias.find((f) => f.clave === clave) || null;
}

/**
 * Qué familia se le ofrece al cliente después de elegir una opción de otra (por clave).
 * Ej. quien elige videoportero suele querer abrir la puerta desde el monitor.
 */
export const COMPLEMENTOS_FAMILIA: Record<string, { familia: string; motivo: string }> = {
  "videoporteros-e-interfones": { familia: "cerraduras-electricas", motivo: "abrir la puerta o el portón desde el monitor o el interfón, sin salir" },
  "cerraduras-electricas": { familia: "videoporteros-e-interfones", motivo: "ver o escuchar quién llama antes de abrirle desde adentro" },
  "camaras-de-seguridad-y-cctv": { familia: "videoporteros-e-interfones", motivo: "atender la puerta y ver quién timbra directamente desde tu celular o monitor interior" },
};

/** Busca un producto de seguridad por su ID (ej. "CAT-010"). */
export function buscarProducto(familias: FamiliaSeguridad[], id: unknown): ProductoSeguridad | null {
  if (typeof id !== "string" || !id.trim()) return null;
  const clave = id.trim().toUpperCase();
  for (const f of familias) {
    const p = f.productos.find((x) => x.id.toUpperCase() === clave);
    if (p) return p;
  }
  return null;
}

/** Complemento de una familia, sólo si esa familia también tiene opciones con precio. */
export function complementoDe(familias: FamiliaSeguridad[], claveFam: string): { familia: FamiliaSeguridad; motivo: string } | null {
  const c = COMPLEMENTOS_FAMILIA[claveFam];
  const familia = c ? familias.find((f) => f.clave === c.familia) : null;
  return c && familia ? { familia, motivo: c.motivo } : null;
}

/** Resumen de las familias para el prompt de Sofía (IDs y nombres, sin precios: los da la imagen). */
export function familiasParaPrompt(familias: FamiliaSeguridad[]): string {
  return familias
    .map((f) => {
      const comp = complementoDe(familias, f.clave);
      return [
        `  • "${f.clave}" — ${f.nombre}:`,
        ...f.productos.slice(0, MAX_OPCIONES_COMPARATIVA).map((p) => `      ${p.id}: ${p.nombre}${p.fotos.length > 0 ? "" : " (sin fotos)"}`),
        comp ? `      Complemento: "${comp.familia.clave}" (${comp.familia.nombre}), para ${comp.motivo}.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}
