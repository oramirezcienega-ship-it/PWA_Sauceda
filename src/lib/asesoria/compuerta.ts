/**
 * Compuerta de precalificación de la asesoría de compra.
 *
 * Un expediente `asesoria_compra` no puede pasar a Búsqueda (ni saltar a
 * Negociación) sin `monto_credito_precalificado` y sin `busqueda_zonas`. Si el
 * cliente ya tiene casa, esas dos etapas no aplican.
 *
 * Módulo puro (sin dependencias) para poder probarlo con `node --test`.
 */

export interface DatosCompuerta {
  tipoNegocio?: string | null;
  montoCreditoPrecalificado?: number | string | null;
  busquedaZonas?: string[] | null;
  yaTieneCasa?: boolean | null;
}

export type ResultadoCompuerta = { ok: true } | { ok: false; mensaje: string };

/** Etapas que exigen la precalificación y el perfil de búsqueda. */
export const ETAPAS_CON_COMPUERTA = ["busqueda", "negociacion"] as const;

export function validarCompuertaEtapa(datos: DatosCompuerta, etapaDestino: string): ResultadoCompuerta {
  if (datos.tipoNegocio !== "asesoria_compra") return { ok: true };
  if (!(ETAPAS_CON_COMPUERTA as readonly string[]).includes(etapaDestino)) return { ok: true };

  if (datos.yaTieneCasa) {
    return {
      ok: false,
      mensaje: "El cliente ya tiene casa: este expediente se salta Búsqueda y Negociación. Muévelo a Expediente.",
    };
  }

  const faltantes: string[] = [];
  const monto = Number(datos.montoCreditoPrecalificado);
  if (!Number.isFinite(monto) || monto <= 0) faltantes.push("el monto de crédito precalificado");
  const zonas = (datos.busquedaZonas ?? []).map((z) => (z ?? "").trim()).filter(Boolean);
  if (zonas.length === 0) faltantes.push("al menos una zona de búsqueda");

  if (faltantes.length > 0) {
    return {
      ok: false,
      mensaje: `No se puede pasar a Búsqueda sin ${faltantes.join(" y ")}. Captúralo en la tarjeta "Perfil de búsqueda".`,
    };
  }
  return { ok: true };
}
