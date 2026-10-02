import type { SupabaseClient } from "@supabase/supabase-js";
import { PAQUETES_DEFAULT, type PaqueteInfo } from "@/lib/impermeabilizacion-paquetes";
import { cargarProductosImper } from "@/lib/ia/catalogo-imper";

type Paquete = "acrilico" | "estandar" | "premium";

export interface PreciosImpermeabilizacion {
  acrilico: number | null;
  estandar: number | null;
  premium: number | null;
  /** Cantidad mínima de cobro (m²) por paquete; 0 = sin mínimo. */
  minimos: Record<Paquete, number>;
}

/** Precios por m² vigentes en el catálogo de Productos y Servicios (null si no se encuentran). */
export async function preciosImpermeabilizacionDeCatalogo(sb: SupabaseClient): Promise<PreciosImpermeabilizacion> {
  const prods = await cargarProductosImper(sb).catch(() => ({}) as Awaited<ReturnType<typeof cargarProductosImper>>);
  const precio = (p: Paquete) => (prods[p]?.precioM2 ? prods[p]!.precioM2 : null);
  const minimo = (p: Paquete) => prods[p]?.minimoM2 || 0;
  return {
    acrilico: precio("acrilico"),
    estandar: precio("estandar"),
    premium: precio("premium"),
    minimos: { acrilico: minimo("acrilico"), estandar: minimo("estandar"), premium: minimo("premium") },
  };
}

/** Aplica precios y mínimos del catálogo a los paquetes (conserva el precio de respaldo si falta). */
export function aplicarPreciosCatalogo(paquetes: PaqueteInfo[], precios: PreciosImpermeabilizacion): PaqueteInfo[] {
  return paquetes.map((pkg) => {
    const p = precios[pkg.id];
    return { ...pkg, precioM2: p && p > 0 ? p : pkg.precioM2, minimoM2: precios.minimos?.[pkg.id] || 0 };
  });
}

/** Los tres paquetes con el precio y mínimo vigentes del catálogo (o el precio de respaldo si falta). */
export async function paquetesConPreciosVigentes(sb: SupabaseClient): Promise<PaqueteInfo[]> {
  return aplicarPreciosCatalogo(PAQUETES_DEFAULT, await preciosImpermeabilizacionDeCatalogo(sb));
}
