/**
 * Búsqueda de casas en internet para la asesoría de compra.
 *
 * - Portales donde se busca (dominios permitidos para la IA).
 * - Criterios de búsqueda a partir de la ficha (sin datos del cliente).
 * - Accesos directos a cada portal (búsqueda de Google limitada al sitio).
 * - Limpieza de las candidatas que devuelve la IA antes de mostrarlas.
 *
 * Módulo puro (sin dependencias de servidor) para poder probarlo con `node --test`.
 */

import type { DatosInmuebleRapido } from "./inmueble-form";

export interface Portal {
  id: string;
  nombre: string;
  dominio: string;
}

/** Portales más usados en México para casas de venta (orden = prioridad). */
export const PORTALES: Portal[] = [
  { id: "inmuebles24", nombre: "Inmuebles24", dominio: "inmuebles24.com" },
  { id: "vivanuncios", nombre: "Vivanuncios", dominio: "vivanuncios.com.mx" },
  { id: "lamudi", nombre: "Lamudi", dominio: "lamudi.com.mx" },
  { id: "propiedades", nombre: "Propiedades.com", dominio: "propiedades.com" },
  { id: "casasyterrenos", nombre: "Casas y Terrenos", dominio: "casasyterrenos.com" },
  { id: "mercadolibre", nombre: "Mercado Libre Inmuebles", dominio: "inmuebles.mercadolibre.com.mx" },
  { id: "century21", nombre: "Century 21 México", dominio: "century21mexico.com" },
  { id: "remax", nombre: "RE/MAX México", dominio: "remax.com.mx" },
];

export const DOMINIOS_PORTALES = PORTALES.map((p) => p.dominio);

export interface CriteriosBusqueda {
  ciudad: string;
  zonas: string[];
  precioMin: number | null;
  precioMax: number | null;
  recamarasMin: number | null;
  tipoInmueble: string | null;
  tipoCredito: string | null;
  indispensables: string | null;
}

/**
 * Criterios para buscar a partir de la ficha. No lleva nombre, teléfono ni
 * ningún dato que identifique al cliente.
 */
export function criteriosDeFicha(ficha: {
  busquedaZonas: string[];
  busquedaPrecioMin: number | null;
  busquedaPrecioMax: number | null;
  montoCreditoPrecalificado: number | null;
  montoAhorroPropio: number | null;
  busquedaRecamarasMin: number | null;
  tipoInmueble: string | null;
  tipoCredito: string | null;
  busquedaIndispensables: string | null;
}, ciudad = "León, Guanajuato"): CriteriosBusqueda {
  const poder = (ficha.montoCreditoPrecalificado ?? 0) + (ficha.montoAhorroPropio ?? 0);
  return {
    ciudad,
    zonas: ficha.busquedaZonas.slice(0, 10),
    precioMin: ficha.busquedaPrecioMin,
    precioMax: ficha.busquedaPrecioMax ?? (poder > 0 ? poder : null),
    recamarasMin: ficha.busquedaRecamarasMin,
    tipoInmueble: ficha.tipoInmueble && ficha.tipoInmueble !== "cualquiera" ? ficha.tipoInmueble : null,
    tipoCredito: ficha.tipoCredito,
    indispensables: (ficha.busquedaIndispensables ?? "").slice(0, 300) || null,
  };
}

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** Texto de los criterios para la IA (y para mostrar al asesor). */
export function describirCriterios(c: CriteriosBusqueda): string {
  const lineas = [
    `Ciudad: ${c.ciudad}`,
    `Tipo: ${c.tipoInmueble === "departamento" ? "departamento" : c.tipoInmueble === "casa" ? "casa" : "casa o departamento"} en venta`,
    c.zonas.length ? `Zonas, colonias o fraccionamientos: ${c.zonas.join(", ")}` : null,
    c.precioMin || c.precioMax
      ? `Precio: ${c.precioMin ? `desde ${MXN.format(c.precioMin)}` : ""}${c.precioMin && c.precioMax ? " " : ""}${c.precioMax ? `hasta ${MXN.format(c.precioMax)}` : ""}`
      : null,
    c.recamarasMin ? `Recámaras: ${c.recamarasMin} o más` : null,
    c.tipoCredito ? `Crédito del comprador: ${c.tipoCredito.toUpperCase()} (de preferencia que lo acepte)` : null,
    c.indispensables ? `Indispensable: ${c.indispensables}` : null,
  ];
  return lineas.filter(Boolean).join("\n");
}

/** Accesos directos: búsqueda de Google limitada a cada portal con los criterios. */
export function enlacesPortales(c: CriteriosBusqueda): { portal: Portal; url: string }[] {
  const tipo = c.tipoInmueble === "departamento" ? "departamento" : "casa";
  const zona = c.zonas.length ? `(${c.zonas.slice(0, 4).map((z) => `"${z}"`).join(" OR ")})` : "";
  const ciudad = c.ciudad.split(",")[0].trim();
  const recamaras = c.recamarasMin ? `${c.recamarasMin} recámaras` : "";
  return PORTALES.map((portal) => {
    const q = [`site:${portal.dominio}`, `${tipo} en venta`, zona, ciudad, recamaras].filter(Boolean).join(" ");
    return { portal, url: `https://www.google.com/search?q=${encodeURIComponent(q)}` };
  });
}

