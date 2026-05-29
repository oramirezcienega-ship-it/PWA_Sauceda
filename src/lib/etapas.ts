import type { Etapa, EtapaId } from "./types";

/**
 * Flujo de operación de un traspaso INFONAVIT (en orden).
 * Nuevo lead → Contactado → Valuación → Oferta → Documentos → Notaría → Cerrado.
 * (Perdido es un estado terminal aparte.)
 *
 * Cada etapa tiene textos INTERNOS (nombre/descripcion, para el asesor) y
 * textos PARA EL CLIENTE (nombreCliente/descripcionCliente, que ve en su portal).
 */
export const ETAPAS: Etapa[] = [
  {
    id: "nuevo-lead",
    nombre: "Nuevo lead",
    orden: 0,
    descripcion: "Prospecto recién captado, sin contacto aún.",
    nombreCliente: "Solicitud recibida",
    descripcionCliente:
      "Recibimos tus datos. En breve un asesor se pondrá en contacto contigo.",
  },
  {
    id: "contactado",
    nombre: "Contactado",
    orden: 1,
    descripcion: "Ya se estableció comunicación con el cliente.",
    nombreCliente: "En contacto",
    descripcionCliente:
      "Ya estamos en comunicación contigo y revisando tu caso.",
  },
  {
    id: "valuacion",
    nombre: "Valuación",
    orden: 2,
    descripcion: "Se está valuando el inmueble y revisando el saldo.",
    nombreCliente: "Valuación",
    descripcionCliente: "Estamos valuando tu propiedad y revisando tu saldo.",
  },
  {
    id: "oferta",
    nombre: "Oferta",
    orden: 3,
    descripcion: "Se presentó una oferta de traspaso al cliente.",
    nombreCliente: "Propuesta",
    descripcionCliente: "Te presentamos una propuesta para tu traspaso.",
  },
  {
    id: "documentos",
    nombre: "Documentos",
    orden: 4,
    descripcion: "Recopilación y validación de la documentación.",
    nombreCliente: "Documentación",
    descripcionCliente: "Estamos reuniendo y validando tus documentos.",
  },
  {
    id: "notaria",
    nombre: "Notaría",
    orden: 5,
    descripcion: "Trámite en proceso ante notaría.",
    nombreCliente: "Notaría",
    descripcionCliente: "Tu trámite está en proceso ante notaría.",
  },
  {
    id: "cerrado",
    nombre: "Cerrado",
    orden: 6,
    descripcion: "Traspaso concluido con éxito.",
    nombreCliente: "Concluido",
    descripcionCliente:
      "¡Tu traspaso se concluyó con éxito! Gracias por confiar en SAUCEDA.",
  },
  {
    id: "perdido",
    nombre: "Perdido",
    orden: 7,
    descripcion: "Lead o traspaso que no prosperó.",
    nombreCliente: "En pausa",
    descripcionCliente:
      "Por ahora tu trámite no continúa. Si tienes dudas, contáctanos con gusto.",
  },
];

/** Mapa de acceso rápido por id de etapa. */
export const ETAPAS_POR_ID: Record<EtapaId, Etapa> = ETAPAS.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {} as Record<EtapaId, Etapa>,
);

/** Devuelve la etapa siguiente en el flujo, o null si ya es la última. */
export function etapaSiguiente(id: EtapaId): Etapa | null {
  const actual = ETAPAS_POR_ID[id];
  return ETAPAS.find((e) => e.orden === actual.orden + 1) ?? null;
}

/** Devuelve la etapa anterior en el flujo, o null si ya es la primera. */
export function etapaAnterior(id: EtapaId): Etapa | null {
  const actual = ETAPAS_POR_ID[id];
  return ETAPAS.find((e) => e.orden === actual.orden - 1) ?? null;
}
