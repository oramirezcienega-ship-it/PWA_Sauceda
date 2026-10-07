import type { PlantillaWhatsApp } from "@/lib/whatsapp";

export type CategoriaPlantilla =
  | "impermeabilizacion"
  | "remodelacion"
  | "piso_estampado"
  | "cisternas_tinacos"
  | "herreria"
  | "bienes_raices"
  | "operativas_cotizaciones"
  | "general";

export interface InfoCategoriaPlantilla {
  categoria: CategoriaPlantilla;
  etiqueta: string;
  icono: string;
}

/**
 * Deduplica plantillas devueltas por Meta (que a menudo incluyen múltiples variantes
 * por idioma como es vs es_MX o registros duplicados).
 * Prioriza:
 * 1. APPROVED sobre cualquier otro estado.
 * 2. Idioma es_MX > es > otros.
 * 3. Plantillas con texto en el cuerpo sobre vacías.
 */
export function deduplicarPlantillas(lista: PlantillaWhatsApp[]): PlantillaWhatsApp[] {
  const mapa = new Map<string, PlantillaWhatsApp>();

  for (const p of lista) {
    if (!p || !p.nombre) continue;

    const existente = mapa.get(p.nombre);
    if (!existente) {
      mapa.set(p.nombre, p);
      continue;
    }

    // 1. Estado APPROVED tiene prioridad
    if (p.estado === "APPROVED" && existente.estado !== "APPROVED") {
      mapa.set(p.nombre, p);
      continue;
    }
    if (p.estado !== "APPROVED" && existente.estado === "APPROVED") {
      continue;
    }

    // 2. Idioma preferido (es_MX > es > otros)
    const pesoIdioma = (idioma: string) => {
      const id = (idioma || "").toLowerCase();
      if (id === "es_mx") return 3;
      if (id === "es" || id === "es_es") return 2;
      return 1;
    };

    if (pesoIdioma(p.idioma) > pesoIdioma(existente.idioma)) {
      mapa.set(p.nombre, p);
      continue;
    }

    // 3. Si tiene cuerpo y la existente no
    if (p.cuerpo && !existente.cuerpo) {
      mapa.set(p.nombre, p);
    }
  }

  return Array.from(mapa.values());
}

/**
 * Clasifica una plantilla de WhatsApp según su nombre o texto en su línea de negocio
 * o propósito operativo dentro de Sauceda.
 */
export function clasificarPlantilla(p: PlantillaWhatsApp): InfoCategoriaPlantilla {
  const nom = (p.nombre || "").toLowerCase();
  const txt = (p.cuerpo || "").toLowerCase();

  // 1. Impermeabilización
  if (
    nom.includes("imper") ||
    nom.includes("gotera") ||
    txt.includes("impermeabili") ||
    txt.includes("gotera") ||
    txt.includes("azotea") ||
    txt.includes("filtraci")
  ) {
    return {
      categoria: "impermeabilizacion",
      etiqueta: "Impermeabilización",
      icono: "☔",
    };
  }

  // 2. Remodelación
  if (
    nom.includes("remodela") ||
    txt.includes("remodela") ||
    txt.includes("acabado")
  ) {
    return {
      categoria: "remodelacion",
      etiqueta: "Remodelación",
      icono: "🔨",
    };
  }

  // 3. Piso Estampado
  if (
    nom.includes("estampado") ||
    (nom.includes("piso") && !nom.includes("compromiso")) ||
    txt.includes("estampado") ||
    txt.includes("concreto estampado")
  ) {
    return {
      categoria: "piso_estampado",
      etiqueta: "Piso Estampado",
      icono: "🧱",
    };
  }

  // 4. Cisternas, Aljibes y Tinacos
  if (
    nom.includes("cisterna") ||
    nom.includes("aljibe") ||
    nom.includes("tinaco") ||
    txt.includes("cisterna") ||
    txt.includes("aljibe") ||
    txt.includes("tinaco")
  ) {
    return {
      categoria: "cisternas_tinacos",
      etiqueta: "Cisternas y Tinacos",
      icono: "💧",
    };
  }

  // 5. Herrería
  if (
    nom.includes("herreria") ||
    nom.includes("herrería") ||
    nom.includes("porton") ||
    nom.includes("reja") ||
    txt.includes("herreria") ||
    txt.includes("portón") ||
    txt.includes("protecciones") ||
    txt.includes("barandal")
  ) {
    return {
      categoria: "herreria",
      etiqueta: "Herrería",
      icono: "⚙️",
    };
  }

  // 6. Bienes Raíces (Compra directa, Traspaso, Promoción, Trámites)
  if (
    nom.includes("compra_directa") ||
    nom.includes("traspaso") ||
    nom.includes("promocion_venta") ||
    nom.includes("solo_tramite") ||
    nom.includes("bienes_raices") ||
    txt.includes("bienes raíces") ||
    txt.includes("compramos tu casa")
  ) {
    return {
      categoria: "bienes_raices",
      etiqueta: "Bienes Raíces",
      icono: "🏠",
    };
  }

  // 7. Operativas, Inspecciones, Cotizaciones, Cobranza y Entrega
  if (
    nom.includes("cotizacion") ||
    nom.includes("inspeccion") ||
    nom.includes("instalacion") ||
    nom.includes("recibo") ||
    nom.includes("entrega") ||
    nom.includes("cita") ||
    nom.includes("agenda") ||
    nom.includes("pago") ||
    nom.includes("garantia")
  ) {
    return {
      categoria: "operativas_cotizaciones",
      etiqueta: "Operativas, Cotizaciones y Citas",
      icono: "📋",
    };
  }

  // 8. General / Ecosistema / Agradecimiento
  return {
    categoria: "general",
    etiqueta: "Bienvenida y General",
    icono: "🌐",
  };
}

