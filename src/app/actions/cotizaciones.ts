"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import type { Cotizacion, VisitaReporte, CotizacionConcepto, ServicioConstruccionTipo, CotizacionEstatus } from "@/lib/types";

// Helper para generar el siguiente folio correlativo (COT-001)
function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `COT-${String(max + 1).padStart(3, "0")}`;
}

// Mapeos de base de datos a modelos de TypeScript
function aCotizacion(fila: any): Cotizacion {
  return {
    id: fila.id,
    prospectoId: fila.prospecto_id,
    expedienteId: fila.expediente_id,
    prospectoNombre: fila.prospectos?.nombre || "",
    prospectoTelefono: fila.prospectos?.telefono || "",
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
    createdAt: fila.created_at,
    updatedAt: fila.updated_at
  };
}

function aVisitaReporte(fila: any): VisitaReporte {
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

function aCotizacionConcepto(fila: any): CotizacionConcepto {
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

// 1. Crear Cotización
export async function crearCotizacion(datos: {
  prospectoId: string;
  expedienteId?: string | null;
  servicioTipo: ServicioConstruccionTipo;
  requiereVisita: boolean;
  fechaVisita?: string | null;
  inspectorId?: string | null;
  notasInternas?: string;
}): Promise<Cotizacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existentes, error: errLista } = await sb
    .from("cotizaciones")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const estatus: CotizacionEstatus = datos.requiereVisita ? "esperando_visita" : "calculando_costo";

  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      id,
      prospecto_id: datos.prospectoId,
      expediente_id: datos.expedienteId || null,
      servicio_tipo: datos.servicioTipo,
      estatus,
      requiere_visita: datos.requiereVisita,
      fecha_visita: datos.fechaVisita || null,
      inspector_id: datos.inspectorId || null,
      notas_internas: datos.notasInternas || ""
    })
    .select("*, prospectos(nombre, telefono)")
    .single();

  if (error) throw new Error(error.message);

  await registrarActividad(sb, {
    prospectoId: datos.prospectoId,
    tipo: "construccion",
    titulo: `Cotización de construcción creada (${id})`,
    detalle: `Servicio: ${datos.servicioTipo}. Estatus inicial: ${estatus}.`
  });

  if (datos.expedienteId) {
    await registrarActividad(sb, {
      expedienteId: datos.expedienteId,
      tipo: "construccion",
      titulo: `Cotización vinculada (${id})`,
      detalle: `Servicio: ${datos.servicioTipo}. Estatus inicial: ${estatus}.`
    });
    
    // Mover expediente a etapa 'cotizacion'
    await sb
      .from("expedientes")
      .update({
        etapa: datos.requiereVisita ? "visita" : "cotizacion",
        ultimo_movimiento: new Date().toISOString().split("T")[0]
      })
      .eq("id", datos.expedienteId);
  }

  return aCotizacion(data);
}


// 2. Listar Cotizaciones
export async function listarCotizaciones(): Promise<Cotizacion[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(aCotizacion);
}

// 3. Obtener Cotización por ID (Detalle completo admin)
export async function obtenerCotizacionPorId(
  id: string
): Promise<{ cotizacion: Cotizacion; conceptos: CotizacionConcepto[]; reporteVisita: VisitaReporte | null } | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: filaCot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .eq("id", id)
    .maybeSingle();

  if (errCot) throw new Error(errCot.message);
  if (!filaCot) return null;

  const { data: filasConceptos, error: errCon } = await sb
    .from("cotizacion_conceptos")
    .select("*")
    .eq("cotizacion_id", id)
    .order("created_at", { ascending: true });

  if (errCon) throw new Error(errCon.message);

  const { data: filaReporte, error: errRep } = await sb
    .from("visitas_reportes")
    .select("*, perfiles:inspector_id(nombre)")
    .eq("cotizacion_id", id)
    .maybeSingle();

  if (errRep) throw new Error(errRep.message);

  return {
    cotizacion: aCotizacion(filaCot),
    conceptos: (filasConceptos ?? []).map(aCotizacionConcepto),
    reporteVisita: filaReporte ? aVisitaReporte(filaReporte) : null
  };
}