// ---------------------------------------------------------------------------
// Candidatas
// ---------------------------------------------------------------------------

export interface Candidata {
  url: string;
  titulo: string;
  precio: number | null;
  zona: string | null;
  fraccionamiento: string | null;
  colonia: string | null;
  ciudad: string | null;
  recamaras: number | null;
  banos: number | null;
  metrosConstruccion: number | null;
  metrosTerreno: number | null;
  aceptaCredito: string[];
  anuncianteNombre: string | null;
  anuncianteTelefono: string | null;
  resumen: string | null;
  /** La URL apareció en los resultados reales de la búsqueda (no es inventada). */
  verificada: boolean;
  /** Si ya se agregó al inventario. */
  inmuebleId: string | null;
}

/** Hostname sin www, en minúsculas; null si la URL no es http(s) válida. */
export function dominioDe(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** URL comparable: sin hash, sin parámetros de rastreo ni diagonal final. */
export function normalizarUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const p of Array.from(u.searchParams.keys())) {
      if (/^(utm_|gclid|fbclid|ref)/i.test(p)) u.searchParams.delete(p);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function esDominioPortal(url: string, dominios: string[] = DOMINIOS_PORTALES): boolean {
  const d = dominioDe(url);
  return !!d && dominios.some((p) => d === p || d.endsWith(`.${p}`));
}

const CREDITOS = ["infonavit", "fovissste", "bancario", "cofinavit", "contado"];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function txt(v: unknown, max = 200): string | null {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, max) : null;
}

/**
 * Limpia las candidatas de la IA: URL válida, sin repetidas, datos con el tipo
 * correcto. `urlsVistas` son las URL que de verdad devolvió la búsqueda; las
 * que no están ahí se marcan como no verificadas (no se descartan: la IA pudo
 * leer la URL desde una página de resultados). Sin `urlsVistas` se conserva
 * la marca que ya traía (candidatas guardadas).
 */
export function limpiarCandidatas(
  crudas: unknown,
  opciones: { urlsVistas?: string[]; soloPortales?: boolean; max?: number } = {},
): Candidata[] {
  const lista = Array.isArray(crudas) ? crudas : [];
  const vistas = new Set((opciones.urlsVistas ?? []).map((u) => normalizarUrl(u)).filter(Boolean) as string[]);
  const repetidas = new Set<string>();
  const salida: Candidata[] = [];
  for (const c of lista) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const url = normalizarUrl(String(r.url ?? ""));
    if (!url || repetidas.has(url)) continue;
    if (opciones.soloPortales && !esDominioPortal(url)) continue;
    repetidas.add(url);
    const recamaras = num(r.recamaras);
    salida.push({
      url,
      titulo: txt(r.titulo, 160) ?? "Inmueble en venta",
      precio: num(r.precio),
      zona: txt(r.zona, 120),
      fraccionamiento: txt(r.fraccionamiento, 120),
      colonia: txt(r.colonia, 120),
      ciudad: txt(r.ciudad, 80),
      recamaras: recamaras === null ? null : Math.round(recamaras),
      banos: num(r.banos),
      metrosConstruccion: num(r.metros_construccion ?? r.metrosConstruccion),
      metrosTerreno: num(r.metros_terreno ?? r.metrosTerreno),
      aceptaCredito: (Array.isArray(r.acepta_credito ?? r.aceptaCredito) ? ((r.acepta_credito ?? r.aceptaCredito) as unknown[]) : [])
        .map((x) => String(x).toLowerCase())
        .filter((x) => CREDITOS.includes(x)),
      anuncianteNombre: txt(r.anunciante_nombre ?? r.anuncianteNombre, 120),
      anuncianteTelefono: txt(r.anunciante_telefono ?? r.anuncianteTelefono, 40),
      resumen: txt(r.resumen, 400),
      verificada: vistas.size > 0 ? vistas.has(url) : r.verificada === true,
      inmuebleId: typeof r.inmuebleId === "string" ? r.inmuebleId : null,
    });
    if (salida.length >= (opciones.max ?? 20)) break;
  }
  return salida;
}

/** Candidata → datos del inventario (origen portal). El link nunca llega al cliente. */
export function candidataAInmueble(c: Candidata): DatosInmuebleRapido {
  const anunciante = [c.anuncianteNombre, c.anuncianteTelefono].filter(Boolean).join(" · ");
  return {
    urlFuente: c.url,
    precio: c.precio ?? "",
    zona: c.zona ?? c.fraccionamiento ?? c.colonia ?? "",
    fraccionamiento: c.fraccionamiento ?? "",
    colonia: c.colonia ?? "",
    recamaras: c.recamaras,
    banos: c.banos,
    metrosConstruccion: c.metrosConstruccion,
    metrosTerreno: c.metrosTerreno,
    aceptaCredito: c.aceptaCredito,
    notasInternas: [
      `Encontrada en internet: ${c.titulo}`,
      anunciante ? `Anunciante: ${anunciante}` : null,
      c.resumen ? `Resumen: ${c.resumen}` : null,
      "Confirmar disponibilidad y comisión compartida con el anunciante antes de publicarla al cliente.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
