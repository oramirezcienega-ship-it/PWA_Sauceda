"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import type { Cotizacion, VisitaReporte, CotizacionConcepto, ServicioConstruccionTipo, CotizacionEstatus, RemisionFactura, GarantiaDocumento } from "@/lib/types";

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

  let resolvedExpedienteId = datos.expedienteId || null;
  if (!resolvedExpedienteId && datos.prospectoId) {
    const { data: exp } = await sb
      .from("expedientes")
      .select("id")
      .eq("prospecto_id", datos.prospectoId)
      .maybeSingle();
    if (exp?.id) {
      resolvedExpedienteId = exp.id;
    }
  }

  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      id,
      prospecto_id: datos.prospectoId,
      expediente_id: resolvedExpedienteId,
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

  if (resolvedExpedienteId) {
    await registrarActividad(sb, {
      expedienteId: resolvedExpedienteId,
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
      .eq("id", resolvedExpedienteId);
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

  const cotizacion = aCotizacion(filaCot);
  const conceptos = (filasConceptos ?? []).map(aCotizacionConcepto);
  const totalConceptos = conceptos.reduce((sum, c) => sum + Number(c.importe || 0), 0);
  if (totalConceptos > 0 && cotizacion.precioFinal !== totalConceptos) {
    cotizacion.precioFinal = totalConceptos;
  }

  return {
    cotizacion,
    conceptos,
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
      prospectos(id, nombre, primer_apellido, segundo_apellido, telefono, correo, direccion),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .eq("token", token)
    .maybeSingle();

  if (errCot) throw new Error(errCot.message);
  if (!filaCot) return null;

  const cot = aCotizacion(filaCot);

  // El cliente solo puede verla si ya fue procesada, aprobada, o está en espera de visita (preliminar)
  const estatusPermitidos: CotizacionEstatus[] = ['aprobada', 'enviada', 'aceptada', 'rechazada', 'esperando_visita'];
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

  const conceptos = (filasConceptos ?? []).map(f => ({
    id: f.id,
    cotizacionId: f.cotizacion_id,
    descripcion: f.descripcion,
    cantidad: Number(f.cantidad || 0),
    unidad: f.unidad,
    precioUnitario: Number(f.precio_unitario || 0),
    descuento: Number(f.descuento || 0),
    importe: Number(f.importe || 0),
    createdAt: f.created_at
  }));

  const totalConceptos = conceptos.reduce((sum, c) => sum + c.importe, 0);
  const finalPrecio = totalConceptos > 0 ? totalConceptos : cot.precioFinal;

  return {
    cotizacion: {
      id: cot.id,
      prospectoId: cot.prospectoId,
      prospectoNombre: cot.prospectoNombre,
      prospectoTelefono: cot.prospectoTelefono,
      prospectoCorreo: cot.prospectoCorreo,
      prospectoDireccion: cot.prospectoDireccion,
      servicioTipo: cot.servicioTipo,
      estatus: cot.estatus,
      requiereVisita: cot.requiereVisita,
      fechaVisita: cot.fechaVisita,
      inspectorId: cot.inspectorId,
      inspectorNombre: cot.inspectorNombre,
      precioFinal: finalPrecio,
      aprobadoComercial: cot.aprobadoComercial,
      aprobadoOperativo: cot.aprobadoOperativo,
      token: cot.token,
      condicionesPago: cot.condicionesPago,
      garantia: cot.garantia,
      createdAt: cot.createdAt,
      updatedAt: cot.updatedAt
    },
    conceptos,
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

// 4b. Obtener Reporte de Visita Técnica por Token (Acceso público cliente, sin bloqueos de estatus)
export async function obtenerReporteVisitaPorToken(
  token: string
): Promise<{ cotizacion: Omit<Cotizacion, 'notasInternas' | 'costoEstimado'>; reporteVisita: Omit<VisitaReporte, 'inspectorId'> | null } | null> {
  const sb = supabaseServidor();

  const { data: filaCot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre)
    `)
    .eq("token", token)
    .maybeSingle();

  if (errCot || !filaCot) return null;

  const cot = aCotizacion(filaCot);

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
      aprobadoComercialByNombre: cot.aprobadoComercialByNombre,
      aprobadoOperativo: cot.aprobadoOperativo,
      aprobadoOperativoByNombre: cot.aprobadoOperativoByNombre,
      token: cot.token,
      condicionesPago: cot.condicionesPago,
      garantia: cot.garantia,
      createdAt: cot.createdAt,
      updatedAt: cot.updatedAt
    },
    reporteVisita: filaReporte ? aVisitaReporte(filaReporte) : null
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
    fechaInspeccion?: string;
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
        fecha_inspeccion: datosReporte.fechaInspeccion || new Date().toISOString()
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
        fotos: datosReporte.fotos,
        fecha_inspeccion: datosReporte.fechaInspeccion || new Date().toISOString()
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

  // Trigger BPM event: visita_tecnica_concluida
  const { data: cotExp } = await sb
    .from("cotizaciones")
    .select("expediente_id")
    .eq("id", cotizacionId)
    .maybeSingle();

  if (cotExp?.expediente_id) {
    const { activarTareasBPMPorEvento } = await import("@/app/actions/bpm");
    await activarTareasBPMPorEvento(cotExp.expediente_id, "visita_tecnica_concluida");
  }

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Reporte de visita técnica guardado (${cotizacionId})`,
    detalle: `Completado por el inspector. Estatus pasa a: ${nuevoEstatus}.`
  });

  return aVisitaReporte(res);
}

// 5b. Actualizar Requerimiento de Visita Técnica y cambiar estatus
export async function actualizarRequerimientoVisita(
  cotizacionId: string,
  requiereVisita: boolean,
  fechaVisita?: string | null,
  inspectorId?: string | null
): Promise<Cotizacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("prospecto_id, estatus, requiere_visita")
    .eq("id", cotizacionId)
    .single();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");

  let nuevoEstatus = cot.estatus;
  if (cot.estatus === "esperando_visita" && !requiereVisita) {
    nuevoEstatus = "calculando_costo";
  } else if (cot.estatus === "calculando_costo" && requiereVisita) {
    nuevoEstatus = "esperando_visita";
  }

  const { data, error } = await sb
    .from("cotizaciones")
    .update({
      requiere_visita: requiereVisita,
      fecha_visita: requiereVisita ? (fechaVisita || null) : null,
      inspector_id: requiereVisita ? (inspectorId || null) : null,
      estatus: nuevoEstatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", cotizacionId)
    .select(`
      *,
      prospectos(nombre, telefono),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .single();

  if (error) throw new Error(error.message);

  await sincronizarEtapaExpediente(sb, cotizacionId);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Requerimiento de visita actualizado (${cotizacionId})`,
    detalle: `Cambio: requiere visita = ${requiereVisita}. Estatus pasa a: ${nuevoEstatus}.`
  });

  return aCotizacion(data);
}

// 5c. Subir Fotografía de Visita Técnica a Supabase Storage (público)
export async function subirFotoVisita(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const archivo = formData.get("archivo") as File | null;
    if (!archivo || archivo.size === 0) return { ok: false, error: "No se adjuntó ningún archivo." };

    const MAX_MB = 10;
    if (archivo.size > MAX_MB * 1024 * 1024) {
      return { ok: false, error: `El archivo supera el límite de ${MAX_MB} MB.` };
    }

    const path = `visita-${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await archivo.arrayBuffer());

    let { data: uploadData, error: uploadError } = await sb.storage
      .from("documentos-ventas")
      .upload(path, buffer, {
        contentType: archivo.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError && (uploadError.message.toLowerCase().includes("not found") || uploadError.message.toLowerCase().includes("bucket"))) {
      try {
        await sb.storage.createBucket("documentos-ventas", { public: true });
        const retry = await sb.storage
          .from("documentos-ventas")
          .upload(path, buffer, {
            contentType: archivo.type || "image/jpeg",
            upsert: false,
          });
        uploadData = retry.data;
        uploadError = retry.error;
      } catch (e) {
        console.warn("No se pudo crear automáticamente el bucket documentos-ventas:", e);
      }
    }

    if (!uploadError && uploadData) {
      const { data: urlData } = sb.storage
        .from("documentos-ventas")
        .getPublicUrl(uploadData.path);

      return { ok: true, url: urlData.publicUrl };
    }

    // Fallback resguardado: si falla el storage de Supabase, retornar base64 Data URL para no bloquear al usuario
    console.warn("Advertencia: Falló el storage de Supabase (" + uploadError?.message + "), utilizando fallback Base64.");
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${archivo.type || "image/jpeg"};base64,${base64}`;
    return { ok: true, url: dataUrl };
  } catch (err) {
    console.error("Error en subirFotoVisita:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al subir foto" };
  }
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

  // 1. Obtener prospecto_id del expediente
  const { data: exp } = await sb
    .from("expedientes")
    .select("prospecto_id")
    .eq("id", expedienteId)
    .maybeSingle();

  const prospectoId = exp?.prospecto_id;

  // 2. Si hay un prospecto_id, buscar cotizaciones de ese prospecto que tengan expediente_id nulo
  // y actualizarlas para asociarlas con este expediente. Esto asegura enlace permanente.
  if (prospectoId) {
    await sb
      .from("cotizaciones")
      .update({ expediente_id: expedienteId })
      .eq("prospecto_id", prospectoId)
      .is("expediente_id", null);
  }

  // 3. Consultar todas las cotizaciones de este expediente
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

/** 11.b. Listar Cotizaciones de un Prospecto */
export async function obtenerCotizacionesDeProspecto(
  prospectoId: string
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
    .eq("prospecto_id", prospectoId)
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

    if (cot.estatus === "pendiente_aprobacion") {
      const { activarTareasBPMPorEvento } = await import("@/app/actions/bpm");
      await activarTareasBPMPorEvento(cot.expediente_id, "cotizacion_conceptos_guardada");
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

/** 12. Guardar Condiciones Comerciales y Garantía */
export async function guardarCondicionesCotizacion(
  id: string,
  condicionesPago: string,
  garantia: string
): Promise<Cotizacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("cotizaciones")
    .update({
      condiciones_pago: condicionesPago,
      garantia: garantia,
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
  return aCotizacion(data);
}

/** 13. Crear Remisión o Factura a partir de Cotización Aceptada */
export async function crearRemisionFactura(
  cotizacionId: string,
  datos: {
    tipo: "remision" | "factura";
    folio: string;
    fecha: string;
    tipoCambio: number;
    datosDocumento: any;
    serviciosExtra: number;
    costoFinanciero: number;
    otrosGastos: number;
  }
): Promise<{ ok: boolean; id: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener la cotización
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("*")
    .eq("id", cotizacionId)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");
  if (cot.estatus !== "aceptada" && cot.estatus !== "instalacion") {
    throw new Error("La cotización debe estar en estado Aceptada o Instalación para generar este documento.");
  }

  // 2. Calcular montos
  const subtotal = Number(cot.precio_final || 0);
  const total = subtotal + Number(datos.serviciosExtra || 0);

  // 3. Insertar remisión / factura
  const { data: doc, error: errDoc } = await sb
    .from("remisiones_facturas")
    .insert({
      cotizacion_id: cotizacionId,
      expediente_id: cot.expediente_id,
      tipo: datos.tipo,
      folio: datos.folio,
      fecha: datos.fecha || new Date().toISOString().split("T")[0],
      tipo_cambio: Number(datos.tipoCambio || 1.0),
      datos_documento: datos.datosDocumento || {},
      servicios_extra: Number(datos.serviciosExtra || 0),
      costo_financiero: Number(datos.costoFinanciero || 0),
      otros_gastos: Number(datos.otrosGastos || 0),
      monto_subtotal: subtotal,
      monto_total: total
    })
    .select("id")
    .single();

  if (errDoc) throw new Error(errDoc.message);

  // 4. Registrar transacciones financieras
  // Registro de Ingreso (Venta)
  const transIngreso = {
    fecha: datos.fecha || new Date().toISOString().split("T")[0],
    tipo: "ingreso",
    categoria: "venta",
    concepto: `${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio} - Venta de Cotización ${cotizacionId}`,
    monto: total,
    expediente_id: cot.expediente_id
  };

  const { error: errIng } = await sb
    .from("transacciones_financieras")
    .insert([transIngreso]);

  if (errIng) console.error("Error al registrar ingreso financiero:", errIng.message);

  // Costo financiero
  if (Number(datos.costoFinanciero || 0) > 0) {
    const { error: errFin } = await sb
      .from("transacciones_financieras")
      .insert([{
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        tipo: "gasto",
        categoria: "costo_venta",
        concepto: `Costo Financiero de ${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio}`,
        monto: Number(datos.costoFinanciero),
        expediente_id: cot.expediente_id
      }]);
    if (errFin) console.error("Error al registrar costo financiero:", errFin.message);
  }

  // Otros gastos
  if (Number(datos.otrosGastos || 0) > 0) {
    const { error: errGas } = await sb
      .from("transacciones_financieras")
      .insert([{
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        tipo: "gasto",
        categoria: "costo_venta",
        concepto: `Otros Gastos de ${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio}`,
        monto: Number(datos.otrosGastos),
        expediente_id: cot.expediente_id
      }]);
    if (errGas) console.error("Error al registrar otros gastos:", errGas.message);
  }

  // 5. Actualizar estatus de la cotización a 'instalacion'
  const { error: errUpdCot } = await sb
    .from("cotizaciones")
    .update({
      estatus: "instalacion",
      updated_at: new Date().toISOString()
    })
    .eq("id", cotizacionId);

  if (errUpdCot) console.error("Error al actualizar estatus de cotización:", errUpdCot.message);

  // 6. Actualizar etapa del expediente a 'venta' (cierre comercial)
  if (cot.expediente_id) {
    const { error: errUpdExp } = await sb
      .from("expedientes")
      .update({
        etapa: "venta",
        ultimo_movimiento: new Date().toISOString().split("T")[0]
      })
      .eq("id", cot.expediente_id);

    if (errUpdExp) console.error("Error al actualizar etapa de expediente:", errUpdExp.message);

    await registrarActividad(sb, {
      expedienteId: cot.expediente_id,
      tipo: "construccion",
      titulo: `Documento de Venta Generado (${datos.tipo.toUpperCase()})`,
      detalle: `${datos.tipo === "remision" ? "Remisión" : "Factura"} registrada con Folio: ${datos.folio}. Total venta: $${total}.`
    });
  }

  return { ok: true, id: doc.id };
}

/** 14. Obtener Remisión o Factura vinculada a una Cotización */
export async function obtenerRemisionFacturaDeCotizacion(
  cotizacionId: string
): Promise<RemisionFactura | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("remisiones_facturas")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    cotizacionId: data.cotizacion_id,
    expedienteId: data.expediente_id,
    tipo: data.tipo,
    folio: data.folio,
    fecha: data.fecha,
    tipoCambio: Number(data.tipo_cambio || 1.0),
    datosDocumento: data.datos_documento || {},
    serviciosExtra: Number(data.servicios_extra || 0),
    costoFinanciero: Number(data.costo_financiero || 0),
    otrosGastos: Number(data.otros_gastos || 0),
    montoSubtotal: Number(data.monto_subtotal || 0),
    montoTotal: Number(data.monto_total || 0),
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/** 14b. Editar una Remisión o Factura existente y actualizar sus transacciones financieras */
export async function editarRemisionFactura(
  id: string,
  datos: {
    tipo: "remision" | "factura";
    folio: string;
    fecha: string;
    tipoCambio: number;
    datosDocumento: any;
    serviciosExtra: number;
    costoFinanciero: number;
    otrosGastos: number;
  }
): Promise<{ ok: boolean }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener la remisión actual
  const { data: rem, error: errRem } = await sb
    .from("remisiones_facturas")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errRem || !rem) throw new Error("Remisión/Factura no encontrada.");

  // 2. Obtener la cotización para recalcular el total
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("*")
    .eq("id", rem.cotizacion_id)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Cotización vinculada no encontrada.");

  const subtotal = Number(cot.precio_final || 0);
  const total = subtotal + Number(datos.serviciosExtra || 0);

  const oldFolio = rem.folio;
  const oldTipoLabel = rem.tipo === "remision" ? "Remisión" : "Factura";

  // 3. Actualizar la remisión/factura
  const { error: errUpd } = await sb
    .from("remisiones_facturas")
    .update({
      tipo: datos.tipo,
      folio: datos.folio,
      fecha: datos.fecha,
      tipo_cambio: Number(datos.tipoCambio || 1.0),
      datos_documento: datos.datosDocumento || {},
      servicios_extra: Number(datos.serviciosExtra || 0),
      costo_financiero: Number(datos.costoFinanciero || 0),
      otros_gastos: Number(datos.otrosGastos || 0),
      monto_subtotal: subtotal,
      monto_total: total,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (errUpd) throw new Error(errUpd.message);

  // 4. Limpiar transacciones financieras viejas de esta remisión
  if (rem.expediente_id) {
    const { error: errDel } = await sb
      .from("transacciones_financieras")
      .delete()
      .eq("expediente_id", rem.expediente_id)
      .or(`concepto.ilike.%${oldFolio}%,concepto.ilike.%${oldTipoLabel}%`);

    if (errDel) console.error("Error al limpiar transacciones previas:", errDel.message);

    // 5. Insertar nuevas transacciones financieras
    const transacciones = [];

    // Ingreso
    transacciones.push({
      fecha: datos.fecha || new Date().toISOString().split("T")[0],
      tipo: "ingreso",
      categoria: "venta",
      concepto: `${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio} - Venta de Cotización ${rem.cotizacion_id}`,
      monto: total,
      expediente_id: rem.expediente_id
    });

    // Costo financiero
    if (Number(datos.costoFinanciero || 0) > 0) {
      transacciones.push({
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        tipo: "gasto",
        categoria: "costo_venta",
        concepto: `Costo Financiero de ${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio}`,
        monto: Number(datos.costoFinanciero),
        expediente_id: rem.expediente_id
      });
    }

    // Otros gastos
    if (Number(datos.otrosGastos || 0) > 0) {
      transacciones.push({
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        tipo: "gasto",
        categoria: "costo_venta",
        concepto: `Otros Gastos de ${datos.tipo === "remision" ? "Remisión" : "Factura"} ${datos.folio}`,
        monto: Number(datos.otrosGastos),
        expediente_id: rem.expediente_id
      });
    }

    const { error: errIns } = await sb
      .from("transacciones_financieras")
      .insert(transacciones);

    if (errIns) console.error("Error al re-registrar transacciones financieras:", errIns.message);
  }

  return { ok: true };
}

/** 15. Cargar plantilla por defecto e interpolar variables dinámicas */
export async function prepararGarantiaPorDefecto(
  cotizacionId: string
): Promise<{ titulo: string; contenido: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Cargar la cotización, prospecto y remisión
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos (
        nombre,
        telefono
      )
    `)
    .eq("id", cotizacionId)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Cotización no encontrada.");

  const { data: remision } = await sb
    .from("remisiones_facturas")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  // 2. Definir fecha y domicilio
  const nombreCliente = cot.prospectos?.nombre || "Cliente Sin Nombre";
  const domicilioCompleto = remision?.datos_documento?.direccionEntrega || "Domicilio en Sitio";
  
  const ahora = new Date();
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const dia = ahora.getDate();
  const mes = meses[ahora.getMonth()];
  const anio = ahora.getFullYear();

  // 3. Buscar plantilla en productos si hay coincidencia
  // Si no, o si el servicioTipo === 'impermeabilizacion', usamos la plantilla por defecto
  let plantilla = "";
  
  // Buscar plantilla en los conceptos de la cotización que estén vinculados al catálogo
  const { data: conceptos } = await sb
    .from("cotizacion_conceptos")
    .select("descripcion")
    .eq("cotizacion_id", cotizacionId);

  if (conceptos && conceptos.length > 0) {
    for (const c of conceptos) {
      const { data: prod } = await sb
        .from("productos_servicios")
        .select("plantilla_garantia")
        .ilike("nombre", c.descripcion)
        .maybeSingle();
      
      if (prod?.plantilla_garantia) {
        plantilla = prod.plantilla_garantia;
        break;
      }
    }
  }

  if (!plantilla) {
    // Plantilla estándar de impermeabilización
    plantilla = `SAUCEDA CONSTRUYE
CARTA DE GARANTÍA · IMPERMEABILIZACIÓN

Por la presente garantizamos los trabajos de impermeabilización que hemos instalado en la siguiente propiedad:

Obra: [NOMBRE DE LA PROPIEDAD / CLIENTE]
Ubicación: [DOMICILIO COMPLETO]
Fecha de aplicación: [DÍA] de [MES] de [AÑO]

Considerando que SAUCEDA Construye ha contratado para los trabajos de impermeabilización en esta propiedad, garantizamos que todos los trabajos realizados con impermeabilizante de la calidad especificada se mantendrán absolutamente impermeables durante el período de garantía establecido.

CONDICIONES DE GARANTÍA:

Período de cobertura
Los trabajos de impermeabilización se mantendrán absolutamente impermeables durante 10 años a partir de la fecha de aplicación.

Cobertura de defectos
Si se detecta cualquier defecto de mano de obra o material relacionado con los trabajos de impermeabilización, SAUCEDA Construye se compromete a rectificar dichas fallas sin cargo extra por servicios, mano de obra y materiales. Esto incluye trabajos de reparación de la superficie, limpieza y pruebas de humedad, de forma completa.

Decisión del cliente
El cliente tiene derecho a autorizar reparaciones o rectificaciones. Dichas reparaciones restablecerán la zona absolutamente impermeable y seca, sin signos de humedad en interiores de la construcción.

Tramitación de reclamaciones
SAUCEDA Construye se compromete a tramitar cualquier reclamación bajo garantía de forma rápida y justa. Para reportar un problema, contáctanos al +52 477 465 4700 o a través de WhatsApp.

Limitaciones de la garantía
SAUCEDA Construye no será responsable si:
- El trabajo es manipulado o la estructura es dañada deliberadamente.
- El sistema de impermeabilización se daña por contratación, agrietamiento por peso adicional, rasgaduras en trabajos externos, o cualquier calamidad natural fuera de nuestro control.
- En caso de infiltraciones por manipulación de la carpeta, SAUCEDA Construye se obliga a reparar la zona afectada con un cargo económico determinado según el daño provocado.

Mantenimiento preventivo
Para garantizar la cobertura completa de esta garantía, recomendamos realizar mantenimiento preventivo a los 6 años después de su aplicación. Consiste en la aplicación de resinas, sellado de traslapés, limpieza y destape de caídas pluviales libres de hojas y basura.

Profesionalismo
La instalación fue realizada por un aplicador previamente calificado y capacitado en técnicas de impermeabilización.

Esta garantía es válida únicamente en la propiedad especificada y no es transferible.

SAUCEDA Construye · Tradición con tecnología · +52 477 465 4700 · saucedamx.com`;
  }

  // 4. Interpolación
  const contenido = plantilla
    .replace(/\[NOMBRE DE LA PROPIEDAD \/ CLIENTE\]/g, nombreCliente)
    .replace(/\[DOMICILIO COMPLETO\]/g, domicilioCompleto)
    .replace(/\[DÍA\]/g, String(dia))
    .replace(/\[MES\]/g, mes)
    .replace(/\[AÑO\]/g, String(anio));

  return {
    titulo: "Carta de Garantía - Impermeabilización",
    contenido
  };
}

/** 16. Obtener Carta de Garantía vinculada a una Cotización */
export async function obtenerGarantiaDocumento(
  cotizacionId: string
): Promise<GarantiaDocumento | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("garantias_documentos")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    cotizacionId: data.cotizacion_id,
    remisionId: data.remision_id,
    titulo: data.titulo,
    contenido: data.contenido,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/** 17. Guardar o actualizar Carta de Garantía */
export async function guardarGarantiaDocumento(
  cotizacionId: string,
  remisionId: string | null,
  titulo: string,
  contenido: string
): Promise<{ ok: boolean; id: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  // Buscar si ya existe
  const { data: existente } = await sb
    .from("garantias_documentos")
    .select("id")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  if (existente?.id) {
    const { error } = await sb
      .from("garantias_documentos")
      .update({
        remision_id: remisionId || null,
        titulo,
        contenido,
        updated_at: new Date().toISOString()
      })
      .eq("id", existente.id);

    if (error) throw new Error(error.message);
    return { ok: true, id: existente.id };
  } else {
    const { data: nueva, error } = await sb
      .from("garantias_documentos")
      .insert({
        cotizacion_id: cotizacionId,
        remision_id: remisionId || null,
        titulo,
        contenido
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, id: nueva.id };
  }
}

/** 18. Obtener de manera pública la garantía utilizando el Token de Cotización */
export async function obtenerGarantiaPorToken(
  token: string
): Promise<{ cotizacion: Cotizacion; garantia: GarantiaDocumento } | null> {
  const sb = supabaseServidor();

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos (
        nombre,
        telefono
      )
    `)
    .eq("token", token)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Acceso denegado o propuesta no encontrada.");

  const { data: gar, error: errGar } = await sb
    .from("garantias_documentos")
    .select("*")
    .eq("cotizacion_id", cot.id)
    .maybeSingle();

  if (errGar || !gar) return null;

  return {
    cotizacion: {
      id: cot.id,
      prospectoId: cot.prospecto_id,
      expedienteId: cot.expediente_id,
      prospectoNombre: cot.prospectos?.nombre || "",
      prospectoTelefono: cot.prospectos?.telefono || "",
      servicioTipo: cot.servicio_tipo,
      estatus: cot.estatus,
      requiereVisita: cot.requiere_visita,
      fechaVisita: cot.fecha_visita,
      inspectorId: cot.inspector_id,
      costoEstimado: Number(cot.costo_estimado || 0),
      precioFinal: Number(cot.precio_final || 0),
      aprobadoComercial: cot.aprobado_comercial,
      aprobadoOperativo: cot.aprobado_operativo,
      token: cot.token,
      notasInternas: cot.notas_internas || "",
      condicionesPago: cot.condiciones_pago || "",
      garantia: cot.garantia || "",
      createdAt: cot.created_at,
      updatedAt: cot.updated_at
    },
    garantia: {
      id: gar.id,
      cotizacionId: gar.cotizacion_id,
      remisionId: gar.remision_id,
      titulo: gar.titulo,
      contenido: gar.contenido,
      createdAt: gar.created_at,
      updatedAt: gar.updated_at
    }
  };
}

/** 19. Obtener remisión/factura y conceptos por el token de cotización */
export async function obtenerRemisionPorToken(
  token: string
): Promise<{ cotizacion: Cotizacion; remision: RemisionFactura; conceptos: CotizacionConcepto[] } | null> {
  const sb = supabaseServidor();

  // 1. Cargar la cotización
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos (
        nombre,
        telefono
      )
    `)
    .eq("token", token)
    .maybeSingle();

  if (errCot || !cot) throw new Error("Acceso denegado o propuesta no encontrada.");

  // 2. Cargar la remisión vinculada
  const { data: rem, error: errRem } = await sb
    .from("remisiones_facturas")
    .select("*")
    .eq("cotizacion_id", cot.id)
    .maybeSingle();

  if (errRem || !rem) return null;

  // 3. Cargar los conceptos
  const { data: concs, error: errConcs } = await sb
    .from("cotizacion_conceptos")
    .select("*")
    .eq("cotizacion_id", cot.id)
    .order("created_at", { ascending: true });

  if (errConcs) throw new Error(errConcs.message);

  return {
    cotizacion: {
      id: cot.id,
      prospectoId: cot.prospecto_id,
      expedienteId: cot.expediente_id,
      prospectoNombre: cot.prospectos?.nombre || "",
      prospectoTelefono: cot.prospectos?.telefono || "",
      servicioTipo: cot.servicio_tipo,
      estatus: cot.estatus,
      requiereVisita: cot.requiere_visita,
      fechaVisita: cot.fecha_visita,
      inspectorId: cot.inspector_id,
      costoEstimado: Number(cot.costo_estimado || 0),
      precioFinal: Number(cot.precio_final || 0),
      aprobadoComercial: cot.aprobado_comercial,
      aprobadoOperativo: cot.aprobado_operativo,
      token: cot.token,
      notasInternas: cot.notas_internas || "",
      condicionesPago: cot.condiciones_pago || "",
      garantia: cot.garantia || "",
      createdAt: cot.created_at,
      updatedAt: cot.updated_at
    },
    remision: {
      id: rem.id,
      cotizacionId: rem.cotizacion_id,
      expedienteId: rem.expediente_id,
      tipo: rem.tipo,
      folio: rem.folio,
      fecha: rem.fecha,
      tipoCambio: Number(rem.tipo_cambio || 1.0),
      datosDocumento: rem.datos_documento || {},
      serviciosExtra: Number(rem.servicios_extra || 0),
      costoFinanciero: Number(rem.costo_financiero || 0),
      otrosGastos: Number(rem.otros_gastos || 0),
      montoSubtotal: Number(rem.monto_subtotal || 0),
      montoTotal: Number(rem.monto_total || 0),
      createdAt: rem.created_at,
      updatedAt: rem.updated_at
    },
    conceptos: (concs ?? []).map((c) => ({
      id: c.id,
      cotizacionId: c.cotizacion_id,
      descripcion: c.descripcion,
      unidad: c.unidad,
      cantidad: Number(c.cantidad || 0),
      costoUnitario: Number(c.costo_unitario || 0),
      precioUnitario: Number(c.precio_unitario || 0),
      descuento: Number(c.descuento || 0),
      importe: Number(c.importe || 0),
      createdAt: c.created_at
    }))
  };
}

/** 20. Obtener los últimos documentos (remisión y garantía) de un prospecto */
export async function obtenerUltimosDocumentosDeProspecto(
  prospectoId: string
): Promise<{ cotizacionToken: string; tieneRemision: boolean; tieneGarantia: boolean } | null> {
  const sb = supabaseServidor();

  // 1. Cargar la última cotización del prospecto
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("id, token")
    .eq("prospecto_id", prospectoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errCot || !cot) return null;

  // 2. Verificar si tiene remisión
  const { data: rem } = await sb
    .from("remisiones_facturas")
    .select("id")
    .eq("cotizacion_id", cot.id)
    .limit(1)
    .maybeSingle();

  // 3. Verificar si tiene garantía
  const { data: gar } = await sb
    .from("garantias_documentos")
    .select("id")
    .eq("cotizacion_id", cot.id)
    .limit(1)
    .maybeSingle();

  return {
    cotizacionToken: cot.token,
    tieneRemision: !!rem,
    tieneGarantia: !!gar
  };
}

