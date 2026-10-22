/**
 * Perfil de búsqueda del comprador (ficha de la OT de asesoría de compra).
 *
 * Normaliza y valida lo que captura el asesor antes de guardarlo en
 * `ot_ficha_asesoria_compra`. Módulo puro para poder probarlo con `node --test`.
 */

import { normalizarCredito, type TipoCredito } from "./match";
import { normalizarZonasGeo, type ZonaGeo } from "./zonas";

export const TIPOS_INMUEBLE = ["casa", "departamento", "cualquiera"] as const;
export type TipoInmueble = (typeof TIPOS_INMUEBLE)[number];
export const ETIQUETA_TIPO_INMUEBLE: Record<TipoInmueble, string> = {
  casa: "Casa",
  departamento: "Departamento",
  cualquiera: "Cualquiera",
};

export const PLAZOS_MUDANZA = ["inmediato", "1_3_meses", "3_6_meses", "mas_6_meses"] as const;
export type PlazoMudanza = (typeof PLAZOS_MUDANZA)[number];
export const ETIQUETA_PLAZO: Record<PlazoMudanza, string> = {
  inmediato: "Lo antes posible",
  "1_3_meses": "1 a 3 meses",
  "3_6_meses": "3 a 6 meses",
  mas_6_meses: "Más de 6 meses",
};

export const FUENTES_PRECALIFICACION = ["infonavit", "fovissste", "bancario", "cofinavit", "otro"] as const;
export type FuentePrecalificacion = (typeof FUENTES_PRECALIFICACION)[number];

export const ETIQUETA_FUENTE: Record<FuentePrecalificacion, string> = {
  infonavit: "INFONAVIT",
  fovissste: "FOVISSSTE",
  bancario: "Bancario",
  cofinavit: "Cofinavit",
  otro: "Otro",
};

/** Perfil tal como lo usa la app (camelCase). */
export interface PerfilBusqueda {
  tipoCredito: TipoCredito | null;
  busquedaZonas: string[];
  /** Zonas con su ubicación en el mapa (las sin confirmar solo traen nombre). */
  zonasGeo: ZonaGeo[];
  busquedaPrecioMin: number | null;
  busquedaPrecioMax: number | null;
  montoCreditoPrecalificado: number | null;
  montoAhorroPropio: number | null;
  busquedaRecamarasMin: number | null;
  /** Deseables (texto libre). */
  busquedaRequisitos: string | null;
  busquedaIndispensables: string | null;
  tipoInmueble: TipoInmueble | null;
  plazoMudanza: PlazoMudanza | null;
  /** Por qué el precio máximo rebasa el poder de compra (si lo rebasa). */
  justificacionPrecio: string | null;
  precalificacionFecha: string | null;
  precalificacionFuente: FuentePrecalificacion | null;
  yaTieneCasa: boolean;
}

/** Lo que llega del formulario (todo opcional, números como texto o número). */
export type EntradaPerfil = Partial<{
  tipoCredito: string | null;
  busquedaZonas: string[] | string | null;
  zonasGeo: unknown;
  busquedaPrecioMin: number | string | null;
  busquedaPrecioMax: number | string | null;
  montoCreditoPrecalificado: number | string | null;
  montoAhorroPropio: number | string | null;
  busquedaRecamarasMin: number | string | null;
  busquedaRequisitos: string | null;
  busquedaIndispensables: string | null;
  tipoInmueble: string | null;
  plazoMudanza: string | null;
  justificacionPrecio: string | null;
  precalificacionFecha: string | null;
  precalificacionFuente: string | null;
  yaTieneCasa: boolean | null;
}>;

export type ResultadoPerfil =
  | { ok: true; perfil: PerfilBusqueda }
  | { ok: false; errores: string[] };

