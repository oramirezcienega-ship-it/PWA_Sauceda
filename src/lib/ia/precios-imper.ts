import type { SupabaseClient } from "@supabase/supabase-js";
import { PAQUETES_DEFAULT, type PaqueteInfo } from "@/lib/impermeabilizacion-paquetes";

export interface PreciosImpermeabilizacion {
  acrilico: number | null;
  estandar: number | null;
  premium: number | null;
}

/** Precios por m² vigentes en el catálogo de Productos y Servicios (null si no se encuentran). */
export async function preciosImpermeabilizacionDeCatalogo(sb: SupabaseClient): Promise<PreciosImpermeabilizacion> {
  const { data, error } = await sb.from("productos_servicios").select("nombre, precio_unitario");
  if (error || !data) return { acrilico: null, estandar: null, premium: null };

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

/** Los tres paquetes con el precio vigente del catálogo (o el de respaldo si falta). */
export async function paquetesConPreciosVigentes(sb: SupabaseClient): Promise<PaqueteInfo[]> {
  const precios = await preciosImpermeabilizacionDeCatalogo(sb).catch(() => null);
  return PAQUETES_DEFAULT.map((pkg) => {
    const p = precios?.[pkg.id];
    return p && p > 0 ? { ...pkg, precioM2: p } : pkg;
  });
}
