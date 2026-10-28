/**
 * Utilidades para extracción, validación y normalización de direcciones físicas
 * recibidas por chat o formularios, y generación de enlaces de Google Maps.
 */

const VIALIDADES_REGEX_STR =
  "calle|c\\.|av\\.?|avenida|blvd\\.?|bulevar|circuito|privada|cerrada|andador|retorno|pasaje|camino|carretera|cto\\.?|prol\\.?|prolongaci[oó]n|convento|paseo|paseos|calzada|czda|valle|monte|sierra|hacienda|villa|villas|bosque|bosques|misi[oó]n|misiones|portal|portales|rinconada|jard[ií]n|jardines|loma|lomas|plaza|plazas|rinc[oó]n|vereda|callej[oó]n|diagonal|eje";

/** Link de búsqueda de Google Maps para la dirección; si no menciona ciudad, se asume León, Gto. */
export function linkMapsDeDireccion(direccion: string): string {
  const d = direccion.trim().replace(/\s+/g, " ");
  if (!d) return "";
  const conCiudad = /le[oó]n|gto|guanajuato|silao|irapuato|celaya|salamanca|lagos|san francisco del rinc[oó]n|purísima/i.test(d)
    ? d
    : `${d}, León, Gto.`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(conCiudad)}`;
}

/** Limpia coletillas conversacionales de WhatsApp al inicio o final de una dirección. */
export function limpiarColetillasDireccion(s: string): string {
  let res = s
    // Quitar prefijos conversacionales como "Perfecto,", "Ok,", "Sale,", etc.
    .replace(/^(?:perfecto|ok|sale|enterado|muy bien|de acuerdo|listo)[,.\s]+/i, "")
    // Quitar "en ", "de ", "sería en " sobrante al inicio
    .replace(/^(?:(?:ser[ií]a|es)\s+)?(?:en|de|por)\s+/i, "")
    // Quitar coletillas al final (agradecimientos, horarios o peticiones)
    .replace(
      /(?:,\s*|\.\s*|\s+)(?:si\s+de\s+favor\s+pudieran|si\s+pudieran|para\s+el\s+d[ií]a|el\s+d[ií]a|por\s+favor|gracias|muchas\s+gracias|saludos|quedo\s+al\s+pendiente|aqu[ií]\s+los\s+espero|aqu[ií]\s+estamos|a\s+qu[eé]\s+hora\s+vienen\??|para\s+que\s+vengan|espero\s+su\s+confirmaci[oó]n).*$/i,
      ""
    )
    .replace(/^[:;,-]\s*/, "")
    .trim();

  // Quitar puntuación suelta al final
  res = res.replace(/[.,;:-]+$/, "").trim();
  return res;
}

/** Evalúa si una cadena tiene características mínimas de una dirección física real. */
export function pareceDireccionValida(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 8 || t.length > 250) return false;

  // No debe ser pregunta
  if (/[?¿]/.test(t)) return false;

  // No debe ser correo electrónico
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;

  // No debe ser un saludo genérico sin números
  if (/^(hola|buenos d[ií]as|buenas tardes|buenas noches)/i.test(t) && !/\d+/.test(t)) return false;

  const tieneNumero = /\d+/.test(t);
  const tieneVialidad = new RegExp(`\\b(${VIALIDADES_REGEX_STR})\\b`, "i").test(t);
  const tieneColonia = /\b(col\.?|colonia|fracc\.?|fraccionamiento|barrio|secci[oó]n|residencial|villa|villas|lomas|jardines|portal)\b/i.test(t);
  const tieneEntreCalles = /\bentre(?:\s+calle|\s+calles|\s+la)?\b/i.test(t);
  const tieneLoteManzana = /\b(mza|manzana|lt|lote)\.?\s*\d+/i.test(t);

  // Es válida si:
  // - Tiene vialidad Y número (ej. Convento del Carmen 112)
  // - O tiene vialidad Y colonia (ej. Privada Gardenias en León II)
  // - O tiene número Y colonia (ej. Roble 124 Col. San Miguel)
  // - O tiene lote/manzana
  // - O tiene vialidad con entre calles o longitud suficiente
  return (
    (tieneVialidad && tieneNumero) ||
    (tieneNumero && tieneColonia) ||
    (tieneVialidad && tieneColonia) ||
    tieneLoteManzana ||
    (tieneVialidad && tieneEntreCalles) ||
    (tieneVialidad && t.length >= 15)
  );
}

/**
 * Extrae de forma determinista una dirección física a partir de un mensaje entrante de chat.
 * Maneja formatos como:
 * - "Mi domicilio es: Calle Josefina Camarena #203. Col. Leon 2. Entre Calle Esteban de laris y Eufrasia Pantoja"
 * - "Convento del Carmen 112 colinas del Carmen hay que avisar por wattsap..."
 * - "Dirección: Paseo de las Lomas 124, Col. San Miguel"
 * - "Calle Roble 124, León II"
 * - "Estamos en Privada Gardenias #12"
 */
export function extraerDireccionDeTexto(texto: string): string | null {
  if (!texto || typeof texto !== "string") return null;
  const t = texto.trim();
  if (t.length < 8 || t.length > 350) return null;

  // 1. Patrón con prefijo explícito: "domicilio es: ...", "dirección: ...", "mi ubicación es: ...", "estamos en: ..."
  const prefijoMatch = t.match(
    /(?:(?:mi|el)\s+)?(?:domicilio|direcci[oó]n|ubicaci[oó]n|casa)\s*(?:es|ser[ií]a)?\s*[:;,-]?\s*([\s\S]+)/i
  );
  if (prefijoMatch) {
    let candidata = limpiarColetillasDireccion(prefijoMatch[1].trim());
    // Si viene multilínea (ej. "domicilio es:\nCalle X #123"), colapsar espacios y saltos
    candidata = candidata.replace(/\r?\n+/g, " ").replace(/\s+/g, " ");
    if (pareceDireccionValida(candidata)) {
      return candidata;
    }
  }

  // 2. Patrón de "estamos en / vivo en / es en / sería en ..."
  const esEnMatch = t.match(
    /(?:(?:estamos|vivo|ser[ií]a|es|seria)\s+en\s+)([\s\S]+)/i
  );
  if (esEnMatch) {
    let candidata = limpiarColetillasDireccion(esEnMatch[1].trim());
    candidata = candidata.replace(/\r?\n+/g, " ").replace(/\s+/g, " ");
    if (pareceDireccionValida(candidata)) {
      return candidata;
    }
  }

  // 3. Patrón directo que comienza con tipo de vialidad + nombre + número
  const vialidadRegex = new RegExp(
    `\\b((?:${VIALIDADES_REGEX_STR})\\s+[A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\\s.,#-]+?\\d+[A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\\s.,#-]*)`,
    "i"
  );
  const vialidadMatch = t.match(vialidadRegex);
  if (vialidadMatch) {
    let candidata = limpiarColetillasDireccion(vialidadMatch[1].trim());
    candidata = candidata.replace(/\r?\n+/g, " ").replace(/\s+/g, " ");
    if (pareceDireccionValida(candidata)) {
      return candidata;
    }
  }

  return null;
}
