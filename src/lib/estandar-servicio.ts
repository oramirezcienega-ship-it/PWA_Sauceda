import type { EstandarServicio } from "@/lib/types";

/** Estándar Sauceda a partir de la fila de productos_servicios; null si el servicio no define ninguno. */
export function estandarDeServicio(ps: any): EstandarServicio | null {
  if (!ps) return null;
  const e: EstandarServicio = {
    proceso: (ps.estandar_proceso || "").trim(),
    incluye: (ps.estandar_incluye || "").trim(),
    garantiaAnios: Number(ps.estandar_garantia_anios || 0),
    garantia: (ps.estandar_garantia || "").trim(),
    tiempo: (ps.estandar_tiempo || "").trim(),
  };
  return e.proceso || e.incluye || e.garantiaAnios > 0 || e.garantia || e.tiempo ? e : null;
}

/** "2 años · mano de obra…" */
export function textoGarantiaEstandar(e: EstandarServicio): string {
  return [e.garantiaAnios > 0 ? `${e.garantiaAnios} ${e.garantiaAnios === 1 ? "año" : "años"}` : "", e.garantia]
    .filter(Boolean)
    .join(" · ");
}