// 4. Obtener Cotización por Token (Acceso público cliente)
export async function obtenerCotizacionPorToken(
  token: string
): Promise<{ cotizacion: Omit<Cotizacion, 'notasInternas' | 'costoEstimado'>; conceptos: Omit<CotizacionConcepto, 'costoUnitario'>[]; reporteVisita: Omit<VisitaReporte, 'inspectorId'> | null } | null> {
  const sb = supabaseServidor();

  const { data: filaCot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .eq("token", token)
    .maybeSingle();

  if (errCot) throw new Error(errCot.message);
  if (!filaCot) return null;

  const cot = aCotizacion(filaCot);

  // El cliente solo puede verla si ya fue procesada y aprobada
  const estatusPermitidos: CotizacionEstatus[] = ['aprobada', 'enviada', 'aceptada', 'rechazada'];
  if (!estatusPermitidos.includes(cot.estatus)) {
    throw new Error("Esta propuesta aún no está disponible para su visualización.");
  }

  const { data: filasConceptos, error: errCon } = await sb
    .from("cotizacion_conceptos")
    .select("id, cotizacion_id, descripcion, cantidad, unidad, precio_unitario, descuento, importe, created_at")
    .eq("cotizacion_id", cot.id)
    .order("created_at", { ascending: true });

  if (errCon) throw new Error(errCon.message);

  const { data: filaReporte, error: errRep } = await sb
    .from("visitas_reportes")
    .select("id, cotizacion_id, fecha_inspeccion, observaciones_tecnicas, condiciones_sitio, medidas, fotos, created_at, perfiles:inspector_id(nombre)")
    .eq("cotizacion_id", cot.id)
    .maybeSingle();

  if (errRep) throw new Error(errRep.message);

  return {
    cotizacion: {
      id: cot.id,
      prospectoId: cot.prospectoId,
      prospectoNombre: cot.prospectoNombre,
      prospectoTelefono: cot.prospectoTelefono,
      servicioTipo: cot.servicioTipo,
      estatus: cot.estatus,
      requiereVisita: cot.requiereVisita,
      fechaVisita: cot.fechaVisita,
      inspectorId: cot.inspectorId,
      inspectorNombre: cot.inspectorNombre,
      precioFinal: cot.precioFinal,
      aprobadoComercial: cot.aprobadoComercial,
      aprobadoOperativo: cot.aprobadoOperativo,
      token: cot.token,
      createdAt: cot.createdAt,
      updatedAt: cot.updatedAt
    },
    conceptos: (filasConceptos ?? []).map(f => ({
      id: f.id,
      cotizacionId: f.cotizacion_id,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad || 0),
      unidad: f.unidad,
      precioUnitario: Number(f.precio_unitario || 0),
      descuento: Number(f.descuento || 0),
      importe: Number(f.importe || 0),
      createdAt: f.created_at
    })),
    reporteVisita: filaReporte ? {
      id: filaReporte.id,
      cotizacionId: filaReporte.cotizacion_id,
      inspectorNombre: (filaReporte as any).perfiles?.nombre || "",
      fechaInspeccion: filaReporte.fecha_inspeccion,
      observacionesTecnicas: filaReporte.observaciones_tecnicas || "",
      condicionesSitio: filaReporte.condiciones_sitio || "",
      medidas: filaReporte.medidas || {},
      fotos: filaReporte.fotos || [],
      createdAt: filaReporte.created_at
    } : null
  };
}

