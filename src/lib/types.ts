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
  /** Descripción corta de lo que ocurre en la etapa. */
  descripcion: string;
}

/**
 * Expediente de un traspaso INFONAVIT.
 * Representa el caso de un cliente a lo largo del flujo de operación.
 */
export interface Expediente {
  id: string;
  /** Nombre del cliente titular del crédito. */
  cliente: string;
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
  "id" | "ultimoMovimiento" | "token" | "origenProspecto"
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
  nombre: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  /** Canal por el que se captó al prospecto. */
  origen: OrigenAdquisicion;
  /** Costo/valor de adquisición de la campaña, en pesos. */
  valorCampana: number;
  notas: string;
}

/** Datos editables de un prospecto (el `id` lo administra la app). */
export type DatosProspecto = Omit<Prospecto, "id">;

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
  | "fecha";

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