/** "$1,250,000" | "1250000" | 1250000 → 1250000; vacío → null. */
export function aMonto(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const limpio = String(valor).replace(/[^\d.]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Separa zonas por coma, punto y coma o salto de línea; quita vacías y repetidas. */
export function normalizarZonas(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : String(valor ?? "").split(/[,;\n]/);
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const z of lista) {
    const limpia = String(z ?? "").replace(/\s+/g, " ").trim();
    const clave = limpia.toLocaleLowerCase("es-MX");
    if (!limpia || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(limpia);
  }
  return salida;
}

/** Poder de compra = crédito precalificado (crédito + subcuenta) + ahorro propio. */
export function poderDeCompra(perfil: Pick<PerfilBusqueda, "montoCreditoPrecalificado" | "montoAhorroPropio">): number {
  return (perfil.montoCreditoPrecalificado ?? 0) + (perfil.montoAhorroPropio ?? 0);
}

export function normalizarPerfil(entrada: EntradaPerfil): ResultadoPerfil {
  const errores: string[] = [];

  const precioMin = aMonto(entrada.busquedaPrecioMin);
  const precioMax = aMonto(entrada.busquedaPrecioMax);
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    errores.push("El precio mínimo no puede ser mayor que el máximo.");
  }

  const recamarasTexto = entrada.busquedaRecamarasMin;
  let recamaras: number | null = null;
  if (recamarasTexto !== null && recamarasTexto !== undefined && String(recamarasTexto).trim() !== "") {
    const n = Number(recamarasTexto);
    if (!Number.isInteger(n) || n < 0 || n > 20) errores.push("Las recámaras mínimas deben ser un número entero entre 0 y 20.");
    else recamaras = n;
  }

  const fecha = (entrada.precalificacionFecha ?? "").trim() || null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push("La fecha de precalificación no es válida.");

  const fuenteTexto = (entrada.precalificacionFuente ?? "").trim().toLowerCase() || null;
  let fuente: FuentePrecalificacion | null = null;
  if (fuenteTexto) {
    if ((FUENTES_PRECALIFICACION as readonly string[]).includes(fuenteTexto)) fuente = fuenteTexto as FuentePrecalificacion;
    else errores.push("La fuente de precalificación no es válida.");
  }

  const creditoTexto = (entrada.tipoCredito ?? "").trim();
  const tipoCredito = creditoTexto ? normalizarCredito(creditoTexto) : null;
  if (creditoTexto && !tipoCredito) errores.push("El tipo de crédito no es válido.");

  const tipoInmueble = (entrada.tipoInmueble ?? "").trim() || null;
  if (tipoInmueble && !(TIPOS_INMUEBLE as readonly string[]).includes(tipoInmueble)) errores.push("El tipo de inmueble no es válido.");
  const plazo = (entrada.plazoMudanza ?? "").trim() || null;
  if (plazo && !(PLAZOS_MUDANZA as readonly string[]).includes(plazo)) errores.push("El plazo de mudanza no es válido.");

  if (errores.length > 0) return { ok: false, errores };

  // Las zonas del mapa mandan; si no vienen, se toman los nombres sueltos.
  const zonasGeo =
    entrada.zonasGeo !== undefined
      ? normalizarZonasGeo(entrada.zonasGeo)
      : normalizarZonasGeo(normalizarZonas(entrada.busquedaZonas));
  const texto = (v: string | null | undefined, max = 1000) => (v ?? "").trim().slice(0, max) || null;

  return {
    ok: true,
    perfil: {
      tipoCredito,
      busquedaZonas: normalizarZonas(zonasGeo.map((z) => z.nombre)),
      zonasGeo,
      busquedaPrecioMin: precioMin,
      busquedaPrecioMax: precioMax,
      montoCreditoPrecalificado: aMonto(entrada.montoCreditoPrecalificado),
      montoAhorroPropio: aMonto(entrada.montoAhorroPropio),
      busquedaRecamarasMin: recamaras,
      busquedaRequisitos: texto(entrada.busquedaRequisitos),
      busquedaIndispensables: texto(entrada.busquedaIndispensables),
      tipoInmueble: tipoInmueble as TipoInmueble | null,
      plazoMudanza: plazo as PlazoMudanza | null,
      justificacionPrecio: texto(entrada.justificacionPrecio, 500),
      precalificacionFecha: fecha,
      precalificacionFuente: fuente,
      yaTieneCasa: Boolean(entrada.yaTieneCasa),
    },
  };
}

/** Perfil → columnas de `ot_ficha_asesoria_compra`. */
export function perfilAFila(p: PerfilBusqueda) {
  return {
    tipo_credito: p.tipoCredito,
    busqueda_zonas: p.busquedaZonas.length > 0 ? p.busquedaZonas : null,
    busqueda_precio_min: p.busquedaPrecioMin,
    busqueda_precio_max: p.busquedaPrecioMax,
    monto_credito_precalificado: p.montoCreditoPrecalificado,
    monto_ahorro_propio: p.montoAhorroPropio,
    busqueda_recamaras_min: p.busquedaRecamarasMin,
    busqueda_requisitos: p.busquedaRequisitos,
    zonas_geo: p.zonasGeo,
    busqueda_indispensables: p.busquedaIndispensables,
    tipo_inmueble: p.tipoInmueble,
    plazo_mudanza: p.plazoMudanza,
    justificacion_precio: p.justificacionPrecio,
    precalificacion_fecha: p.precalificacionFecha,
    precalificacion_fuente: p.precalificacionFuente,
    ya_tiene_casa: p.yaTieneCasa,
  };
}

/** Fila de `ot_ficha_asesoria_compra` → perfil. */
export function filaAPerfil(f: Record<string, any>): PerfilBusqueda {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const nombres: string[] = Array.isArray(f.busqueda_zonas) ? f.busqueda_zonas : [];
  const geo = normalizarZonasGeo(f.zonas_geo);
  return {
    tipoCredito: normalizarCredito(f.tipo_credito),
    busquedaZonas: nombres,
    zonasGeo: geo.length > 0 ? geo : normalizarZonasGeo(nombres),
    busquedaPrecioMin: num(f.busqueda_precio_min),
    busquedaPrecioMax: num(f.busqueda_precio_max),
    montoCreditoPrecalificado: num(f.monto_credito_precalificado),
    montoAhorroPropio: num(f.monto_ahorro_propio),
    busquedaRecamarasMin: num(f.busqueda_recamaras_min),
    busquedaRequisitos: f.busqueda_requisitos ?? null,
    busquedaIndispensables: f.busqueda_indispensables ?? null,
    tipoInmueble: (TIPOS_INMUEBLE as readonly string[]).includes(f.tipo_inmueble) ? f.tipo_inmueble : null,
    plazoMudanza: (PLAZOS_MUDANZA as readonly string[]).includes(f.plazo_mudanza) ? f.plazo_mudanza : null,
    justificacionPrecio: f.justificacion_precio ?? null,
    precalificacionFecha: f.precalificacion_fecha ?? null,
    precalificacionFuente: f.precalificacion_fuente ?? null,
    yaTieneCasa: Boolean(f.ya_tiene_casa),
  };
}
