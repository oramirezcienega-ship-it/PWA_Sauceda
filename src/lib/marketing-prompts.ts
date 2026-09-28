/**
 * Catálogo Parametrizado de Prompts y Creativos de Marketing por Línea de Negocio - SAUCEDA
 * 
 * Este módulo centraliza las especificaciones técnicas fotográficas, reglas de composición,
 * ganchos comerciales y variaciones escénicas para generar anuncios de alto impacto con IA (Flux / Replicate / n8n)
 * para todas las líneas de negocio de Sauceda en León, Guanajuato.
 */

export interface VariacionEscenica {
  id: string;
  nombre: string;
  descripcionEsp: string;
  promptIngles: string;
}

export interface CategoriaMarketingParametrizada {
  id: string;
  nombre: string;
  lineaNegocio: "Sauceda Construye" | "Sauceda Bienes Raíces";
  icono: string;
  palabrasClave: string[];
  ofertaPrincipal: string;
  ganchosComerciales: string[];
  elementosPermitidos: string[];
  elementosProhibidos: string[];
  variaciones: VariacionEscenica[];
}

/**
 * Catálogo maestro de categorías de negocio parametrizadas para generación de anuncios y creativos fotográficos.
 */
export const CATALOGO_CATEGORIAS_MARKETING: Record<string, CategoriaMarketingParametrizada> = {
  pintura: {
    id: "pintura",
    nombre: "Pintura y Mantenimiento del Hogar (Fachadas e Interiores)",
    lineaNegocio: "Sauceda Construye",
    icono: "🎨",
    palabrasClave: [
      "pintura", "pintar", "pintores", "esmalte", "vinilica", "vinílica",
      "brocha", "rodillo", "mantenimiento del hogar", "mantenimiento integral",
      "resane", "sellador", "acabados de pintura", "fachada renovada"
    ],
    ofertaPrincipal: "Pintura vinílica lavable y esmalte anticorrosivo para fachadas e interiores con preparación y resane profesional.",
    ganchosComerciales: [
      "¿Tu casa se ve envejecida o sin vida? Dale un cambio radical con pintura profesional para fachadas que dura años.",
      "Muros agrietados o pintura botada: renovación total con pintura vinílica lavable de alta duración.",
      "Protege y embellece tu hogar en León Gto con mano de obra calificada y acabados limpios garantizados."
    ],
    elementosPermitidos: [
      "Mexican house painters in clean white and navy work uniforms",
      "Professional paint rollers with extension poles",
      "Precision trim brushes",
      "Clean canvas drop cloths protecting walkways",
      "Sturdy aluminum extension ladders",
      "Smooth stucco modern facade in warm neutrals (sand-white, soft terracotta, warm beige)",
      "Bright natural morning sunlight in León Guanajuato"
    ],
    elementosProhibidos: [
      "blowtorch", "flame", "roofing torch", "tar", "asphalt rolls", "manto",
      "messy paint drips", "spilled paint", "distorted ladders", "text", "watermarks", "logos", "labels"
    ],
    variaciones: [
      {
        id: "fachada_general",
        nombre: "Fachada Exterior Residencial Completa",
        descripcionEsp: "Dos pintores profesionales con uniforme limpio aplicando pintura exterior satinada a una casa residencial moderna en León Gto con rodillo y brocha de corte fino.",
        promptIngles: "Two skilled Mexican house painters in clean white and navy work uniforms meticulously applying premium satin exterior architectural paint in warm contemporary neutral tones (sand-white and subtle terracotta accent) to the exterior smooth stucco walls of a modern two-story Mexican residence. One painter skillfully uses a professional paint roller with an extension pole, and the other does crisp edge cutting with a precision trim brush. Clean canvas drop cloths neatly protecting the paved walkway, professional aluminum ladder standing steadily. Crisp architectural lines, bright natural morning sunlight, crystal clear azure sky, shot on Hasselblad H6D-100c, 35mm lens, f/4, pristine craftsmanship, authentic textures of fresh smooth paint and fine stucco, 8k resolution."
      },
      {
        id: "detalle_recorte_molduras",
        nombre: "Detalle de Recorte Fino y Acabado de Molduras",
        descripcionEsp: "Pintor calificado sobre escalera de aluminio realizando corte limpio perimetral con brocha de precisión en molduras y marcos de ventana.",
        promptIngles: "Close-up commercial editorial shot of an expert Mexican painter in a spotless branded navy work vest and safety eyewear, steadily applying a crisp, razor-sharp edge of charcoal gray accent paint along the window frame molding of a sunny modern home. In the background, immaculate warm off-white stucco facade glows in natural golden sunlight. Professional aluminum ladder, clean precision sash brush, razor-sharp cut lines, realistic fine textures of fresh paint film, shot on Sony A7R V, 50mm f/2.8, magazine editorial quality, 8k resolution."
      },
      {
        id: "transformacion_luminosa",
        nombre: "Renovación Luminosa de Muros Exteriores",
        descripcionEsp: "Técnico pintor aplicando recubrimiento protector con rodillo en muro principal de cochera con acabados limpios y piso protegido.",
        promptIngles: "Commercial architectural photography of a professional Mexican painter evenly rolling high-opacity weather-resistant exterior paint across a wide residential facade wall. Crisp drop cloths covering the driveway, modern potted agaves, sunny León Guanajuato residential neighborhood, bright natural daylight, razor-sharp paint texture, authentic craftsmanship, shot on Hasselblad H6D-100c, 35mm lens, f/4, 8k resolution."
      }
    ]
  },

  herreria: {
    id: "herreria",
    nombre: "Herrería Residencial y Comercial (Portones y Barandales)",
    lineaNegocio: "Sauceda Construye",
    icono: "⚒️",
    palabrasClave: [
      "herreria", "herrería", "porton", "portón", "portones", "barandal",
      "barandales", "proteccion", "protección", "protecciones", "zaguan", "zaguán",
      "reja", "techumbre", "estructura metalica", "estructura metálica", "canceleria", "cancelería"
    ],
    ofertaPrincipal: "Portones modernos automatizados, protecciones de seguridad y barandales contemporáneos fabricados a la medida.",
    ganchosComerciales: [
      "¿Buscas seguridad y elegancia para tu familia? Portones modernos de herrería automatizados fabricados a la medida.",
      "Moderniza la fachada de tu casa con herrería residencial de diseño minimalista y máxima durabilidad.",
      "Protecciones de herrería y portones eléctricos en León Gto: cotización a domicilio sin costo."
    ],
    elementosPermitidos: [
      "Bespoke custom-fabricated matte dark charcoal gray steel automatic garage gate",
      "Minimalist horizontal louvers",
      "Integrated warm LED accent strip lights",
      "Matching black steel security window grilles and balcony railings",
      "Travertine or cantera stone cladding",
      "Desert succulent planters",
      "Paved modern driveway in sunny León Guanajuato"
    ],
    elementosProhibidos: [
      "blowtorch roofing", "paint rollers on walls", "rusted metal", "bent bars",
      "welding sparks covering whole screen", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "porton_automatizado_cochera",
        nombre: "Portón Automatizado con Louvers y LED",
        descripcionEsp: "Portón moderno de herrería en acero gris carbón mate con louvers horizontales y luces LED cálidas integradas en cochera residencial.",
        promptIngles: "Architectural luxury editorial photography of a modern Mexican residential home entrance in sunny León Guanajuato. A bespoke custom-fabricated matte dark charcoal gray steel automatic garage gate with minimalist horizontal louvers and subtle warm integrated LED accent lights. Beautiful matching black steel security window grilles and contemporary balcony railings. Clean travertine stone cladding, landscaped succulent planters, bright natural daylight, clear blue sky, shot on Hasselblad H6D-100c, 35mm f/4, crisp realistic metal craftsmanship, razor-sharp details, 8k resolution."
      },
      {
        id: "conjunto_fachada_herreria",
        nombre: "Conjunto Completo de Portón, Protecciones y Barandales",
        descripcionEsp: "Fachada residencial completa mostrando la armonía entre portón vehicular, puerta peatonal y barandales minimalistas de acero negro.",
        promptIngles: "Wide commercial architectural photograph of an elegant contemporary two-story home in León Guanajuato featuring complete architectural metalwork. A flush black steel sectional electric gate, a matching pedestrian entry door with smart digital handle, and slender black steel terrace guardrails. Warm sand stucco walls, paved stamped concrete driveway, bright natural afternoon light, razor-sharp details of metal fabrication, shot on Hasselblad H6D-100c, 35mm lens, f/4, 8k resolution."
      },
      {
        id: "detalle_artesano_instalacion",
        nombre: "Maestro Herrero Instalando Portón Residencial",
        descripcionEsp: "Instalador mexicano profesional verificando la alineación y cierre suave del sistema corredizo automatizado.",
        promptIngles: "Editorial documentary craftsmanship shot of a skilled Mexican steel fabricator in clean protective workwear and helmet adjusting the smooth track of a newly installed matte black architectural steel gate. Crisp residential exterior setting, bright sunny day in León Guanajuato, precise engineering, clean authentic setting, shot on Sony A7R V, 35mm f/2.8, 8k resolution."
      }
    ]
  },

  concreto_estampado: {
    id: "concreto_estampado",
    nombre: "Concreto y Pisos Estampados Decorativos",
    lineaNegocio: "Sauceda Construye",
    icono: "🧱",
    palabrasClave: [
      "estampado", "piso estampado", "concreto estampado", "moldes", "molde",
      "estampados", "piso decorativo", "acabado piedra", "piedra laja", "adoquín", "adoquin", "sellador"
    ],
    ofertaPrincipal: "Pisos decorativos de concreto estampado para cocheras, terrazas y patios con acabado tipo piedra laja y sellador acrílico brillante.",
    ganchosComerciales: [
      "Olvídate del piso gris y aburrido: transforma tu cochera con concreto estampado imitación piedra laja de alta durabilidad.",
      "Pisos de concreto estampado para cocheras y terrazas en León Gto: resistentes, elegantes y fáciles de limpiar.",
      "Dale plusvalía inmediata a tu casa con concreto estampado decorativo resistente al tráfico pesado."
    ],
    elementosPermitidos: [
      "Pristine newly poured stamped concrete driveway or patio",
      "Natural ashlar slate stone or cobblestone embossed texture",
      "Subtle charcoal and warm terracotta highlights",
      "Semi-gloss wet-look protective sealer reflecting sunlight",
      "Flanked by modern Mexican architecture and manicured palm planters"
    ],
    elementosProhibidos: [
      "blowtorch", "roofing technician", "cracked broken concrete", "unfinished mud puddles",
      "paint rollers on walls", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "cochera_piedra_laja",
        nombre: "Cochera Residencial con Acabado Piedra Laja",
        descripcionEsp: "Cochera de residencia contemporánea con piso de concreto estampado textura piedra laja y sellador brillante bajo el sol de León Gto.",
        promptIngles: "Award-winning commercial architectural photography of a luxury residential driveway in sunny León Guanajuato. A pristine, newly poured stamped concrete driveway featuring rich natural slate stone ashlar texture with subtle charcoal and warm terracotta highlights. Semi-gloss wet-look protective sealer reflecting brilliant afternoon sunlight. Flanked by modern Mexican architecture, manicured ornamental palms, crisp realistic textures of embossed stone patterns, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, 8k resolution."
      },
      {
        id: "patio_terraza_social",
        nombre: "Terraza Social con Concreto Estampado Adoquín",
        descripcionEsp: "Patio y terraza social exterior con piso estampado tipo adoquín europeo, pérgola moderna y área de asador.",
        promptIngles: "Editorial outdoor living architectural photography of a private backyard terrace in León Guanajuato paved with rich embossed stamped concrete in a European cobblestone pattern. Warm earth tones, subtle glossy protective sealer, contemporary steel pergola with hanging lights, stylish modern patio furniture, warm golden hour sunlight, shot on Sony A7R V, 35mm f/2.8, magazine quality, 8k resolution."
      },
      {
        id: "proceso_estampado_artesanos",
        nombre: "Cuadrilla Estampando y Aplicando Molde Texturizado",
        descripcionEsp: "Cuadrilla de técnicos nivelando y aplicando moldes de textura con desmoldante de color sobre firme fresco.",
        promptIngles: "Dynamic commercial craftsmanship photograph of skilled Mexican concrete finishers in safety boots and high-vis vests pressing large textured polyurethane stone imprint stamps onto fresh smooth concrete. Visible release agent powder highlighting natural slate clefts, bright daylight in León Guanajuato, razor-sharp textures of embossing, authentic craftsmanship, shot on Hasselblad H6D-100c, 35mm lens, f/4, 8k resolution."
      }
    ]
  },

  concreto_premezclado: {
    id: "concreto_premezclado",
    nombre: "Concreto Premezclado y Colado de Losas",
    lineaNegocio: "Sauceda Construye",
    icono: "🚛",
    palabrasClave: [
      "concreto premezclado", "premezclado", "colado", "colados", "losa", "losas",
      "firme", "firmes", "zapata", "trompo", "revolvedora", "camion de concreto", "camión de concreto", "suministro de concreto"
    ],
    ofertaPrincipal: "Suministro directo de concreto premezclado certificado para losas, firmes y pisos industriales con colado en obra.",
    ganchosComerciales: [
      "Colado seguro y sin retrasos: concreto premezclado certificado con entrega puntual en obra en León Gto.",
      "Resistencia garantizada para tus losas y firmes con concreto premezclado directo de planta.",
      "Ahorra tiempo y mano de obra colando con concreto premezclado Sauceda Construye."
    ],
    elementosPermitidos: [
      "Clean modern concrete mixer truck chute delivering smooth pre-mixed concrete",
      "Reinforced steel rebar grid foundation slab",
      "Mexican construction builders in high-vis vests, hardhats, and rubber boots",
      "Screed boards and aluminum bull floats leveling wet concrete",
      "Bright natural daylight on construction site in León Guanajuato"
    ],
    elementosProhibidos: [
      "blowtorch on rooftop", "living room couch", "paint rollers", "office desk",
      "collapsed forms", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "vaciado_canaleta_losa",
        nombre: "Vaciado por Canaleta a Losa de Cimentación",
        descripcionEsp: "Camión revolvedora vaciando concreto premezclado fluido por canaleta hacia una losa armada con albañiles nivelando.",
        promptIngles: "Dynamic crisp industrial architectural photography of a modern residential construction site in sunny León Guanajuato. A clean modern concrete mixer truck chute delivering smooth, high-grade ready-mixed concrete onto a reinforced foundation slab. Mexican construction craftsmen in clean high-visibility safety vests, boots, and hardhats skillfully leveling the wet concrete surface with screed boards and aluminum floats. Bright golden daylight, sharp realistic textures of aggregate, wet concrete, and rebar, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, 8k resolution."
      },
      {
        id: "nivelado_acabado_firme",
        nombre: "Nivelado y Pulido de Firme con Regla y Llana",
        descripcionEsp: "Albañiles calificados pasando regla vibratoria y llana flotadora para dejar un firme de concreto perfectamente plano.",
        promptIngles: "Crisp commercial action photography of two Mexican concrete workers in safety gear expertly pulling a long magnesium screed board across fresh freshly poured ready-mix concrete on a residential floor slab. Smooth reflective wet concrete surface, aggregate details, bright blue sky, sunny day in León Guanajuato, authentic construction site, shot on Sony A7R V, 35mm lens, f/4, 8k resolution."
      }
    ]
  },

  mantenimiento_cisternas: {
    id: "mantenimiento_cisternas",
    nombre: "Mantenimiento, Lavado y Desinfección de Cisternas y Tinacos",
    lineaNegocio: "Sauceda Construye",
    icono: "💧",
    palabrasClave: [
      "cisterna", "cisternas", "aljibe", "aljibes", "tinaco", "tinacos",
      "lavado de cisterna", "limpieza de cisterna", "desinfeccion de cisterna",
      "desinfección de cisterna", "lavado de aljibe", "limpieza de aljibe",
      "lavado de tinaco", "limpieza de tinaco", "agua limpia", "sarro en cisterna",
      "fuga en cisterna", "bomba de agua", "deposito de agua", "depósito de agua"
    ],
    ofertaPrincipal: "Lavado profundo con hidrolavadora, desinfección bactericida de grado alimenticio y sellado impermeable para cisternas, aljibes y tinacos.",
    ganchosComerciales: [
      "¿Cuándo fue la última vez que lavaste tu cisterna? Protege la salud de tu familia con agua 100% limpia y desinfectada.",
      "Elimina sarro, sedimentos y bacterias con nuestro servicio profesional de lavado profundo y desinfección de cisternas y aljibes.",
      "Mantenimiento preventivo, sellado de fugas y revisión de bombas en depósitos de agua en León, Gto."
    ],
    elementosPermitidos: [
      "Spotless clean concrete cistern interior with crystal clear water reflections",
      "Professional service technician in protective clean white suit and waterproof boots",
      "High-pressure wash equipment and specialized eco-friendly sanitizing tools",
      "Bright task illumination inside clean cistern or rooftop modern water storage tank",
      "Sunny rooftop or clean modern patio in León Guanajuato"
    ],
    elementosProhibidos: [
      "dirty muddy sludge", "contaminants", "toxic smoke", "blowtorch", "flames", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "cisterna_limpia_cristalina",
        nombre: "Cisterna Residencial Profundamente Limpia con Agua Cristalina",
        descripcionEsp: "Interior de cisterna o aljibe de concreto impecablemente limpio y desinfectado, con agua cristalina y luz cenital cálida.",
        promptIngles: "Award-winning commercial architectural photography of a pristine, freshly sanitized and sealed residential underground concrete cistern in León Guanajuato. Crystal-clear pure water with gentle ripples reflecting clean bright LED inspection light. Impeccable smooth sealed concrete walls with zero algae, zero sediment, pure pristine hygiene and safety. Flawless craftsmanship, shot on Hasselblad H6D-100c, 28mm lens, f/4, editorial magazine quality, 8k resolution."
      },
      {
        id: "tecnico_lavado_hidrolavadora",
        nombre: "Técnico Profesional Realizando Lavado y Desinfección",
        descripcionEsp: "Técnico calificado con equipo de protección y bota impermeable realizando hidrolavado a presión en aljibe residencial.",
        promptIngles: "Dynamic commercial photography of a professional Mexican service technician in a clean protective work jumpsuit, waterproof rubber boots, and safety eyewear, skillfully operating high-pressure washing equipment to sanitize the clean walls of a residential water storage cistern. Fine water mist catch in bright warm sunlight, pristine clean environment, high safety standards, shot on Sony A7R V, 35mm f/2.8, authentic craftsmanship, 8k resolution."
      },
      {
        id: "tinaco_azotea_moderno",
        nombre: "Mantenimiento y Conexiones de Tinaco en Azotea Residencial",
        descripcionEsp: "Mantenimiento integral de tinaco y sistema de bombeo en azotea limpia y moderna bajo el cielo azul de León Gto.",
        promptIngles: "Commercial architectural editorial photography of a modern, clean rooftop residential water storage tank (tinaco) with brand-new brass valves, pristine hydraulic PVC plumbing, and pump system in León Guanajuato. Clean waterproofed rooftop surface, bright morning sun, azure sky, pristine residential neighborhood, crisp clean craftsmanship, shot on Hasselblad H6D-100c, 35mm lens, f/4, 8k resolution."
      }
    ]
  },

  impermeabilizacion: {
    id: "impermeabilizacion",
    nombre: "Impermeabilización Profesional con Soplete y Manto Asfáltico",
    lineaNegocio: "Sauceda Construye",
    icono: "☔",
    palabrasClave: [
      "impermeabilizacion", "impermeabilización", "impermeabilizante", "impermeabilizar",
      "manto prefabricado", "manto asfaltico", "manto asfáltico", "soplete", "termofusion", "termofusión",
      "gotera", "goteras", "filtracion", "filtración", "humedad en techo", "azotea"
    ],
    ofertaPrincipal: "Impermeabilización profesional con rollo de membrana asfáltica prefabricada con gravilla blanca termo-fusionada con soplete. $210/m² con 5 a 10 años de garantía por escrito.",
    ganchosComerciales: [
      "Antes de que la lluvia dañe tus muebles y techos: impermeabilización profesional con soplete y garantía de hasta 10 años.",
      "¡No más goteras ni humedad! Sistema prefabricado termo-fusionado a $210/m² instalado en 1 día.",
      "Garantía por escrito de 5 a 10 años en impermeabilización de azoteas en León Gto."
    ],
    elementosPermitidos: [
      "Skilled Mexican roofing technician in clean navy blue workwear, heat-resistant gloves, and helmet",
      "Heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules",
      "Long propane gas blowtorch wand with bright controlled orange and blue flame melting bottom asphalt",
      "Visible red propane cylinder tank with hose nearby",
      "Flat concrete roof deck in sunny León Guanajuato",
      "Finished roof surface covered in clean neat parallel white mineral granule sheets reflecting sunlight"
    ],
    elementosProhibidos: [
      "paint rollers", "liquid acrylic paint in buckets", "brooms", "lawn rollers",
      "swimming pools on roof", "beer bottles", "messy tar buckets", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "termofusion_soplete_rollo",
        nombre: "Aplicación Termo-fusionada con Soplete y Membrana Blanca",
        descripcionEsp: "Técnico en uniforme azul aplicando rollo de membrana asfáltica con gravilla blanca usando soplete a flama controlada sobre losa plana.",
        promptIngles: "Award-winning commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato. A skilled Mexican roofing technician in clean navy blue workwear, protective heat-resistant gloves, and safety helmet, precisely applying a heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules. He operates a long propane gas blowtorch wand with a bright controlled orange and blue flame, heating and melting the bottom asphalt layer as the roll unrolls seamlessly onto the primed flat concrete roof deck. Visible red propane cylinder tank with hose nearby. In the background, the pristine finished roof surface is covered in clean, neat parallel sheets of white mineral granules reflecting bright natural sunlight. Clear blue sky, crisp architectural lines, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, crisp realistic textures, 8k resolution."
      },
      {
        id: "azotea_terminada_panoramica",
        nombre: "Azotea Residencial Completamente Protegida y Blanca",
        descripcionEsp: "Vista panorámica de una azotea residencial terminada en impecables lienzos de gravilla blanca reflectiva bajo el sol.",
        promptIngles: "Wide commercial architectural photograph of an expansive flat residential rooftop in sunny León Guanajuato, completely sealed and finished with neat, parallel rolls of white mineral granule waterproofing membrane. Crisp clean parapet walls, brilliant white reflective surface gleaming under bright midday sunlight, panoramic view of the clear blue sky and city skyline in background, shot on Hasselblad H6D-100c, 28mm lens, f/5.6, immaculate professional workmanship, 8k resolution."
      },
      {
        id: "detalle_sellado_traslape",
        nombre: "Detalle de Sellado Térmico en Traslapes y Pretiles",
        descripcionEsp: "Técnico sellando herméticamente el traslape lateral de la membrana con espátula y flama de soplete.",
        promptIngles: "Close-up craftsmanship photograph of a professional roofing technician sealing the 10cm overlap seam of a white mineral granule waterproofing membrane roll with a precision trowel and warm flame. Clean tight bond, asphalt bleed-out neatly pressed, red propane hose in background, bright natural sunlight in León Guanajuato, razor-sharp detail of granule textures, shot on Sony A7R V, 50mm f/2.8, 8k resolution."
      }
    ]
  },

  traspasos_infonavit: {
    id: "traspasos_infonavit",
    nombre: "Traspasos INFONAVIT / FOVISSSTE y Compra Directa de Contado",
    lineaNegocio: "Sauceda Bienes Raíces",
    icono: "🏠",
    palabrasClave: [
      "traspaso", "traspasos", "infonavit", "fovissste", "compra de casa", "comprar casa de contado",
      "compra directa", "compra rápida", "casa con deuda", "deudas infonavit", "agiotista",
      "trámite infonavit", "tramite infonavit", "adeudo hipotecario", "vender casa"
    ],
    ofertaPrincipal: "Traspaso legal y seguro de tu casa INFONAVIT con pago de contado y cancelación de deuda ante notario.",
    ganchosComerciales: [
      "¿Tienes una casa con deudas o que ya no puedes pagar en León? Traspaso seguro con pago de contado.",
      "Traspasa tu casa INFONAVIT sin riesgos ni agiotistas: resolvemos tu trámite ante notario público.",
      "Te compramos tu casa de contado aunque tenga adeudos o esté deshabitada. Trámite transparente."
    ],
    elementosPermitidos: [
      "Professional Mexican real estate advisor in clean business casual attire",
      "Warm consultation with a smiling young Mexican couple over an executive property folder",
      "Polished light wood or white executive meeting table",
      "Bright natural daylight streaming through floor-to-ceiling glass windows",
      "Minimalist contemporary Mexican living room or modern real estate office in León Guanajuato",
      "Lush courtyard or green plants in background"
    ],
    elementosProhibidos: [
      "blowtorch", "roofing roll", "construction mud", "dark dingy office",
      "distorted fingers", "fake money piles", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "asesoria_sala_moderna",
        nombre: "Asesoría Cálida en Sala Residencial",
        descripcionEsp: "Asesor inmobiliario en ropa ejecutiva casual explicando el expediente de traspaso a una pareja joven sonriente en sala luminosa.",
        promptIngles: "High-end interior architectural photography of a sunny, contemporary Mexican residential living room in León Guanajuato. A professional Mexican real estate advisor in clean business casual attire warmly consulting with a smiling young couple over an executive property folder on a polished wood table. Natural daylight streaming through floor-to-ceiling glass windows, minimalist modern Mexican decor, lush courtyard in background, shot on Sony A7R V, 35mm f/2.8, magazine editorial quality, trustworthy atmosphere, 8k resolution."
      },
      {
        id: "cierre_notarial_exitoso",
        nombre: "Firma y Entrega Exitosa de Documentación",
        descripcionEsp: "Asesor entregando carpeta ejecutiva y llaves a clientes satisfechos en oficina luminosa con vista urbana de León.",
        promptIngles: "Commercial editorial photograph of a professional Mexican real estate advisor warmly shaking hands with a relieved smiling client in a bright, modern glass-walled consultation office in León Guanajuato. Clean executive desk with neat documents in a navy folder and bronze house keys, bright natural daylight, crisp corporate atmosphere, shot on Hasselblad H6D-100c, 50mm lens, f/2.8, premium editorial quality, 8k resolution."
      }
    ]
  },

  expediente_infonavit: {
    id: "expediente_infonavit",
    nombre: "Gestión y Armado de Expediente INFONAVIT (Trato Directo)",
    lineaNegocio: "Sauceda Bienes Raíces",
    icono: "📂",
    palabrasClave: [
      "expediente", "armado de expediente", "trato directo", "asesoria infonavit", "asesoría infonavit",
      "tramite directo", "gestión infonavit", "gestion infonavit", "dictamen tecnico", "avaluo", "avalúo"
    ],
    ofertaPrincipal: "Armamos y gestionamos tu expediente INFONAVIT completo cuando ya tienes comprador o vendedor directo sin comisiones excesivas.",
    ganchosComerciales: [
      "¿Ya encontraste comprador para tu casa pero el papeleo de INFONAVIT te tiene atorado? Nosotros armamos tu expediente.",
      "Trato directo sin vueltas: tramitamos tu crédito INFONAVIT de principio a fin hasta la firma en notaría.",
      "Evita fraudes y rechazos de crédito: gestión profesional de expediente INFONAVIT en León Gto."
    ],
    elementosPermitidos: [
      "Professional real estate consultant reviewing organized executive folders and architectural floor plans",
      "Bright modern office in León Guanajuato",
      "High quality documents, executive pen, tablet device",
      "Warm confident Mexican clients smiling",
      "Natural window light"
    ],
    elementosProhibidos: [
      "blowtorch", "concrete mixer", "messy paper clutter", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "revision_documental_mesa",
        nombre: "Revisión Profesional de Expediente en Mesa de Trabajo",
        descripcionEsp: "Asesora experta revisando checklist de expediente INFONAVIT con cliente frente a computadora y carpetas organizadas.",
        promptIngles: "High-end corporate commercial photography of an expert Mexican mortgage consultant in a well-lit modern office in León Guanajuato reviewing an organized property checklist and folder with an attentive client. Crisp white desk, laptop, neat document folders, warm natural daylight through large windows, confident and professional mood, shot on Sony A7R V, 35mm f/2.8, 8k resolution."
      }
    ]
  },

  catalogo_inmuebles: {
    id: "catalogo_inmuebles",
    nombre: "Venta de Casas y Catálogo Inmobiliario (Listas para Habitar)",
    lineaNegocio: "Sauceda Bienes Raíces",
    icono: "🏡",
    palabrasClave: [
      "venta de casa", "casas en venta", "catalogo", "catálogo", "comprar casa", "estrena casa",
      "vivienda en venta", "credito infonavit", "crédito infonavit", "credito fovissste", "credito bancario"
    ],
    ofertaPrincipal: "Casas listas para habitar en León Gto con créditos INFONAVIT, FOVISSSTE o bancarios.",
    ganchosComerciales: [
      "¡Estrena casa en León Gto! Conoce nuestro catálogo de viviendas listas para habitar aceptando tu crédito INFONAVIT.",
      "Deja de pagar renta: casas de 2 y 3 recámaras en las mejores zonas de León.",
      "Tu nuevo hogar te espera: asesoría gratuita para ejercer tu crédito INFONAVIT o bancario sin costo."
    ],
    elementosPermitidos: [
      "Exquisite modern Mexican residential home exterior in sunny León Guanajuato",
      "Contemporary two-story house facade with clean geometric lines",
      "Warm sand stucco, natural oak wood slats, black-framed picture windows",
      "Landscaped front entrance with desert agave planters and recessed lighting",
      "Pristine paved driveway, bright sunny morning light, clear azure sky"
    ],
    elementosProhibidos: [
      "blowtorch", "roofing roll", "construction scaffolding", "dirty sidewalks",
      "for sale signs with text", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "fachada_casa_estrenar",
        nombre: "Fachada Exterior de Casa Nueva en Venta",
        descripcionEsp: "Hermosa fachada frontal de casa de dos pisos contemporánea con jardín delantero, cochera techada y cielo azul en León Gto.",
        promptIngles: "High-end architectural photography of an exquisite modern Mexican residential home exterior in León Guanajuato. Contemporary two-story house facade with clean geometric lines, warm sand stucco, natural oak wood slats, black framed picture windows, landscaped front entrance with desert agave and warm recessed exterior lighting. Pristine paved driveway, bright sunny morning light, clear azure sky, shot on Hasselblad H6D-100c, 35mm lens, f/4, luxury real estate catalog editorial, 8k resolution."
      },
      {
        id: "interior_estancia_iluminada",
        nombre: "Interior Amplio de Sala y Comedor Iluminados",
        descripcionEsp: "Estancia interior de casa nueva con sala-comedor abierta, pisos brillantes y ventanal con luz natural.",
        promptIngles: "Bright open-concept interior photography of a newly built modern Mexican home in León Guanajuato. Spacious living and dining area with polished porcelain tile floors, floor-to-ceiling glass sliding doors opening to a green private garden, warm natural sunlight streaming in, staged with minimalist modern furniture, shot on Sony A7R V, 24mm f/4, magazine editorial quality, 8k resolution."
      }
    ]
  },

  remodelacion: {
    id: "remodelacion",
    nombre: "Remodelaciones y Ampliaciones de Viviendas",
    lineaNegocio: "Sauceda Construye",
    icono: "🏗️",
    palabrasClave: [
      "remodelacion", "remodelación", "ampliacion", "ampliación", "remodelar", "ampliar",
      "arquitectura", "diseño arquitectonico", "diseño arquitectónico", "obra civil", "segundo piso", "cochera techada"
    ],
    ofertaPrincipal: "Remodelaciones y ampliaciones residenciales bajo diseño arquitectónico con presupuesto y visita técnica gratuita.",
    ganchosComerciales: [
      "¿Tu familia creció y necesitas más espacio? Ampliaciones de casas con diseño arquitectónico en León Gto.",
      "Transforma tu hogar: remodelación de cocheras, cocinas y fachadas modernas sin salirte de presupuesto.",
      "Diseño y construcción integral: hacemos realidad la ampliación de tu casa con visita y cotización gratuita."
    ],
    elementosPermitidos: [
      "Cinematic architectural photography of a newly remodeled modern Mexican residential facade",
      "Clean geometric architecture, warm sand stucco, natural teak wood accents",
      "Contemporary black steel beams and glass sliding doors",
      "Private patio or landscaped driveway, bright sunny day in León Guanajuato"
    ],
    elementosProhibidos: [
      "blowtorch on roof", "waterproofing membrane", "demolition rubble covering camera",
      "dirty scaffolding", "text", "watermarks", "logos"
    ],
    variaciones: [
      {
        id: "fachada_remodelada_moderna",
        nombre: "Fachada Residencial Transformada y Modernizada",
        descripcionEsp: "Fachada moderna mexicana recién remodelada con acabados limpios de estuco, madera y acero bajo el sol.",
        promptIngles: "Cinematic architectural photography of a newly remodeled modern Mexican residential home facade in León Guanajuato. Clean geometric architecture, warm sand-colored stucco, natural teak wood accents, contemporary black steel beams, expansive glass sliding doors connecting to a serene private patio. Sunny day, clear blue sky, sharp realistic textures of stone and smooth polished concrete, shot on Hasselblad H6D-100c, 35mm lens, f/4, pristine architectural transformation, 8k resolution."
      },
      {
        id: "ampliacion_cochera_portico",
        nombre: "Ampliación de Cochera Techada y Pórtico",
        descripcionEsp: "Ampliación de cochera con estructura contemporánea de acero, pérgola y piso nuevo frente a casa remodelada.",
        promptIngles: "Architectural photograph of a newly expanded modern covered carport addition on a residential home in León Guanajuato. Slender matte black steel pergola structure with warm wood louver slats, newly poured stone-finish driveway, crisp renovated facade with warm LED exterior uplighting, sunny daytime sky, shot on Hasselblad H6D-100c, 35mm lens, f/4, 8k resolution."
      }
    ]
  }
};

