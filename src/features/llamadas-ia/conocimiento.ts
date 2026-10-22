/**
 * Base de conocimiento de las llamadas IA de impermeabilización.
 *
 * Sale del análisis de ~2,000 mensajes de WhatsApp de 168 leads de
 * impermeabilización (oct 2026): lo que de verdad preguntan, cómo objetan y qué
 * dijeron los que sí contrataron. Es la pieza que el agente de calidad irá
 * ajustando: cada cambio se aprueba y sube la versión del guion.
 *
 * Regla: aquí solo va lo confirmado. Lo que no esté, Sofía no lo afirma y lo
 * pasa al asesor (queda en `pregunta_sin_respuesta` para completar esta base).
 */

export interface PreguntaFrecuente {
  /** Cómo lo preguntan los clientes (ejemplos reales). */
  pregunta: string;
  /** Respuesta de 1–2 frases para teléfono. */
  respuesta: string;
}

export const PREGUNTAS_IMPER: PreguntaFrecuente[] = [
  {
    pregunta: "¿Cuál es la diferencia entre las opciones? / ¿Cuál me recomiendas? / Explícame cada una",
    respuesta:
      "Usa la línea de cada opción de DATOS OFICIALES. Para recomendar: azotea en buen estado, la estándar; si ya tiene filtraciones, la han reparado antes o quiere olvidarse por más tiempo, la Premium de 10 años.",
  },
  {
    pregunta: "¿El precio incluye IVA? / Con IVA cuánto sería / Si no necesito factura…",
    respuesta:
      "Los precios son sin factura; si necesita factura, se agrega el IVA. El monto exacto con factura se lo confirma el asesor.",
  },
  {
    pregunta: "¿Es carpeta, tapete, rollo o líquido? / ¿Qué es la gravilla?",
    respuesta:
      "La estándar y la Premium son de rollo con gravilla protectora encima, en color rojo o gris a su elección; la acrílica es la opción líquida.",
  },
  {
    pregunta: "¿Qué marca manejan? / ¿Qué material es?",
    respuesta:
      "En la estándar y la Premium usamos membrana IMPAC Hogar Poliéster, de Saint-Gobain, que se adhiere con soplete por termofusión.",
  },
  {
    pregunta: "¿Se puede pisar?",
    respuesta: "Sí, el acabado con gravilla aguanta tránsito ligero ocasional, por ejemplo para subir a revisar el tinaco.",
  },
  {
    pregunta: "¿Qué incluye?",
    respuesta:
      "Incluye el diagnóstico, la limpieza y preparación de la superficie, la aplicación profesional, el sellado de bordes y boquillas, la limpieza final y la garantía por escrito.",
  },
  {
    pregunta: "¿Tiene garantía? / ¿Me garantizan que se acaba la gotera?",
    respuesta: "Sí, la garantía es por escrito: 3, 5 o 10 años según la opción.",
  },
  {
    pregunta: "¿Aceptan tarjeta? / ¿Hay meses sin intereses?",
    respuesta:
      "Sí aceptamos tarjeta, además de efectivo y transferencia. No manejamos meses sin intereses; con Mercado Pago se puede pagar a meses con intereses.",
  },
  {
    pregunta: "¿Quitan la carpeta o membrana que ya tengo?",
    respuesta:
      "Sí, nosotros la retiramos; tiene un costo adicional pequeño que el especialista confirma en la visita.",
  },
  {
    pregunta: "¿Cuánto tardan? / ¿En un día lo ponen?",
    respuesta: "Regularmente se aplica en un día hasta unos 100 metros; si son más metros, toma un poco más.",
  },
  {
    pregunta: "¿Se puede sobre lámina? / ¿Encima del piso? / Tengo paneles solares",
    respuesta:
      "Se aplica sobre losa o piso, no sobre lámina. Si tiene paneles solares, nosotros los podemos mover para trabajar.",
  },
  {
    pregunta: "¿Pueden hacerlo solo en una parte de la azotea?",
    respuesta: "Sí, podemos aplicarlo solo en una parte; el precio se ajusta a esos metros (con el mínimo de cobro).",
  },
  {
    pregunta: "¿También reparan la humedad de plafones y muros por dentro?",
    respuesta:
      "Sí, en Sauceda Construye también reparamos humedades en plafones y muros interiores; eso se cotiza aparte y el especialista lo revisa en la visita.",
  },
  {
    pregunta: "¿Dónde están? / ¿Tienen oficina? / ¿Van a mi ciudad?",
    respuesta:
      "Estamos en León, Guanajuato. Atendemos León y ciudades muy cercanas; si es fuera de León, el asesor le confirma si llegamos a su ciudad.",
  },
  {
    pregunta: "¿Cuándo conviene impermeabilizar? / ¿Se puede con lluvia?",
    respuesta:
      "La temporada seca es el mejor momento: el material se adhiere mejor con la losa completamente seca, y así queda listo antes de que lleguen las lluvias.",
  },
  {
    pregunta: "No sé bien las medidas / ¿Ustedes van a medir? / Si van y miden, ¿cambia la cotización?",
    respuesta:
      "Su cotización es un estimado con las medidas que nos dio; el especialista puede pasar a medir sin costo y ahí se confirma el precio final.",
  },
];

