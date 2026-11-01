/**
 * Motor de Segmentación, Arquetipos y Lead Scoring Maestro Omnicanal
 * 
 * Implementa el protocolo de optimización de conversión:
 * - Clasificación geográfica por Tiers en León, Gto.
 * - Detección de Arquetipos de Comprador (Urgente, Residencial Premium, Cuidadoso/Infonavit)
 * - Asignación de Holdout Group (90% Variante v2 / 10% Control v1)
 * - Cálculo de Score Maestro (0 a 100 puntos) con gatillo VIP (>= 70 pts)
 */

export type ZonaTier = "tier_1_premium" | "tier_2_medio" | "tier_3_popular";

export type ArquetipoComprador = 
  | "urgente_dano"
  | "residencial_premium"
  | "cuidadoso_infonavit"
  | "curioso_general";

export type GrupoExperimento = "variante_v2" | "control_v1";

// Catálogo de fraccionamientos y colonias de León clasificados por valor inmobiliario
export const FRACCIONAMIENTOS_TIER_1: string[] = [
  "mayorazgo", "residencial mayorazgo", "rinconada del mayorazgo", "arboledas del mayorazgo",
  "gran jardin", "gran jardín",
  "el molino", "lomas del molino", "residencial el molino", "condominio el molino",
  "sierra nogal", "privada sierra nogal",
  "valle del campestre", "campestre", "cumbres del campestre", "balcones del campestre",
  "punta del este", "residencial punta del este",
  "porta fontana", "fontana",
  "la campiña", "campiña del bosque", "la campiña del bosque",
  "cañada del refugio", "barranca del refugio", "bosques del refugio", "el refugio",
  "la herradura", "fraccionamiento la herradura",
  "lomas del campestre",
  "san jeronimo", "san jerónimo", "mision de san jeronimo", "misión de san jerónimo",
  "jardines del moral", "residencial natura"
];

export const FRACCIONAMIENTOS_TIER_2: string[] = [
  "jardines de santa julia", "santa julia",
  "parque manzanares", "manzanares",
  "san isidro", "san pedro",
  "leon moderno", "león moderno",
  "andrade", "colonia andrade",
  "panorama",
  "real providencia",
  "coecillo", "el coecillo",
  "valle de señora", "valle de senora",
  "santa maria del granjeno", "santa maría del granjeno",
  "presidentes de mexico", "presidentes de méxico",
  "bosques del pedregal",
  "residencial muna", "valle del roble",
  "la yesca", "fraccionamiento la yesca",
  "san miguel", "arboledas", "las arboledas", "san juan bosco"
];

export const FRACCIONAMIENTOS_TIER_3: string[] = [
  "brisas del campestre",
  "las joyas", "la ermita", "joyas",
  "villas de san juan",
  "heroes de leon", "héroes de león",
  "delta", "10 de mayo", "diez de mayo",
  "villas de san nicolas", "villas de san nicolás",
  "brisas del pedregal", "lomas de medina", "san francisco",
  "piletas", "los castillos"
];

/**
 * Clasifica la zona o fraccionamiento de León en uno de los 3 Tiers.
 */
export function clasificarZona(textoUbicacion?: string | null): { tier: ZonaTier; puntos: number; nombreIdentificado: string | null } {
  if (!textoUbicacion) {
    return { tier: "tier_2_medio", puntos: 15, nombreIdentificado: null };
  }

  const limpio = textoUbicacion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const f of FRACCIONAMIENTOS_TIER_1) {
    const fLimpio = f.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (limpio.includes(fLimpio)) {
      return { tier: "tier_1_premium", puntos: 25, nombreIdentificado: f };
    }
  }

  for (const f of FRACCIONAMIENTOS_TIER_2) {
    const fLimpio = f.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (limpio.includes(fLimpio)) {
      return { tier: "tier_2_medio", puntos: 15, nombreIdentificado: f };
    }
  }

  for (const f of FRACCIONAMIENTOS_TIER_3) {
    const fLimpio = f.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (limpio.includes(fLimpio)) {
      return { tier: "tier_3_popular", puntos: 10, nombreIdentificado: f };
    }
  }

  return { tier: "tier_2_medio", puntos: 15, nombreIdentificado: null };
}

/**
 * Detecta el Arquetipo de Comprador a partir de señales en el mensaje y la zona.
 */
