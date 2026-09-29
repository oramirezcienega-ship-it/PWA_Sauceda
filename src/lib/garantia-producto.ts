/**
 * Arma el texto de la póliza de garantía a partir del PRODUCTO vendido:
 * usa la plantilla de garantía ligada al producto del catálogo, la
 * descripción de los conceptos de la cotización, las características del
 * producto y su plazo de garantía. Como se lee el catálogo en el momento de
 * generar, las garantías nuevas siempre reflejan el producto vigente; las ya
 * emitidas no cambian salvo que se regeneren.
 *
 * Marcadores que puede usar la plantilla del producto:
 *   [NOMBRE DE LA PROPIEDAD / CLIENTE]  [DOMICILIO COMPLETO]
 *   [DÍA] [MES] [AÑO]                  (fecha de inicio)
 *   [PRODUCTO]                          nombre del producto del catálogo
 *   [DESCRIPCION DEL TRABAJO]           conceptos tal como van en la cotización
 *   [ESPECIFICACIONES]                  características del producto
 *   [PLAZO DE GARANTIA]                 p. ej. "5 años"
 *   [FECHA DE VENCIMIENTO]              p. ej. "28 de septiembre de 2031"
 *   [FOLIO COTIZACION] [FOLIO OT]
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaLargaEs(f: Date): string {
  return `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}`;
}

export interface PlazoGarantia {
  /** Años (puede ser fraccionario si viene en meses). */
  anos: number;
  /** Texto legible: "5 años", "6 meses". */
  texto: string;
}

/** Busca "garantía N años/meses" (o "N años de garantía") dentro de un texto. */
export function extraerPlazoGarantia(texto: string | null | undefined, permitirSuelto = false): PlazoGarantia | null {
  if (!texto) return null;
  const t = String(texto);
  const patrones: RegExp[] = [
    /garant[ií]a[^0-9\n]{0,25}(\d+(?:[.,]\d+)?)\s*(a[ñn]os?|meses|mes)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(a[ñn]os?|meses|mes)\s*(?:de\s+)?garant[ií]a/i,
  ];
  if (permitirSuelto) patrones.push(/(\d+(?:[.,]\d+)?)\s*(a[ñn]os?|meses|mes)\b/i);

  for (const re of patrones) {
    const m = t.match(re);
    if (!m) continue;
    const n = parseFloat(m[1].replace(",", "."));
    if (!(n > 0)) continue;
    const esMes = /mes/i.test(m[2]);
    const anos = esMes ? n / 12 : n;
    const unidad = esMes ? (n === 1 ? "mes" : "meses") : n === 1 ? "año" : "años";
    return { anos, texto: `${m[1]} ${unidad}` };
  }
  return null;
}

interface ConceptoCot {
  descripcion: string;
  cantidad: number;
  unidad: string;
  importe: number;
  producto_servicio_id: string | null;
}

const norm = (s: string | null | undefined) =>
  String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

const PLANTILLA_GENERICA = `SAUCEDA CONSTRUYE
PÓLIZA DE GARANTÍA POR SERVICIO

Por la presente garantizamos los trabajos realizados en la siguiente propiedad:

Cliente: [NOMBRE DE LA PROPIEDAD / CLIENTE]
Ubicación: [DOMICILIO COMPLETO]
Fecha de inicio de garantía: [DÍA] de [MES] de [AÑO]

CONDICIONES DE GARANTÍA:

Cobertura de defectos
Si se detecta cualquier defecto de mano de obra o material relacionado con los trabajos realizados, SAUCEDA Construye se compromete a rectificar dichas fallas sin cargo extra por mano de obra ni materiales durante [PLAZO DE GARANTIA] a partir de la fecha de inicio.

Tramitación de reclamaciones
SAUCEDA Construye se compromete a tramitar cualquier reclamación bajo garantía de forma rápida y justa. Para reportar un problema, contáctanos al +52 477 465 4700 o a través de WhatsApp.

Limitaciones de la garantía
SAUCEDA Construye no será responsable de daños ocasionados por manipulación del trabajo, negligencia del cliente o fenómenos naturales fuera de nuestro control.

Esta garantía es válida únicamente en la propiedad especificada y no es transferible.

SAUCEDA Construye · Tradición con tecnología · +52 477 465 4700 · saucedamx.com`;

export interface GarantiaArmada {
  titulo: string;
  contenido: string;
  anos: number;
  plazoTexto: string;
  productoNombre: string | null;
  /** true si se usó la plantilla del producto; false si se usó la genérica. */
  usoPlantillaProducto: boolean;
}

