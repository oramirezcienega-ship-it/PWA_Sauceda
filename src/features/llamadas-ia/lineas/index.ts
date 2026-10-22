import type { ContextoLlamadaIA } from "@/features/llamadas-ia/service";
import {
  conocimientoParaPrompt,
  PREGUNTAS_GENERALES,
  type LineaLlamada,
} from "@/features/llamadas-ia/lineas/tipos";
import { lineaImpermeabilizacion } from "@/features/llamadas-ia/lineas/impermeabilizacion";
import { lineaPisoEstampado } from "@/features/llamadas-ia/lineas/piso-estampado";

/**
 * Línea genérica para servicios que aún no tienen módulo propio (remodelación,
 * mantenimiento…): sin precios, todo lo específico se pasa al asesor.
 */
const lineaGeneral: LineaLlamada = {
  clave: "general",
  version: "general-v1",
  tipos: [],
  reServicio: /$^/,
  contexto: "son clientes que pidieron información o cotización por WhatsApp y no han avanzado.",
  apertura: (ctx, nombre) =>
    `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba. Le llamo por la cotización de ${ctx.servicio || "su proyecto"} que nos pidió por WhatsApp, ¿pudo revisarla?`,
  datosOficiales: async () => "- No tienes precios de este servicio: si preguntan, el precio lo confirma un asesor.",
  orientar: "pregunta qué necesita resolver y para cuándo.",
  reglaPrecio: "no des precios: dile que el asesor se lo confirma con su presupuesto.",
  visita: "un especialista revisa el lugar y le deja el presupuesto exacto",
  propuestaVisita:
    "Si le parece, el siguiente paso es que un especialista pase a revisar, sin costo, para dejarle el presupuesto exacto. ¿Le gustaría?",
  conocimiento: () => conocimientoParaPrompt(PREGUNTAS_GENERALES, ["Precios, tiempos, materiales y garantías del servicio"], [], []),
};

const LINEAS: LineaLlamada[] = [lineaImpermeabilizacion, lineaPisoEstampado];

/** El módulo de guion según el tipo de negocio (o, en pruebas, el texto del servicio). */
export function lineaDe(ctx: ContextoLlamadaIA): LineaLlamada {
  return (
    LINEAS.find((l) => ctx.tipoNegocio && l.tipos.includes(ctx.tipoNegocio)) ??
    LINEAS.find((l) => !ctx.tipoNegocio && l.reServicio.test(ctx.servicio || "")) ??
    lineaGeneral
  );
}
