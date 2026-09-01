"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { enviarCorreo } from "@/lib/email";
import { MARCA } from "@/lib/marca";
import { formatoPesos } from "@/lib/formato";
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
    .select("prospecto_id, token, expediente_id")
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

  // Sincronizar remisión/factura existente si fue creada previamente
  const { data: remExistente } = await sb
    .from("remisiones_facturas")
    .select("id, servicios_extra, folio, expediente_id")
    .eq("cotizacion_id", cotizacionId)
    .maybeSingle();

  if (remExistente) {
    const serviciosExtra = Number(remExistente.servicios_extra || 0);
    const nuevoMontoTotal = totalPrecio + serviciosExtra;
    await sb
      .from("remisiones_facturas")
      .update({
        monto_subtotal: totalPrecio,
        monto_total: nuevoMontoTotal,
        updated_at: new Date().toISOString()
      })
      .eq("id", remExistente.id);

    if (remExistente.expediente_id) {
      await sb
        .from("transacciones_financieras")
        .update({ monto: nuevoMontoTotal })
        .eq("expediente_id", remExistente.expediente_id)
        .ilike("concepto", `%${remExistente.folio}%`);
    }
  }

  await sincronizarEtapaExpediente(sb, cotizacionId);

  await registrarActividad(sb, {
    prospectoId: cot.prospecto_id,
    tipo: "construccion",
    titulo: `Presupuesto calculado para cotización (${cotizacionId})`,
    detalle: `Costo interno: $${totalCosto.toFixed(2)}, Venta: $${totalPrecio.toFixed(2)}. Firmas reseteadas.`
  });

  await revalidarRutasCotizacion(sb, cotizacionId, cot.token);

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

/** Helper para revalidar la caché de las páginas de cotización, remisión, garantía y expediente */
export async function revalidarRutasCotizacion(sb: any, cotizacionId: string, tokenOptional?: string) {
  try {
    const { revalidatePath } = await import("next/cache");
    let token = tokenOptional;
    let expedienteId: string | null = null;
    let prospectoId: string | null = null;

    if (!token) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("token, expediente_id, prospecto_id")
        .eq("id", cotizacionId)
        .maybeSingle();

      if (cot) {
        token = cot.token;
        expedienteId = cot.expediente_id;
        prospectoId = cot.prospecto_id;
      }
    }

    if (token) {
      revalidatePath(`/cotizacion/${token}`);
      revalidatePath(`/cotizacion/remision/${token}`);
      revalidatePath(`/cotizacion/garantia/${token}`);
      revalidatePath(`/reporte-visita/${token}`);
    }
    revalidatePath(`/construccion/${cotizacionId}`);
    if (expedienteId) revalidatePath(`/expediente/${expedienteId}`);
    if (prospectoId) revalidatePath(`/prospectos/${prospectoId}`);
    revalidatePath("/construccion");
    revalidatePath("/");
  } catch (err) {
    console.warn("No se pudo revalidar la caché de rutas de cotización:", err);
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
  await revalidarRutasCotizacion(sb, id, data.token);
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

  await revalidarRutasCotizacion(sb, cotizacionId, cot.token);
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

  await revalidarRutasCotizacion(sb, rem.cotizacion_id);
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
    await revalidarRutasCotizacion(sb, cotizacionId);
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
    await revalidarRutasCotizacion(sb, cotizacionId);
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

  const conceptosLista = (concs ?? []).map((c) => ({
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
  }));

  const subtotalConceptos = conceptosLista.reduce((sum, c) => sum + c.importe, 0);
  const montoSubtotalCalculado = subtotalConceptos > 0 ? subtotalConceptos : (Number(cot.precio_final || 0) || Number(rem.monto_subtotal || 0));
  const serviciosExtra = Number(rem.servicios_extra || 0);
  const montoTotalCalculado = montoSubtotalCalculado + serviciosExtra;

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
      serviciosExtra,
      costoFinanciero: Number(rem.costo_financiero || 0),
      otrosGastos: Number(rem.otros_gastos || 0),
      montoSubtotal: montoSubtotalCalculado,
      montoTotal: montoTotalCalculado,
      createdAt: rem.created_at,
      updatedAt: rem.updated_at
    },
    conceptos: conceptosLista
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

