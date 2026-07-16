/**
 * Tipos del dominio de traspasos INFONAVIT.
 * Incremento 1: solo lo necesario para el tablero de expedientes.
 */

/** Identificador de cada etapa del flujo de traspaso. */
export type EtapaId =
  | "nuevo-lead"
  | "contactado"
  | "valuacion"
  | "oferta"
  | "documentos"
  | "notaria"
  | "cerrado"
  | "perdido"
  | "interes"
  | "cotizacion"
  | "visita"
  | "propuesta-aceptada"
  | "venta";

/** Definición visual y de orden de una etapa. */
export interface Etapa {
  id: EtapaId;
  nombre: string;
  /** Orden dentro del flujo (0 = primera). */
  orden: number;
  /** Descripción corta de lo que ocurre en la etapa (interna, para el asesor). */
  descripcion: string;
  /** Nombre de la etapa que ve el cliente en su portal. */
  nombreCliente: string;
  /** Descripción que ve el cliente en su portal. */
  descripcionCliente: string;
}

export type TipoNegocioId =
  | "traspaso_compra"
  | "promocion_venta"
  | "solo_tramite"
  | "construccion"
  | "construccion-impermeabilizacion"
  | "construccion-remodelacion"
  | "otro";

export function labelTipoNegocio(tipo: string): string {
  switch (tipo) {
    case "traspaso_compra":
      return "Traspaso / Compra";
    case "promocion_venta":
      return "Promoción Venta";
    case "solo_tramite":
      return "Solo Trámite";
    case "construccion":
      return "Sauceda Construye";
    case "construccion-impermeabilizacion":
      return "Construcción-Impermeabilización";
    case "construccion-remodelacion":
      return "Construcción-Remodelación";
    case "otro":
      return "Otro";
    default:
      return tipo || "—";
  }
}

/**
 * Analiza el mensaje inicial y el nombre de la campaña para auto-detectar
 * el tipo de negocio/servicio de interés.
 */
export function detectarTipoNegocio(mensaje: string, campaignName?: string): TipoNegocioId {
  const texto = `${mensaje} ${campaignName ?? ""}`.toLowerCase();

  if (
    texto.includes("remodela") ||
    texto.includes("remodelacion") ||
    texto.includes("remodelación") ||
    texto.includes("remodelar")
  ) {
    return "construccion-remodelacion";
  }

  if (
    texto.includes("impermeabili") ||
    texto.includes("gotera") ||
    texto.includes("humedad") ||
    texto.includes("impermeable") ||
    texto.includes("filtracion") ||
    texto.includes("filtración") ||
    texto.includes("azotea") ||
    texto.includes("concreto") ||
    texto.includes("construccion") ||
    texto.includes("construcción") ||
    texto.includes("reparacion") ||
    texto.includes("reparación")
  ) {
    return "construccion-impermeabilizacion";
  }

  if (
    texto.includes("construye") ||
    texto.includes("amplia") ||
    texto.includes("ampliación") ||
    texto.includes("albañil")
  ) {
    return "construccion";
  }

  if (
    texto.includes("tramite") ||
    texto.includes("trámite") ||
    texto.includes("gesti") ||
    texto.includes("armado") ||
    texto.includes("expediente")
  ) {
    return "solo_tramite";
  }

  if (
    texto.includes("promocion") ||
    texto.includes("promoción") ||
    texto.includes("venda") ||
    texto.includes("comision") ||
    texto.includes("comisión") ||
    texto.includes("vender") ||
    texto.includes("promover")
  ) {
    return "promocion_venta";
  }

  return "traspaso_compra";
}

/**
 * Expediente de un traspaso INFONAVIT.
 * Representa el caso de un cliente a lo largo del flujo de operación.
 */
