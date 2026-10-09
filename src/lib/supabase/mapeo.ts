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
  Empresa,
  DatosEmpresa,
  Proveedor,
  DatosProveedor,
  DocumentoProveedor,
  DatosDocumentoProveedor,
  TipoDocumentoProveedor,
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
  prospectos?: {
    origen?: OrigenAdquisicion | null;
    correo?: string | null;
    direccion?: string | null;
    campaign_name?: string | null;
    adset_name?: string | null;
    ad_name?: string | null;
  } | null;
  empresa_id?: string | null;
  empresas?: { id: string; name: string } | null;
  empresa?: { id: string; name: string } | null;
  asesor_id?: string | null;
  operador_id?: string | null;
  asesor?: { nombre: string } | null;
  operador?: { nombre: string } | null;
  perfiles?: { nombre: string } | null;
  no_viable?: boolean;
  session_token_client?: string | null;
  status_proceso?: string | null;
  fecha_confirmacion?: string | null;
  calificacion?: CalificacionProspecto;
  ya_tiene_casa?: boolean | null;
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
    adName: fila.ad_name || fila.prospectos?.ad_name || "",
    adsetName: fila.adset_name || fila.prospectos?.adset_name || "",
    campaignName: fila.campaign_name || fila.prospectos?.campaign_name || "",
    token: fila.token,
    ultimoMovimiento: fila.ultimo_movimiento,
    prospectoId: fila.prospecto_id,
    origenProspecto: fila.prospectos?.origen || (fila as any).origen || null,
    prospectoCorreo: fila.prospectos?.correo ?? null,
    prospectoDireccion: fila.prospectos?.direccion ?? null,
    tipoCredito: fila.tipo_credito ?? "",
    direccionPropiedad: fila.direccion_propiedad ?? "",
    linkGoogleMaps: fila.link_google_maps ?? "",
    necesidad: fila.necesidad ?? "",
    tipoNegocio: fila.tipo_negocio ?? "otro",
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
    calificacion: fila.calificacion ?? "frio",
    empresaId: fila.empresa_id ?? null,
    empresaNombre: fila.empresas?.name ?? fila.empresa?.name ?? null,
    yaTieneCasa: fila.ya_tiene_casa ?? false,
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
    tipo_negocio: (datos.tipoNegocio && datos.tipoNegocio.trim()) ? datos.tipoNegocio : "otro",
    canal_id: datos.canalId || "",
    sin_pagos: datos.sinPagos ?? null,
    estado_fisico: datos.estadoFisico ?? null,
    habitada: datos.habitada ?? null,
    asesor_id: datos.asesorId ?? null,
    operador_id: datos.operadorId ?? null,
    calificacion: datos.calificacion || "frio",
    empresa_id: datos.empresaId ?? null,
    // Solo se escribe si el formulario lo trae (no pisa el perfil de búsqueda).
    ...(datos.yaTieneCasa !== undefined && datos.yaTieneCasa !== null
      ? { ya_tiene_casa: Boolean(datos.yaTieneCasa) }
      : {}),
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
  expedientes?: { id: string; tipo_negocio?: string | null; etapa?: string | null }[] | null;
  empresa_id?: string | null;
  empresas?: { id: string; name: string } | null;
  created_at?: string;
}

/** Fila de la BD → modelo de la app. */
export function aProspecto(fila: FilaProspecto): Prospecto {
  const exps = fila.expedientes || [];
  const expActivo = exps.find((e) => e.etapa !== "cerrado" && e.etapa !== "perdido" && e.etapa !== "venta") || exps[0];
  const tipoNegocioPrincipal = expActivo?.tipo_negocio || null;
  const expedientesCount = exps.length;

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
    tipoNegocioPrincipal,
    expedientesCount,
    empresaId: fila.empresa_id ?? null,
    empresaNombre: fila.empresas?.name ?? null,
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
    empresa_id: datos.empresaId || null,
  };
}

// ------------------------------------------------------------
// MÓDULO EMPRESAS (COMPANIES - B2B)
// ------------------------------------------------------------

export interface FilaEmpresa {
  id: string;
  name: string;
  industry: string;
  website: string;
  phone: string;
  address: string;
  billing_address: string;
  owner_id?: string | null;
  perfiles?: { nombre: string } | null;
  parent_id?: string | null;
  parent?: { name: string } | null;
  created_at: string;
  updated_at: string;
  prospectos?: { count?: number }[] | { count: number } | null;
  expedientes?: { count?: number; valor_estimado?: number }[] | null;
}

export function aEmpresa(
  fila: FilaEmpresa,
  metricas?: { prospectosCount?: number; negociosCount?: number; valorTotalNegocios?: number; sucursalesCount?: number }
): Empresa {
  return {
    id: fila.id,
    name: fila.name,
    industry: fila.industry ?? "",
    website: fila.website ?? "",
    phone: fila.phone ?? "",
    address: fila.address ?? "",
    billingAddress: fila.billing_address ?? "",
    ownerId: fila.owner_id ?? null,
    ownerNombre: fila.perfiles?.nombre ?? null,
    parentId: fila.parent_id ?? null,
    parentNombre: fila.parent?.name ?? null,
    createdAt: fila.created_at ?? "",
    updatedAt: fila.updated_at ?? "",
    sucursalesCount: metricas?.sucursalesCount ?? 0,
    prospectosCount: metricas?.prospectosCount ?? 0,
    negociosCount: metricas?.negociosCount ?? 0,
    valorTotalNegocios: metricas?.valorTotalNegocios ?? 0,
  };
}

