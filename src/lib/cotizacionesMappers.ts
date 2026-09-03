import type { Cotizacion, CotizacionConcepto, VisitaReporte } from "@/lib/types";

// Mapeos de base de datos a modelos de TypeScript
export function aCotizacion(fila: any): Cotizacion {
  const pros = fila.prospectos;
  const nombreCompleto = pros
    ? [pros.nombre, pros.primer_apellido, pros.segundo_apellido].filter(Boolean).join(" ")
    : "";

  return {
    id: fila.id,
    prospectoId: fila.prospecto_id,
    expedienteId: fila.expediente_id,
    prospectoNombre: nombreCompleto || pros?.nombre || "",
    prospectoTelefono: pros?.telefono || "",
    prospectoCorreo: pros?.correo || null,
    prospectoDireccion: pros?.direccion || null,
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
    aprobadoOperativoByNombre: fila.perfiles_operativo?.nombre || "",
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