export function detectarArquetipo(params: {
  textoCliente?: string | null;
  zonaTier?: ZonaTier;
  metros?: number | null;
}): ArquetipoComprador {
  const t = (params.textoCliente || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Arquetipo Urgente: daño, agua, filtración activa o prisa
  if (
    t.includes("gotera") ||
    t.includes("goteras") ||
    t.includes("lluvia") ||
    t.includes("filtracion") ||
    t.includes("filtra") ||
    t.includes("humedad") ||
    t.includes("urge") ||
    t.includes("urgente") ||
    t.includes("cuando pueden venir") ||
    t.includes("lo mas pronto") ||
    t.includes("lo antes posible") ||
    t.includes("hoy mismo")
  ) {
    return "urgente_dano";
  }

  // 2. Arquetipo Residencial Premium: zona Tier 1, metraje amplio o búsqueda de formalidad/calidad
  if (
    params.zonaTier === "tier_1_premium" ||
    (params.metros && params.metros >= 120) ||
    t.includes("garantia 10") ||
    t.includes("poliester") ||
    t.includes("factura") ||
    t.includes("contrato") ||
    t.includes("ficha tecnica")
  ) {
    return "residencial_premium";
  }

  // 3. Arquetipo Cuidadoso / Infonavit: zona Tier 3, mención explícita o precio x m²
  if (
    params.zonaTier === "tier_3_popular" ||
    t.includes("infonavit") ||
    t.includes("casa chica") ||
    t.includes("precio por metro") ||
    t.includes("cuanto el metro") ||
    t.includes("a meses") ||
    (params.metros && params.metros <= 65)
  ) {
    return "cuidadoso_infonavit";
  }

  return "curioso_general";
}

/**
 * Asigna el grupo del experimento con partición fija y determinista:
 * 90% Variante v2 (Nuevo flujo de Arquetipos + Visita Rápida)
 * 10% Control v1 (Flujo anterior de control)
 */
export function asignarGrupoExperimento(identificador: string): GrupoExperimento {
  if (!identificador) return "variante_v2";

  const digitos = identificador.replace(/\D/g, "");
  if (!digitos) return "variante_v2";

  const suma = digitos.split("").reduce((acc, d) => acc + parseInt(d, 10), 0);
  return suma % 10 === 0 ? "control_v1" : "variante_v2";
}

export interface VariablesLeadScore {
  zonaTier?: ZonaTier;
  metros?: number | null;
  haCompartidoUbicacion?: boolean;
  preguntaAgendaOCita?: boolean;
  solicitoLlamada?: boolean;
  contestoLlamadaConmutador?: boolean;
  interaccionMautic?: boolean;
  abrioPropuestaWeb?: boolean;
  tieneCotizacionFormal?: boolean;
  etapaAvanzada?: boolean;
  arquetipo?: ArquetipoComprador;
}

/**
 * Calcula el Lead Score Maestro Omnicanal (0 a 100 puntos) calibrado para ventas.
 */
export function calcularLeadScore(v: VariablesLeadScore): number {
  let score = 0;

  // 1. Ubicación y Perfil (Hasta 25 pts)
  if (v.zonaTier === "tier_1_premium") score += 25;
  else if (v.zonaTier === "tier_2_medio") score += 15;
  else score += 10;

  // 2. Datos Clave del Proyecto (Hasta 35 pts)
  if (v.haCompartidoUbicacion) score += 20;

  if (v.metros) {
    if (v.metros >= 120) score += 15;
    else if (v.metros >= 50) score += 10;
    else score += 5;
  }

  if (v.tieneCotizacionFormal) score += 15;

  // 3. Señales de Conversación y Urgencia (Hasta 30 pts)
  if (v.preguntaAgendaOCita) score += 15;
  if (v.solicitoLlamada || v.contestoLlamadaConmutador) score += 15;
  if (v.arquetipo === "urgente_dano") score += 10;

  // 4. Omnicanalidad y Avance de Embudo (Hasta 20 pts)
  if (v.abrioPropuestaWeb || v.interaccionMautic) score += 10;
  if (v.etapaAvanzada) score += 15;

  return Math.min(100, Math.max(0, score));
}

/**
 * Identifica si el lead califica para atención inmediata VIP (Cierre Rápido).
 */
export function esLeadCalienteVIP(score: number): boolean {
  return score >= 70;
}