// 5. Guardar Reporte de Visita Técnica
export async function guardarReporteVisita(
  cotizacionId: string,
  datosReporte: {
    observacionesTecnicas: string;
    condicionesSitio: string;
    medidas: Record<string, any>;
    fotos: string[];
  }
): Promise<VisitaReporte> {
  await requireAdmin();
  const sb = supabaseServidor();
  const user = await usuarioActual();
  if (!user) throw new Error("No autenticado.");

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("prospecto_id, estatus")
    .eq("id", cotizacionId)
    .single();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");

  const { data: existente } = await sb
    .from("visitas_reportes")
    .select("id")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  let res;
  if (existente) {
    const { data, error } = await sb
      .from("visitas_reportes")
      .update({
        inspector_id: user.id,
        observaciones_tecnicas: datosReporte.observacionesTecnicas,
        condiciones_sitio: datosReporte.condicionesSitio,
        medidas: datosReporte.medidas,
        fotos: datosReporte.fotos,
        fecha_inspeccion: new Date().toISOString()
      })
      .eq("cotizacion_id", cotizacionId)
      .select("*, perfiles:inspector_id(nombre)")
      .single();
    if (error) throw new Error(error.message);
    res = data;
  } else {
    const { data, error } = await sb
      .from("visitas_reportes")
      .insert({
        cotizacion_id: cotizacionId,
        inspector_id: user.id,
        observaciones_tecnicas: datosReporte.observacionesTecnicas,
        condiciones_sitio: datosReporte.condicionesSitio,
        medidas: datosReporte.medidas,
        fotos: datosReporte.fotos
      })
      .select("*, perfiles:inspector_id(nombre)")
      .single();
    if (error) throw new Error(error.message);
    res = data;
  }

  // Actualizar estatus
  let nuevoEstatus: CotizacionEstatus = "calculando_costo";
  const estatusActual = cot.estatus as CotizacionEstatus;
  if (estatusActual === "esperando_visita" || estatusActual === "en_inspeccion" || estatusActual === "borrador") {
    await sb
      .from("cotizaciones")
      .update({ estatus: nuevoEstatus, updated_at: new Date().toISOString() })
      .eq("id", cotizacionId);
  }

  await sincronizarEtapaExpediente(sb, cotizacionId);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Reporte de visita técnica guardado (${cotizacionId})`,
    detalle: `Completado por el inspector. Estatus pasa a: ${nuevoEstatus}.`
  });

  return aVisitaReporte(res);
}

// 6. Guardar Conceptos y Calcular Totales (Presupuesto)
export async function guardarConceptosCotizacion(
  cotizacionId: string,
  conceptos: {
    descripcion: string;
    cantidad: number;
    unidad: string;
    costoUnitario: number;
    precioUnitario: number;
    descuento?: number;
  }[]
): Promise<{ ok: boolean; costoEstimado: number; precioFinal: number }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("prospecto_id")
    .eq("id", cotizacionId)
    .single();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");

  const { error: errDel } = await sb
    .from("cotizacion_conceptos")
    .delete()
    .eq("cotizacion_id", cotizacionId);

  if (errDel) throw new Error(errDel.message);

  let totalCosto = 0;
  let totalPrecio = 0;

  const filasInsertar = conceptos.map((c) => {
    const desc = c.descuento || 0;
    const precioConDescuento = c.precioUnitario * (1 - desc / 100);
    const importe = c.cantidad * precioConDescuento;
    totalCosto += c.cantidad * c.costoUnitario;
    totalPrecio += importe;
    return {
      cotizacion_id: cotizacionId,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      unidad: c.unidad,
      costo_unitario: c.costoUnitario,
      precio_unitario: c.precioUnitario,
      descuento: desc,
      importe
    };
  });

  if (filasInsertar.length > 0) {
    const { error: errIns } = await sb
      .from("cotizacion_conceptos")
      .insert(filasInsertar);
    if (errIns) throw new Error(errIns.message);
  }

  const { error: errUpd } = await sb
    .from("cotizaciones")
    .update({
      costo_estimado: totalCosto,
      precio_final: totalPrecio,
      aprobado_comercial: false,
      aprobado_comercial_by: null,
      aprobado_operativo: false,
      aprobado_operativo_by: null,
      estatus: "pendiente_aprobacion",
      updated_at: new Date().toISOString()
    })
    .eq("id", cotizacionId);

  if (errUpd) throw new Error(errUpd.message);

  await sincronizarEtapaExpediente(sb, cotizacionId);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Presupuesto calculado para cotización (${cotizacionId})`,
    detalle: `Costo interno: $${totalCosto.toFixed(2)}, Venta: $${totalPrecio.toFixed(2)}. Firmas reseteadas.`
  });

  return { ok: true, costoEstimado: totalCosto, precioFinal: totalPrecio };
}

