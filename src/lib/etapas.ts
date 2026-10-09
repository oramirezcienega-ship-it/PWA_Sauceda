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
    descripcion: "Negocio inicial calificado que entra a ventas.",
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
    id: "visita",
    nombre: "Inspección Programada",
    orden: 2,
    descripcion: "Inspección técnica en sitio agendada o en proceso de visita.",
    nombreCliente: "Inspección Programada",
    descripcionCliente:
      "Tu visita e inspección técnica en sitio han sido agendadas.",
  },
  {
    id: "oferta",
    nombre: "Propuesta enviada",
    orden: 3,
    descripcion: "Se presentó una propuesta o cotización formal al cliente.",
    nombreCliente: "Propuesta enviada",
    descripcionCliente: "Te presentamos una propuesta para tu trámite.",
  },
  {
    id: "cerrado",
    nombre: "Cerrado ganado",
    orden: 4,
    descripcion: "Traspaso o venta concluida con éxito.",
    nombreCliente: "Concluido",
    descripcionCliente:
      "¡Tu traspaso se concluyó con éxito! Gracias por confiar en SAUCEDA.",
  },
  {
    id: "en_pausa",
    nombre: "En pausa (retomar)",
    orden: 5,
    descripcion: "El cliente pidió retomarlo más adelante. Sin campañas hasta la fecha para retomar.",
    nombreCliente: "En pausa",
    descripcionCliente: "Retomaremos tu solicitud en la fecha que acordamos contigo.",
  },
  {
    id: "perdido",
    nombre: "Cerrado perdido",
    orden: 6,
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
  "en_pausa": 0.1,
  "captacion": 0.1,
  "precalificacion": 0.2,
  "busqueda": 0.3,
  "negociacion": 0.5,
  "expediente": 0.7,
  "escrituracion": 0.9,
  "entrega": 1.0,
};

export const ETAPAS_CONSTRUCCION: Etapa[] = [
  {
    id: "interes",
    nombre: "Interés (Negocio)",
    orden: 0,
    descripcion: "Cliente interesado, negocio inicial creado.",
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
    id: "en_pausa",
    nombre: "En pausa (retomar)",
    orden: 5,
    descripcion: "El cliente pidió retomarlo más adelante. Sin campañas hasta la fecha para retomar.",
    nombreCliente: "En pausa",
    descripcionCliente: "Retomaremos tu solicitud en la fecha que acordamos contigo.",
  },
  {
    id: "perdido",
    nombre: "Perdido",
    orden: 6,
    descripcion: "Cotización rechazada o no prosperó.",
    nombreCliente: "En pausa",
    descripcionCliente: "Por ahora tu cotización no continúa. Si tienes dudas, contáctanos.",
  },
];

/**
 * Asesoría y acompañamiento al comprador de vivienda (`asesoria_compra`).
 * Los ids coinciden con las etapas del flujo BPM. Si el cliente ya tiene casa
 * (`ya_tiene_casa`), se saltan Búsqueda y Negociación.
 */
