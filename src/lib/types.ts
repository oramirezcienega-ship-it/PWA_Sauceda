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
  | "cerrado";

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
}

/**
 * Datos editables de un expediente (lo que captura el formulario).
 * El `id`, el `token` y la fecha de `ultimoMovimiento` los administra la app,
 * no el usuario.
 */
export type DatosExpediente = Omit<
  Expediente,
  "id" | "ultimoMovimiento" | "token"
>;
