/**
 * Condiciones comerciales del PROVEEDOR (migración 0160): aplican a todos sus servicios.
 * Anticipo, condiciones de pago, zonas donde trabaja y hasta cuándo respeta sus precios.
 */
export interface CondicionesProveedor {
  anticipoPct: number;
  condicionesPago: string;
  zonas: string[];
  /** YYYY-MM-DD */
  vigenciaPrecios: string | null;
}

export const CONDICIONES_VACIAS: CondicionesProveedor = { anticipoPct: 0, condicionesPago: "", zonas: [], vigenciaPrecios: null };

/** Fila de `proveedores` (snake_case) → condiciones. */
export function condicionesDeFila(p: any): CondicionesProveedor {
  if (!p) return { ...CONDICIONES_VACIAS };
  return {
    anticipoPct: Number(p.anticipo_pct || 0),
    condicionesPago: (p.condiciones_pago || "").trim(),
    zonas: Array.isArray(p.zonas_cobertura) ? p.zonas_cobertura.map((z: any) => String(z).trim()).filter(Boolean) : [],
    vigenciaPrecios: p.vigencia_precios || null,
  };
}

/** "León, Silao" → ["León", "Silao"] */
export function zonasDeTexto(texto: string): string[] {
  return Array.from(
    new Set(
      (texto || "")
        .split(/[,;\n]/)
        .map((z) => z.trim())
        .filter(Boolean)
    )
  ).slice(0, 40);
}

export function textoPago(c: CondicionesProveedor): string {
  return [c.anticipoPct > 0 ? `${c.anticipoPct}% de anticipo` : "", c.condicionesPago].filter(Boolean).join(" · ");
}

/** Lo que le falta al proveedor en sus condiciones generales. */
export function faltantesCondiciones(c: CondicionesProveedor): string[] {
  const f: string[] = [];
  if (!(c.anticipoPct > 0) && !c.condicionesPago) f.push("forma de pago");
  if (c.zonas.length === 0) f.push("zonas");
  return f;
}

/** Columnas de `proveedores` para guardar condiciones (valores ya validados). */
export function filaCondiciones(d: Partial<CondicionesProveedor>) {
  const fila: Record<string, unknown> = {};
  if (d.anticipoPct !== undefined) {
    const n = Number(d.anticipoPct);
    fila.anticipo_pct = Number.isFinite(n) && n > 0 ? Math.min(n, 100) : null;
  }
  if (d.condicionesPago !== undefined) fila.condiciones_pago = (d.condicionesPago || "").trim().slice(0, 1000);
  if (d.zonas !== undefined) fila.zonas_cobertura = (d.zonas || []).map((z) => z.trim().slice(0, 80)).filter(Boolean).slice(0, 40);
  if (d.vigenciaPrecios !== undefined) {
    fila.vigencia_precios = typeof d.vigenciaPrecios === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.vigenciaPrecios) ? d.vigenciaPrecios : null;
  }
  return fila;
}