export const ETAPAS_ASESORIA_COMPRA: Etapa[] = [
  {
    id: "captacion",
    nombre: "Captación",
    orden: 0,
    descripcion: "Contactar al comprador y levantar su perfil.",
    nombreCliente: "Solicitud recibida",
    descripcionCliente: "Recibimos tus datos. Un asesor te contactará para conocer lo que buscas.",
  },
  {
    id: "precalificacion",
    nombre: "Precalificación",
    orden: 1,
    descripcion: "Obtener la precalificación de crédito y registrar el perfil de búsqueda.",
    nombreCliente: "Precalificación",
    descripcionCliente: "Estamos revisando cuánto crédito te autorizan para saber tu poder de compra.",
  },
  {
    id: "busqueda",
    nombre: "Búsqueda",
    orden: 2,
    descripcion: "Cruzar el perfil con el inventario y con aliados; publicar opciones y visitar.",
    nombreCliente: "Buscando tu casa",
    descripcionCliente: "Estamos buscando casas que se ajusten a tu perfil. Revisa tus opciones en este portal.",
  },
  {
    id: "negociacion",
    nombre: "Negociación",
    orden: 3,
    descripcion: "Presentar oferta, confirmar fee con el aliado y firmar apartado / promesa.",
    nombreCliente: "Negociación",
    descripcionCliente: "Estamos negociando la casa que elegiste.",
  },
  {
    id: "expediente",
    nombre: "Expediente",
    orden: 4,
    descripcion: "Orden de trabajo del trámite: avalúo, libertad de gravamen, alineamiento y documentos.",
    nombreCliente: "Integración de expediente",
    descripcionCliente: "Estamos reuniendo los documentos y el avalúo para tu crédito.",
  },
  {
    id: "escrituracion",
    nombre: "Escrituración",
    orden: 5,
    descripcion: "Coordinar notaría y fecha de firma.",
    nombreCliente: "Escrituración",
    descripcionCliente: "Estamos coordinando con la notaría la fecha de firma de tu escritura.",
  },
  {
    id: "entrega",
    nombre: "Entrega",
    orden: 6,
    descripcion: "Entrega de llaves, testimonio y oferta de Construye.",
    nombreCliente: "Entrega",
    descripcionCliente: "¡Ya casi! Preparamos la entrega de llaves y de tu testimonio.",
  },
  {
    id: "cerrado",
    nombre: "Cerrado ganado",
    orden: 7,
    descripcion: "Compra concluida y casa entregada.",
    nombreCliente: "Concluido",
    descripcionCliente: "¡Felicidades por tu nueva casa! Gracias por confiar en SAUCEDA.",
  },
  {
    id: "en_pausa",
    nombre: "En pausa (retomar)",
    orden: 8,
    descripcion: "El cliente pidió retomarlo más adelante. Sin campañas hasta la fecha para retomar.",
    nombreCliente: "En pausa",
    descripcionCliente: "Retomaremos tu solicitud en la fecha que acordamos contigo.",
  },
  {
    id: "perdido",
    nombre: "Cerrado perdido",
    orden: 9,
    descripcion: "El comprador no continuó.",
    nombreCliente: "En pausa",
    descripcionCliente: "Por ahora tu proceso no continúa. Si tienes dudas, contáctanos con gusto.",
  },
];

/** Etapas de asesoría de compra que se saltan cuando el cliente ya tiene casa. */
export const ETAPAS_SOLO_BUSQUEDA: EtapaId[] = ["busqueda", "negociacion"];

/** Etapas exclusivas de asesoría de compra (no existen en los demás pipelines). */
export const IDS_ETAPAS_ASESORIA_COMPRA: EtapaId[] = [
  "captacion", "precalificacion", "busqueda", "negociacion", "expediente", "escrituracion", "entrega",
];

export function esTipoNegocioAsesoriaCompra(tipoNegocio?: string | null): boolean {
  return tipoNegocio === "asesoria_compra";
}

/** Lista unificada de todas las etapas posibles (Traspasos + Construcción + Asesoría de compra). */
export const TODAS_LAS_ETAPAS: Etapa[] = [
  ...ETAPAS,
  ...ETAPAS_CONSTRUCCION.filter((ec) => !ETAPAS.some((e) => e.id === ec.id)),
  ...ETAPAS_ASESORIA_COMPRA.filter((ea) => IDS_ETAPAS_ASESORIA_COMPRA.includes(ea.id)),
];