export function aFilaEmpresa(datos: DatosEmpresa) {
  return {
    name: datos.name.trim(),
    industry: datos.industry || "",
    website: datos.website || "",
    phone: datos.phone || "",
    address: datos.address || "",
    billing_address: datos.billingAddress || "",
    owner_id: datos.ownerId || null,
    parent_id: datos.parentId || null,
  };
}

// ------------------------------------------------------------
// MÓDULO PROVEEDORES
// ------------------------------------------------------------

export interface FilaProveedor {
  id: string;
  nombre: string;
  razon_social: string;
  rfc: string;
  categoria: string;
  contacto_nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export function aProveedor(
  fila: FilaProveedor,
  metricas?: { totalDocumentos?: number; montoTotal?: number }
): Proveedor {
  return {
    id: fila.id,
    nombre: fila.nombre,
    razonSocial: fila.razon_social ?? "",
    rfc: fila.rfc ?? "",
    categoria: fila.categoria ?? "",
    contactoNombre: fila.contacto_nombre ?? "",
    telefono: fila.telefono ?? "",
    email: fila.email ?? "",
    direccion: fila.direccion ?? "",
    notas: fila.notas ?? "",
    activo: fila.activo ?? true,
    createdAt: fila.created_at ?? "",
    updatedAt: fila.updated_at ?? "",
    totalDocumentos: metricas?.totalDocumentos ?? 0,
    montoTotal: metricas?.montoTotal ?? 0,
  };
}

export function aFilaProveedor(datos: DatosProveedor) {
  return {
    nombre: datos.nombre.trim(),
    razon_social: datos.razonSocial || "",
    rfc: datos.rfc || "",
    categoria: datos.categoria || "",
    contacto_nombre: datos.contactoNombre || "",
    telefono: datos.telefono || "",
    email: datos.email || "",
    direccion: datos.direccion || "",
    notas: datos.notas || "",
    activo: datos.activo ?? true,
  };
}

export interface FilaDocumentoProveedor {
  id: string;
  proveedor_id: string;
  proveedores?: { nombre: string } | null;
  cotizacion_id: string | null;
  cotizaciones?: { id: string } | null;
  expediente_id: string | null;
  orden_trabajo_id: string | null;
  ordenes_trabajo?: { folio: string } | null;
  tipo: TipoDocumentoProveedor;
  folio: string;
  folio_proveedor: string | null;
  concepto: string;
  fecha: string;
  monto: number;
  producto_id?: string | null;
  producto_nombre?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  costo_unitario?: number | null;
  partidas?: any;
  archivo_url: string | null;
  archivo_nombre: string | null;
  notas: string;
  origen: "manual" | "automatico";
  created_at: string;
  updated_at: string;
}

export function aDocumentoProveedor(fila: FilaDocumentoProveedor): DocumentoProveedor {
  return {
    id: fila.id,
    proveedorId: fila.proveedor_id,
    proveedorNombre: fila.proveedores?.nombre ?? null,
    cotizacionId: fila.cotizacion_id,
    cotizacionFolio: fila.cotizacion_id ?? null,
    expedienteId: fila.expediente_id,
    ordenTrabajoId: fila.orden_trabajo_id,
    ordenTrabajoFolio: fila.ordenes_trabajo?.folio ?? null,
    tipo: fila.tipo,
    folio: fila.folio ?? "",
    folioProveedor: fila.folio_proveedor ?? null,
    concepto: fila.concepto ?? "",
    fecha: fila.fecha,
    monto: Number(fila.monto) || 0,
    productoId: fila.producto_id ?? null,
    productoNombre: fila.producto_nombre ?? null,
    cantidad: fila.cantidad !== null && fila.cantidad !== undefined ? Number(fila.cantidad) : null,
    unidad: fila.unidad ?? "m2",
    costoUnitario:
      fila.costo_unitario !== null && fila.costo_unitario !== undefined ? Number(fila.costo_unitario) : null,
    partidas: Array.isArray(fila.partidas) ? fila.partidas : [],
    archivoUrl: fila.archivo_url ?? null,
    archivoNombre: fila.archivo_nombre ?? null,
    notas: fila.notas ?? "",
    origen: fila.origen ?? "manual",
    createdAt: fila.created_at ?? "",
    updatedAt: fila.updated_at ?? "",
  };
}

export function aFilaDocumentoProveedor(datos: DatosDocumentoProveedor) {
  return {
    proveedor_id: datos.proveedorId,
    cotizacion_id: datos.cotizacionId || null,
    expediente_id: datos.expedienteId || null,
    orden_trabajo_id: datos.ordenTrabajoId || null,
    tipo: datos.tipo,
    folio_proveedor: datos.folioProveedor || null,
    concepto: datos.concepto || "",
    fecha: datos.fecha,
    monto: Number(datos.monto) || 0,
    producto_id: datos.productoId || null,
    producto_nombre: datos.productoNombre || null,
    cantidad: datos.cantidad !== null && datos.cantidad !== undefined ? Number(datos.cantidad) : null,
    unidad: datos.unidad || "m2",
    costo_unitario:
      datos.costoUnitario !== null && datos.costoUnitario !== undefined ? Number(datos.costoUnitario) : null,
    partidas: datos.partidas || [],
    archivo_url: datos.archivoUrl || null,
    archivo_nombre: datos.archivoNombre || null,
    notas: datos.notas || "",
  };
}