/** Preguntas reales que aún no tienen respuesta confirmada: Sofía las pasa al asesor. */
export const PENDIENTES_DE_CONFIRMAR = [
  "Marca de la opción acrílica",
  "Monto exacto con factura",
  "Costo de retirar la carpeta, de mover paneles o de reparar humedades interiores",
  "Si llegamos a una ciudad específica fuera de León",
  "Descuentos",
];

export interface Objecion {
  cuando: string;
  respuesta: string;
}

export const OBJECIONES_IMPER: Objecion[] = [
  {
    cuando: "\"Está caro\" / \"se sale de mi presupuesto\" / \"no me alcanza\"",
    respuesta:
      "Valida sin discutir. Menciona que la acrílica es la más económica, que se puede hacer solo en la parte que más lo necesita y que se puede pagar con tarjeta a meses (con intereses). Pregunta con qué lo está comparando.",
  },
  {
    cuando: "\"Lo voy a platicar con mi esposo/esposa\" / \"tengo que pedir autorización\"",
    respuesta:
      "Es muy común. Ofrece mandarle por WhatsApp el resumen de las opciones para que lo revisen juntos y pregunta qué día le marcamos para saber qué decidieron.",
  },
  {
    cuando: "\"Más adelante\" / \"hasta diciembre\" / \"el próximo año\" / \"estoy ahorrando\"",
    respuesta:
      "Sin presión. Comenta que la temporada seca es el mejor momento para aplicarlo, antes de las lluvias, y pregunta en qué fecha le volvemos a llamar.",
  },
  {
    cuando: "\"Estoy cotizando con otros\" / \"déjame ver otras opciones\"",
    respuesta:
      "Está bien comparar. Recuerda en una frase que la garantía es por escrito y que todo incluye preparación y sellado, y ofrece resolver cualquier duda para que compare parejo.",
  },
  {
    cuando: "\"Ya lo hice con alguien más\"",
    respuesta: "Agradece y pregunta en una frase qué le hizo decidirse por la otra opción (precio, rapidez, otra cosa). Despídete.",
  },
  {
    cuando: "\"Nadie me contactó\" / \"tardaron mucho\" / \"no llegó nadie\"",
    respuesta:
      "Discúlpate en una frase, sin excusas, y ofrece que un asesor le llame hoy mismo; si hay asesor disponible, transfiérelo.",
  },
];

/** Frases de clientes que sí avanzaron: señales de compra para detectar intención. */
export const SENALES_COMPRA = [
  "elige una opción (\"la de 10 años\", \"la estándar\", \"la tercera\")",
  "pregunta cuándo lo pueden aplicar o cuánto tardan",
  "dice que le urge o que ya tiene goteras dentro de la casa",
  "pregunta cómo se paga o si aceptan tarjeta para decidir",
  "pregunta dónde hacer el trámite o pide hablar con alguien para cerrar",
  "da su dirección o pide que vayan a medir",
];

/** Bloque para el prompt de Sofía. */
export function conocimientoParaPrompt(): string {
  const faq = PREGUNTAS_IMPER.map((p) => `- ${p.pregunta} → ${p.respuesta}`).join("\n");
  const obj = OBJECIONES_IMPER.map((o) => `- ${o.cuando} → ${o.respuesta}`).join("\n");
  return `PREGUNTAS FRECUENTES (respuestas confirmadas):
${faq}

TEMAS SIN RESPUESTA CONFIRMADA (no los respondas; pásalos al asesor):
${PENDIENTES_DE_CONFIRMAR.map((p) => `- ${p}`).join("\n")}

OBJECIONES REALES Y CÓMO RESPONDER:
${obj}

SEÑALES DE COMPRA (cuentan como intención clara):
${SENALES_COMPRA.map((s) => `- ${s}`).join("\n")}`;
}