/**
 * Resuelve la categoría de marketing más adecuada a partir de cualquier texto o ID.
 */
export function resolverCategoriaMarketing(textoOCategoria: string): CategoriaMarketingParametrizada {
  const query = (textoOCategoria || "").trim().toLowerCase();

  // 1. Coincidencia directa por ID
  if (CATALOGO_CATEGORIAS_MARKETING[query]) {
    return CATALOGO_CATEGORIAS_MARKETING[query];
  }

  // 2. Coincidencia por palabras clave en orden de especificidad
  // Nota: Pintura y Herrería se evalúan antes de términos genéricos como "fachada" o "azotea"
  const categoriasOrdenadas: Array<keyof typeof CATALOGO_CATEGORIAS_MARKETING> = [
    "pintura",
    "herreria",
    "mantenimiento_cisternas",
    "concreto_estampado",
    "concreto_premezclado",
    "impermeabilizacion",
    "traspasos_infonavit",
    "expediente_infonavit",
    "catalogo_inmuebles",
    "remodelacion"
  ];

  for (const catId of categoriasOrdenadas) {
    const cat = CATALOGO_CATEGORIAS_MARKETING[catId];
    for (const palabra of cat.palabrasClave) {
      if (query.includes(palabra.toLowerCase())) {
        return cat;
      }
    }
  }

  // Fallback por defecto si no hay coincidencia
  return CATALOGO_CATEGORIAS_MARKETING.pintura;
}

