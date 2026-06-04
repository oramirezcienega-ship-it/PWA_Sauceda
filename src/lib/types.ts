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
  | "perdido";

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
  adsetName: string;
  campaignName: string;
  /** Token aleatorio para el enlace privado de seguimiento del cliente. */
  token: string;
  /** Prospecto (persona) dueño del expediente. Null si aún no se enlaza. */
  prospectoId: string | null;
  /** Origen de adquisición del prospecto enlazado (solo lectura, vía join). */
  origenProspecto: OrigenAdquisicion | null;
}

/**
 * Datos editables de un expediente (lo que captura el formulario).
 * El `id`, el `token` y la fecha de `ultimoMovimiento` los administra la app,
 * no el usuario.
 */
export type DatosExpediente = Omit<
  Expediente,
  "id" | "ultimoMovimiento" | "token" | "origenProspecto" | "nombreCompleto"
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
}

/** Datos editables de un prospecto (el `id` lo administra la app). */
export type DatosProspecto = Omit<Prospecto, "id" | "nombreCompleto">;

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