export interface Expediente {
  id: string;
  /** Nombre(s) de pila del cliente titular del crédito. */
  cliente: string;
  /** Primer apellido del cliente. */
  primerApellido: string;
  /** Segundo apellido del cliente. */
  segundoApellido: string;
  /** Nombre completo armado (solo lectura). */
  nombreCompleto: string;
  /** Fraccionamiento / zona en León, Gto. */
  fraccionamiento: string;
  /** Etapa actual dentro del flujo. */
  etapa: EtapaId;
  /** Situación o estado de la deuda / caso. */
  situacion: string;
  /** Teléfono de contacto (mock). */
  telefono: string;
  /** Valor estimado del inmueble en pesos (mock). */
  valorEstimado: number;
  /** Saldo de la deuda INFONAVIT en pesos (mock). */
  saldoDeuda: number;
  /** Fecha del último movimiento (ISO). */
  ultimoMovimiento: string;
  /** Notas internas del asesor (NO se muestran al cliente). */
  notas: string;
  /** Atribución de campaña Meta. */
  adName: string;
  /** Adset de campaña Meta. */
  adsetName: string;
  /** Campaña Meta. */
  campaignName: string;
  /** Token aleatorio para el enlace privado de seguimiento del cliente. */
  token: string;
  /** Tipo de crédito (ej. INFONAVIT, FOVISSSTE, Bancario, etc.). */
  tipoCredito?: string | null;
  /** Dirección completa de la propiedad. */
  direccionPropiedad?: string | null;
  /** Enlace a la ubicación en Google Maps. */
  linkGoogleMaps?: string | null;
  /** Necesidad del cliente (ej. Vender, traspasar, etc.). */
  necesidad?: string | null;
  /** Tipo de negocio (ej. Traspaso/Compra, Promoción de venta, Solo trámite, etc.). */
  tipoNegocio?: TipoNegocioId | null;
  /** Prospecto (persona) dueño del expediente. Null si aún no se enlaza. */
  prospectoId: string | null;
  /** Asesor asignado al expediente. Null si no está asignado. */
  asesorId?: string | null;
  /** Nombre del asesor asignado (solo lectura, vía join). */
  asesorNombre?: string | null;
  /** Operador técnico asignado al expediente. Null si no está asignado. */
  operadorId?: string | null;
  /** Nombre del operador técnico asignado (solo lectura, vía join). */
  operadorNombre?: string | null;
  /** Origen de adquisición del prospecto enlazado (solo lectura, vía join). */
  origenProspecto: OrigenAdquisicion | null;
  /** Identificador técnico del canal de redes sociales (ej. messenger:PSID) */
  canalId?: string | null;
  /** Campos adicionales recopilados de la conversación */
  sinPagos?: string | null;
  estadoFisico?: string | null;
  habitada?: string | null;
  createdAt?: string;
  secuenciaNombre?: string | null;
  ultimaActividadTitulo?: string | null;
  ultimaActividadFecha?: string | null;
  /** Marca permanente: el expediente no cumple criterios de servicio. Bloquea todo contacto. */
  noViable?: boolean;
}

/**
 * Datos editables de un expediente (lo que captura el formulario).
 * El `id`, el `token` y la fecha de `ultimoMovimiento` los administra la app,
 * no el usuario.
 */
export type DatosExpediente = Omit<
  Expediente,
  "id" | "ultimoMovimiento" | "token" | "origenProspecto" | "nombreCompleto" | "asesorNombre" | "operadorNombre"
>;

/** Origen de adquisición de un prospecto (lista fija). */
export type OrigenAdquisicion =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "recomendacion"
  | "sitio-web"
  | "volante"
  | "otro";

/**
 * Prospecto: la persona (entidad central del CRM). Un prospecto puede
 * tener varios expedientes. "Cliente" no es otra entidad: es un estado
 * que se deriva de la etapa de sus expedientes.
 */
export type EstatusProspecto =
  | "nuevo"
  | "en_conversacion"
  | "no_viable"
  | "sin_contacto"
  | "expediente_abierto"
  | "cliente";

export type CalificacionProspecto =
  | "caliente"
  | "templado"
  | "frio"
  | "descalificado";

export interface Prospecto {
  id: string;
  /** Nombre(s) de pila. */
  nombre: string;
  /** Primer apellido. */
  primerApellido: string;
  /** Segundo apellido. */
  segundoApellido: string;
  /** Nombre completo armado (solo lectura). */
  nombreCompleto: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  /** Canal por el que se captó al prospecto. */
  origen: OrigenAdquisicion;
  /** Costo/valor de adquisición de la campaña, en pesos. */
  valorCampana: number;
  /** Atribución de campaña Meta. */
  adName: string;
  adsetName: string;
  campaignName: string;
  notas: string;
  /** Identificador técnico del canal de redes sociales (ej. messenger:PSID) */
  canalId?: string | null;
  /** Estado del ciclo del prospecto. */
  estatus: EstatusProspecto;
  /** Calificación / ranking del prospecto. */
  calificacion: CalificacionProspecto;
  /** Asesor asignado al prospecto. Null si no está asignado. */
  asesorId?: string | null;
  /** Nombre del asesor asignado (solo lectura, vía join). */
  asesorNombre?: string | null;
  /** Operador técnico asignado al prospecto. Null si no está asignado. */
  operadorId?: string | null;
  /** Nombre del operador técnico asignado (solo lectura, vía join). */
  operadorNombre?: string | null;
  /** Marca permanente: el prospecto no cumple criterios de servicio. Bloquea todo contacto. */
  noViable?: boolean;
  createdAt?: string;
}