export async function armarGarantiaDesdeCotizacion(
  sb: any,
  datos: {
    cotizacionId: string;
    ordenFolio?: string;
    clienteNombre: string;
    direccion: string;
    fechaInicio?: Date;
    /** Plazo por omisión si ni producto ni cotización lo indican. */
    anosPorDefecto?: number;
  }
): Promise<GarantiaArmada> {
  const inicio = datos.fechaInicio || new Date();

  const { data: cot } = await sb
    .from("cotizaciones")
    .select("id, garantia, servicio_tipo")
    .eq("id", datos.cotizacionId)
    .maybeSingle();

  const { data: concRows } = await sb
    .from("cotizacion_conceptos")
    .select("descripcion, cantidad, unidad, importe, producto_servicio_id")
    .eq("cotizacion_id", datos.cotizacionId);

  const conceptos: ConceptoCot[] = ((concRows as any[]) || [])
    .map((c) => ({
      descripcion: String(c.descripcion || ""),
      cantidad: Number(c.cantidad || 0),
      unidad: String(c.unidad || ""),
      importe: Number(c.importe || 0),
      producto_servicio_id: c.producto_servicio_id || null,
    }))
    .sort((a, b) => b.importe - a.importe);

  // Productos del catálogo (se leen ahora: reflejan siempre el producto vigente)
  const { data: prodRows } = await sb.from("productos_servicios").select("*");
  const productos: any[] = (prodRows as any[]) || [];
  const porId = new Map<string, any>(productos.map((p): [string, any] => [String(p.id), p]));
  const porNombre = new Map<string, any>(productos.map((p): [string, any] => [norm(p.nombre), p]));

  const productoDe = (c: ConceptoCot): any | null => {
    if (c.producto_servicio_id && porId.has(c.producto_servicio_id)) return porId.get(c.producto_servicio_id);
    return porNombre.get(norm(c.descripcion)) || null;
  };

  // Producto principal: el de mayor importe que tenga plantilla de garantía
  let principal: any | null = null;
  let conceptoPrincipal: ConceptoCot | null = null;
  for (const c of conceptos) {
    const p = productoDe(c);
    if (p && String(p.plantilla_garantia || "").trim()) {
      principal = p;
      conceptoPrincipal = c;
      break;
    }
  }
  const usoPlantillaProducto = Boolean(principal);
  let plantilla: string = usoPlantillaProducto ? String(principal.plantilla_garantia) : PLANTILLA_GENERICA;

  // Plazo: producto vigente > descripción en la cotización > campo garantía de la cotización > plantilla > default
  const porDefecto = datos.anosPorDefecto ?? (String(cot?.servicio_tipo || "").includes("imperme") ? 3 : 1);
  const plazo: PlazoGarantia =
    (principal &&
      (extraerPlazoGarantia(principal.nombre) ||
        extraerPlazoGarantia(principal.descripcion_valor) ||
        extraerPlazoGarantia(principal.descripcion))) ||
    (conceptoPrincipal && extraerPlazoGarantia(conceptoPrincipal.descripcion)) ||
    conceptos.map((c) => extraerPlazoGarantia(c.descripcion)).find(Boolean) ||
    extraerPlazoGarantia(cot?.garantia, true) ||
    extraerPlazoGarantia(plantilla.match(/durante\s+\d+\s*(?:a[ñn]os?|meses)/i)?.[0], true) || {
      anos: porDefecto,
      texto: `${porDefecto} ${porDefecto === 1 ? "año" : "años"}`,
    };

  const vence = new Date(inicio);
  vence.setMonth(vence.getMonth() + Math.round(plazo.anos * 12));

  // "Durante N años" de la plantilla se adapta al plazo real del producto
  plantilla = plantilla.replace(/durante\s+\d+\s*(?:a[ñn]os?|meses)/gi, `durante ${plazo.texto}`);

  const listaConceptos = conceptos.length
    ? conceptos.map((c) => `• ${c.descripcion}${c.cantidad ? ` (${c.cantidad} ${c.unidad})` : ""}`).join("\n")
    : "• Trabajos según cotización";
  const especificaciones =
    (principal &&
      (String(principal.especificaciones || "").trim() ||
        String(principal.descripcion || "").trim())) ||
    "";
  const productoNombre: string | null = principal ? String(principal.nombre) : null;

  // Si la plantilla no trae los marcadores, se agrega un bloque "Trabajo amparado"
  const tieneMarcadores = /\[(PRODUCTO|DESCRIPCION DEL TRABAJO|ESPECIFICACIONES)\]/i.test(plantilla);
  if (!tieneMarcadores) {
    const bloque =
      `TRABAJO AMPARADO (Cotización ${datos.cotizacionId})\n` +
      (productoNombre ? `Producto / servicio: ${productoNombre}\n` : "") +
      `${listaConceptos}\n` +
      (especificaciones ? `Características: ${especificaciones}\n` : "") +
      `Plazo de garantía: ${plazo.texto}, a partir del ${fechaLargaEs(inicio)} y hasta el ${fechaLargaEs(vence)}.\n\n`;
    const idx = plantilla.search(/^\s*CONDICIONES DE GARANT[ÍI]A/im);
    plantilla = idx >= 0 ? plantilla.slice(0, idx) + bloque + plantilla.slice(idx) : `${plantilla}\n\n${bloque}`;
  }

  const reemplazos: Array<[RegExp, string]> = [
    [/\[NOMBRE DE LA PROPIEDAD \/ CLIENTE\]/g, datos.clienteNombre],
    [/\[DOMICILIO COMPLETO\]/g, datos.direccion],
    [/\[DÍA\]/g, String(inicio.getDate())],
    [/\[MES\]/g, MESES[inicio.getMonth()]],
    [/\[AÑO\]/g, String(inicio.getFullYear())],
    [/\[PRODUCTO\]/g, productoNombre || "Servicio contratado"],
    [/\[DESCRIPCION DEL TRABAJO\]/g, listaConceptos],
    [/\[ESPECIFICACIONES\]/g, especificaciones || "Según cotización"],
    [/\[PLAZO DE GARANTIA\]/g, plazo.texto],
    [/\[FECHA DE VENCIMIENTO\]/g, fechaLargaEs(vence)],
    [/\[FOLIO COTIZACION\]/g, datos.cotizacionId],
    [/\[FOLIO OT\]/g, datos.ordenFolio || ""],
  ];
  let contenido = plantilla;
  for (const [re, val] of reemplazos) contenido = contenido.replace(re, val);

  return {
    titulo: productoNombre ? `Póliza de Garantía · ${productoNombre}` : "Póliza de Garantía por Servicio",
    contenido,
    anos: plazo.anos,
    plazoTexto: plazo.texto,
    productoNombre,
    usoPlantillaProducto,
  };
}
