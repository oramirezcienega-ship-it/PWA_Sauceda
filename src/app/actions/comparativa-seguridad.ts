"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import { buscarFamilia, cargarFamiliasSeguridad, MAX_OPCIONES_COMPARATIVA } from "@/lib/ia/catalogo-seguridad";
import { generarImagenComparativaSeguridad } from "@/lib/ia/imagen-comparativa-seguridad";

export interface FamiliaSeguridadResumen {
  clave: string;
  nombre: string;
  productos: { id: string; nombre: string; precio: number; fotos: { url: string; titulo: string }[] }[];
}

/** Familias de seguridad con productos activos y con precio de venta (para el cotizador del chat). */
export async function listarFamiliasSeguridad(): Promise<FamiliaSeguridadResumen[]> {
  await requireAdmin();
  const familias = await cargarFamiliasSeguridad(supabaseServidor());
  return familias.map((f) => ({
    clave: f.clave,
    nombre: f.nombre,
    productos: f.productos.slice(0, MAX_OPCIONES_COMPARATIVA).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      fotos: p.fotos.map((x) => ({ url: x.url, titulo: x.titulo || "" })),
    })),
  }));
}

/** PNG (base64) de la comparativa de una familia, listo para previsualizar y enviar al chat. */
export async function generarComparativaSeguridad(clave: string): Promise<{ ok: boolean; base64?: string; nombre?: string; error?: string }> {
  await requireAdmin();
  try {
    const familia = buscarFamilia(await cargarFamiliasSeguridad(supabaseServidor()), clave);
    if (!familia) return { ok: false, error: "Esa familia no tiene productos activos con precio de venta." };
    const png = await generarImagenComparativaSeguridad(familia);
    return { ok: true, base64: png.toString("base64"), nombre: familia.nombre };
  } catch (err: any) {
    console.error("[Seguridad] Error al generar la comparativa:", err);
    return { ok: false, error: err?.message || "No se pudo generar la imagen." };
  }
}
