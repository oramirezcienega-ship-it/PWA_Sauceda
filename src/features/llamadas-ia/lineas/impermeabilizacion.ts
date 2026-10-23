import { supabaseServidor } from "@/lib/supabase/server";
import { cargarProductosImper, ETIQUETA_PAQUETE } from "@/lib/ia/catalogo-imper";
import { formatoPesosEnteros } from "@/lib/costo-inspeccion";
import {
  conocimientoParaPrompt,
  preguntasParaPrompt,
  PREGUNTAS_GENERALES,
  type LineaLlamada,
  type Objecion,
  type PreguntaFrecuente,
} from "@/features/llamadas-ia/lineas/tipos";

/**
 * Impermeabilización. Sale del análisis de ~2,000 mensajes de WhatsApp de 168
 * leads (oct 2026): lo que de verdad preguntan, cómo objetan y qué dijeron los
 * que sí contrataron. Aquí solo va lo confirmado; lo demás se pasa al asesor.
 * Sofía en WhatsApp usa las mismas preguntas frecuentes (preguntasImperParaPrompt).
 */

export const PREGUNTAS_IMPER: PreguntaFrecuente[] = [
  {
    pregunta: "¿Cuál es la diferencia entre las opciones? / ¿Cuál me recomiendas? / Explícame cada una",
    respuesta:
      "Acrílica: la más económica, es líquida, garantía de 2 años. Estándar 3.5: la más solicitada, rollo con gravilla, 5 años, para azoteas en buen estado. Premium 4.0 poliéster: rollo con gravilla, 10 años, la de mayor durabilidad. Para recomendar: azotea en buen estado, la estándar; si ya tiene filtraciones, la han reparado antes o quiere olvidarse por más tiempo, la Premium.",
  },
  ...PREGUNTAS_GENERALES,
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
    respuesta: "Sí, la garantía es por escrito: 2, 5 o 10 años según la opción.",
  },
  {
    pregunta: "¿Quitan la carpeta o membrana que ya tengo?",
    respuesta: "Sí, nosotros la retiramos; tiene un costo adicional pequeño que el especialista confirma en la visita.",
  },
  {
    pregunta: "¿Cuánto tardan? / ¿En un día lo ponen?",
    respuesta: "Regularmente se aplica en un día hasta unos 100 metros; si son más metros, toma un poco más.",
  },
  {
    pregunta: "¿Se puede sobre lámina? / ¿Encima del piso? / Tengo paneles solares",
    respuesta: "Se aplica sobre losa o piso, no sobre lámina. Si tiene paneles solares, nosotros los podemos mover para trabajar.",
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
export const PENDIENTES_IMPER = [
  "Marca de la opción acrílica",
  "Monto exacto con factura",
  "Costo de retirar la carpeta, de mover paneles o de reparar humedades interiores",
  "Si llegamos a una ciudad específica fuera de León",
  "Descuentos",
];

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
export const SENALES_IMPER = [
  "elige una opción (\"la de 10 años\", \"la estándar\", \"la tercera\")",
  "pregunta cuándo lo pueden aplicar o cuánto tardan",
  "dice que le urge o que ya tiene goteras dentro de la casa",
  "pregunta cómo se paga o si aceptan tarjeta para decidir",
  "pregunta dónde hacer el trámite o pide hablar con alguien para cerrar",
  "da su dirección o pide que vayan a medir",
];

/** Preguntas frecuentes de impermeabilización para Sofía en WhatsApp (misma base que la llamada). */
export function preguntasImperParaPrompt(): string {
  return preguntasParaPrompt(PREGUNTAS_IMPER, PENDIENTES_IMPER);
}

export const lineaImpermeabilizacion: LineaLlamada = {
  clave: "impermeabilizacion",
  version: "impermeabilizacion-v5",
  tipos: ["construccion-impermeabilizacion"],
  reServicio: /imper/i,
  contexto:
    "la mayoría de los clientes pidió precio por WhatsApp, recibió la comparativa y dejó de contestar. No es que no les interese: muchos se quedaron con dudas (cuál opción conviene, si incluye IVA, qué material es) o lo están platicando en casa.",
  apertura: (ctx, nombre) =>
    `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba. Le llamo por la cotización de impermeabilización${ctx.metros ? ` para sus ${ctx.metros} metros` : ""} que le enviamos por WhatsApp, ¿pudo revisarla?`,
  async datosOficiales(ctx) {
    const productos = await cargarProductosImper(supabaseServidor());
    const lineas: string[] = [];
    const minimos: number[] = [];
    for (const p of ["acrilico", "estandar", "premium"] as const) {
      const prod = productos[p];
      if (!prod || !prod.aptoParaIa || prod.precioM2 <= 0) continue;
      const garantia = prod.nombre.match(/garant[ií]a\s*(?:de\s*)?(\d+)\s*a[ñn]os?/i)?.[1];
      const volumen = prod.preciosVolumen.length
        ? `; desde ${prod.preciosVolumen.map((t) => `${t.desde} m² baja a ${formatoPesosEnteros(t.precio)}`).join(", ")}`
        : "";
      const valor = prod.descripcionValor.trim().split(/(?<=[.!?])\s/)[0];
      lineas.push(
        `${ETIQUETA_PAQUETE[p]}: ${formatoPesosEnteros(prod.precioM2)} por m² sin factura${garantia ? `, garantía ${garantia} años por escrito` : ""}${volumen}${valor ? `. ${valor}` : ""}`,
      );
      if (prod.minimoM2 > 0) minimos.push(prod.minimoM2);
    }
    const estimado = ctx.monto
      ? `- Su estimado: alrededor de ${formatoPesosEnteros(ctx.monto)} sin factura${ctx.paquete ? ` con la opción ${ctx.paquete}` : ""}${ctx.metros ? ` para ${ctx.metros} m²` : ""}. Es un estimado con las medidas que nos dio.\n`
      : "";
    const minimo = minimos.length
      ? `\n- Para superficies pequeñas hay un mínimo de cobro de ${Math.round(Math.min(...minimos))}–${Math.round(Math.max(...minimos))} m².`
      : "";
    return lineas.length
      ? `${estimado}- Opciones (catálogo):\n- ${lineas.join("\n- ")}${minimo}`
      : `${estimado}- No tienes precios cargados: si preguntan, el precio lo confirma un asesor.`;
  },
  orientar:
    "si no ha elegido opción, pregunta cómo está su azotea (¿ya tiene goteras o es preventivo?) y recomienda UNA opción en una frase según su respuesta.",
  reglaPrecio:
    "si pregunta cuánto cuesta y conoces sus metros, da el total aproximado de la opción de la que hablan: metros por precio por metro cuadrado (si son menos del mínimo de cobro, usa el mínimo), redondeado a cientos y diciendo \"alrededor de\". Si no conoces sus metros, da el precio por metro cuadrado y pregunta cuántos metros tiene su azotea para darle el aproximado.",
  visita:
    "un especialista revisa el estado de la losa, grietas, humedad, filtraciones y desagües, confirma medidas y deja el precio final",
  propuestaVisita:
    "Si le parece, el siguiente paso es que un especialista pase a revisar y confirmar medidas, sin costo, para dejarle el precio final. ¿Le gustaría?",
  conocimiento: () => conocimientoParaPrompt(PREGUNTAS_IMPER, PENDIENTES_IMPER, OBJECIONES_IMPER, SENALES_IMPER),
};
