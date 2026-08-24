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
    nombre: "Nuevo",
    orden: 0,
    descripcion: "Expediente inicial calificado que entra a ventas.",
    nombreCliente: "Solicitud recibida",
    descripcionCliente:
      "Recibimos tus datos. En breve un asesor se pondrá en contacto contigo.",
  },
  {
    id: "contactado",
    nombre: "Contacto inicial",
    orden: 1,
    descripcion: "Ya se estableció comunicación formal con el cliente.",
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
    descripcionCliente: "Estamos evaluando tu propiedad y revisando tu saldo.",
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
    nombre: "Cerrado ganado",
    orden: 6,
    descripcion: "Traspaso o venta concluida con éxito.",
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

/** Probabilidad estimada de cierre por etapa para el cálculo del valor ponderado (estilo HubSpot). */
export const PROBABILIDAD_POR_ETAPA: Record<EtapaId, number> = {
  "nuevo-lead": 0.1,
  "contactado": 0.2,
  "valuacion": 0.4,
  "oferta": 0.6,
  "documentos": 0.8,
  "notaria": 0.9,
  "cerrado": 1.0,
  "perdido": 0.0,
  "interes": 0.1,
  "cotizacion": 0.3,
  "visita": 0.5,
  "propuesta-aceptada": 0.8,
  "venta": 1.0,
};

export const ETAPAS_CONSTRUCCION: Etapa[] = [
  {
    id: "interes",
    nombre: "Interés (Expediente)",
    orden: 0,
    descripcion: "Cliente interesado, expediente inicial creado.",
    nombreCliente: "Interés",
    descripcionCliente: "Hemos recibido tus datos y estamos revisando tu caso.",
  },
  {
    id: "cotizacion",
    nombre: "Cotización",
    orden: 1,
    descripcion: "Cotización en borrador o en costeo.",
    nombreCliente: "Cotización en preparación",
    descripcionCliente: "Estamos preparando tu cotización.",
  },
  {
    id: "visita",
    nombre: "Visita Técnica",
    orden: 2,
    descripcion: "Visita técnica programada o en inspección.",
    nombreCliente: "Visita Técnica",
    descripcionCliente: "Programando o realizando la visita técnica a tu propiedad.",
  },
  {
    id: "propuesta-aceptada",
    nombre: "Propuesta Aceptada",
    orden: 3,
    descripcion: "La cotización fue aprobada y aceptada por el cliente.",
    nombreCliente: "Propuesta Aceptada",
    descripcionCliente: "¡Has aceptado nuestra propuesta! Programando orden de trabajo.",
  },
  {
    id: "venta",
    nombre: "Venta (Cerrado)",
    orden: 4,
    descripcion: "Venta cerrada y obra ejecutada/cobrada.",
    nombreCliente: "Servicio Concluido",
    descripcionCliente: "¡Tu servicio se concluyó con éxito! Gracias por confiar en nosotros.",
  },
  {
    id: "perdido",
    nombre: "Perdido",
    orden: 5,
    descripcion: "Cotización rechazada o no prosperó.",
    nombreCliente: "En pausa",
    descripcionCliente: "Por ahora tu cotización no continúa. Si tienes dudas, contáctanos.",
  },
];

/** Lista unificada de todas las etapas posibles (Traspasos + Construcción). */
export const TODAS_LAS_ETAPAS: Etapa[] = [
  ...ETAPAS,
  ...ETAPAS_CONSTRUCCION.filter((ec) => !ETAPAS.some((e) => e.id === ec.id)),
];

/** Mapa de acceso rápido por id de etapa para Traspasos. */
export const ETAPAS_POR_ID: Record<EtapaId, Etapa> = ETAPAS.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {} as Record<EtapaId, Etapa>,
);

export const ETAPAS_CONSTRUCCION_POR_ID: Record<string, Etapa> = ETAPAS_CONSTRUCCION.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {} as Record<string, Etapa>,
);

/** Mapa global de todas las etapas por ID. */
export const TODAS_LAS_ETAPAS_POR_ID: Record<string, Etapa> = TODAS_LAS_ETAPAS.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {} as Record<string, Etapa>,
);

export function esTipoNegocioConstruccion(tipoNegocio?: string | null): boolean {
  if (!tipoNegocio) return false;
  return (
    tipoNegocio === "construccion" ||
    tipoNegocio.startsWith("construccion-") ||
    tipoNegocio === "construccion-impermeabilizacion" ||
    tipoNegocio === "construccion-remodelacion"
  );
}

export function obtenerEtapasPorNegocio(tipoNegocio?: string | null): Etapa[] {
  if (esTipoNegocioConstruccion(tipoNegocio)) {
    return ETAPAS_CONSTRUCCION;
  }
  return ETAPAS;
}

export function obtenerEtapasPorId(tipoNegocio?: string | null): Record<string, Etapa> {
  if (esTipoNegocioConstruccion(tipoNegocio)) {
    return ETAPAS_CONSTRUCCION_POR_ID;
  }
  return TODAS_LAS_ETAPAS_POR_ID;
}

/** Devuelve la etapa siguiente en el flujo, o null si ya es la última. */
export function etapaSiguiente(id: EtapaId, tipoNegocio?: string | null): Etapa | null {
  const etapas = obtenerEtapasPorNegocio(tipoNegocio);
  const mapa = obtenerEtapasPorId(tipoNegocio);
  const actual = mapa[id];
  if (!actual) return null;
  return etapas.find((e) => e.orden === actual.orden + 1) ?? null;
}

/** Devuelve la etapa anterior en el flujo, o null si ya es la primera. */
export function etapaAnterior(id: EtapaId, tipoNegocio?: string | null): Etapa | null {
  const etapas = obtenerEtapasPorNegocio(tipoNegocio);
  const mapa = obtenerEtapasPorId(tipoNegocio);
  const actual = mapa[id];
  if (!actual) return null;
  return etapas.find((e) => e.orden === actual.orden - 1) ?? null;
}