/**
 * Traduce el valor de `tipoNegocio` (de expedientes o prospectos en BD) a la
 * categoría de plantilla correspondiente.
 */
export function obtenerCategoriaDeTipoNegocio(tipoNegocio?: string | null): {
  categoria: CategoriaPlantilla;
  nombreLegible: string;
  icono: string;
} | null {
  if (!tipoNegocio) return null;
  const tn = tipoNegocio.toLowerCase();

  if (tn.includes("impermea")) {
    return { categoria: "impermeabilizacion", nombreLegible: "Impermeabilización", icono: "☔" };
  }
  if (tn.includes("remodela")) {
    return { categoria: "remodelacion", nombreLegible: "Remodelación", icono: "🔨" };
  }
  if (tn.includes("estampado") || tn.includes("piso")) {
    return { categoria: "piso_estampado", nombreLegible: "Piso Estampado", icono: "🧱" };
  }
  if (tn.includes("cisterna") || tn.includes("tinaco") || tn.includes("aljibe")) {
    return { categoria: "cisternas_tinacos", nombreLegible: "Cisternas y Tinacos", icono: "💧" };
  }
  if (tn.includes("herreria") || tn.includes("herrería")) {
    return { categoria: "herreria", nombreLegible: "Herrería", icono: "⚙️" };
  }
  if (tn.includes("traspaso") || tn.includes("compra") || tn.includes("promocion") || tn.includes("tramite")) {
    return { categoria: "bienes_raices", nombreLegible: "Bienes Raíces", icono: "🏠" };
  }

  return null;
}

export interface GrupoPlantillas {
  id: string;
  label: string;
  icono: string;
  destacado?: boolean;
  plantillas: PlantillaWhatsApp[];
}

/**
 * Agrupa y filtra las plantillas deduplicadas de acuerdo al tipo de negocio del lead,
 * el término de búsqueda opcional y si se prefiere ver solo las recomendadas o todas.
 */
