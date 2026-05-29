import type {
  DatosExpediente,
  DatosProspecto,
  EtapaId,
  Expediente,
  OrigenAdquisicion,
  Prospecto,
} from "@/lib/types";

/**
 * Fila tal como vive en la tabla `expedientes` de Supabase (snake_case).
 * Aquí se traduce entre la base de datos y el modelo que usa la app.
 */
export interface FilaExpediente {
  id: string;
  cliente: string;
  fraccionamiento: string;
  etapa: EtapaId;
  situacion: string;
  telefono: string;
  valor_estimado: number;
  saldo_deuda: number;
  notas: string;
  token: string;
  ultimo_movimiento: string;
  prospecto_id: string | null;
  /** Origen del prospecto enlazado (cuando se pide vía join). */
  prospectos?: { origen: OrigenAdquisicion } | null;
}

/** Fila de la BD → modelo de la app. */
export function aExpediente(fila: FilaExpediente): Expediente {
  return {
    id: fila.id,
    cliente: fila.cliente,
    fraccionamiento: fila.fraccionamiento,
    etapa: fila.etapa,
    situacion: fila.situacion,
    telefono: fila.telefono,
    valorEstimado: Number(fila.valor_estimado),
    saldoDeuda: Number(fila.saldo_deuda),
    notas: fila.notas,
    token: fila.token,
    ultimoMovimiento: fila.ultimo_movimiento,
    prospectoId: fila.prospecto_id,
    origenProspecto: fila.prospectos?.origen ?? null,
  };
}

/** Datos editables del formulario → columnas de la BD (snake_case). */
export function aFila(datos: DatosExpediente) {
  return {
    cliente: datos.cliente,
    fraccionamiento: datos.fraccionamiento,
    etapa: datos.etapa,
    situacion: datos.situacion,
    telefono: datos.telefono,
    valor_estimado: datos.valorEstimado,
    saldo_deuda: datos.saldoDeuda,
    notas: datos.notas,
    prospecto_id: datos.prospectoId,
  };
}

// ------------------------------------------------------------
// MÓDULO PROSPECTOS
// ------------------------------------------------------------

/** Fila de la tabla `prospectos` (snake_case). */
export interface FilaProspecto {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  origen: OrigenAdquisicion;
  valor_campana: number;
  notas: string;
}

/** Fila de la BD → modelo de la app. */
export function aProspecto(fila: FilaProspecto): Prospecto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    correo: fila.correo,
    direccion: fila.direccion,
    ciudad: fila.ciudad,
    origen: fila.origen,
    valorCampana: Number(fila.valor_campana),
    notas: fila.notas,
  };
}

/** Datos editables del formulario → columnas de la BD (snake_case). */
export function aFilaProspecto(datos: DatosProspecto) {
  return {
    nombre: datos.nombre,
    telefono: datos.telefono,
    correo: datos.correo,
    direccion: datos.direccion,
    ciudad: datos.ciudad,
    origen: datos.origen,
    valor_campana: datos.valorCampana,
    notas: datos.notas,
  };
}
