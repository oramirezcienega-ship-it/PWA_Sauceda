/**
 * Motor paramétrico de cotización para Portones y Pérgolas
 * SAUCEDA Bienes Raíces y Construcción
 */

export interface ModeloDiseno {
  id: string;
  tipo: "porton" | "pergola";
  nombre: string;
  descripcionCorta: string;
  materiales: string;
  precioMinM2: number;
  precioMaxM2: number;
  precioPromedioM2: number;
  tiempoEntregaDias: number;
  garantiaAnos: number;
  badge?: string;
  caracteristicas: string[];
}

export const CATALOGO_MODELOS: Record<string, ModeloDiseno> = {
  // --- PORTONES ---
  porton_duela: {
    id: "porton_duela",
    tipo: "porton",
    nombre: "Portón Duela Horizontal",
    descripcionCorta: "Herrería contemporánea con duela de acero horizontal y acabado anticorrosivo mate.",
    materiales: "Duela de acero cal. 18, marco en PTR 2\"x2\", primario anticorrosivo epóxico y esmalte de poliuretano grafito.",
    precioMinM2: 2300,
    precioMaxM2: 2800,
    precioPromedioM2: 2550,
    tiempoEntregaDias: 15,
    garantiaAnos: 3,
    badge: "Más Solicitado",
    caracteristicas: [
      "Diseño contemporáneo de alta privacidad",
      "Pintura horneada anticorrosiva grado arquitectónico",
      "Preparación oculta para automatización",
      "Jaladera tubular en acero inoxidable 304"
    ]
  },
  porton_laser: {
    id: "porton_laser",
    tipo: "porton",
    nombre: "Portón Corte Láser CNC",
    descripcionCorta: "Lámina de acero de alto calibre con cortes y geometrías computarizadas de precisión.",
    materiales: "Lámina de acero al carbón cal. 14/12 en CNC de fibra óptica, bastidor PTR 3\"x1.5\" reforzado.",
    precioMinM2: 2900,
    precioMaxM2: 3700,
    precioPromedioM2: 3300,
    tiempoEntregaDias: 18,
    garantiaAnos: 5,
    badge: "Diseño de Autor",
    caracteristicas: [
      "Patrón geométrico minimalista de alta precisión",
      "Estructura reforzada antivibración y antirrobo",
      "Fondo negro mate satinado con respaldo opcional",
      "Bisagras de uso rudo tipo bala con balero"
    ]
  },
  porton_mixto: {
    id: "porton_mixto",
    tipo: "porton",
    nombre: "Portón Minimalista Mixto",
    descripcionCorta: "Combinación cálida y resistente de acero estructural negro y teka sintética para exteriores.",
    materiales: "Acero estructural cal. 16 con acabado negro mate y duelas de WPC / teka sintética resistente a rayos UV.",
    precioMinM2: 3200,
    precioMaxM2: 4200,
    precioPromedioM2: 3700,
    tiempoEntregaDias: 20,
    garantiaAnos: 5,
    badge: "Estilo Premium",
    caracteristicas: [
      "Elegancia de madera natural sin mantenimiento de lijado ni barniz",
      "Resistencia total a lluvia, sol intenso y humedad",
      "Marco perimetral negro mate con soleras decorativas",
      "Cerradura de alta seguridad con pernos de acero"
    ]
  },

  // --- PÉRGOLAS ---
  pergola_estructural: {
    id: "pergola_estructural",
    tipo: "pergola",
    nombre: "Pérgola Estructural + Policarbonato",
    descripcionCorta: "Vigas estructurales de acero con cubierta de policarbonato alveolar y protección UV.",
    materiales: "Vigas tipo IPR / PTR de acero estructural 4\"x2\", policarbonato alveolar de 8mm o 10mm con perfil de unión en aluminio.",
    precioMinM2: 2200,
    precioMaxM2: 2900,
    precioPromedioM2: 2550,
    tiempoEntregaDias: 14,
    garantiaAnos: 5,
    badge: "Resistencia Máxima",
    caracteristicas: [
      "Filtración del 99% de radiación solar UV nociva",
      "Bajantes pluviales y canaletas integradas",
      "Estructura calculada para vientos fuertes y granizo",
      "Ambiente fresco y luminoso bajo la terraza"
    ]
  },
  pergola_cristal: {
    id: "pergola_cristal",
    tipo: "pergola",
    nombre: "Pérgola Premium + Cristal Templado",
    descripcionCorta: "Vigas de aluminio o acero pesado con cristal templado de seguridad de 9.5mm con película control solar.",
    materiales: "Estructura arquitectónica reforzada, cristal de seguridad templado de 9.5mm a 10mm, herrajes de acero inoxidable 316 y sellador estructural.",
    precioMinM2: 3800,
    precioMaxM2: 4900,
    precioPromedioM2: 4350,
    tiempoEntregaDias: 21,
    garantiaAnos: 10,
    badge: "Lujo Arquitectónico",
    caracteristicas: [
      "Cristal templado de seguridad de impacto de 9.5mm",
      "Claridad visual insuperable y estética contemporánea de lujo",
      "Herrajes articulados en acero inoxidable marino",
      "Resistencia a intemperie de más de 15 años"
    ]
  },
  pergola_bioclimatica: {
    id: "pergola_bioclimatica",
    tipo: "pergola",
    nombre: "Pérgola Bioclimática con Celosías",
    descripcionCorta: "Estructura con lamas y celosías contemporáneas orientables para control de sombra y ventilación.",
    materiales: "Aluminio extrusionado cal. pesado con lamas ajustables de diseño contemporáneo y fijación oculta.",
    precioMinM2: 3400,
    precioMaxM2: 4400,
    precioPromedioM2: 3900,
    tiempoEntregaDias: 18,
    garantiaAnos: 7,
    badge: "Ventilación & Confort",
    caracteristicas: [
      "Control térmico natural mediante circulación de aire",
      "Juego de sombras lineal contemporáneo",
      "Cero corrosión gracias al aluminio estructural",
      "Apta para integrar iluminación LED perimetral"
    ]
  }
};

