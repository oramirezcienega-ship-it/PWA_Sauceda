import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Productos de impermeabilización del catálogo (Productos y Servicios) que usa
 * Sofía: precio, fotos, propuesta de valor y ficha técnica / facts. Todo se
 * administra desde la pantalla de Productos; aquí sólo se lee.
 */

export type PaqueteImper = "acrilico" | "estandar" | "premium";

export const ETIQUETA_PAQUETE: Record<PaqueteImper, string> = {
  acrilico: "Acrílico",
  estandar: "Estándar 3.5",
  premium: "Premium 4.0 Poliéster",
};

export interface FotoCatalogo {
  url: string;
  tipo?: "producto" | "aplicacion" | "antes_despues";
  titulo?: string;
  descripcion?: string;
}

export interface ProductoImper {
  id: string;
  nombre: string;
  paquete: PaqueteImper;
  precioM2: number;
  costoM2: number;
  descripcionValor: string;
  especificaciones: string;
  plantillaGarantia: string;
  fotos: FotoCatalogo[];
  fichaTecnicaUrl: string;
  fichaTecnicaNombre: string;
  /** Si es false, Sofía no usa su información (pitch, ficha ni fotos). */
  aptoParaIa: boolean;
}

/** Identifica a qué paquete corresponde un producto por su nombre. */
export function paqueteDeNombre(nombre: string): PaqueteImper | null {
  const n = (nombre || "").toLowerCase();
  if (!n.includes("imperme")) return null;
  if (n.includes("4.0") || n.includes("poliéster") || n.includes("poliester") || n.includes("premium")) return "premium";
  if (n.includes("3.5") || n.includes("estándar") || n.includes("estandar")) return "estandar";
  if (n.includes("acríl") || n.includes("acril")) return "acrilico";
  return null;
}

/** Los productos de impermeabilización activos, uno por paquete. */
export async function cargarProductosImper(sb: SupabaseClient): Promise<Partial<Record<PaqueteImper, ProductoImper>>> {
  const { data } = await sb
    .from("productos_servicios")
    .select("id, nombre, precio_unitario, costo_unitario, descripcion_valor, especificaciones, plantilla_garantia, fotos, apto_para_ia, activo, ficha_tecnica_url, ficha_tecnica_nombre")
    .ilike("nombre", "%imperme%");

  const out: Partial<Record<PaqueteImper, ProductoImper>> = {};
  for (const f of data || []) {
    if (f.activo === false) continue;
    const paquete = paqueteDeNombre(f.nombre);
    if (!paquete || out[paquete]) continue;
    out[paquete] = {
      id: f.id,
      nombre: f.nombre,
      paquete,
      precioM2: Number(f.precio_unitario || 0),
      costoM2: Number(f.costo_unitario || 0),
      descripcionValor: f.descripcion_valor || "",
      especificaciones: f.especificaciones || "",
      plantillaGarantia: f.plantilla_garantia || "",
      fotos: (Array.isArray(f.fotos) ? f.fotos : []).filter((x: any) => x && /^https?:\/\//i.test(x.url || "")),
      aptoParaIa: f.apto_para_ia !== false,
      fichaTecnicaUrl: /^https?:\/\//i.test(f.ficha_tecnica_url || "") ? f.ficha_tecnica_url : "",
      fichaTecnicaNombre: f.ficha_tecnica_nombre || "",
    };
  }
  return out;
}

/** Ficha de los productos para el prompt de Sofía (sólo los aptos para IA y con información). */
export function fichaProductosParaPrompt(productos: Partial<Record<PaqueteImper, ProductoImper>>): string {
  const bloques: string[] = [];
  for (const p of ["acrilico", "estandar", "premium"] as const) {
    const prod = productos[p];
    if (!prod || !prod.aptoParaIa) continue;
    if (!prod.descripcionValor.trim() && !prod.especificaciones.trim()) continue;
    bloques.push(
      [
        `• ${ETIQUETA_PAQUETE[p]} — ${prod.nombre}`,
        prod.descripcionValor.trim() ? `  Propuesta de valor: ${prod.descripcionValor.trim()}` : "",
        prod.especificaciones.trim() ? `  Ficha técnica y datos clave:\n${prod.especificaciones.trim().split("\n").map((l) => `    ${l}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return bloques.join("\n");
}

/** Paquetes cuya ficha técnica en PDF Sofía puede enviar (con producto apto para IA). */
export function paquetesConFicha(productos: Partial<Record<PaqueteImper, ProductoImper>>): PaqueteImper[] {
  return (["acrilico", "estandar", "premium"] as const).filter((p) => productos[p]?.aptoParaIa && productos[p]?.fichaTecnicaUrl);
}