/** Datos editables de un prospecto (el `id` lo administra la app). */
export type DatosProspecto = Omit<Prospecto, "id" | "nombreCompleto" | "asesorNombre" | "operadorNombre">;

// ------------------------------------------------------------
// MÓDULO FORMULARIOS
// ------------------------------------------------------------

/** Tipo de pregunta de un formulario. */
export type TipoPregunta =
  | "texto-corto"
  | "texto-largo"
  | "numero"
  | "opcion-multiple"
  | "si-no"
  | "fecha"
  | "archivo";

/** Una pregunta dentro de un formulario. */
export interface Pregunta {
  id: string;
  etiqueta: string;
  tipo: TipoPregunta;
  /** Opciones (solo para tipo opcion-multiple). */
  opciones: string[];
  requerido: boolean;
}

/** Plantilla de formulario reutilizable. */
export interface Formulario {
  id: string;
  titulo: string;
  descripcion: string;
  preguntas: Pregunta[];
}

/** Datos editables de un formulario (el `id` lo administra la app). */
export type DatosFormulario = Omit<Formulario, "id">;

/** Envío de un formulario a un expediente (con sus respuestas). */
export interface EnvioFormulario {
  id: string;
  formularioId: string;
  expedienteId: string;
  estado: "pendiente" | "respondido";
  /** Respuestas por id de pregunta. */
  respuestas: Record<string, string>;
}

/** Envío junto con la plantilla del formulario (para mostrarlo y llenarlo). */
export interface EnvioConFormulario extends EnvioFormulario {
  formulario: Formulario;
}

// ------------------------------------------------------------
// MÓDULO MENSAJES
// ------------------------------------------------------------

/** Plantilla de mensaje reutilizable. */
export interface Mensaje {
  id: string;
  titulo: string;
  texto: string;
}

/** Datos editables de un mensaje (el `id` lo administra la app). */
export type DatosMensaje = Omit<Mensaje, "id">;

/** Mensaje enviado a un expediente (visible en el portal del cliente). */
export interface MensajeEnviado {
  id: string;
  expedienteId: string;
  titulo: string;
  texto: string;
}

// ------------------------------------------------------------
// MÓDULO ACTIVIDADES (bitácora)
// ------------------------------------------------------------

export type TipoActividad =
  | "nota"
  | "llamada"
  | "correo"
  | "reunion"
  | "mensaje"
  | "formulario"
  | "etapa"
  | "creacion"
  | "sistema";

/** Una entrada de la bitácora de actividades. */
export interface Actividad {
  id: string;
  tipo: TipoActividad;
  titulo: string;
  detalle: string;
  /** Fecha/hora ISO. */
  fecha: string;
}

// ------------------------------------------------------------
// MÓDULO AUTOMATIZACIONES (motor de reglas por disparadores)
// ------------------------------------------------------------

/** Evento que dispara una automatización. */
export type EventoAutomatizacion =
  | "nuevo-expediente"
  | "nuevo-prospecto"
  | "cambio-etapa"
  | "formulario-respondido"
  | "cambio-campo";

/** Operador de comparación de una condición. */
export type OperadorCondicion = "igual" | "distinto" | "contiene" | "cualquiera";

/**
 * Condición que debe cumplirse para que la regla se ejecute. Se evalúa
 * contra una columna real de la entidad (expediente o prospecto). Todas
 * las condiciones de una regla se combinan con AND.
 */
export interface CondicionAutomatizacion {
  /** Columna de la entidad (ej. "etapa", "origen"). */
  campo: string;
  operador: OperadorCondicion;
  valor: string;
}

/** Tipo de acción que ejecuta una automatización. */
export type TipoAccion =
  | "enviar-formulario"
  | "enviar-correo"
  | "enviar-whatsapp"
  | "mover-etapa";

/**
 * Acción a ejecutar. Cada tipo usa solo algunos campos:
 *  - enviar-formulario: formularioId
 *  - enviar-correo: asunto, titulo, cuerpo
 *  - enviar-whatsapp: texto
 *  - mover-etapa: etapa
 */
export interface AccionAutomatizacion {
  tipo: TipoAccion;
  formularioId?: string;
  asunto?: string;
  titulo?: string;
  cuerpo?: string;
  texto?: string;
  etapa?: EtapaId;
  /**
   * WhatsApp: cómo se envía.
   *  - "texto": texto libre (solo entrega dentro de la ventana de 24 h).
   *  - "plantilla": plantilla aprobada en Meta (contacto en frío).
   * Si no se define, se asume "texto".
   */
  modoWhatsapp?: "texto" | "plantilla";
  /** Nombre real de la plantilla aprobada en Meta. */
  plantilla?: string;
  /** Idioma de la plantilla (ej. "es_MX"). */
  idiomaPlantilla?: string;
  /** Valores para los {{1}}, {{2}}… de la plantilla (admiten {nombre}). */
  parametros?: string[];
}

