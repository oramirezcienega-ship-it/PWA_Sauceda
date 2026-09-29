import type { Cotizacion, CotizacionConcepto, VisitaReporte } from "@/lib/types";

// Mapeos de base de datos a modelos de TypeScript
export function aCotizacion(fila: any): Cotizacion {
  const pros = fila.prospectos;
  const nombreContacto = pros
    ? [pros.nombre, pros.primer_apellido, pros.segundo_apellido].filter(Boolean).join(" ")
    : "";

  const empRaw = fila.empresas;
  const esSucursal = Boolean(empRaw?.parent_id);
  const empresaMatriz = esSucursal ? (empRaw?.parent_name || null) : (empRaw?.name || null);
  const sucursalNombre = esSucursal ? (empRaw?.name || null) : null;
  const empresaNombreCompleto = esSucursal && empresaMatriz
    ? `${empresaMatriz} · ${empRaw.name}`
    : (empRaw?.name || null);

  const nombrePersonalizado = fila.cliente_nombre_personalizado?.trim() || null;

  // Si tiene un nombre personalizado explícito, lo prioriza;
  // Si tiene empresa vinculada (con o sin sucursal), muestra la empresa, sucursal y contacto;
  // Si es persona física, muestra su nombre completo.
  let nombreMostrado = nombrePersonalizado;
  if (!nombreMostrado) {
    if (empresaNombreCompleto) {
      nombreMostrado = nombreContacto
        ? `${empresaNombreCompleto} (At'n: ${nombreContacto})`
        : empresaNombreCompleto;
    } else {
      nombreMostrado = nombreContacto || pros?.nombre || "Cliente";
    }
  }

  return {
    id: fila.id,
    prospectoId: fila.prospecto_id,
    expedienteId: fila.expediente_id,
    empresaId: fila.empresa_id || pros?.empresa_id || null,
    empresaNombre: empresaNombreCompleto,
    empresaMatrizNombre: empresaMatriz,
    sucursalNombre: sucursalNombre,
    contactoNombre: nombreContacto || null,
    clienteNombrePersonalizado: nombrePersonalizado,
    prospectoNombre: nombreMostrado,
    prospectoTelefono: pros?.telefono || empRaw?.phone || "",
    prospectoCorreo: pros?.correo || null,
    prospectoDireccion: empRaw?.address || pros?.direccion || null,
    servicioTipo: fila.servicio_tipo,
    estatus: fila.estatus,
    requiereVisita: fila.requiere_visita,
    fechaVisita: fila.fecha_visita,
    inspectorId: fila.inspector_id,
    inspectorNombre: fila.perfiles_inspector?.nombre || "",
    costoEstimado: Number(fila.costo_estimado || 0),
    precioFinal: Number(fila.precio_final || 0),
    aprobadoComercial: fila.aprobado_comercial,
    aprobadoComercialBy: fila.aprobado_comercial_by,
    aprobadoComercialByNombre: fila.perfiles_comercial?.nombre || "",
    aprobadoOperativo: fila.aprobado_operativo,
    aprobadoOperativoBy: fila.aprobado_operativo_by,
    costoDirecto: Number(fila.costo_directo || 0),
    indirectosPct: Number(fila.indirectos_pct || 0),
    indirectosMonto: Number(fila.indirectos_monto || 0),
    imprevistosPct: Number(fila.imprevistos_pct || 0),
    imprevistosMonto: Number(fila.imprevistos_monto || 0),
    utilidadPct: Number(fila.utilidad_pct || 0),
    utilidadMonto: Number(fila.utilidad_monto || 0),
    ivaPct: Number(fila.iva_pct ?? 16),
    ivaMonto: Number(fila.iva_monto || 0),
    incluyeIva: Boolean(fila.incluye_iva),
    alcances: fila.alcances || "",
    exclusiones: fila.exclusiones || "",
    esquemaPagos: fila.esquema_pagos || [],
    versionNumero: Number(fila.version_numero || 1),
    versionPadreId: fila.version_padre_id || null,
    modalidad: fila.modalidad || 'estatica',
    datosModulares: fila.datos_modulares || null,
    opcionesSeleccionadas: fila.opciones_seleccionadas || null,
    token: fila.token,
    notasInternas: fila.notas_internas || "",
    condicionesPago: fila.condiciones_pago || 'Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción.',
    garantia: fila.garantia || 'Todos los trabajos cuentan con garantía técnica contra vicios ocultos de acuerdo al servicio contratado.',
    createdAt: fila.created_at,
    updatedAt: fila.updated_at
  };
}

export function aVisitaReporte(fila: any): VisitaReporte {
  return {
    id: fila.id,
    cotizacionId: fila.cotizacion_id,
    inspectorId: fila.inspector_id,
    inspectorNombre: fila.perfiles?.nombre || "",
    fechaInspeccion: fila.fecha_inspeccion,
    observacionesTecnicas: fila.observaciones_tecnicas || "",
    condicionesSitio: fila.condiciones_sitio || "",
    medidas: fila.medidas || {},
    fotos: fila.fotos || [],
    createdAt: fila.created_at
  };
}

export function aCotizacionConcepto(fila: any): CotizacionConcepto {
  return {
    id: fila.id,
    cotizacionId: fila.cotizacion_id,
    productoServicioId: fila.producto_servicio_id || null,
    partidaId: fila.partida_id || null,
    espacioId: fila.espacio_id || null,
    gama: fila.gama || undefined,
    orden: Number(fila.orden || 0),
    apuDetallado: fila.apu_detallado || [],
    descripcion: fila.descripcion,
    cantidad: Number(fila.cantidad || 0),
    unidad: fila.unidad,
    costoUnitario: Number(fila.costo_unitario || 0),
    precioUnitario: Number(fila.precio_unitario || 0),
    descuento: Number(fila.descuento || 0),
    importe: Number(fila.importe || 0),
    createdAt: fila.created_at
  };
}

