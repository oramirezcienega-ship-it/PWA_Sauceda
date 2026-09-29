"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ProductoServicio } from "@/lib/types";

// Mapeador
function aProductoServicio(fila: any): ProductoServicio {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion || "",
    unidad: fila.unidad || "m2",
    costoUnitario: Number(fila.costo_unitario || 0),
    precioUnitario: Number(fila.precio_unitario || 0),
    porcentajeComision: Number(fila.porcentaje_comision !== undefined && fila.porcentaje_comision !== null ? fila.porcentaje_comision : 5.0),
    plantillaGarantia: fila.plantilla_garantia || "",
    createdAt: fila.created_at,
  };
}

// Generador de IDs secuenciales CAT-001, CAT-002...
function siguienteId(ids: string[]): string {
  const nums = ids
    .map((id) => {
      const match = id.match(/^CAT-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `CAT-${String(max + 1).padStart(3, "0")}`;
}

/** 1. Listar Productos y Servicios */
export async function listarProductosServicios(): Promise<ProductoServicio[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("productos_servicios")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(aProductoServicio);
}

/** 2. Crear Producto o Servicio */
export async function crearProductoServicio(datos: {
  nombre: string;
  descripcion: string;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  porcentajeComision?: number;
  plantillaGarantia?: string;
}): Promise<ProductoServicio> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existentes, error: errLista } = await sb
    .from("productos_servicios")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("productos_servicios")
    .insert({
      id,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      unidad: datos.unidad,
      costo_unitario: datos.costoUnitario,
      precio_unitario: datos.precioUnitario,
      porcentaje_comision: Number(datos.porcentajeComision ?? 5.0),
      plantilla_garantia: datos.plantillaGarantia || "",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return aProductoServicio(data);
}

/**
 * Resuelve el precio por m² vigente en el catálogo para los 3 paquetes de
 * impermeabilización (Acrílico, Estándar 3.5, Premium 4.0 Poliéster) que se
 * usan en la calculadora comparativa de precios de Conversaciones. Devuelve
 * null en el paquete que no encuentre coincidencia en el catálogo, para que
 * el llamador pueda conservar su valor por defecto en ese caso.
 */
export async function obtenerPreciosImpermeabilizacionCatalogo(): Promise<{
  acrilico: number | null;
  estandar: number | null;
  premium: number | null;
}> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("productos_servicios")
    .select("nombre, precio_unitario");

  if (error || !data) {
    return { acrilico: null, estandar: null, premium: null };
  }

  let acrilico: number | null = null;
  let estandar: number | null = null;
  let premium: number | null = null;

  for (const fila of data) {
    const nombre = (fila.nombre || "").toLowerCase();
    const precio = Number(fila.precio_unitario || 0);
    if (!precio) continue;

    if (nombre.includes("4.0") || nombre.includes("poliéster") || nombre.includes("poliester") || nombre.includes("premium")) {
      premium = precio;
    } else if (nombre.includes("3.5") || nombre.includes("estándar") || nombre.includes("estandar")) {
      estandar = precio;
    } else if (nombre.includes("acríl") || nombre.includes("acril")) {
      acrilico = precio;
    }
  }

  return { acrilico, estandar, premium };
}

/** 3. Editar Producto o Servicio */
export async function editarProductoServicio(
  id: string,
  datos: {
    nombre: string;
    descripcion: string;
    unidad: string;
    costoUnitario: number;
    precioUnitario: number;
    porcentajeComision?: number;
    plantillaGarantia?: string;
  }
): Promise<ProductoServicio> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("productos_servicios")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      unidad: datos.unidad,
      costo_unitario: datos.costoUnitario,
      precio_unitario: datos.precioUnitario,
      porcentaje_comision: Number(datos.porcentajeComision ?? 5.0),
      plantilla_garantia: datos.plantillaGarantia || "",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return aProductoServicio(data);
}

/** 4. Eliminar Producto o Servicio */
export async function eliminarProductoServicio(
  id: string
): Promise<{ ok: boolean }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("productos_servicios")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  return { ok: true };
}
