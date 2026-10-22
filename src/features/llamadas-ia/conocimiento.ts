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
      "Los precios son más IVA. Si pregunta por el total con IVA o sin factura, el asesor le confirma el monto exacto.",
  },
  {
    pregunta: "¿Es carpeta, tapete, rollo o líquido? / ¿Qué es la gravilla?",
    respuesta:
      "La estándar y la Premium son de rollo con gravilla protectora encima, en color rojo o gris a su elección; la acrílica es la opción líquida.",
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
    pregunta: "¿Aceptan tarjeta?",
    respuesta: "Sí, aceptamos tarjeta con Mercado Pago, además de efectivo y transferencia.",
  },
  {
    pregunta: "¿Dónde están? / ¿Tienen oficina?",
    respuesta: "Estamos en León, Guanajuato, y atendemos León y alrededores.",
  },
  {
    pregunta: "No sé bien las medidas / ¿Ustedes van a medir? / Si van y miden, ¿cambia la cotización?",
    respuesta:
      "Su cotización es un estimado con las medidas que nos dio; el especialista puede pasar a medir sin costo y ahí se confirma el precio final.",
  },
];

/** Preguntas reales que aún no tienen respuesta confirmada: Sofía las pasa al asesor. */
export const PENDIENTES_DE_CONFIRMAR = [
  "Meses sin intereses o descuento con tarjeta",
  "Si se retira la carpeta o membrana que ya tiene, y si tiene costo",
  "Cuántos días tarda la aplicación",
  "Precio total con IVA o sin factura",
  "Si se aplica sobre lámina, sobre piso o con paneles solares",
  "Si reparan humedades en plafones y muros interiores",
  "Si dan servicio fuera de León (Silao, Valle de Santiago, Lagos de Moreno, San Francisco, Guanajuato capital)",
  "Marca del material",
  "Si se puede aplicar solo en una parte de la azotea",
];

export interface Objecion {
  cuando: string;
  respuesta: string;
}

export const OBJECIONES_IMPER: Objecion[] = [
  {
    cuando: "\"Está caro\" / \"se sale de mi presupuesto\" / \"no me alcanza\"",
    respuesta:
      "Valida sin discutir. Menciona que la acrílica es la más económica y que, si solo es una parte de la azotea o las medidas son menores, el especialista lo confirma al medir. Pregunta con qué lo está comparando.",
  },
  {
    cuando: "\"Lo voy a platicar con mi esposo/esposa\" / \"tengo que pedir autorización\"",
    respuesta:
      "Es muy común. Ofrece mandarle por WhatsApp el resumen de las opciones para que lo revisen juntos y pregunta qué día le marcamos para saber qué decidieron.",
  },
  {
    cuando: "\"Más adelante\" / \"hasta diciembre\" / \"el próximo año\" / \"estoy ahorrando\"",
    respuesta:
      "Sin presión. Comenta que la temporada seca es buena época para aplicarlo, antes de las lluvias, y pregunta en qué fecha le volvemos a llamar.",
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
