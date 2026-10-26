import {
  conocimientoParaPrompt,
  PREGUNTAS_GENERALES,
  type LineaLlamada,
  type Objecion,
  type PreguntaFrecuente,
} from "@/features/llamadas-ia/lineas/tipos";

/**
 * Piso / concreto estampado. Sale del análisis de los 79 leads de WhatsApp
 * (oct 2026): ninguno ha cerrado; casi todos dieron área y medidas, preguntaron
 * el precio por m² y no recibieron seguimiento. Muchos son de fuera de León.
 * Las condiciones (sin mínimo de metros, qué incluye, muestrario) son las mismas que usa
 * Sofía en WhatsApp (flujo G de agente.ts).
 */

const CATALOGO_URL = "saucedamx.com/construye/concreto-estampado/catalogo-de-estampados";
const MUNICIPIOS = "Silao, Irapuato, Guanajuato y Lagos de Moreno";

const PREGUNTAS_PISO: PreguntaFrecuente[] = [
  {
    pregunta: "¿Cuánto cuesta el metro? / ¿Precio por metro terminado? / ¿Cuánto me dijeron?",
    respuesta: "El precio oficial depende del metraje y si es sobre firme ($420-$750/m²) o colado nuevo sobre tierra ($840-$1,290/m²). Se le ofrece la visita técnica sin costo para revisar niveles y presupuesto exacto.",
  },
  ...PREGUNTAS_GENERALES,
  {
    pregunta: "¿Depende del diseño o modelo el precio?",
    respuesta:
      "No, el diseño no cambia el precio; lo que lo define son las características del área y del suelo, por eso el especialista lo revisa en la visita.",
  },
  {
    pregunta: "¿Qué incluye?",
    respuesta:
      "Incluye material de alta resistencia, mano de obra especializada, el estampado con la textura que elija, el color y un sellado de alta durabilidad.",
  },
  {
    pregunta: "¿Es por piezas o colado? / ¿Lo hacen con revolvedora?",
    respuesta:
      "Es concreto colado en sitio, preparado con revolvedora para que tenga la resistencia correcta, y ahí mismo se estampa con el diseño y color que elija.",
  },
  {
    pregunta: "¿Qué diseños o colores tienen? / ¿Tienen catálogo? / Quiero algo liso, tipo piedra, madera…",
    respuesta:
      "Tenemos varias texturas, moldes y colores; puede verlos en el catálogo en línea que le compartimos por WhatsApp, y en la visita técnica sin costo revisamos sus medidas y niveles para dejarle el presupuesto exacto.",
  },
  {
    pregunta: "Mi área es chica / ¿Hacen espacios pequeños?",
    respuesta: "Sí, también hacemos áreas chicas; el especialista le confirma el presupuesto exacto en la visita.",
  },
  {
    pregunta: "¿Tiene costo el presupuesto o la visita?",
    respuesta: "No, la visita técnica de medición, niveles y el presupuesto son totalmente sin costo.",
  },
  {
    pregunta: "¿Dónde están? / ¿Van a mi ciudad?",
    respuesta: `Estamos en León, Guanajuato, y atendemos León y alrededores, además de ${MUNICIPIOS}. Si es otra ciudad, el asesor le confirma si podemos llegar.`,
  },
  {
    pregunta: "¿De qué espesor lo hacen? / ¿Aguanta el peso de los carros?",
    respuesta:
      "Lo hacemos de 10 centímetros, que es lo que recomendamos, y aguanta sin problema el peso de hasta dos vehículos. Si lo quiere de 15 centímetros también se puede, pero el costo sube bastante.",
  },
  {
    pregunta: "¿Se puede poner sobre tierra? / ¿Sobre el piso que ya tengo?",
    respuesta: "Sí, lo ideal es colocarlo directamente sobre tierra, y también se puede colocar sin problema sobre un piso de concreto.",
  },
  {
    pregunta: "¿Qué mantenimiento lleva? / ¿Cada cuánto se resella?",
    respuesta: "En promedio cada 5 a 6 años; depende mucho de qué tan expuesto esté al sol y a la lluvia directa.",
  },
];

/** Dudas reales sin respuesta confirmada: Sofía las pasa al asesor. */
const PENDIENTES_PISO = [
  "Cuánto cuesta preparar la base o quitar el piso que ya tiene",
  "Precio del espesor de 15 centímetros",
  "Cuántos días tarda el trabajo",
  "Garantía",
  "Reparación de un piso estampado que ya existe",
  "Precio por volumen en áreas grandes",
  `Si llegamos a una ciudad que no sea León, sus alrededores, ${MUNICIPIOS}`,
  "Antiderrapante u otros acabados especiales",
];