/** Una regla de automatización. */
export interface Automatizacion {
  id: string;
  nombre: string;
  activa: boolean;
  evento: EventoAutomatizacion;
  condiciones: CondicionAutomatizacion[];
  acciones: AccionAutomatizacion[];
}

/** Datos editables de una automatización (el `id` lo administra la app). */
export type DatosAutomatizacion = Omit<Automatizacion, "id">;

// ------------------------------------------------------------
// MÓDULO CONVERSACIONES DE WHATSAPP (bandeja bidireccional)
// ------------------------------------------------------------

/** Un mensaje dentro de un hilo de conversación de WhatsApp. */
export interface MensajeChat {
  id: string;
  /** 'in' = del cliente · 'out' = enviado por nosotros. */
  direccion: "in" | "out";
  texto: string;
  /** Estado del envío saliente: ''/'enviado'/'error'. */
  estado: string;
  /** Nombre del asesor que envió el mensaje saliente. */
  agente: string;
  fecha: string;
}

/** Resumen de una conversación (para la lista de la bandeja). */
export interface ConversacionResumen {
  telefono: string;
  expedienteId: string | null;
  prospectoId: string | null;
  nombre: string;
  ultimoTexto: string;
  ultimaFecha: string;
  /** Si hay un entrante en las últimas 24 h (se puede responder con texto). */
  ventanaAbierta: boolean;
  /** Asesor que la está atendiendo (último que respondió), o "" si nadie. */
  atiende: string;
  ultimoInboundFecha: string | null;
  finalizado: boolean;
  /** Dirección del último mensaje: 'in' = cliente esperando respuesta, 'out' = ya respondimos. */
  ultimaDireccion: "in" | "out";
}

/** Detalle de una conversación (hilo completo). */
export interface ConversacionDetalle {
  telefono: string;
  expedienteId: string | null;
  prospectoId: string | null;
  nombre: string;
  ventanaAbierta: boolean;
  mensajes: MensajeChat[];
  ultimoInboundFecha: string | null;
  finalizado: boolean;
  nombreProspecto?: string;
  nombreExpediente?: string;
  atiende?: string;
}

/** Una ejecución registrada del motor (bitácora de automatizaciones). */
export interface EjecucionAutomatizacion {
  id: string;
  automatizacionId: string | null;
  nombre: string;
  evento: string;
  expedienteId: string | null;
  prospectoId: string | null;
  estado: "ok" | "error" | "omitido";
  detalle: string;
  fecha: string;
}

// ------------------------------------------------------------
// MÓDULO CONSTRUCCIÓN (Sauceda Construye)
// ------------------------------------------------------------

export type ServicioConstruccionTipo = 'pintura' | 'impermeabilizacion' | 'losa' | 'remodelacion' | 'otro';

export type CotizacionEstatus =
  | 'borrador'
  | 'esperando_visita'
  | 'en_inspeccion'
  | 'calculando_costo'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'enviada'
  | 'aceptada'
  | 'rechazada'
  | 'archivada';

export interface Cotizacion {
  id: string;
  prospectoId: string;
  expedienteId?: string | null;
  prospectoNombre?: string;
  prospectoTelefono?: string;
  servicioTipo: ServicioConstruccionTipo;
  estatus: CotizacionEstatus;
  requiereVisita: boolean;
  fechaVisita?: string | null;
  inspectorId?: string | null;
  inspectorNombre?: string | null;
  costoEstimado: number;
  precioFinal: number;
  aprobadoComercial: boolean;
  aprobadoComercialBy?: string | null;
  aprobadoComercialByNombre?: string | null;
  aprobadoOperativo: boolean;
  aprobadoOperativoBy?: string | null;
  aprobadoOperativoByNombre?: string | null;
  token: string;
  notasInternas: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitaReporte {
  id: string;
  cotizacionId: string;
  inspectorId: string;
  inspectorNombre?: string;
  fechaInspeccion: string;
  observacionesTecnicas: string;
  condicionesSitio: string;
  medidas: Record<string, any>;
  fotos: string[];
  createdAt: string;
}

export interface CotizacionConcepto {
  id: string;
  cotizacionId: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  descuento?: number;
  importe: number;
  createdAt: string;
}

export interface ProductoServicio {
  id: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  createdAt: string;
}