export function agruparPlantillasParaChat({
  plantillas,
  tipoNegocio,
  busqueda = "",
  modoFiltro = "recomendadas",
}: {
  plantillas: PlantillaWhatsApp[];
  tipoNegocio?: string | null;
  busqueda?: string;
  modoFiltro?: "recomendadas" | "todas";
}): {
  grupos: GrupoPlantillas[];
  totalFiltradas: number;
  totalRecomendadas: number;
  infoNegocio: { categoria: CategoriaPlantilla; nombreLegible: string; icono: string } | null;
} {
  const query = busqueda.trim().toLowerCase();

  // Filtrado por término de búsqueda si existe
  const listaFiltrada = plantillas.filter((p) => {
    if (!query) return true;
    const n = (p.nombre || "").toLowerCase();
    const c = (p.cuerpo || "").toLowerCase();
    const cat = (p.categoria || "").toLowerCase();
    return n.includes(query) || c.includes(query) || cat.includes(query);
  });

  const infoNegocio = obtenerCategoriaDeTipoNegocio(tipoNegocio);

  // Clasificar cada plantilla
  const clasificadas = listaFiltrada.map((p) => ({
    plantilla: p,
    info: clasificarPlantilla(p),
  }));

  // Separar en cubetas
  const especificasNegocio: PlantillaWhatsApp[] = [];
  const operativas: PlantillaWhatsApp[] = [];
  const general: PlantillaWhatsApp[] = [];
  const otrasLineas: PlantillaWhatsApp[] = [];

  // Diccionarios por categoría para desglose detallado en modo "todas"
  const porCategoria: Record<CategoriaPlantilla, PlantillaWhatsApp[]> = {
    impermeabilizacion: [],
    remodelacion: [],
    piso_estampado: [],
    cisternas_tinacos: [],
    herreria: [],
    bienes_raices: [],
    operativas_cotizaciones: [],
    general: [],
  };

  for (const item of clasificadas) {
    const cat = item.info.categoria;
    porCategoria[cat].push(item.plantilla);

    if (infoNegocio && cat === infoNegocio.categoria) {
      especificasNegocio.push(item.plantilla);
    } else if (cat === "operativas_cotizaciones") {
      operativas.push(item.plantilla);
    } else if (cat === "general") {
      general.push(item.plantilla);
    } else {
      otrasLineas.push(item.plantilla);
    }
  }

  const totalRecomendadas = especificasNegocio.length + operativas.length + general.length;

  const grupos: GrupoPlantillas[] = [];

  if (infoNegocio) {
    // Si el lead pertenece a una línea de negocio identificada (ej: Impermeabilización)
    if (especificasNegocio.length > 0) {
      grupos.push({
        id: "especificas",
        label: `⭐ Específicas de ${infoNegocio.nombreLegible} (${especificasNegocio.length})`,
        icono: infoNegocio.icono,
        destacado: true,
        plantillas: especificasNegocio,
      });
    }

    if (operativas.length > 0) {
      grupos.push({
        id: "operativas",
        label: `📋 Operativas, Cotizaciones y Citas (${operativas.length})`,
        icono: "📋",
        plantillas: operativas,
      });
    }

    if (general.length > 0) {
      grupos.push({
        id: "general",
        label: `🌐 Bienvenida y Ecosistema (${general.length})`,
        icono: "🌐",
        plantillas: general,
      });
    }

    // Si el usuario eligió "todas" o no hay recomendadas, agregar el resto de las líneas
    if (modoFiltro === "todas" && otrasLineas.length > 0) {
      grupos.push({
        id: "otras",
        label: `🔄 Otras Líneas de Negocio (${otrasLineas.length})`,
        icono: "🔄",
        plantillas: otrasLineas,
      });
    }
  } else {
    // Sin línea de negocio asignada al lead: agrupar por categoría ordenada
    const ordenCategorias: Array<{ id: CategoriaPlantilla; label: string; icono: string }> = [
      { id: "general", label: "🌐 Bienvenida y Ecosistema", icono: "🌐" },
      { id: "operativas_cotizaciones", label: "📋 Operativas y Cotizaciones", icono: "📋" },
      { id: "impermeabilizacion", label: "☔ Impermeabilización", icono: "☔" },
      { id: "remodelacion", label: "🔨 Remodelación", icono: "🔨" },
      { id: "piso_estampado", label: "🧱 Piso Estampado", icono: "🧱" },
      { id: "cisternas_tinacos", label: "💧 Cisternas y Tinacos", icono: "💧" },
      { id: "herreria", label: "⚙️ Herrería", icono: "⚙️" },
      { id: "bienes_raices", label: "🏠 Bienes Raíces", icono: "🏠" },
    ];

    for (const c of ordenCategorias) {
      const items = porCategoria[c.id];
      if (items.length > 0) {
        grupos.push({
          id: c.id,
          label: `${c.label} (${items.length})`,
          icono: c.icono,
          plantillas: items,
        });
      }
    }
  }

  const totalFiltradas = grupos.reduce((acc, g) => acc + g.plantillas.length, 0);

  return {
    grupos,
    totalFiltradas,
    totalRecomendadas: infoNegocio ? totalRecomendadas : listaFiltrada.length,
    infoNegocio,
  };
}