// Opcionales y Accesorios
export const ACCESORIOS = {
  motor_electrico: {
    id: "motor_electrico",
    nombre: "Motor Eléctrico Automatizado (Merik / LiftMaster)",
    descripcion: "Kit de motor residencial de alta durabilidad, incluye 2 controles remotos de largo alcance e instalación profesional.",
    precioMin: 7500,
    precioMax: 8900,
    precioPromedio: 8200,
  },
  cerradura_digital: {
    id: "cerradura_digital",
    nombre: "Cerradura Digital Inteligente / WiFi",
    descripcion: "Apertura con huella dactilar, código numérico, tarjeta RFID o app móvil desde cualquier lugar.",
    precioMin: 2800,
    precioMax: 3900,
    precioPromedio: 3350,
  }
};

export interface OpcionesCotizacion {
  area_sqm: number;
  model_id: string;
  motor_electrico?: boolean;
  cerradura_digital?: boolean;
  incluye_visita?: boolean;
}

export interface ResultadoPresupuesto {
  modelo: ModeloDiseno;
  area_sqm: number;
  ancho_m?: number;
  alto_m?: number;
  precio_unitario_min: number;
  precio_unitario_promedio: number;
  precio_unitario_max: number;
  costo_base_min: number;
  costo_base_promedio: number;
  costo_base_max: number;
  adicionales_total_promedio: number;
  total_estimado_min: number;
  total_estimado_promedio: number;
  total_estimado_max: number;
  desglose: {
    materiales_porcentaje: number;
    fabricacion_pintura_porcentaje: number;
    instalacion_flete_porcentaje: number;
    subtotal_fabricacion_promedio: number;
    subtotal_accesorios_promedio: number;
    adicionales_seleccionados: Array<{
      id: string;
      nombre: string;
      precio: number;
    }>;
  };
  beneficios_incluidos: string[];
}

/**
 * Calcula el presupuesto paramétrico en base al área y opciones seleccionadas
 */
export function calcularPresupuestoEstimado(opciones: OpcionesCotizacion): ResultadoPresupuesto {
  const area = Math.max(1, Number(opciones.area_sqm) || 1);
  const modelo = CATALOGO_MODELOS[opciones.model_id] || CATALOGO_MODELOS["porton_duela"];

  const costoBaseMin = Math.round(area * modelo.precioMinM2);
  const costoBaseMax = Math.round(area * modelo.precioMaxM2);
  const costoBasePromedio = Math.round(area * modelo.precioPromedioM2);

  const adicionalesSeleccionados: Array<{ id: string; nombre: string; precio: number }> = [];
  let adicionalesTotalMin = 0;
  let adicionalesTotalPromedio = 0;
  let adicionalesTotalMax = 0;

  if (opciones.motor_electrico && modelo.tipo === "porton") {
    adicionalesTotalMin += ACCESORIOS.motor_electrico.precioMin;
    adicionalesTotalPromedio += ACCESORIOS.motor_electrico.precioPromedio;
    adicionalesTotalMax += ACCESORIOS.motor_electrico.precioMax;
    adicionalesSeleccionados.push({
      id: ACCESORIOS.motor_electrico.id,
      nombre: ACCESORIOS.motor_electrico.nombre,
      precio: ACCESORIOS.motor_electrico.precioPromedio,
    });
  }

  if (opciones.cerradura_digital) {
    adicionalesTotalMin += ACCESORIOS.cerradura_digital.precioMin;
    adicionalesTotalPromedio += ACCESORIOS.cerradura_digital.precioPromedio;
    adicionalesTotalMax += ACCESORIOS.cerradura_digital.precioMax;
    adicionalesSeleccionados.push({
      id: ACCESORIOS.cerradura_digital.id,
      nombre: ACCESORIOS.cerradura_digital.nombre,
      precio: ACCESORIOS.cerradura_digital.precioPromedio,
    });
  }

  const totalMin = costoBaseMin + adicionalesTotalMin;
  const totalPromedio = costoBasePromedio + adicionalesTotalPromedio;
  const totalMax = costoBaseMax + adicionalesTotalMax;

  return {
    modelo,
    area_sqm: Number(area.toFixed(2)),
    precio_unitario_min: modelo.precioMinM2,
    precio_unitario_promedio: modelo.precioPromedioM2,
    precio_unitario_max: modelo.precioMaxM2,
    costo_base_min: totalMin - adicionalesTotalMin,
    costo_base_promedio: costoBasePromedio,
    costo_base_max: costoBaseMax,
    adicionales_total_promedio: adicionalesTotalPromedio,
    total_estimado_min: totalMin,
    total_estimado_promedio: totalPromedio,
    total_estimado_max: totalMax,
    desglose: {
      materiales_porcentaje: 60,
      fabricacion_pintura_porcentaje: 25,
      instalacion_flete_porcentaje: 15,
      subtotal_fabricacion_promedio: costoBasePromedio,
      subtotal_accesorios_promedio: adicionalesTotalPromedio,
      adicionales_seleccionados: adicionalesSeleccionados,
    },
    beneficios_incluidos: [
      "Visita técnica de calibración de medidas sin costo en León, Gto.",
      "Fabricación con soldadura microalambre y desbaste fino",
      "Pintura de fondo anticorrosivo y esmalte automotriz/electrostático",
      "Instalación y nivelación por herreros calificados",
      `Garantía por escrito de ${modelo.garantiaAnos} años en estructura`,
    ],
  };
}