/**
 * Genera un prompt en inglés altamente robusto, técnico y libre de sesgos para Flux / Replicate,
 * parametrizado por categoría de negocio, relación de aspecto y variación escénica.
 */
export function generarPromptFluxParametrizado(
  textoOCategoria: string,
  opciones?: {
    variacionIndex?: number;
    esVertical?: boolean;
    aspectRatio?: "1:1" | "9:16" | "16:9";
    contextoExtra?: string;
  }
): string {
  const categoria = resolverCategoriaMarketing(textoOCategoria);
  const variaciones = categoria.variaciones;

  // Seleccionar la variación especificada o rotar cíclicamente
  const index = Math.max(0, opciones?.variacionIndex ?? 0);
  const variacionSeleccionada = variaciones[index % variaciones.length] || variaciones[0];

  const esVertical = opciones?.esVertical || opciones?.aspectRatio === "9:16";
  const prefijoCamara = esVertical
    ? "Award-winning 9:16 vertical commercial architectural editorial photography"
    : "Award-winning commercial architectural editorial photography";

  let basePrompt = variacionSeleccionada.promptIngles;

  // Si se solicita vertical, adaptar la introducción si no lo incluye ya
  if (esVertical && !basePrompt.toLowerCase().includes("9:16 vertical")) {
    basePrompt = basePrompt.replace(
      /^((?:Award-winning|Cinematic|High-end|Architectural|Dynamic)[^.]+of)/i,
      `${prefijoCamara} of`
    );
  }

  // Si se proporcionó contexto extra específico (ej. "color terracota", "cochera para dos autos")
  if (opciones?.contextoExtra && opciones.contextoExtra.trim().length > 3) {
    const extraLimpio = opciones.contextoExtra.trim().replace(/[."]+$/, "");
    basePrompt = `${basePrompt} Special focus on: ${extraLimpio}.`;
  }

  return basePrompt;
}
