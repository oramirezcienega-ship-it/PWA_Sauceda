import type { ContextoLlamadaIA } from "@/features/llamadas-ia/service";
import type { LineaLlamada } from "@/features/llamadas-ia/lineas/tipos";

/**
 * Segmentos del embudo para las llamadas IA. Cada uno tiene su objetivo, su
 * apertura y sus pasos; la base común (estilo, candados, visita, despedida)
 * vive en service.ts y lo propio del servicio en lineas/.
 *
 *   sin_respuesta  escribió y dejó de contestar sin dar datos → reconectar y saber qué pasó
 *   sin_cotizar    dio datos pero no recibió precio          → completar datos para cotizar
 *   cotizado       ya tiene precio y no avanzó               → resolver dudas y coordinar visita
 *   no_interesado  ya dijo que no o contrató a otro          → no se llama
 */
export type SegmentoLlamada = "sin_respuesta" | "sin_cotizar" | "cotizado" | "no_interesado";

export const SEGMENTOS: Record<SegmentoLlamada, { etiqueta: string; objetivo: string; exito: string }> = {
  sin_respuesta: {
    etiqueta: "Sin respuesta",
    objetivo: "reconectar y saber qué pasó (no le llegó la información, se le pasó, ya lo resolvió o no le convenció)",
    exito: "Reactivado con datos para cotizar",
  },
  sin_cotizar: {
    etiqueta: "Sin cotizar",
    objetivo: "completar los datos que faltan para que el asesor le mande su cotización hoy",
    exito: "Datos completos para cotizar",
  },
  cotizado: {
    etiqueta: "Cotizado",
    objetivo: "resolver sus dudas sobre la cotización y, si hay intención, coordinar la visita sin costo",
    exito: "Visita aceptada",
  },
  no_interesado: {
    etiqueta: "No interesado",
    objetivo: "no se llama",
    exito: "—",
  },
};

export const SEGMENTOS_LLAMABLES: SegmentoLlamada[] = ["sin_respuesta", "sin_cotizar", "cotizado"];

/** Segmento guardado o, si no se analizó, el que se deduce de los datos. */
export function segmentoDe(ll: {
  segmento?: SegmentoLlamada | null;
  cotizacion_id?: string | null;
  sugerencia?: { precio_dado?: string } | null;
}): SegmentoLlamada {
  if (ll.segmento) return ll.segmento;
  return ll.cotizacion_id || ll.sugerencia?.precio_dado ? "cotizado" : "sin_cotizar";
}

/** Primer mensaje de Sofía. En 'cotizado' manda la apertura de la línea. */
export function aperturaSegmento(
  segmento: SegmentoLlamada,
  linea: LineaLlamada,
  ctx: ContextoLlamadaIA,
  nombre: string,
): string {
  const hola = `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba.`;
  const servicio = ctx.servicio || "su proyecto";
  if (segmento === "sin_respuesta") {
    return `${hola} Hace un tiempo nos escribió por WhatsApp sobre ${servicio} y ya no supimos de usted, ¿pudo ver la información que le mandamos?`;
  }
  if (segmento === "sin_cotizar") {
    return `${hola} Le llamo por el ${servicio} que nos preguntó por WhatsApp; una disculpa porque no le llegó su presupuesto. ¿Lo sigue considerando?`;
  }
  return linea.apertura(ctx, nombre);
}

/** Pasos 1–4 de la llamada según el segmento (del 5 en adelante son comunes). */
export function pasosSegmento(
  segmento: SegmentoLlamada,
  linea: LineaLlamada,
  propuestaVisita: string,
): string {
  const precio = `PRECIO: ${linea.reglaPrecio}`;
  const visita = `- PRIMERO EL PRECIO: solo propón la visita si el cliente ya conoce su precio (de la cotización que recibió, del precio que ya se le dio por WhatsApp o porque se lo diste en esta llamada con la regla de PRECIO). Si no tienes precio que dar, no ofrezcas visita.
   - Con precio conocido e intención clara (SEÑALES DE COMPRA), o si duda de sus medidas y le interesa: propón con suavidad: "${propuestaVisita}"`;
  const cotizar =
    "Si no hay precio que dar o aún no quiere visita: confirma los datos que te dio y dile que un asesor le manda su cotización hoy por WhatsApp (resultado: cotizar).";

  if (segmento === "sin_respuesta") {
    return `1. RECONECTAR: escucha por qué no siguió la conversación. No le reclames ni insistas.
2. DIAGNOSTICAR según lo que diga:
   - No le llegó la información o se le pasó, y sí le interesa: discúlpate en una frase y pasa al paso 3.
   - Ya lo resolvió, contrató a otro o ya no le interesa: pregunta en una frase el motivo (precio, tiempo, otro proveedor), agradece y despídete (resultado: no_interesado).
   - Lo está pensando o no es buen momento: pregunta qué día le marcamos (resultado: llamar_despues).
3. COMPLETAR DATOS: ${linea.orientar} Confirma sus medidas aproximadas.
   ${precio}
4. SIGUIENTE PASO: ${cotizar}
   ${visita}`;
  }

  if (segmento === "sin_cotizar") {
    return `1. RECONOCER: si sigue interesado, agradece y di que en esta llamada completamos lo que falta para su presupuesto. Si ya no le interesa, pregunta en una frase el motivo y despídete (resultado: no_interesado).
2. COMPLETAR DATOS: ${linea.orientar} Confirma sus medidas aproximadas. No le vuelvas a preguntar lo que ya está en LO QUE SABEMOS DE ESTE CLIENTE.
3. RESOLVER: responde dudas con DATOS OFICIALES y PREGUNTAS FRECUENTES. Los precios son sin factura; si necesita factura se agrega el IVA.
   ${precio}
4. SIGUIENTE PASO: ${cotizar}
   ${visita}`;
  }

  return `1. DESCUBRIR: pregunta qué le pareció su cotización o en qué punto está. Deja que hable. No le vuelvas a preguntar medidas que ya tenemos.
2. ORIENTAR: ${linea.orientar}
3. RESOLVER: responde dudas con DATOS OFICIALES y PREGUNTAS FRECUENTES. Los precios son sin factura; si necesita factura se agrega el IVA.
   ${precio}
4. DETECTAR INTENCIÓN con las SEÑALES DE COMPRA.
   - Sin intención clara: no ofrezcas visita. Usa la respuesta de OBJECIONES que corresponda y pregunta qué le haría falta para decidirse.
   ${visita}`;
}