/** 21. Duplicar Cotización
 * Crea una copia exacta de una cotización existente (incluyendo todos sus conceptos),
 * generando un nuevo folio correlativo (COT-XXX) para el prospecto especificado
 * (o para el mismo prospecto de la cotización original si no se proporciona uno nuevo).
 */
export async function duplicarCotizacion(
  cotizacionId: string,
  nuevoProspectoId?: string | null
): Promise<Cotizacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener la cotización original
  const { data: original, error: errOrig } = await sb
    .from("cotizaciones")
    .select("*")
    .eq("id", cotizacionId)
    .maybeSingle();

  if (errOrig) throw new Error(errOrig.message);
  if (!original) throw new Error("La cotización original no existe.");

  // 2. Obtener los conceptos de la cotización original
  const { data: conceptosOriginales, error: errCon } = await sb
    .from("cotizacion_conceptos")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("created_at", { ascending: true });

  if (errCon) throw new Error(errCon.message);

  // 3. Generar el nuevo folio correlativo
  const { data: existentes, error: errLista } = await sb
    .from("cotizaciones")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const nuevoId = siguienteId((existentes ?? []).map((r) => r.id as string));

  // 4. Determinar prospecto y expediente destino
  const targetProspectoId = nuevoProspectoId || original.prospecto_id;
  let resolvedExpedienteId = original.expediente_id || null;

  if (nuevoProspectoId && nuevoProspectoId !== original.prospecto_id) {
    const { data: exp } = await sb
      .from("expedientes")
      .select("id")
      .eq("prospecto_id", nuevoProspectoId)
      .maybeSingle();
    resolvedExpedienteId = exp?.id || null;
  }

  // 5. Insertar nueva cotización
  const nuevoToken = crypto.randomUUID();
  const notasClonadas = `[Duplicada de ${cotizacionId}] ${original.notas_internas || ""}`.trim();

  const { data: nuevaCotFila, error: errIns } = await sb
    .from("cotizaciones")
    .insert({
      id: nuevoId,
      prospecto_id: targetProspectoId,
      expediente_id: resolvedExpedienteId,
      servicio_tipo: original.servicio_tipo,
      estatus: "calculando_costo",
      requiere_visita: original.requiere_visita || false,
      fecha_visita: null,
      inspector_id: null,
      costo_estimado: Number(original.costo_estimado || 0),
      precio_final: Number(original.precio_final || 0),
      aprobado_comercial: false,
      aprobado_comercial_by: null,
      aprobado_operativo: false,
      aprobado_operativo_by: null,
      token: nuevoToken,
      notas_internas: notasClonadas,
      condiciones_pago: original.condiciones_pago || 'Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción.',
      garantia: original.garantia || 'Todos los trabajos cuentan con garantía técnica contra vicios ocultos de acuerdo al servicio contratado.',
    })
    .select(`
      *,
      prospectos(nombre, primer_apellido, segundo_apellido, telefono, correo, direccion),
      perfiles_inspector:inspector_id(nombre),
      perfiles_comercial:aprobado_comercial_by(nombre),
      perfiles_operativo:aprobado_operativo_by(nombre)
    `)
    .single();

  if (errIns) throw new Error(errIns.message);

  // 6. Duplicar los conceptos
  if (conceptosOriginales && conceptosOriginales.length > 0) {
    const nuevosConceptos = conceptosOriginales.map((c: any) => ({
      cotizacion_id: nuevoId,
      descripcion: c.descripcion,
      cantidad: Number(c.cantidad || 0),
      unidad: c.unidad || "m2",
      costo_unitario: Number(c.costo_unitario || 0),
      precio_unitario: Number(c.precio_unitario || 0),
      descuento: Number(c.descuento || 0),
      importe: Number(c.importe || 0),
    }));

    const { error: errInsCon } = await sb
      .from("cotizacion_conceptos")
      .insert(nuevosConceptos);

    if (errInsCon) {
      console.error("Error al copiar conceptos de cotización duplicada:", errInsCon);
    }
  }

  // 7. Registrar actividad en la bitácora
  await registrarActividad(sb, {
    prospectoId: targetProspectoId,
    tipo: "construccion",
    titulo: `Cotización duplicada (${nuevoId})`,
    detalle: `Se generó el folio ${nuevoId} como duplicado de la cotización ${cotizacionId}.`,
  });

  if (resolvedExpedienteId) {
    await registrarActividad(sb, {
      expedienteId: resolvedExpedienteId,
      tipo: "construccion",
      titulo: `Cotización duplicada vinculada (${nuevoId})`,
      detalle: `Se vinculó el nuevo folio ${nuevoId} duplicado de ${cotizacionId}.`,
    });
  }

  return aCotizacion(nuevaCotFila);
}

