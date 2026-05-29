import type { DatosExpediente, EtapaId, Expediente } from "@/lib/types";

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
  };
}