// 7. Aprobación Comercial
export async function aprobarCotizacionComercial(
  id: string,
  aprobar: boolean = true
): Promise<{ ok: boolean; cotizacion: Cotizacion }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const user = await usuarioActual();
  if (!user) throw new Error("No autenticado.");

  const { data: cotPrev, error: errPrev } = await sb
    .from("cotizaciones")
    .select("prospecto_id, aprobado_operativo, estatus")
    .eq("id", id)
    .single();

  if (errPrev || !cotPrev) throw new Error("Cotización no encontrada.");

  let dataUpdate: any = {
    aprobado_comercial: aprobar,
    aprobado_comercial_by: aprobar ? user.id : null,
    updated_at: new Date().toISOString()
  };

  if (aprobar && cotPrev.aprobado_operativo) {
    dataUpdate.estatus = "aprobada";
  } else if (!aprobar) {
    dataUpdate.estatus = "calculando_costo";
  }

  const { data, error } = await sb
    .from("cotizaciones")
    .update(dataUpdate)
    .eq("id", id)
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .single();

  if (error) throw new Error(error.message);

  await sincronizarEtapaExpediente(sb, id);

  await registrarActividad(sb, {
    prospectoId: cotPrev.prospecto_id,
    tipo: "construccion",
    titulo: aprobar 
      ? `Aprobación Comercial registrada (${id})` 
      : `Cotización rechazada comercialmente (${id})`,
    detalle: aprobar 
      ? `Firmado por asesor/admin. Estatus: ${data.estatus}.` 
      : `Regresada a costeo.`
  });

  return { ok: true, cotizacion: aCotizacion(data) };
}

// 8. Aprobación Operativa
export async function aprobarCotizacionOperativa(
  id: string,
  aprobar: boolean = true
): Promise<{ ok: boolean; cotizacion: Cotizacion }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const user = await usuarioActual();
  if (!user) throw new Error("No autenticado.");

  const { data: cotPrev, error: errPrev } = await sb
    .from("cotizaciones")
    .select("prospecto_id, aprobado_comercial, estatus")
    .eq("id", id)
    .single();

  if (errPrev || !cotPrev) throw new Error("Cotización no encontrada.");

  let dataUpdate: any = {
    aprobado_operativo: aprobar,
    aprobado_operativo_by: aprobar ? user.id : null,
    updated_at: new Date().toISOString()
  };

  if (aprobar && cotPrev.aprobado_comercial) {
    dataUpdate.estatus = "aprobada";
  } else if (!aprobar) {
    dataUpdate.estatus = "calculando_costo";
  }

  const { data, error } = await sb
    .from("cotizaciones")
    .update(dataUpdate)
    .eq("id", id)
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .single();

  if (error) throw new Error(error.message);

  await sincronizarEtapaExpediente(sb, id);

  await registrarActividad(sb, {
    prospectoId: cotPrev.prospecto_id,
    tipo: "construccion",
    titulo: aprobar 
      ? `Aprobación Operativa registrada (${id})` 
      : `Cotización rechazada operativamente (${id})`,
    detalle: aprobar 
      ? `Firmado por operaciones/admin. Estatus: ${data.estatus}.` 
      : `Regresada a costeo.`
  });

  return { ok: true, cotizacion: aCotizacion(data) };
}

