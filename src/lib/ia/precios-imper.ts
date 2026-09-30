import type { SupabaseClient } from "@supabase/supabase-js";
import { PAQUETES_DEFAULT, type PaqueteInfo } from "@/lib/impermeabilizacion-paquetes";
import { cargarProductosImper } from "@/lib/ia/catalogo-imper";

export interface PreciosImpermeabilizacion {
  acrilico: number | null;
  estandar: number | null;
  premium: number | null;
}

/** Precios por m² vigentes en el catálogo de Productos y Servicios (null si no se encuentran). */
export async function preciosImpermeabilizacionDeCatalogo(sb: SupabaseClient): Promise<PreciosImpermeabilizacion> {
  const prods = await cargarProductosImper(sb).catch(() => ({}) as Awaited<ReturnType<typeof cargarProductosImper>>);
  const precio = (p: "acrilico" | "estandar" | "premium") => (prods[p]?.precioM2 ? prods[p]!.precioM2 : null);
  return { acrilico: precio("acrilico"), estandar: precio("estandar"), premium: precio("premium") };
}

/** Los tres paquetes con el precio vigente del catálogo (o el de respaldo si falta). */
export async function paquetesConPreciosVigentes(sb: SupabaseClient): Promise<PaqueteInfo[]> {
  const precios = await preciosImpermeabilizacionDeCatalogo(sb);
  return PAQUETES_DEFAULT.map((pkg) => {
    const p = precios[pkg.id];
    return p && p > 0 ? { ...pkg, precioM2: p } : pkg;
  });
}