/**
 * Envía una cotización por correo electrónico al cliente utilizando la plantilla de la marca SAUCEDA
 * y registra la actividad en el historial especificando el medio (Correo Electrónico).
 */
export async function enviarCotizacionPorCorreo(datos: {
  cotizacionId: string;
  correoDestino: string;
  asunto?: string;
  notasAdicionales?: string;
}): Promise<{ ok: boolean; error?: string; mensaje?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const correoDestino = (datos.correoDestino || "").trim();
  if (!correoDestino || !correoDestino.includes("@")) {
    return { ok: false, error: "La dirección de correo electrónico ingresada no es válida." };
  }

  // 1. Obtener la cotización con datos de su prospecto
  const { data: cotFila, error: errCot } = await sb
    .from("cotizaciones")
    .select(`
      *,
      prospectos:prospecto_id(id, nombre, primer_apellido, segundo_apellido, correo, telefono, direccion)
    `)
    .eq("id", datos.cotizacionId)
    .single();

  if (errCot || !cotFila) {
    return { ok: false, error: "No se encontró la cotización especificada." };
  }

  const cotizacion = aCotizacion(cotFila);

  // 2. Obtener los conceptos
  const { data: concFilas } = await sb
    .from("cotizacion_conceptos")
    .select("*")
    .eq("cotizacion_id", datos.cotizacionId)
    .order("created_at", { ascending: true });

  const conceptos: CotizacionConcepto[] = (concFilas || []).map(aCotizacionConcepto);

  // 3. Preparar datos de plantilla
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";
  const folioCot = cotizacion.id;
  const siteUrl = process.env.SITE_URL || "https://crm.saucedamx.com";
  const urlPortal = `${siteUrl}/cotizacion/${cotizacion.token}`;

  const servicioLabels: Record<string, string> = {
    impermeabilizacion: "Impermeabilización de Azotea",
    pintura: "Pintura & Acabados",
    losa: "Construcción de Losa",
    remodelacion: "Remodelación Integral",
  };
  const servicioNombre = servicioLabels[cotizacion.servicioTipo] || cotizacion.servicioTipo || "Servicio de Construcción";

  const montoTotal = cotizacion.precioFinal > 0 ? cotizacion.precioFinal : cotizacion.costoEstimado;
  const montoFormateado = formatoPesos(montoTotal);

  const asunto = (datos.asunto || "").trim() || `Propuesta Comercial SAUCEDA ${folioCot} - ${servicioNombre}`;

  // Construir tabla HTML de conceptos
  let tablaConceptosHTML = "";
  if (conceptos.length > 0) {
    const filasHTML = conceptos
      .map(
        (c) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-size: 13px; color: #334155;">${c.descripcion}</td>
          <td style="padding: 10px; font-size: 13px; color: #475569; text-align: center;">${c.cantidad} ${c.unidad}</td>
          <td style="padding: 10px; font-size: 13px; color: #059669; font-weight: bold; text-align: right;">${formatoPesos(c.importe)}</td>
        </tr>
      `
      )
      .join("");

    tablaConceptosHTML = `
      <div style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #2D4A2B; color: #ffffff; text-align: left; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 10px;">Concepto / Descripción</th>
              <th style="padding: 10px; text-align: center;">Cantidad</th>
              <th style="padding: 10px; text-align: right;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${filasHTML}
          </tbody>
        </table>
      </div>
    `;
  }

  const notasHTML = datos.notasAdicionales?.trim()
    ? `<div style="background-color: #f8fafc; border-left: 4px solid #5C7A52; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 13px; color: #334155; font-style: italic;">
        ${datos.notasAdicionales.trim().replace(/\n/g, "<br>")}
      </div>`
    : "";

  // 4. Armar el HTML institucional SAUCEDA
  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${asunto}</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #1a1a1a;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    
    <!-- Encabezado SAUCEDA -->
    <div style="background-color: #2D4A2B; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1px;">SAUCEDA CONSTRUCCIÓN & SERVICIOS</h1>
      <p style="color: #C9A961; margin: 4px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Propuesta Comercial & Presupuesto</p>
    </div>

    <!-- Contenido Principal -->
    <div style="padding: 28px;">
      <p style="font-size: 15px; margin-top: 0; color: #1e293b;">Estimado(a) <strong>${nombreCliente}</strong>,</p>
      
      <p style="font-size: 13px; color: #475569; line-height: 1.6;">
        Es un gusto saludarte. Te compartimos la propuesta comercial formal para el servicio de <strong>${servicioNombre}</strong> (Folio <strong>${folioCot}</strong>).
      </p>

      ${notasHTML}

      <!-- Tarjeta Resumen -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="color: #64748b; padding-bottom: 6px;">Folio de Cotización:</td>
            <td style="font-weight: bold; text-align: right; color: #2D4A2B;">${folioCot}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding-bottom: 6px;">Servicio Solicitado:</td>
            <td style="font-weight: bold; text-align: right; color: #1e293b;">${servicioNombre}</td>
          </tr>
          <tr>
            <td style="color: #64748b;">Monto Total Estimado:</td>
            <td style="font-weight: bold; font-size: 16px; text-align: right; color: #059669;">${montoFormateado}</td>
          </tr>
        </table>
      </div>

      ${tablaConceptosHTML}

      <!-- Botón de Acción -->
      <div style="text-align: center; margin: 32px 0 24px 0;">
        <a href="${urlPortal}" target="_blank" style="background-color: #2D4A2B; color: #ffffff; padding: 14px 28px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 2px 5px rgba(45,74,43,0.3);">
          📋 Ver y Autorizar Propuesta en Línea
        </a>
      </div>

      <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 16px; line-height: 1.5;">
        En nuestro portal interactivo podrás revisar los detalles del proyecto, solicitar modificaciones o autorizar la cotización en línea.
      </p>
    </div>

    <!-- Pie de Página -->
    <div style="background-color: #2D4A2B; padding: 20px; text-align: center; color: #ffffff; font-size: 12px;">
      <p style="margin: 0 0 6px 0; font-weight: bold; color: #F5F1E8;">SAUCEDA Bienes Raíces & Construcción</p>
      <p style="margin: 0; color: #C9A961; font-size: 11px;">WhatsApp: ${MARCA.whatsappTexto} · ${MARCA.web.replace("https://", "")}</p>
    </div>
  </div>
</body>
</html>`;

  // 5. Enviar correo por medio de Resend
  await enviarCorreo(correoDestino, asunto, htmlBody);

  // 6. Si estaba en estatus aprobada, marcarla como enviada
  if (cotFila.estatus === "aprobada") {
    await sb
      .from("cotizaciones")
      .update({ estatus: "enviada", updated_at: new Date().toISOString() })
      .eq("id", datos.cotizacionId);
  }

  // 7. Si el prospecto no tenía correo asignado o era distinto, guardarlo permanentemente
  if (cotFila.prospecto_id && (!cotFila.prospectos?.correo || cotFila.prospectos?.correo !== correoDestino)) {
    await sb
      .from("prospectos")
      .update({ correo: correoDestino, updated_at: new Date().toISOString() })
      .eq("id", cotFila.prospecto_id);
  }

  // 8. Registrar la Actividad especificando claramente que el medio fue Correo Electrónico
  await registrarActividad(sb, {
    prospectoId: cotFila.prospecto_id,
    expedienteId: cotFila.expediente_id,
    tipo: "envio_cotizacion_email",
    titulo: `✉️ Cotización enviada por Correo Electrónico`,
    detalle: `Se envió la propuesta comercial (Folio ${folioCot}) a la dirección ${correoDestino} por medio de Correo Electrónico. Enlace al portal: ${urlPortal}`,
  });

  return {
    ok: true,
    mensaje: `Cotización ${folioCot} enviada exitosamente por correo electrónico a ${correoDestino} y registrada en la bitácora.`,
  };
}