// 9. Marcar como Enviada
export async function marcarComoEnviada(id: string): Promise<Cotizacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("estatus, prospecto_id")
    .eq("id", id)
    .single();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");

  if (cot.estatus !== "aprobada" && cot.estatus !== "enviada") {
    throw new Error("No se puede enviar una cotización que no esté aprobada por ambas áreas.");
  }

  const { data, error } = await sb
    .from("cotizaciones")
    .update({
      estatus: "enviada",
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .single();

  if (error) throw new Error(error.message);

  await sincronizarEtapaExpediente(sb, id);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Cotización compartida con el cliente (${id})`,
    detalle: `El enlace público está disponible para revisión y firma.`
  });

  return aCotizacion(data);
}

// 10. Aceptar Cotización (Cliente - Pública, usa Token)
export async function aceptarCotizacionCliente(
  token: string,
  firmaNombre: string
): Promise<{ ok: boolean; id: string }> {
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("id, prospecto_id, estatus")
    .eq("token", token)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Propuesta no encontrada.");

  const estatusActual = cot.estatus as CotizacionEstatus;
  if (estatusActual !== "enviada" && estatusActual !== "aprobada") {
    if (estatusActual === "aceptada") {
      return { ok: true, id: cot.id };
    }
    throw new Error("Esta propuesta no está disponible para firma en este momento.");
  }

  const { error } = await sb
    .from("cotizaciones")
    .update({
      estatus: "aceptada",
      notas_internas: `Aceptada por el cliente: ${firmaNombre} vía portal web.`,
      updated_at: new Date().toISOString()
    })
    .eq("id", cot.id);

  if (error) throw new Error(error.message);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Cotización Aceptada por el Cliente 🎉 (${cot.id})`,
    detalle: `Aceptada formalmente por: ${firmaNombre} a través del portal de cliente.`
  });

  // Sincronizar etapa del expediente
  await sincronizarEtapaExpediente(sb, cot.id);

  return { ok: true, id: cot.id };
}

/** 11. Listar Cotizaciones de un Expediente */
export async function obtenerCotizacionesDeExpediente(
  expedienteId: string
): Promise<Cotizacion[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(aCotizacion);
}

/** Helper para sincronizar automáticamente la etapa del expediente según el estatus de la cotización. */
export async function sincronizarEtapaExpediente(sb: any, cotizacionId: string) {
  try {
    const { data: cot } = await sb
      .from("cotizaciones")
      .select("expediente_id, estatus, requiere_visita")
      .eq("id", cotizacionId)
      .maybeSingle();

    if (!cot || !cot.expediente_id) return;

    let nuevaEtapa: string | null = null;

    switch (cot.estatus) {
      case "borrador":
      case "calculando_costo":
      case "pendiente_aprobacion":
      case "aprobada":
      case "enviada":
        // Si requiere visita y está en borrador o esperando visita, la etapa es 'visita'
        if (cot.requiere_visita && (cot.estatus === "borrador" || cot.estatus === "esperando_visita" || cot.estatus === "en_inspeccion")) {
          nuevaEtapa = "visita";
        } else {
          nuevaEtapa = "cotizacion";
        }
        break;
      case "esperando_visita":
      case "en_inspeccion":
        nuevaEtapa = "visita";
        break;
      case "aceptada":
        nuevaEtapa = "propuesta-aceptada";
        break;
      case "rechazada":
      case "archivada":
        nuevaEtapa = "perdido";
        break;
    }

    if (nuevaEtapa) {
      const { error: errUpd } = await sb
        .from("expedientes")
        .update({
          etapa: nuevaEtapa,
          ultimo_movimiento: new Date().toISOString().split("T")[0]
        })
        .eq("id", cot.expediente_id);

      if (!errUpd) {
        await registrarActividad(sb, {
          expedienteId: cot.expediente_id,
          tipo: "etapa",
          titulo: `Etapa sincronizada a ${nuevaEtapa} (Sinc. Automática)`,
          detalle: `La etapa del expediente se actualizó automáticamente debido a que el estatus de la cotización ${cotizacionId} pasó a '${cot.estatus}'.`
        });
      }
    }
  } catch (err) {
    console.error("Error en sincronizarEtapaExpediente:", err);
  }
}

