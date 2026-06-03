import type {
  EventoAutomatizacion,
  OperadorCondicion,
  TipoAccion,
} from "@/lib/types";

/**
 * Catálogos del módulo AUTOMATIZACIONES.
 * Solo datos (sin lógica de servidor), por eso lo pueden importar tanto el
 * motor (servidor) como el constructor de reglas (cliente).
 */

/** Eventos disparadores disponibles y la entidad a la que aplican. */
export const EVENTOS: {
  id: EventoAutomatizacion;
  nombre: string;
  descripcion: string;
  entidad: "expediente" | "prospecto";
}[] = [
  {
    id: "nuevo-expediente",
    nombre: "Nuevo expediente",
    descripcion: "Cuando se crea un expediente (alta manual, web o WhatsApp).",
    entidad: "expediente",
  },
  {
    id: "nuevo-prospecto",
    nombre: "Nuevo prospecto",
    descripcion: "Cuando se registra un prospecto nuevo.",
    entidad: "prospecto",
  },
  {
    id: "cambio-etapa",
    nombre: "Cambio de etapa",
    descripcion: "Cuando un expediente avanza o cambia de etapa.",
    entidad: "expediente",
  },
  {
    id: "formulario-respondido",
    nombre: "Formulario respondido",
    descripcion: "Cuando el cliente responde un formulario en su portal.",
    entidad: "expediente",
  },
  {
    id: "cambio-campo",
    nombre: "Cambio en un campo",
    descripcion: "Cuando se edita un expediente y un campo cambia a cierto valor.",
    entidad: "expediente",
  },
];

/** Operadores de comparación para las condiciones. */
export const OPERADORES: { id: OperadorCondicion; nombre: string }[] = [
  { id: "igual", nombre: "es igual a" },
  { id: "distinto", nombre: "es distinto de" },
  { id: "contiene", nombre: "contiene" },
  { id: "cualquiera", nombre: "tiene cualquier valor" },
];

/** Tipos de acción que puede ejecutar el motor. */
export const TIPOS_ACCION: {
  id: TipoAccion;
  nombre: string;
  descripcion: string;
  requiereExpediente: boolean;
}[] = [
  {
    id: "enviar-formulario",
    nombre: "Enviar formulario",
    descripcion: "Asigna un formulario al expediente y avisa al cliente.",
    requiereExpediente: true,
  },
  {
    id: "enviar-correo",
    nombre: "Enviar correo",
    descripcion: "Envía un correo con la marca SAUCEDA al cliente.",
    requiereExpediente: true,
  },
  {
    id: "enviar-whatsapp",
    nombre: "Enviar WhatsApp",
    descripcion: "Envía un mensaje de WhatsApp al teléfono registrado.",
    requiereExpediente: false,
  },
  {
    id: "mover-etapa",
    nombre: "Mover de etapa",
    descripcion: "Cambia el expediente a otra etapa del flujo.",
    requiereExpediente: true,
  },
];

/** Campos (columnas reales) seleccionables en condiciones de expediente. */
export const CAMPOS_EXPEDIENTE: { id: string; nombre: string }[] = [
  { id: "etapa", nombre: "Etapa" },
  { id: "fraccionamiento", nombre: "Fraccionamiento" },
  { id: "situacion", nombre: "Situación" },
  { id: "telefono", nombre: "Teléfono" },
  { id: "valor_estimado", nombre: "Valor estimado" },
  { id: "saldo_deuda", nombre: "Saldo de deuda" },
  { id: "campaign_name", nombre: "Campaña" },
];

/** Campos (columnas reales) seleccionables en condiciones de prospecto. */
export const CAMPOS_PROSPECTO: { id: string; nombre: string }[] = [
  { id: "origen", nombre: "Origen" },
  { id: "ciudad", nombre: "Ciudad" },
  { id: "telefono", nombre: "Teléfono" },
  { id: "correo", nombre: "Correo" },
  { id: "campaign_name", nombre: "Campaña" },
];

/** Entidad sobre la que se evalúan las condiciones de un evento. */
export function entidadDeEvento(
  evento: EventoAutomatizacion,
): "expediente" | "prospecto" {
  return EVENTOS.find((e) => e.id === evento)?.entidad ?? "expediente";
}

/** Campos disponibles para las condiciones, según el evento. */
export function camposDeEvento(
  evento: EventoAutomatizacion,
): { id: string; nombre: string }[] {
  return entidadDeEvento(evento) === "prospecto"
    ? CAMPOS_PROSPECTO
    : CAMPOS_EXPEDIENTE;
}
