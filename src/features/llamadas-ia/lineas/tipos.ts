import type { ContextoLlamadaIA } from "@/features/llamadas-ia/service";

/**
 * Módulo de guion por línea de negocio. La base común (estilo, flujo, candados,
 * reglas de visita y despedida) vive en service.ts; cada línea aporta lo que
 * cambia: apertura, datos oficiales, cómo orientar, preguntas frecuentes,
 * objeciones y señales de compra reales. Cada línea lleva su propia versión
 * para que el agente de calidad mida y mejore cada una por separado.
 */
export interface LineaLlamada {
  clave: string;
  /** Versión del guion de esta línea (se guarda con cada resultado). */
  version: string;
  /** tipo_negocio que atiende. */
  tipos: string[];
  /** Reconoce la línea por el texto del servicio (llamadas de prueba). */
  reServicio: RegExp;
  /** Situación típica del cliente al que se llama. */
  contexto: string;
  /** Primer mensaje de Sofía. */
  apertura(ctx: ContextoLlamadaIA, nombre: string): string;
  /** Bloque de DATOS OFICIALES propio de la línea (catálogo, precios, mínimos). */
  datosOficiales(ctx: ContextoLlamadaIA): Promise<string>;
  /** Paso ORIENTAR: qué preguntar para recomendar. */
  orientar: string;
  /** Cómo dar el precio. */
  reglaPrecio: string;
  /** Qué hace el especialista en la visita sin costo. */
  visita: string;
  /** Frase para proponer la visita cuando hay intención. */
  propuestaVisita: string;
  /** Preguntas frecuentes, pendientes, objeciones y señales de compra. */
  conocimiento(): string;
}

export interface PreguntaFrecuente {
  /** Cómo lo preguntan los clientes (ejemplos reales). */
  pregunta: string;
  /** Respuesta de 1–2 frases. */
  respuesta: string;
}

export interface Objecion {
  cuando: string;
  respuesta: string;
}

export function preguntasParaPrompt(preguntas: PreguntaFrecuente[], pendientes: string[]): string {
  return `PREGUNTAS FRECUENTES (respuestas confirmadas):
${preguntas.map((p) => `- ${p.pregunta} → ${p.respuesta}`).join("\n")}

TEMAS SIN RESPUESTA CONFIRMADA (no los respondas; pásalos al asesor):
${pendientes.map((p) => `- ${p}`).join("\n")}`;
}

export function conocimientoParaPrompt(
  preguntas: PreguntaFrecuente[],
  pendientes: string[],
  objeciones: Objecion[],
  senales: string[],
): string {
  return `${preguntasParaPrompt(preguntas, pendientes)}

OBJECIONES REALES Y CÓMO RESPONDER:
${objeciones.map((o) => `- ${o.cuando} → ${o.respuesta}`).join("\n")}

SEÑALES DE COMPRA (cuentan como intención clara):
${senales.map((s) => `- ${s}`).join("\n")}`;
}

/** Respuestas que aplican a todas las líneas de Sauceda Construye. */
export const PREGUNTAS_GENERALES: PreguntaFrecuente[] = [
  {
    pregunta: "¿El precio incluye IVA? / Si necesito factura…",
    respuesta: "Los precios son sin factura; si necesita factura, se agrega el IVA. El monto exacto con factura se lo confirma el asesor.",
  },
  {
    pregunta: "¿Aceptan tarjeta? / ¿Hay meses sin intereses?",
    respuesta:
      "Sí aceptamos tarjeta, además de efectivo y transferencia. No manejamos meses sin intereses; con Mercado Pago se puede pagar a meses con intereses.",
  },
];
