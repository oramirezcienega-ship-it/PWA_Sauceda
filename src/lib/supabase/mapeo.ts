import type {
  DatosExpediente,
  DatosProspecto,
  EtapaId,
  Expediente,
  OrigenAdquisicion,
  Prospecto,
  EstatusProspecto,
  CalificacionProspecto,
  TipoNegocioId,
} from "@/lib/types";

/** Arma el nombre completo a partir de nombre + apellidos. */
export function nombreCompleto(
  nombre: string,
  primerApellido: string,
  segundoApellido: string,
): string {
  return [nombre, primerApellido, segundoApellido]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Fila tal como vive en la tabla `expedientes` de Supabase (snake_case).
 * Aquí se traduce entre la base de datos y el modelo que usa la app.
 */
export interface FilaExpediente {
  id: string;
  cliente: string;
  primer_apellido: string;
  segundo_apellido: string;
  fraccionamiento: string;
  etapa: EtapaId;
  situacion: string;
  telefono: string;
  valor_estimado: number;
  saldo_deuda: number;
  notas: string;
  ad_name: string;
  adset_name: string;
  campaign_name: string;
  token: string;
  ultimo_movimiento: string;
  prospecto_id: string | null;
  tipo_credito?: string | null;
  direccion_propiedad?: string | null;
  link_google_maps?: string | null;
  necesidad?: string | null;
  tipo_negocio?: TipoNegocioId | null;
  canal_id?: string | null;
  sin_pagos?: string | null;
  estado_fisico?: string | null;
  habitada?: string | null;
  created_at?: string;
  /** Origen del prospecto enlazado (cuando se pide vía join). */
  prospectos?: { origen: OrigenAdquisicion } | null;
  asesor_id?: string | null;
  operador_id?: string | null;
  asesor?: { nombre: string } | null;
  operador?: { nombre: string } | null;
  perfiles?: { nombre: string } | null;
  no_viable?: boolean;
  session_token_client?: string | null;
  status_proceso?: string | null;
  fecha_confirmacion?: string | null;
}

/** Fila de la BD → modelo de la app. */
export function aExpediente(fila: FilaExpediente): Expediente {
  return {
    id: fila.id,
    cliente: fila.cliente,
    primerApellido: fila.primer_apellido ?? "",
    segundoApellido: fila.segundo_apellido ?? "",
    nombreCompleto: nombreCompleto(
      fila.cliente,
      fila.primer_apellido ?? "",
      fila.segundo_apellido ?? "",
    ),
    fraccionamiento: fila.fraccionamiento,
    etapa: fila.etapa,
    situacion: fila.situacion,
    telefono: fila.telefono,
    valorEstimado: Number(fila.valor_estimado),
    saldoDeuda: Number(fila.saldo_deuda),
    notas: fila.notas,
    adName: fila.ad_name ?? "",
    adsetName: fila.adset_name ?? "",
    campaignName: fila.campaign_name ?? "",
    token: fila.token,
    ultimoMovimiento: fila.ultimo_movimiento,
    prospectoId: fila.prospecto_id,
    origenProspecto: fila.prospectos?.origen ?? null,
    tipoCredito: fila.tipo_credito ?? "",
    direccionPropiedad: fila.direccion_propiedad ?? "",
    linkGoogleMaps: fila.link_google_maps ?? "",
    necesidad: fila.necesidad ?? "",
    tipoNegocio: fila.tipo_negocio ?? "traspaso_compra",
    canalId: fila.canal_id ?? "",
    sinPagos: fila.sin_pagos ?? "",
    estadoFisico: fila.estado_fisico ?? "",
    habitada: fila.habitada ?? "",
    createdAt: fila.created_at ?? "",
    asesorId: fila.asesor_id ?? null,
    asesorNombre: fila.asesor?.nombre ?? fila.perfiles?.nombre ?? null,
    operadorId: fila.operador_id ?? null,
    operadorNombre: fila.operador?.nombre ?? null,
    noViable: fila.no_viable ?? false,
    sessionTokenClient: fila.session_token_client ?? null,
    statusProceso: fila.status_proceso ?? null,
    fechaConfirmacion: fila.fecha_confirmacion ?? null,
  };
}

/** Datos editables del formulario → columnas de la BD (snake_case). */
export function aFila(datos: DatosExpediente) {
  return {
    cliente: datos.cliente || "",
    primer_apellido: datos.primerApellido || "",
    segundo_apellido: datos.segundoApellido || "",
    fraccionamiento: datos.fraccionamiento || "",
    etapa: datos.etapa,
    situacion: datos.situacion || "",
    telefono: datos.telefono || "",
    valor_estimado: Number(datos.valorEstimado) || 0,
    saldo_deuda: Number(datos.saldoDeuda) || 0,
    notas: datos.notas || "",
    ad_name: datos.adName || "",
    adset_name: datos.adsetName || "",
    campaign_name: datos.campaignName || "",
    prospecto_id: datos.prospectoId,
    tipo_credito: datos.tipoCredito ?? null,
    direccion_propiedad: datos.direccionPropiedad ?? null,
    link_google_maps: datos.linkGoogleMaps ?? null,
    necesidad: datos.necesidad ?? null,
    tipo_negocio: (datos.tipoNegocio && datos.tipoNegocio.trim()) ? datos.tipoNegocio : "traspaso_compra",
    canal_id: datos.canalId || "",
    sin_pagos: datos.sinPagos ?? null,
    estado_fisico: datos.estadoFisico ?? null,
    habitada: datos.habitada ?? null,
    asesor_id: datos.asesorId ?? null,
    operador_id: datos.operadorId ?? null,
  };
}

// ------------------------------------------------------------
// MÓDULO PROSPECTOS
// ------------------------------------------------------------

/** Fila de la tabla `prospectos` (snake_case). */
export interface FilaProspecto {
  id: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  origen: OrigenAdquisicion;
  valor_campana: number;
  ad_name: string;
  adset_name: string;
  campaign_name: string;
  notas: string;
  canal_id?: string | null;
  estatus?: EstatusProspecto;
  calificacion?: CalificacionProspecto;
  asesor_id?: string | null;
  operador_id?: string | null;
  asesor?: { nombre: string } | null;
  operador?: { nombre: string } | null;
  perfiles?: { nombre: string } | null;
  no_viable?: boolean;
  created_at?: string;
}

/** Fila de la BD → modelo de la app. */
export function aProspecto(fila: FilaProspecto): Prospecto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    primerApellido: fila.primer_apellido ?? "",
    segundoApellido: fila.segundo_apellido ?? "",
    nombreCompleto: nombreCompleto(
      fila.nombre,
      fila.primer_apellido ?? "",
      fila.segundo_apellido ?? "",
    ),
    telefono: fila.telefono,
    correo: fila.correo,
    direccion: fila.direccion,
    ciudad: fila.ciudad,
    origen: fila.origen,
    valorCampana: Number(fila.valor_campana),
    adName: fila.ad_name ?? "",
    adsetName: fila.adset_name ?? "",
    campaignName: fila.campaign_name ?? "",
    notas: fila.notas,
    canalId: fila.canal_id ?? "",
    estatus: fila.estatus ?? "nuevo",
    calificacion: fila.calificacion ?? "frio",
    asesorId: fila.asesor_id ?? null,
    asesorNombre: fila.asesor?.nombre ?? fila.perfiles?.nombre ?? null,
    operadorId: fila.operador_id ?? null,
    operadorNombre: fila.operador?.nombre ?? null,
    noViable: fila.no_viable ?? false,
    createdAt: fila.created_at ?? "",
  };
}

/** Datos editables del formulario → columnas de la BD (snake_case). */
export function aFilaProspecto(datos: DatosProspecto) {
  return {
    nombre: datos.nombre || "",
    primer_apellido: datos.primerApellido || "",
    segundo_apellido: datos.segundoApellido || "",
    telefono: datos.telefono || "",
    correo: datos.correo || "",
    direccion: datos.direccion || "",
    ciudad: datos.ciudad || "",
    origen: datos.origen || "otro",
    valor_campana: Number(datos.valorCampana) || 0,
    ad_name: datos.adName || "",
    adset_name: datos.adsetName || "",
    campaign_name: datos.campaignName || "",
    notas: datos.notas || "",
    canal_id: datos.canalId || "",
    estatus: datos.estatus || "nuevo",
    calificacion: datos.calificacion || "frio",
    asesor_id: datos.asesorId || null,
    operador_id: datos.operadorId || null,
  };
}