const OBJECIONES_PISO: Objecion[] = [
  {
    cuando: "\"Está caro\" / \"prefiero vitropiso\" / \"se sale de mi presupuesto\"",
    respuesta:
      "Valida sin discutir. Pregunta para qué área es y comenta que el estampado es concreto colado en sitio, pensado para exteriores como cocheras y patios. Si el área es grande, ofrece que el asesor revise una propuesta por volumen. Menciona que se puede pagar con tarjeta a meses (con intereses).",
  },
  {
    cuando: "\"Estoy pidiendo presupuestos\" / \"estoy comparando\"",
    respuesta:
      "Está bien comparar. Ofrece la visita técnica de medición y niveles sin costo para que tenga un presupuesto exacto con sus medidas y pueda comparar parejo.",
  },
  {
    cuando: "\"Lo checo\" / \"déjame ver\" / \"más adelante\"",
    respuesta:
      "Sin presión. Ofrece que le compartamos otra vez el catálogo de diseños por WhatsApp y pregunta en qué fecha le volvemos a llamar.",
  },
  {
    cuando: `La propiedad está fuera de León y sus alrededores, y no es en ${MUNICIPIOS}`,
    respuesta:
      "Agradece, dile que el asesor le confirma si podemos llegar a su ciudad y no prometas el servicio. Registra la ciudad.",
  },
  {
    cuando: "\"Nadie me contactó\" / \"no me llegó el presupuesto\" / \"me visitaron y no regresaron con el presupuesto\"",
    respuesta:
      "Discúlpate en una frase, sin excusas, y ofrece que un asesor le llame hoy mismo con su presupuesto; si hay asesor disponible, transfiérelo.",
  },
];

const SENALES_PISO = [
  "da el área y sus medidas y pregunta el precio",
  "dice que ya tiene el firme o la base lista",
  "describe el diseño o color que quiere (\"algo liso\", \"gris\", \"tipo piedra\", \"ladrillo\")",
  "pide que vayan a medir, a revisar niveles o a cotizar en sitio",
  "pregunta cuándo pueden hacerlo o cuánto tardan",
  "pregunta cómo se paga",
];

export const lineaPisoEstampado: LineaLlamada = {
  clave: "piso-estampado",
  version: "piso-estampado-v5",
  tipos: ["construccion-piso-estampado"],
  reServicio: /estampad/i,
  contexto:
    `son clientes que preguntaron por piso o concreto estampado por WhatsApp (sobre todo cochera, patio, terraza, entrada o jardín), casi siempre dieron su área y medidas y preguntaron el precio por metro, pero no recibieron presupuesto ni seguimiento. Varios dudan si su piso o tierra actual sirve de base, y algunos viven fuera de León (atendemos León y alrededores, ${MUNICIPIOS}).`,
  apertura: (ctx, nombre) =>
    `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba. Le llamo por el piso estampado que nos preguntó por WhatsApp${ctx.metros ? ` para sus ${ctx.metros} metros` : ""}, ¿lo sigue considerando?`,
  async datosOficiales() {
    return `- Concreto estampado: NO das precios ni cifras. El precio depende de las características del área y del suelo (si es tierra, pasto o firme de concreto, niveles y accesos). El diseño no cambia el precio. No hay mínimo de metros: también se hacen áreas chicas.
- Catálogo de diseños en línea: ${CATALOGO_URL} (si lo quiere, dile que se lo compartimos por WhatsApp; no le dictes la dirección).`;
  },
  orientar:
    "pregunta para qué área es (cochera, patio, terraza…) y si ya tiene firme de concreto o es tierra. Si es cochera, confirma si la va a usar para autos (con 10 centímetros aguanta hasta dos vehículos).",
  reglaPrecio: `NUNCA inventes ni calcules cifras: ni precio por metro, ni rangos, ni "desde", ni totales. Si en LO QUE SABEMOS DE ESTE CLIENTE aparece el PRECIO QUE YA RECIBIÓ POR WHATSAPP, usa SOLO ese, tal cual se le dio, y aclara que el final depende del área y del suelo; cuenta como precio conocido. Si no ha recibido precio: explica en una frase que depende de las características del área y del suelo, confirma sus metros, pregunta cómo está su suelo (tierra, pasto o firme de concreto) y dile que un asesor le manda su presupuesto por WhatsApp, donde puede mandar una foto del área. Nunca le digas que su área es muy chica ni menciones mínimos.`,
  visita:
    "un especialista mide el área, valida niveles y caídas pluviales, revisa la base y le deja el presupuesto exacto sin costo",
  propuestaVisita:
    "Si le parece, el siguiente paso es agendar la visita técnica a su casa, sin costo, para medir niveles y dejarle el presupuesto exacto. ¿Le gustaría?",
  conocimiento: () => conocimientoParaPrompt(PREGUNTAS_PISO, PENDIENTES_PISO, OBJECIONES_PISO, SENALES_PISO),
};
