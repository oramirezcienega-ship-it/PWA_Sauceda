import type { CotizacionModularData } from "./types";

export const PLANTILLA_PERGOLA_AZOTEA_3X3: CotizacionModularData = {
  plantillaKey: "pergola_azotea_3x3",
  titulo: "Pérgola de azotea 3 × 3 m",
  descripcion:
    "Techumbre metálica apoyada en los dos muros existentes, con un solo poste en la esquina libre. Incluye fabricación, traslado, anclaje e instalación. El precio base cubre la estructura terminada y pintada; la cubierta y el recubrimiento inferior se cotizan aparte para que elijas el nivel de acabado.",
  dimensiones: {
    titulo: "Ficha Técnica",
    superficieM2: 9.0,
    alturaLibreM: 1.95,
    postes: 1,
    plazoDiasHabiles: 5,
    garantiaMeses: 12,
  },
  estructuraBase: {
    titulo: "Estructura metálica terminada",
    subtitulo: "PARTIDA 1 — ESTRUCTURA (OBLIGATORIA)",
    precio: 23500,
    detalles: [
      'Largueros de apoyo en los dos muros, PTR 4" × 2" calibre 14, anclados con ancla química de 1/2" a cada 60 cm.',
      'Dos vigas perimetrales en los bordes libres, PTR 4" × 2" calibre 14, con claros de 2.20 y 1.95 m en vigueta.',
      'Poste único de PTR 4" × 4" calibre 11 con placa base de 1/4", cuatro anclas y cartabones de refuerzo.',
      'Cinco largueros de cubierta PTR 2" × 1½" a cada 55 cm, listos para recibir cualquiera de las cubiertas.',
      "Limpieza, primer anticorrosivo y dos manos de esmalte negro mate.",
      "Sellado de todos los anclajes con poliuretano y limpieza del área al terminar.",
    ],
    nota: "La estructura sola es plenamente funcional como pérgola de sombra parcial. No confiere protección de la lluvia.",
  },
  gruposOpciones: [
    {
      id: "cubierta",
      titulo: "Cubierta superior",
      tipo: "radio",
      notaPie:
        "Las tres opciones van selladas contra los dos muros, con caídas hacia el frente y botagua contra derrames posteriores.",
      opciones: [
        {
          id: "sin_cubierta",
          nombre: "Sin cubierta",
          descripcion: "Solo estructura: sombra parcial, sin protección de lluvia.",
          precio: 0,
          incluido: true,
        },
        {
          id: "lamina_pintro",
          nombre: "Lámina pintro calibre 26",
          descripcion: "La opción más económica. Detiene el agua, pero calienta y hace ruido al llover.",
          precio: 7500,
        },
        {
          id: "policarbonato_10mm",
          nombre: "Policarbonato celular 10 mm",
          descripcion: "Deja pasar la luz natural, filtra los rayos ultravioleta, protege la estancia.",
          precio: 11400,
        },
        {
          id: "multipanel_1pulg",
          nombre: 'Lámina Multipanel 1"',
          descripcion: "Aísla calor y ruido. Es la que recomendamos para uso todo el año.",
          precio: 13800,
          recomendado: true,
        },
      ],
    },
    {
      id: "recubrimiento",
      titulo: "Recubrimiento inferior",
      tipo: "radio",
      notaPie: "El recubrimiento inferior viste la estructura y oculta los anclajes de la cubierta.",
      opciones: [
        {
          id: "sin_plafon",
          nombre: "Sin plafón",
          descripcion: "Quedan a la vista los largueros pintados de negro, acabado industrial moderno.",
          precio: 0,
          incluido: true,
        },
        {
          id: "panel_pvc",
          nombre: "Plafón panel PVC blanco",
          descripcion: "Limpio al tacto, resistente a la humedad, fácil de limpiar.",
          precio: 7800,
        },
        {
          id: "wpc_madera",
          nombre: "Plafón WPC imitación madera",
          descripcion: "El acabado de la referencia: aspecto cálido, elegante y contemporáneo.",
          precio: 10300,
          recomendado: true,
        },
      ],
    },
  ],
  complementos: [
    {
      id: "iluminacion",
      nombre: "Iluminación empotrada",
      descripcion: "Tubos conduit, 4 spots LED embutidos en plafón, más interruptor de pared.",
      precio: 4600,
    },
    {
      id: "ganar_altura",
      nombre: "Perfil para ganar altura",
      descripcion: "Sube la estructura 25 cm sobre la cornisa de los muros y lleva la altura libre de 1.95 a 2.20 m.",
      precio: 2900,
    },
    {
      id: "pintura_electrostatica",
      nombre: "Pintura electrostática",
      descripcion: "Acabado de mayor durabilidad en lugar de esmalte. Tono mate, sin requerir retoque anual.",
      precio: 5600,
    },
  ],
  presets: [
    {
      id: "esencial",
      nombre: "Paquete esencial",
      opciones: {
        cubierta: "lamina_pintro",
        recubrimiento: "sin_plafon",
      },
      complementos: [],
    },
    {
      id: "recomendado",
      nombre: "Paquete recomendado",
      opciones: {
        cubierta: "multipanel_1pulg",
        recubrimiento: "wpc_madera",
      },
      complementos: [],
      recomendado: true,
    },
    {
      id: "premium",
      nombre: "Paquete premium",
      opciones: {
        cubierta: "multipanel_1pulg",
        recubrimiento: "wpc_madera",
      },
      complementos: ["iluminacion", "pintura_electrostatica"],
    },
  ],
  condiciones: {
    anticipo: "65% a la firma para compra de material, el saldo contra entrega.",
    plazo: "5 días hábiles a partir del anticipo: 3 de taller y 2 de obra.",
    garantia: "12 meses en estructura y soldadura; 24 meses en estanqueidad de la cubierta.",
    precios: "En pesos mexicanos, sin IVA. Sujetos a revisión después de la vigencia por variación de acero.",
    notaLegal:
      "No incluye retiro de impermeabilizante previo ni resanes si se detecta que los muros no tienen dala estructural; en caso necesario se cotiza por separado antes de iniciar.",
  },
};

export const PLANTILLAS_MODULARES_DISPONIBLES: Record<string, { nombre: string; descripcion: string; data: CotizacionModularData }> = {
  pergola_azotea_3x3: {
    nombre: "Pérgola de azotea 3 × 3 m",
    descripcion: "Estructura PTR con opciones de cubierta (Pintro/Poli/Multipanel), plafón y complementos.",
    data: PLANTILLA_PERGOLA_AZOTEA_3X3,
  },
};