/** Mapa de acceso rápido por id de etapa para Traspasos. */
export const ETAPAS_POR_ID: Record<EtapaId, Etapa> = ETAPAS.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {
    valuacion: {
      id: "valuacion" as EtapaId,
      nombre: "Propuesta enviada",
      orden: 2,
      descripcion: "Propuesta enviada al cliente.",
      nombreCliente: "Propuesta enviada",
      descripcionCliente: "Te presentamos una propuesta para tu trámite.",
    },
    documentos: {
      id: "documentos" as EtapaId,
      nombre: "Propuesta enviada",
      orden: 2,
      descripcion: "Documentación y propuesta.",
      nombreCliente: "Documentación",
      descripcionCliente: "Reuniendo documentos.",
    },
    notaria: {
      id: "notaria" as EtapaId,
      nombre: "Propuesta enviada",
      orden: 2,
      descripcion: "Trámite ante notaría.",
      nombreCliente: "Notaría",
      descripcionCliente: "Trámite en notaría.",
    },
  } as Record<EtapaId, Etapa>,
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

export const ETAPAS_ASESORIA_COMPRA_POR_ID: Record<string, Etapa> = ETAPAS_ASESORIA_COMPRA.reduce(
  (acc, etapa) => {
    acc[etapa.id] = etapa;
    return acc;
  },
  {} as Record<string, Etapa>,
);

export interface OpcionesEtapas {
  /** Asesoría de compra: el cliente ya tiene casa (se saltan Búsqueda y Negociación). */
  yaTieneCasa?: boolean | null;
}

export function obtenerEtapasPorNegocio(tipoNegocio?: string | null, opciones?: OpcionesEtapas): Etapa[] {
  if (esTipoNegocioConstruccion(tipoNegocio)) {
    return ETAPAS_CONSTRUCCION;
  }
  if (esTipoNegocioAsesoriaCompra(tipoNegocio)) {
    return opciones?.yaTieneCasa
      ? ETAPAS_ASESORIA_COMPRA.filter((e) => !ETAPAS_SOLO_BUSQUEDA.includes(e.id))
      : ETAPAS_ASESORIA_COMPRA;
  }
  return ETAPAS;
}

export function obtenerEtapasPorId(tipoNegocio?: string | null): Record<string, Etapa> {
  if (esTipoNegocioConstruccion(tipoNegocio)) {
    return ETAPAS_CONSTRUCCION_POR_ID;
  }
  if (esTipoNegocioAsesoriaCompra(tipoNegocio)) {
    return ETAPAS_ASESORIA_COMPRA_POR_ID;
  }
  return TODAS_LAS_ETAPAS_POR_ID;
}

/** Asesoría de compra: etapas navegables en orden (se respetan las que se saltan). */
function vecinaAsesoria(id: EtapaId, paso: 1 | -1, opciones?: OpcionesEtapas): Etapa | null {
  const lista = obtenerEtapasPorNegocio("asesoria_compra", opciones).filter(
    (e) => e.id !== "en_pausa" && e.id !== "perdido",
  );
  const i = lista.findIndex((e) => e.id === id);
  if (i === -1) return null;
  return lista[i + paso] ?? null;
}

/** Devuelve la etapa siguiente en el flujo, o null si ya es la última. */
export function etapaSiguiente(id: EtapaId, tipoNegocio?: string | null, opciones?: OpcionesEtapas): Etapa | null {
  if (esTipoNegocioAsesoriaCompra(tipoNegocio)) return vecinaAsesoria(id, 1, opciones);
  const etapas = obtenerEtapasPorNegocio(tipoNegocio);
  const mapa = obtenerEtapasPorId(tipoNegocio);
  const actual = mapa[id];
  if (!actual) return null;
  return etapas.find((e) => e.orden === actual.orden + 1) ?? null;
}

/** Devuelve la etapa anterior en el flujo, o null si ya es la primera. */
export function etapaAnterior(id: EtapaId, tipoNegocio?: string | null, opciones?: OpcionesEtapas): Etapa | null {
  if (esTipoNegocioAsesoriaCompra(tipoNegocio)) return vecinaAsesoria(id, -1, opciones);
  const etapas = obtenerEtapasPorNegocio(tipoNegocio);
  const mapa = obtenerEtapasPorId(tipoNegocio);
  const actual = mapa[id];
  if (!actual) return null;
  return etapas.find((e) => e.orden === actual.orden - 1) ?? null;
}

