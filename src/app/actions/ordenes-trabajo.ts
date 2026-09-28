"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { numeroALetras } from "@/lib/numero-a-letras";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { normalizarTelefono } from "@/lib/telefono";
import { enviarCorreo } from "@/lib/email";
import { PLANTILLA_ENTREGA_SERVICIO } from "@/lib/meta-plantillas";
import { MARCA } from "@/lib/marca";
import { generarDocumentoProveedorAutomatico } from "@/app/actions/proveedores";
import { aDocumentoProveedor } from "@/lib/supabase/mapeo";
import type { RemisionFactura, DocumentoProveedor } from "@/lib/types";
import { sincronizarComisionParaRecibo } from "@/app/actions/comisiones";

export interface EvidenciaFoto {
  url: string;
  descripcion?: string;
  fecha: string;
  etapa: "inicio" | "proceso" | "entrega";
}

export interface OrdenTrabajo {
  id: string;
  folio: string;
  expedienteId: string | null;
  cotizacionId: string | null;
  prospectoId: string | null;
  tipoNegocio: string;
  estatus: "pendiente" | "en_proceso" | "completada" | "cancelada";
  titulo: string;
  descripcion: string | null;
  fechaProgramada: string | null;
  fechaInicio: string | null;
  fechaConclusion: string | null;
  asesorResponsableId: string | null;
  asesorEjecutorId: string | null;
  creadoPor: string | null;
  notasConclusion: string | null;
  fotosEvidencia: EvidenciaFoto[];
  createdAt: string;
  updatedAt: string;
  // Proveedor asignado a esta orden de trabajo
  proveedorId: string | null;
  proveedorNombre?: string | null;
  costoProveedor: number | null;
  proveedorConcepto: string | null;
  // Enriquecidos
  token: string;
  notificadoClienteAt?: string | null;
  canalNotificacion?: string | null;
  asesorEjecutorNombre?: string;
  asesorResponsableNombre?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteCorreo?: string;
  clienteDireccion?: string;
  totalCotizado?: number;
  totalPagado?: number;
  saldoRestante?: number;
  cotizacionToken?: string;
  remisionFactura?: RemisionFactura | null;
}

export interface ReciboPago {
  id: string;
  folio: string;
  ordenTrabajoId: string;
  expedienteId: string | null;
  cotizacionId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  monto: number;
  montoLetra: string | null;
  metodoPago: "transferencia" | "efectivo" | "tarjeta" | "otro";
  referenciaPago: string | null;
  concepto: string;
  saldoAnterior: number;
  saldoRestante: number;
  recibidoPor: string | null;
  recibidoPorNombre: string | null;
  fechaPago: string;
  notas: string | null;
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartaGarantiaOT {
  id: string;
  ordenTrabajoId: string;
  cotizacionId: string | null;
  titulo: string;
  contenido: string;
  token: string | null;
  anosGarantia: number;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Genera folio correlativo anual para Orden de Trabajo: OT-2026-0001 */
async function generarFolioOT(sb: any): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = `OT-${anio}-`;

  const { data } = await sb
    .from("ordenes_trabajo")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);

  let siguienteNum = 1;
  if (data && data.length > 0 && data[0]?.folio) {
    const ultimo = data[0].folio.replace(prefijo, "");
    const parsed = parseInt(ultimo, 10);
    if (!isNaN(parsed)) {
      siguienteNum = parsed + 1;
    }
  }

  return `${prefijo}${String(siguienteNum).padStart(4, "0")}`;
}

/** Genera folio correlativo anual para Recibo de Pago: REC-2026-0001 */
async function generarFolioRecibo(sb: any): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = `REC-${anio}-`;

  const { data } = await sb
    .from("recibos_pago")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);

  let siguienteNum = 1;
  if (data && data.length > 0 && data[0]?.folio) {
    const ultimo = data[0].folio.replace(prefijo, "");
    const parsed = parseInt(ultimo, 10);
    if (!isNaN(parsed)) {
      siguienteNum = parsed + 1;
    }
  }

  return `${prefijo}${String(siguienteNum).padStart(4, "0")}`;
}

/** 1. Crear Orden de Trabajo */
export async function crearOrdenTrabajo(datos: {
  expedienteId?: string | null;
  cotizacionId?: string | null;
  prospectoId?: string | null;
  tipoNegocio?: string;
  titulo: string;
  descripcion?: string;
  fechaProgramada?: string;
  asesorEjecutorId?: string | null;
  proveedorId?: string | null;
  costoProveedor?: number | null;
  proveedorConcepto?: string | null;
}): Promise<{ ok: boolean; id?: string; folio?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    let {
      expedienteId = null,
      cotizacionId = null,
      prospectoId = null,
      tipoNegocio = "construccion",
      titulo,
      descripcion = "",
      fechaProgramada = null,
      asesorEjecutorId = null,
      proveedorId = null,
      costoProveedor = null,
      proveedorConcepto = null,
    } = datos;

    // Si viene de una cotización y faltan datos, resolverlos automáticamente
    if (cotizacionId && (!prospectoId || !expedienteId)) {
      const { data: cot } = await sb
        .from("cotizaciones")
        .select("prospecto_id, expediente_id, servicio_tipo, precio_final, prospectos(nombre)")
        .eq("id", cotizacionId)
        .maybeSingle();

      if (cot) {
        prospectoId = prospectoId || cot.prospecto_id;
        expedienteId = expedienteId || cot.expediente_id;
        if (!tipoNegocio || tipoNegocio === "construccion") {
          tipoNegocio = cot.servicio_tipo || "construccion";
        }
      }
    }

    // Si viene con expedienteId y no prospectoId, resolver prospecto
    if (expedienteId && !prospectoId) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("prospecto_id, tipo_negocio")
        .eq("id", expedienteId)
        .maybeSingle();
      if (exp) {
        prospectoId = exp.prospecto_id;
        if (exp.tipo_negocio) tipoNegocio = exp.tipo_negocio;
      }
    }

    const folio = await generarFolioOT(sb);
    const token = crypto.randomBytes(16).toString("hex");

    const { data: nuevaOT, error } = await sb
      .from("ordenes_trabajo")
      .insert({
        folio,
        token,
        expediente_id: expedienteId || null,
        cotizacion_id: cotizacionId || null,
        prospecto_id: prospectoId || null,
        tipo_negocio: tipoNegocio || "construccion",
        estatus: "pendiente",
        titulo: titulo.trim(),
        descripcion: descripcion?.trim() || null,
        fecha_programada: fechaProgramada || null,
        fecha_inicio: null,
        fecha_conclusion: null,
        asesor_responsable_id: usuario?.id || null,
        asesor_ejecutor_id: asesorEjecutorId || null,
        creado_por: usuario?.id || null,
        fotos_evidencia: [],
        proveedor_id: proveedorId || null,
        costo_proveedor: costoProveedor && costoProveedor > 0 ? costoProveedor : null,
        proveedor_concepto: proveedorConcepto?.trim() || null,
      })
      .select("id, folio, token")
      .single();

    if (error) {
      console.error("Error al crear orden de trabajo:", error);
      return { ok: false, error: error.message };
    }

    // Revalidaciones
    revalidatePath("/ordenes-trabajo");
    if (expedienteId) revalidatePath(`/expediente/${expedienteId}`);
    if (prospectoId) revalidatePath(`/prospectos/${prospectoId}`);
    if (cotizacionId) revalidatePath(`/cotizacion/${cotizacionId}`);

    return { ok: true, id: nuevaOT.id, folio: nuevaOT.folio };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al crear la orden de trabajo." };
  }
}

/** Asigna (o cambia) el proveedor y el costo pactado con él para esta orden de trabajo. */
export async function asignarProveedorOrdenTrabajo(
  ordenId: string,
  datos: { proveedorId: string | null; costoProveedor: number | null; proveedorConcepto?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb
      .from("ordenes_trabajo")
      .update({
        proveedor_id: datos.proveedorId || null,
        costo_proveedor: datos.costoProveedor && datos.costoProveedor > 0 ? datos.costoProveedor : null,
        proveedor_concepto: datos.proveedorConcepto?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ordenId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al asignar el proveedor." };
  }
}

/** 2. Listar Órdenes de Trabajo con filtros */
export async function obtenerOrdenesTrabajo(filtros?: {
  expedienteId?: string;
  cotizacionId?: string;
  prospectoId?: string;
  estatus?: string;
  tipoNegocio?: string;
  asesorEjecutorId?: string;
  busqueda?: string;
}): Promise<OrdenTrabajo[]> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    let query = sb
      .from("ordenes_trabajo")
      .select(`
        *,
        asesor_ejecutor:perfiles!ordenes_trabajo_asesor_ejecutor_id_fkey(id, nombre),
        asesor_responsable:perfiles!ordenes_trabajo_asesor_responsable_id_fkey(id, nombre),
        prospectos(id, nombre, telefono, correo, direccion),
        cotizaciones(id, precio_final, condiciones_pago, token),
        proveedores:proveedor_id(id, nombre)
      `)
      .order("created_at", { ascending: false });

    if (filtros?.expedienteId) {
      query = query.eq("expediente_id", filtros.expedienteId);
    }
    if (filtros?.cotizacionId) {
      query = query.eq("cotizacion_id", filtros.cotizacionId);
    }
    if (filtros?.prospectoId) {
      query = query.eq("prospecto_id", filtros.prospectoId);
    }
    if (filtros?.estatus && filtros.estatus !== "todos") {
      query = query.eq("estatus", filtros.estatus);
    }
    if (filtros?.tipoNegocio && filtros.tipoNegocio !== "todos") {
      query = query.eq("tipo_negocio", filtros.tipoNegocio);
    }
    if (filtros?.asesorEjecutorId) {
      query = query.eq("asesor_ejecutor_id", filtros.asesorEjecutorId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error al obtener ordenes de trabajo:", error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Obtener acumulados de pagos por orden de trabajo
    const otIds = data.map((d: any) => d.id);
    const { data: recibos } = await sb
      .from("recibos_pago")
      .select("orden_trabajo_id, monto")
      .in("orden_trabajo_id", otIds);

    const pagosPorOT = new Map<string, number>();
    (recibos || []).forEach((r: any) => {
      const prev = pagosPorOT.get(r.orden_trabajo_id) || 0;
      pagosPorOT.set(r.orden_trabajo_id, prev + Number(r.monto || 0));
    });

    // Obtener remisiones vinculadas
    const cotIds = data.map((d: any) => d.cotizacion_id).filter(Boolean);
    const { data: remisionesList } = await sb
      .from("remisiones_facturas")
      .select("*")
      .or(`orden_trabajo_id.in.(${otIds.join(",")})${cotIds.length > 0 ? `,cotizacion_id.in.(${cotIds.join(",")})` : ""}`);

    const remisionPorOT = new Map<string, RemisionFactura>();
    (remisionesList || []).forEach((rem: any) => {
      const obj: RemisionFactura = {
        id: rem.id,
        cotizacionId: rem.cotizacion_id,
        ordenTrabajoId: rem.orden_trabajo_id,
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
        updatedAt: rem.updated_at,
      };
      if (rem.orden_trabajo_id) remisionPorOT.set(rem.orden_trabajo_id, obj);
      if (rem.cotizacion_id) {
        data.forEach((d: any) => {
          if (d.cotizacion_id === rem.cotizacion_id && !remisionPorOT.has(d.id)) {
            remisionPorOT.set(d.id, obj);
          }
        });
      }
    });

    return data.map((d: any) => {
      const totalCotizado = Number(d.cotizaciones?.precio_final || 0);
      const totalPagado = pagosPorOT.get(d.id) || 0;
      const saldoRestante = Math.max(0, totalCotizado - totalPagado);

      return {
        id: d.id,
        folio: d.folio,
        token: d.token || "",
        notificadoClienteAt: d.notificado_cliente_at,
        canalNotificacion: d.canal_notificacion,
        expedienteId: d.expediente_id,
        cotizacionId: d.cotizacion_id,
        prospectoId: d.prospecto_id,
        tipoNegocio: d.tipo_negocio,
        estatus: d.estatus,
        titulo: d.titulo,
        descripcion: d.descripcion,
        fechaProgramada: d.fecha_programada,
        fechaInicio: d.fecha_inicio,
        fechaConclusion: d.fecha_conclusion,
        asesorResponsableId: d.asesor_responsable_id,
        asesorEjecutorId: d.asesor_ejecutor_id,
        creadoPor: d.creado_por,
        notasConclusion: d.notas_conclusion,
        fotosEvidencia: Array.isArray(d.fotos_evidencia) ? d.fotos_evidencia : [],
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        proveedorId: d.proveedor_id,
        proveedorNombre: d.proveedores?.nombre || null,
        costoProveedor: d.costo_proveedor !== null && d.costo_proveedor !== undefined ? Number(d.costo_proveedor) : null,
        proveedorConcepto: d.proveedor_concepto,
        asesorEjecutorNombre: d.asesor_ejecutor?.nombre || "Sin asignar",
        asesorResponsableNombre: d.asesor_responsable?.nombre || "",
        clienteNombre: d.prospectos?.nombre || "Cliente General",
        clienteTelefono: d.prospectos?.telefono || "",
        clienteCorreo: d.prospectos?.correo || "",
        clienteDireccion: d.prospectos?.direccion || "",
        totalCotizado,
        totalPagado,
        saldoRestante,
        cotizacionToken: d.cotizaciones?.token,
        remisionFactura: remisionPorOT.get(d.id) || null,
      };
    });
  } catch (err) {
    console.error("Error en obtenerOrdenesTrabajo:", err);
    return [];
  }
}

/** 3. Obtener Orden de Trabajo por ID con recibos, garantía y remisión */
export async function obtenerOrdenTrabajoPorId(id: string): Promise<{
  orden: OrdenTrabajo | null;
  recibos: ReciboPago[];
  garantia: CartaGarantiaOT | null;
  remisionFactura: RemisionFactura | null;
  documentoProveedor: DocumentoProveedor | null;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: d, error } = await sb
      .from("ordenes_trabajo")
      .select(`
        *,
        asesor_ejecutor:perfiles!ordenes_trabajo_asesor_ejecutor_id_fkey(id, nombre),
        asesor_responsable:perfiles!ordenes_trabajo_asesor_responsable_id_fkey(id, nombre),
        prospectos(id, nombre, telefono, correo, direccion),
        cotizaciones(id, precio_final, condiciones_pago, token),
        proveedores:proveedor_id(id, nombre)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !d) return { orden: null, recibos: [], garantia: null, remisionFactura: null, documentoProveedor: null };

    // Documento de costo del proveedor (generado automático al concluir, o registrado manualmente)
    const { data: docProv } = await sb
      .from("documentos_proveedores")
      .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
      .eq("orden_trabajo_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const documentoProveedor: DocumentoProveedor | null = docProv
      ? aDocumentoProveedor(docProv as any)
      : null;

    // Recibos asociados
    const { data: recs } = await sb
      .from("recibos_pago")
      .select("*")
      .eq("orden_trabajo_id", id)
      .order("created_at", { ascending: false });

    // Garantía asociada
    const { data: gar } = await sb
      .from("garantias_documentos")
      .select("*")
      .eq("orden_trabajo_id", id)
      .maybeSingle();

    // Remisión / Factura asociada
    let queryRem = sb.from("remisiones_facturas").select("*");
    if (d.cotizacion_id) {
      queryRem = queryRem.or(`orden_trabajo_id.eq.${id},cotizacion_id.eq.${d.cotizacion_id}`);
    } else {
      queryRem = queryRem.eq("orden_trabajo_id", id);
    }
    const { data: remData } = await queryRem.order("created_at", { ascending: false }).limit(1).maybeSingle();

    const remisionFactura: RemisionFactura | null = remData
      ? {
          id: remData.id,
          cotizacionId: remData.cotizacion_id,
          ordenTrabajoId: remData.orden_trabajo_id,
          expedienteId: remData.expediente_id,
          tipo: remData.tipo,
          folio: remData.folio,
          fecha: remData.fecha,
          tipoCambio: Number(remData.tipo_cambio || 1.0),
          datosDocumento: remData.datos_documento || {},
          serviciosExtra: Number(remData.servicios_extra || 0),
          costoFinanciero: Number(remData.costo_financiero || 0),
          otrosGastos: Number(remData.otros_gastos || 0),
          montoSubtotal: Number(remData.monto_subtotal || 0),
          montoTotal: Number(remData.monto_total || 0),
          createdAt: remData.created_at,
          updatedAt: remData.updated_at,
        }
      : null;

    const recibos: ReciboPago[] = (recs || []).map((r: any) => ({
      id: r.id,
      folio: r.folio,
      ordenTrabajoId: r.orden_trabajo_id,
      expedienteId: r.expediente_id,
      cotizacionId: r.cotizacion_id,
      clienteNombre: r.cliente_nombre,
      clienteTelefono: r.cliente_telefono,
      clienteDireccion: r.cliente_direccion,
      monto: Number(r.monto || 0),
      montoLetra: r.monto_letra,
      metodoPago: r.metodo_pago,
      referenciaPago: r.referencia_pago,
      concepto: r.concepto,
      saldoAnterior: Number(r.saldo_anterior || 0),
      saldoRestante: Number(r.saldo_restante || 0),
      recibidoPor: r.recibido_por,
      recibidoPorNombre: r.recibido_por_nombre,
      fechaPago: r.fecha_pago,
      notas: r.notas,
      token: r.token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const totalCotizado = Number(d.cotizaciones?.precio_final || 0);
    const totalPagado = recibos.reduce((acc, curr) => acc + curr.monto, 0);
    const saldoRestante = Math.max(0, totalCotizado - totalPagado);

    const garantia: CartaGarantiaOT | null = gar
      ? {
          id: gar.id,
          ordenTrabajoId: gar.orden_trabajo_id,
          cotizacionId: gar.cotizacion_id,
          titulo: gar.titulo,
          contenido: gar.contenido,
          token: gar.token,
          anosGarantia: Number(gar.anos_garantia || 3),
          fechaInicio: gar.fecha_inicio,
          fechaVencimiento: gar.fecha_vencimiento,
          createdAt: gar.created_at,
          updatedAt: gar.updated_at,
        }
      : null;

    const orden: OrdenTrabajo = {
      id: d.id,
      folio: d.folio,
      token: d.token || "",
      notificadoClienteAt: d.notificado_cliente_at,
      canalNotificacion: d.canal_notificacion,
      expedienteId: d.expediente_id,
      cotizacionId: d.cotizacion_id,
      prospectoId: d.prospecto_id,
      tipoNegocio: d.tipo_negocio,
      estatus: d.estatus,
      titulo: d.titulo,
      descripcion: d.descripcion,
      fechaProgramada: d.fecha_programada,
      fechaInicio: d.fecha_inicio,
      fechaConclusion: d.fecha_conclusion,
      asesorResponsableId: d.asesor_responsable_id,
      asesorEjecutorId: d.asesor_ejecutor_id,
      creadoPor: d.creado_por,
      notasConclusion: d.notas_conclusion,
      fotosEvidencia: Array.isArray(d.fotos_evidencia) ? d.fotos_evidencia : [],
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      proveedorId: d.proveedor_id,
      proveedorNombre: d.proveedores?.nombre || null,
      costoProveedor: d.costo_proveedor !== null && d.costo_proveedor !== undefined ? Number(d.costo_proveedor) : null,
      proveedorConcepto: d.proveedor_concepto,
      asesorEjecutorNombre: d.asesor_ejecutor?.nombre || "Sin asignar",
      asesorResponsableNombre: d.asesor_responsable?.nombre || "",
      clienteNombre: d.prospectos?.nombre || "Cliente General",
      clienteTelefono: d.prospectos?.telefono || "",
      clienteCorreo: d.prospectos?.correo || "",
      clienteDireccion: d.prospectos?.direccion || "",
      totalCotizado,
      totalPagado,
      saldoRestante,
      cotizacionToken: d.cotizaciones?.token,
      remisionFactura,
    };

    return { orden, recibos, garantia, remisionFactura, documentoProveedor };
  } catch (err) {
    console.error("Error en obtenerOrdenTrabajoPorId:", err);
    return { orden: null, recibos: [], garantia: null, remisionFactura: null, documentoProveedor: null };
  }
}

/** 4. Actualizar Estatus de Orden de Trabajo */
export async function actualizarEstatusOrdenTrabajo(
  ordenId: string,
  nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada",
  extras?: { notasConclusion?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const actualizacion: Record<string, any> = {
      estatus: nuevoEstatus,
      updated_at: new Date().toISOString(),
    };

    if (nuevoEstatus === "en_proceso") {
      actualizacion.fecha_inicio = new Date().toISOString().split("T")[0];
    } else if (nuevoEstatus === "completada") {
      actualizacion.fecha_conclusion = new Date().toISOString();
      if (extras?.notasConclusion) {
        actualizacion.notas_conclusion = extras.notasConclusion.trim();
      }
    }

    const { error } = await sb
      .from("ordenes_trabajo")
      .update(actualizacion)
      .eq("id", ordenId);

    if (error) return { ok: false, error: error.message };

    // Al concluir la orden, generar en automático la remisión de costo del proveedor asignado
    if (nuevoEstatus === "completada") {
      const resDoc = await generarDocumentoProveedorAutomatico(ordenId);
      if (!resDoc.ok) {
        console.warn("No se generó el documento de proveedor automático:", resDoc.error);
      }
    }

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al actualizar estatus." };
  }
}

/** 5. Eliminar Orden de Trabajo */
export async function eliminarOrdenTrabajo(
  ordenId: string
): Promise<{ ok: boolean; folio?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Obtener datos de la orden para saber referencias y folios
    const { data: orden, error: errOrden } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, expediente_id, cotizacion_id")
      .eq("id", ordenId)
      .maybeSingle();

    if (errOrden) return { ok: false, error: errOrden.message };
    if (!orden) return { ok: false, error: "La orden de trabajo no existe o ya fue eliminada." };

    // 2. Limpiar pólizas de garantía exclusivas de esta OT (sin cotización vinculada)
    await sb
      .from("garantias_documentos")
      .delete()
      .eq("orden_trabajo_id", ordenId)
      .is("cotizacion_id", null);

    // Desvincular garantías que sí pertenezcan a una cotización
    await sb
      .from("garantias_documentos")
      .update({ orden_trabajo_id: null })
      .eq("orden_trabajo_id", ordenId);

    // 3. Limpiar recibos de pago vinculados a esta orden
    await sb
      .from("recibos_pago")
      .delete()
      .eq("orden_trabajo_id", ordenId);

    // 4. Desvincular remisión o factura asociada a esta OT
    await sb
      .from("remisiones_facturas")
      .update({ orden_trabajo_id: null })
      .eq("orden_trabajo_id", ordenId);

    // 5. Eliminar la orden de trabajo
    const { error: errDelete } = await sb
      .from("ordenes_trabajo")
      .delete()
      .eq("id", ordenId);

    if (errDelete) return { ok: false, error: errDelete.message };

    // 6. Revalidar rutas
    revalidatePath("/ordenes-trabajo");
    if (orden.cotizacion_id) revalidatePath(`/construccion/${orden.cotizacion_id}`);
    if (orden.expediente_id) revalidatePath(`/expedientes/${orden.expediente_id}`);
    revalidatePath("/construccion");
    revalidatePath("/prospectos");

    return { ok: true, folio: orden.folio };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar la orden de trabajo." };
  }
}

/** 5. Asignar Asesor Ejecutor */
export async function asignarAsesorEjecutor(
  ordenId: string,
  asesorEjecutorId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb
      .from("ordenes_trabajo")
      .update({
        asesor_ejecutor_id: asesorEjecutorId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ordenId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al asignar asesor ejecutor." };
  }
}

/** 6. Subir Evidencia Fotográfica a la Orden de Trabajo */
export async function agregarEvidenciaFotoOT(
  ordenId: string,
  formData: FormData
): Promise<{ ok: boolean; foto?: EvidenciaFoto; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const archivo = formData.get("foto") as File | null;
    const etapa = (formData.get("etapa") as "inicio" | "proceso" | "entrega") || "proceso";
    const descripcion = (formData.get("descripcion") as string) || "";

    if (!archivo || archivo.size === 0) {
      return { ok: false, error: "No se seleccionó ninguna imagen válida." };
    }

    const cleanName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `ordenes/${ordenId}/${Date.now()}-${cleanName}`;
    const buffer = Buffer.from(await archivo.arrayBuffer());

    let publicUrl = "";
    let { data: uploadData, error: uploadError } = await sb.storage
      .from("expedientes-fotos")
      .upload(path, buffer, {
        contentType: archivo.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError && uploadError.message.toLowerCase().includes("not found")) {
      try {
        await sb.storage.createBucket("expedientes-fotos", { public: true });
        const retry = await sb.storage
          .from("expedientes-fotos")
          .upload(path, buffer, {
            contentType: archivo.type || "image/jpeg",
            upsert: true,
          });
        uploadData = retry.data;
        uploadError = retry.error;
      } catch (e) {
        console.warn("Bucket fallback warning:", e);
      }
    }

    if (!uploadError && uploadData) {
      const { data: urlData } = sb.storage
        .from("expedientes-fotos")
        .getPublicUrl(uploadData.path);
      publicUrl = urlData.publicUrl;
    } else {
      const base64 = buffer.toString("base64");
      publicUrl = `data:${archivo.type || "image/jpeg"};base64,${base64}`;
    }

    // Traer fotos existentes
    const { data: otData } = await sb
      .from("ordenes_trabajo")
      .select("fotos_evidencia")
      .eq("id", ordenId)
      .single();

    const existentes: EvidenciaFoto[] = Array.isArray(otData?.fotos_evidencia)
      ? otData.fotos_evidencia
      : [];

    const nuevaFoto: EvidenciaFoto = {
      url: publicUrl,
      descripcion: descripcion.trim() || undefined,
      fecha: new Date().toISOString(),
      etapa,
    };

    existentes.push(nuevaFoto);

    const { error: updateError } = await sb
      .from("ordenes_trabajo")
      .update({
        fotos_evidencia: existentes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ordenId);

    if (updateError) return { ok: false, error: updateError.message };

    revalidatePath("/ordenes-trabajo");
    return { ok: true, foto: nuevaFoto };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al subir evidencia fotográfica." };
  }
}

/** Elimina una foto de evidencia de la orden de trabajo (storage + registro). */
export async function eliminarEvidenciaFotoOT(
  ordenId: string,
  fotoUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: otData, error: otErr } = await sb
      .from("ordenes_trabajo")
      .select("fotos_evidencia")
      .eq("id", ordenId)
      .single();

    if (otErr || !otData) return { ok: false, error: "Orden de trabajo no encontrada." };

    const existentes: EvidenciaFoto[] = Array.isArray(otData.fotos_evidencia)
      ? otData.fotos_evidencia
      : [];
    const restantes = existentes.filter((f) => f.url !== fotoUrl);

    if (restantes.length === existentes.length) {
      return { ok: false, error: "La foto ya no está en la orden de trabajo." };
    }

    const { error: updateError } = await sb
      .from("ordenes_trabajo")
      .update({ fotos_evidencia: restantes, updated_at: new Date().toISOString() })
      .eq("id", ordenId);

    if (updateError) return { ok: false, error: updateError.message };

    // Borrado del archivo en storage (best-effort, no bloquea si falla)
    const match = fotoUrl.match(/expedientes-fotos\/(.+)$/);
    if (match) {
      try {
        await sb.storage.from("expedientes-fotos").remove([match[1]]);
      } catch (e) {
        console.warn("No se pudo borrar el archivo de storage:", e);
      }
    }

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar la evidencia fotográfica." };
  }
}

/** 7. Crear Recibo de Pago (Anticipo / Liquidación) */
export async function crearReciboPago(datos: {
  ordenTrabajoId: string;
  monto: number;
  metodoPago: "transferencia" | "efectivo" | "tarjeta" | "otro";
  referenciaPago?: string;
  concepto: string;
  fechaPago?: string;
  notas?: string;
}): Promise<{ ok: boolean; recibo?: ReciboPago; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    // Obtener orden y cotización vinculada para calcular saldos
    const { data: ot, error: otErr } = await sb
      .from("ordenes_trabajo")
      .select(`
        id,
        expediente_id,
        cotizacion_id,
        prospecto_id,
        titulo,
        prospectos(nombre, telefono),
        cotizaciones(precio_final)
      `)
      .eq("id", datos.ordenTrabajoId)
      .single();

    if (otErr || !ot) return { ok: false, error: "Orden de trabajo no encontrada." };

    // Obtener recibos previos para saldo anterior
    const { data: recibosPrevios } = await sb
      .from("recibos_pago")
      .select("monto")
      .eq("orden_trabajo_id", datos.ordenTrabajoId);

    const totalCotizado = Number(ot.cotizaciones?.precio_final || 0);
    const pagadoHastaAhora = (recibosPrevios || []).reduce(
      (acc: number, curr: any) => acc + Number(curr.monto || 0),
      0
    );

    const saldoAnterior = totalCotizado > 0 ? Math.max(0, totalCotizado - pagadoHastaAhora) : 0;
    const monto = Number(datos.monto || 0);
    const saldoRestante = Math.max(0, saldoAnterior - monto);

    const folio = await generarFolioRecibo(sb);
    const token = crypto.randomBytes(24).toString("hex");
    const montoLetra = numeroALetras(monto);

    // Obtener nombre del perfil que recibe el pago
    let recibidoPorNombre = "Asesor Sauceda";
    if (usuario?.id) {
      const { data: perf } = await sb
        .from("perfiles")
        .select("nombre")
        .eq("id", usuario.id)
        .maybeSingle();
      if (perf?.nombre) recibidoPorNombre = perf.nombre;
    }

    const { data: nuevo, error: insertError } = await sb
      .from("recibos_pago")
      .insert({
        folio,
        orden_trabajo_id: datos.ordenTrabajoId,
        expediente_id: ot.expediente_id,
        cotizacion_id: ot.cotizacion_id,
        cliente_nombre: ot.prospectos?.nombre || "Cliente Sauceda",
        cliente_telefono: ot.prospectos?.telefono || null,
        cliente_direccion: null,
        monto,
        monto_letra: montoLetra,
        metodo_pago: datos.metodoPago || "transferencia",
        referencia_pago: datos.referenciaPago?.trim() || null,
        concepto: datos.concepto.trim(),
        saldo_anterior: saldoAnterior,
        saldo_restante: saldoRestante,
        recibido_por: usuario?.id || null,
        recibido_por_nombre: recibidoPorNombre,
        fecha_pago: datos.fechaPago || new Date().toISOString().split("T")[0],
        notas: datos.notas?.trim() || null,
        token,
      })
      .select("*")
      .single();

    if (insertError) return { ok: false, error: insertError.message };

    // Sincronizar automáticamente la comisión del asesor
    try {
      await sincronizarComisionParaRecibo(nuevo.id);
    } catch (eCom: any) {
      console.warn("No se pudo sincronizar automáticamente la comisión del recibo:", eCom?.message);
    }

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/comisiones");
    if (ot.expediente_id) revalidatePath(`/expediente/${ot.expediente_id}`);
    if (ot.prospecto_id) revalidatePath(`/prospectos/${ot.prospecto_id}`);

    return {
      ok: true,
      recibo: {
        id: nuevo.id,
        folio: nuevo.folio,
        ordenTrabajoId: nuevo.orden_trabajo_id,
        expedienteId: nuevo.expediente_id,
        cotizacionId: nuevo.cotizacion_id,
        clienteNombre: nuevo.cliente_nombre,
        clienteTelefono: nuevo.cliente_telefono,
        clienteDireccion: nuevo.cliente_direccion,
        monto: Number(nuevo.monto),
        montoLetra: nuevo.monto_letra,
        metodoPago: nuevo.metodo_pago,
        referenciaPago: nuevo.referencia_pago,
        concepto: nuevo.concepto,
        saldoAnterior: Number(nuevo.saldo_anterior),
        saldoRestante: Number(nuevo.saldo_restante),
        recibidoPor: nuevo.recibido_por,
        recibidoPorNombre: nuevo.recibido_por_nombre,
        fechaPago: nuevo.fecha_pago,
        notas: nuevo.notas,
        token: nuevo.token,
        createdAt: nuevo.created_at,
        updatedAt: nuevo.updated_at,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al registrar recibo de pago." };
  }
}

/** 8. Obtener Recibo de Pago de forma pública por Token (para cliente / PDF) */
export async function obtenerReciboPorToken(token: string): Promise<ReciboPago | null> {
  try {
    const sb = supabaseServidor();
    const { data: r, error } = await sb
      .from("recibos_pago")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error || !r) return null;

    return {
      id: r.id,
      folio: r.folio,
      ordenTrabajoId: r.orden_trabajo_id,
      expedienteId: r.expediente_id,
      cotizacionId: r.cotizacion_id,
      clienteNombre: r.cliente_nombre,
      clienteTelefono: r.cliente_telefono,
      clienteDireccion: r.cliente_direccion,
      monto: Number(r.monto),
      montoLetra: r.monto_letra,
      metodoPago: r.metodo_pago,
      referenciaPago: r.referencia_pago,
      concepto: r.concepto,
      saldoAnterior: Number(r.saldo_anterior),
      saldoRestante: Number(r.saldo_restante),
      recibidoPor: r.recibido_por,
      recibidoPorNombre: r.recibido_por_nombre,
      fechaPago: r.fecha_pago,
      notas: r.notas,
      token: r.token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } catch (err) {
    console.error("Error en obtenerReciboPorToken:", err);
    return null;
  }
}

/** 9. Guardar o Emitir Póliza de Garantía de la Orden de Trabajo */
export async function guardarGarantiaOT(datos: {
  ordenTrabajoId: string;
  titulo?: string;
  contenido: string;
  anosGarantia?: number;
  fechaInicio?: string;
}): Promise<{ ok: boolean; garantia?: CartaGarantiaOT; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const anos = Number(datos.anosGarantia || 3);
    const fechaInicioStr = datos.fechaInicio || new Date().toISOString().split("T")[0];
    const fechaInicioDate = new Date(fechaInicioStr);
    const fechaVencimientoDate = new Date(fechaInicioDate);
    fechaVencimientoDate.setFullYear(fechaVencimientoDate.getFullYear() + Math.floor(anos));
    const fechaVencimientoStr = fechaVencimientoDate.toISOString().split("T")[0];

    // Verificar si ya existe garantía para la OT
    const { data: existente } = await sb
      .from("garantias_documentos")
      .select("id, token")
      .eq("orden_trabajo_id", datos.ordenTrabajoId)
      .maybeSingle();

    const token = existente?.token || crypto.randomBytes(24).toString("hex");

    if (existente?.id) {
      const { data: actualizada, error: upErr } = await sb
        .from("garantias_documentos")
        .update({
          titulo: datos.titulo || "Póliza de Garantía por Servicio",
          contenido: datos.contenido.trim(),
          anos_garantia: anos,
          fecha_inicio: fechaInicioStr,
          fecha_vencimiento: fechaVencimientoStr,
          token,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id)
        .select("*")
        .single();

      if (upErr) return { ok: false, error: upErr.message };

      revalidatePath("/ordenes-trabajo");
      return {
        ok: true,
        garantia: {
          id: actualizada.id,
          ordenTrabajoId: actualizada.orden_trabajo_id,
          cotizacionId: actualizada.cotizacion_id,
          titulo: actualizada.titulo,
          contenido: actualizada.contenido,
          token: actualizada.token,
          anosGarantia: Number(actualizada.anos_garantia),
          fechaInicio: actualizada.fecha_inicio,
          fechaVencimiento: actualizada.fecha_vencimiento,
          createdAt: actualizada.created_at,
          updatedAt: actualizada.updated_at,
        },
      };
    } else {
      // Buscar cotización vinculada para registrar cotizacion_id si existe
      const { data: ot } = await sb
        .from("ordenes_trabajo")
        .select("cotizacion_id")
        .eq("id", datos.ordenTrabajoId)
        .single();

      const { data: nueva, error: inErr } = await sb
        .from("garantias_documentos")
        .insert({
          orden_trabajo_id: datos.ordenTrabajoId,
          cotizacion_id: ot?.cotizacion_id || null,
          titulo: datos.titulo || "Póliza de Garantía por Servicio",
          contenido: datos.contenido.trim(),
          anos_garantia: anos,
          fecha_inicio: fechaInicioStr,
          fecha_vencimiento: fechaVencimientoStr,
          token,
        })
        .select("*")
        .single();

      if (inErr) return { ok: false, error: inErr.message };

      revalidatePath("/ordenes-trabajo");
      return {
        ok: true,
        garantia: {
          id: nueva.id,
          ordenTrabajoId: nueva.orden_trabajo_id,
          cotizacionId: nueva.cotizacion_id,
          titulo: nueva.titulo,
          contenido: nueva.contenido,
          token: nueva.token,
          anosGarantia: Number(nueva.anos_garantia),
          fechaInicio: nueva.fecha_inicio,
          fechaVencimiento: nueva.fecha_vencimiento,
          createdAt: nueva.created_at,
          updatedAt: nueva.updated_at,
        },
      };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al guardar póliza de garantía." };
  }
}

/** 10. Obtener Garantía por Token (público para cliente / WhatsApp) */
export async function obtenerGarantiaOTPorToken(
  token: string
): Promise<{ garantia: CartaGarantiaOT; orden: OrdenTrabajo } | null> {
  try {
    const sb = supabaseServidor();

    const { data: gar, error: garErr } = await sb
      .from("garantias_documentos")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (garErr || !gar || !gar.orden_trabajo_id) return null;

    const { data: ot, error: otErr } = await sb
      .from("ordenes_trabajo")
      .select(`
        *,
        asesor_ejecutor:perfiles!ordenes_trabajo_asesor_ejecutor_id_fkey(id, nombre),
        prospectos(nombre, telefono)
      `)
      .eq("id", gar.orden_trabajo_id)
      .maybeSingle();

    if (otErr || !ot) return null;

    return {
      garantia: {
        id: gar.id,
        ordenTrabajoId: gar.orden_trabajo_id,
        cotizacionId: gar.cotizacion_id,
        titulo: gar.titulo,
        contenido: gar.contenido,
        token: gar.token,
        anosGarantia: Number(gar.anos_garantia || 3),
        fechaInicio: gar.fecha_inicio,
        fechaVencimiento: gar.fecha_vencimiento,
        createdAt: gar.created_at,
        updatedAt: gar.updated_at,
      },
      orden: {
        id: ot.id,
        folio: ot.folio,
        expedienteId: ot.expediente_id,
        cotizacionId: ot.cotizacion_id,
        prospectoId: ot.prospecto_id,
        tipoNegocio: ot.tipo_negocio,
        estatus: ot.estatus,
        titulo: ot.titulo,
        descripcion: ot.descripcion,
        fechaProgramada: ot.fecha_programada,
        fechaInicio: ot.fecha_inicio,
        fechaConclusion: ot.fecha_conclusion,
        asesorResponsableId: ot.asesor_responsable_id,
        asesorEjecutorId: ot.asesor_ejecutor_id,
        creadoPor: ot.creado_por,
        notasConclusion: ot.notas_conclusion,
        fotosEvidencia: Array.isArray(ot.fotos_evidencia) ? ot.fotos_evidencia : [],
        createdAt: ot.created_at,
        updatedAt: ot.updated_at,
        asesorEjecutorNombre: ot.asesor_ejecutor?.nombre || "Sauceda Construye",
        clienteNombre: ot.prospectos?.nombre || "Cliente Sauceda",
        clienteTelefono: ot.prospectos?.telefono || "",
        proveedorId: ot.proveedor_id ?? null,
        costoProveedor: ot.costo_proveedor !== null && ot.costo_proveedor !== undefined ? Number(ot.costo_proveedor) : null,
        proveedorConcepto: ot.proveedor_concepto ?? null,
      },
    };
  } catch (err) {
    console.error("Error en obtenerGarantiaOTPorToken:", err);
    return null;
  }
}

/** 11. Generar Remisión de Entrega o Factura directamente desde la Orden de Trabajo */
export async function generarRemisionDesdeOrdenTrabajo(datos: {
  ordenTrabajoId: string;
  tipo: "remision" | "factura";
  fecha?: string;
  direccionEntrega?: string;
  personaRecibe?: string;
  rfc?: string;
  razonSocial?: string;
  regimenFiscal?: string;
  usoCfdi?: string;
}): Promise<{ ok: boolean; remision?: RemisionFactura; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Obtener orden de trabajo y cotización vinculada
    const { data: ot, error: otErr } = await sb
      .from("ordenes_trabajo")
      .select(`
        id,
        folio,
        expediente_id,
        cotizacion_id,
        prospecto_id,
        titulo,
        fecha_conclusion,
        fecha_programada,
        prospectos(nombre, telefono, direccion),
        cotizaciones(id, precio_final, token, expediente_id)
      `)
      .eq("id", datos.ordenTrabajoId)
      .single();

    if (otErr || !ot) return { ok: false, error: "Orden de trabajo no encontrada." };

    // Verificar si ya existe una remisión/factura vinculada
    let queryEx = sb.from("remisiones_facturas").select("id, folio, tipo");
    if (ot.cotizacion_id) {
      queryEx = queryEx.or(`orden_trabajo_id.eq.${ot.id},cotizacion_id.eq.${ot.cotizacion_id}`);
    } else {
      queryEx = queryEx.eq("orden_trabajo_id", ot.id);
    }
    const { data: existente } = await queryEx.limit(1).maybeSingle();

    if (existente) {
      return {
        ok: false,
        error: `Ya existe un documento de venta generado (${existente.tipo.toUpperCase()} ${existente.folio}) para esta orden.`,
      };
    }

    // 2. Generar Folio
    const anio = new Date().getFullYear();
    const prefijo = datos.tipo === "remision" ? `REM-${anio}-` : `FAC-${anio}-`;
    const { data: ultimos } = await sb
      .from("remisiones_facturas")
      .select("folio")
      .ilike("folio", `${prefijo}%`)
      .order("folio", { ascending: false })
      .limit(1);

    let siguienteNum = 1;
    if (ultimos && ultimos.length > 0 && ultimos[0]?.folio) {
      const numPart = ultimos[0].folio.replace(prefijo, "");
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) siguienteNum = parsed + 1;
    }
    const folio = `${prefijo}${String(siguienteNum).padStart(4, "0")}`;

    const montoBase = Number(ot.cotizaciones?.precio_final || 0);

    const datosDoc: Record<string, any> =
      datos.tipo === "factura"
        ? {
            rfc: datos.rfc?.trim().toUpperCase() || "XAXX010101000",
            razonSocial: datos.razonSocial?.trim() || ot.prospectos?.nombre || "Público en General",
            regimenFiscal: datos.regimenFiscal || "601",
            usoCfdi: datos.usoCfdi || "G03",
          }
        : {
            direccionEntrega:
              datos.direccionEntrega?.trim() || ot.prospectos?.direccion || "León, Guanajuato",
            personaRecibe: datos.personaRecibe?.trim() || ot.prospectos?.nombre || "",
            fechaInstalacion:
              datos.fecha ||
              ot.fecha_conclusion ||
              ot.fecha_programada ||
              new Date().toISOString().split("T")[0],
          };

    const { data: nuevaRem, error: insErr } = await sb
      .from("remisiones_facturas")
      .insert({
        orden_trabajo_id: ot.id,
        cotizacion_id: ot.cotizacion_id,
        expediente_id: ot.expediente_id,
        tipo: datos.tipo,
        folio,
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        tipo_cambio: 1.0,
        datos_documento: datosDoc,
        servicios_extra: 0.0,
        costo_financiero: 0.0,
        otros_gastos: 0.0,
        monto_subtotal: montoBase,
        monto_total: montoBase,
      })
      .select("*")
      .single();

    if (insErr) return { ok: false, error: insErr.message };

    try {
      const { sincronizarComisionParaRemision } = await import("@/app/actions/comisiones");
      await sincronizarComisionParaRemision(nuevaRem.id);
    } catch (errCom) {
      console.error("Error al sincronizar comisión tras generar remisión desde OT:", errCom);
    }

    // Si tiene cotización, asegurar que pase a 'instalacion'
    if (ot.cotizacion_id) {
      await sb
        .from("cotizaciones")
        .update({ estatus: "instalacion", updated_at: new Date().toISOString() })
        .eq("id", ot.cotizacion_id);
    }

    revalidatePath("/ordenes-trabajo");
    if (ot.cotizacion_id) revalidatePath(`/cotizacion/${ot.cotizacion_id}`);
    if (ot.expediente_id) revalidatePath(`/expediente/${ot.expediente_id}`);
    if (ot.prospecto_id) revalidatePath(`/prospectos/${ot.prospecto_id}`);

    return {
      ok: true,
      remision: {
        id: nuevaRem.id,
        cotizacionId: nuevaRem.cotizacion_id,
        ordenTrabajoId: nuevaRem.orden_trabajo_id,
        expedienteId: nuevaRem.expediente_id,
        tipo: nuevaRem.tipo,
        folio: nuevaRem.folio,
        fecha: nuevaRem.fecha,
        tipoCambio: Number(nuevaRem.tipo_cambio),
        datosDocumento: nuevaRem.datos_documento || {},
        serviciosExtra: Number(nuevaRem.servicios_extra || 0),
        costoFinanciero: Number(nuevaRem.costo_financiero || 0),
        otrosGastos: Number(nuevaRem.otros_gastos || 0),
        montoSubtotal: Number(nuevaRem.monto_subtotal || 0),
        montoTotal: Number(nuevaRem.monto_total || 0),
        createdAt: nuevaRem.created_at,
        updatedAt: nuevaRem.updated_at,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al generar remisión/factura." };
  }
}

/**
 * 12. Asegurar Orden de Trabajo para una cotización aceptada.
 * Se ejecuta automáticamente al aceptar una cotización (ya sea por el cliente en portal web o por el asesor).
 * Es idempotente: si ya existe una orden ligada a la cotización, devuelve la existente.
 */
export async function asegurarOrdenTrabajoParaCotizacion(cotizacionId: string): Promise<{
  ok: boolean;
  ordenId?: string;
  folio?: string;
  error?: string;
}> {
  try {
    const sb = supabaseServidor();

    // 1. Verificar si ya existe
    const { data: existente } = await sb
      .from("ordenes_trabajo")
      .select("id, folio")
      .eq("cotizacion_id", cotizacionId)
      .maybeSingle();

    if (existente) {
      return { ok: true, ordenId: existente.id, folio: existente.folio };
    }

    // 2. Obtener datos de la cotización
    const { data: cot, error: errCot } = await sb
      .from("cotizaciones")
      .select("id, prospecto_id, expediente_id, servicio_tipo, precio_final, prospectos(nombre)")
      .eq("id", cotizacionId)
      .maybeSingle();

    if (errCot || !cot) {
      return { ok: false, error: "Cotización no encontrada para generar orden de trabajo." };
    }

    const folio = await generarFolioOT(sb);
    const token = crypto.randomBytes(16).toString("hex");
    const clienteNombre = (cot.prospectos as any)?.nombre || "Cliente";

    const { data: nuevaOT, error: errIns } = await sb
      .from("ordenes_trabajo")
      .insert({
        folio,
        token,
        expediente_id: cot.expediente_id || null,
        cotizacion_id: cot.id,
        prospecto_id: cot.prospecto_id || null,
        tipo_negocio: cot.servicio_tipo || "construccion",
        estatus: "pendiente",
        titulo: `Ejecución de Obra / Servicio · ${clienteNombre}`,
        descripcion: `Orden generada automáticamente por aceptación de cotización ${cot.id}.`,
        fotos_evidencia: [],
      })
      .select()
      .single();

    if (errIns || !nuevaOT) {
      return { ok: false, error: errIns?.message || "No se pudo crear la orden de trabajo." };
    }

    revalidatePath("/ordenes-trabajo");
    if (cot.id) revalidatePath(`/cotizacion/${cot.id}`);
    if (cot.expediente_id) revalidatePath(`/expediente/${cot.expediente_id}`);
    if (cot.prospecto_id) revalidatePath(`/prospectos/${cot.prospecto_id}`);

    return { ok: true, ordenId: nuevaOT.id, folio: nuevaOT.folio };
  } catch (err: any) {
    console.error("Error en asegurarOrdenTrabajoParaCotizacion:", err);
    return { ok: false, error: err?.message || "Error al asegurar orden de trabajo." };
  }
}

/**
 * 13. Obtener entrega pública de Orden de Trabajo por Token.
 * Usado por el portal del cliente (/orden-trabajo/entrega/[token]). No requiere login de admin.
 */
export async function obtenerEntregaOrdenTrabajoPorToken(token: string): Promise<{
  ok: boolean;
  error?: string;
  orden?: OrdenTrabajo;
  recibos?: ReciboPago[];
  garantia?: CartaGarantiaOT | null;
  remisionFactura?: RemisionFactura | null;
}> {
  try {
    const sb = supabaseServidor();

    const { data: d, error } = await sb
      .from("ordenes_trabajo")
      .select(`
        *,
        asesor_ejecutor:perfiles!ordenes_trabajo_asesor_ejecutor_id_fkey(id, nombre, telefono),
        asesor_responsable:perfiles!ordenes_trabajo_asesor_responsable_id_fkey(id, nombre, telefono),
        prospectos(id, nombre, telefono, correo, direccion),
        cotizaciones(id, precio_final, condiciones_pago, token)
      `)
      .eq("token", token)
      .maybeSingle();

    if (error || !d) {
      return { ok: false, error: "Orden de trabajo no encontrada o enlace caducado." };
    }

    // Recibos
    const { data: recs } = await sb
      .from("recibos_pago")
      .select("*")
      .eq("orden_trabajo_id", d.id)
      .order("created_at", { ascending: false });

    // Garantía
    let queryGar = sb.from("garantias_documentos").select("*");
    if (d.cotizacion_id) {
      queryGar = queryGar.or(`orden_trabajo_id.eq.${d.id},cotizacion_id.eq.${d.cotizacion_id}`);
    } else {
      queryGar = queryGar.eq("orden_trabajo_id", d.id);
    }
    const { data: gar } = await queryGar.maybeSingle();

    // Remisión / Factura
    let queryRem = sb.from("remisiones_facturas").select("*");
    if (d.cotizacion_id) {
      queryRem = queryRem.or(`orden_trabajo_id.eq.${d.id},cotizacion_id.eq.${d.cotizacion_id}`);
    } else {
      queryRem = queryRem.eq("orden_trabajo_id", d.id);
    }
    const { data: remData } = await queryRem.order("created_at", { ascending: false }).limit(1).maybeSingle();

    const totalCotizado = Number(d.cotizaciones?.precio_final || 0);
    const totalPagado = (recs || []).reduce((acc: number, r: any) => acc + Number(r.monto || 0), 0);
    const saldoRestante = Math.max(0, totalCotizado - totalPagado);

    const remisionFactura: RemisionFactura | null = remData
      ? {
          id: remData.id,
          cotizacionId: remData.cotizacion_id,
          ordenTrabajoId: remData.orden_trabajo_id,
          expedienteId: remData.expediente_id,
          tipo: remData.tipo,
          folio: remData.folio,
          fecha: remData.fecha,
          tipoCambio: Number(remData.tipo_cambio || 1.0),
          datosDocumento: remData.datos_documento || {},
          serviciosExtra: Number(remData.servicios_extra || 0),
          costoFinanciero: Number(remData.costo_financiero || 0),
          otrosGastos: Number(remData.otros_gastos || 0),
          montoSubtotal: Number(remData.monto_subtotal || 0),
          montoTotal: Number(remData.monto_total || 0),
          createdAt: remData.created_at,
          updatedAt: remData.updated_at,
        }
      : null;

    const garantiaObj: CartaGarantiaOT | null = gar
      ? {
          id: gar.id,
          ordenTrabajoId: gar.orden_trabajo_id || d.id,
          cotizacionId: gar.cotizacion_id,
          titulo: gar.titulo || "Póliza de Garantía Oficial",
          contenido: gar.contenido || "",
          token: gar.token,
          anosGarantia: gar.anos_garantia || 1,
          fechaInicio: gar.fecha_inicio,
          fechaVencimiento: gar.fecha_vencimiento,
          createdAt: gar.created_at,
          updatedAt: gar.updated_at,
        }
      : null;

    const recibos: ReciboPago[] = (recs || []).map((r: any) => ({
      id: r.id,
      folio: r.folio,
      ordenTrabajoId: r.orden_trabajo_id,
      expedienteId: r.expediente_id,
      cotizacionId: r.cotizacion_id,
      clienteNombre: r.cliente_nombre,
      clienteTelefono: r.cliente_telefono,
      clienteDireccion: r.cliente_direccion,
      monto: Number(r.monto || 0),
      montoLetra: r.monto_letra,
      metodoPago: r.metodo_pago,
      referenciaPago: r.referencia_pago,
      concepto: r.concepto,
      saldoAnterior: Number(r.saldo_anterior || 0),
      saldoRestante: Number(r.saldo_restante || 0),
      recibidoPor: r.recibido_por,
      recibidoPorNombre: r.recibido_por_nombre,
      fechaPago: r.fecha_pago,
      notas: r.notas,
      token: r.token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const orden: OrdenTrabajo = {
      id: d.id,
      folio: d.folio,
      token: d.token || token,
      notificadoClienteAt: d.notificado_cliente_at,
      canalNotificacion: d.canal_notificacion,
      expedienteId: d.expediente_id,
      cotizacionId: d.cotizacion_id,
      prospectoId: d.prospecto_id,
      tipoNegocio: d.tipo_negocio,
      estatus: d.estatus,
      titulo: d.titulo,
      descripcion: d.descripcion,
      fechaProgramada: d.fecha_programada,
      fechaInicio: d.fecha_inicio,
      fechaConclusion: d.fecha_conclusion,
      asesorResponsableId: d.asesor_responsable_id,
      asesorEjecutorId: d.asesor_ejecutor_id,
      creadoPor: d.creado_por,
      notasConclusion: d.notas_conclusion,
      fotosEvidencia: Array.isArray(d.fotos_evidencia) ? d.fotos_evidencia : [],
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      proveedorId: d.proveedor_id ?? null,
      costoProveedor: d.costo_proveedor !== null && d.costo_proveedor !== undefined ? Number(d.costo_proveedor) : null,
      proveedorConcepto: d.proveedor_concepto ?? null,
      asesorEjecutorNombre: d.asesor_ejecutor?.nombre || "Técnico Asignado",
      asesorResponsableNombre: d.asesor_responsable?.nombre || "",
      clienteNombre: d.prospectos?.nombre || "Cliente General",
      clienteTelefono: d.prospectos?.telefono || "",
      clienteCorreo: d.prospectos?.correo || "",
      clienteDireccion: d.prospectos?.direccion || "",
      totalCotizado,
      totalPagado,
      saldoRestante,
      cotizacionToken: d.cotizaciones?.token,
      remisionFactura,
    };

    return {
      ok: true,
      orden,
      recibos,
      garantia: garantiaObj,
      remisionFactura,
    };
  } catch (err: any) {
    console.error("Error en obtenerEntregaOrdenTrabajoPorToken:", err);
    return { ok: false, error: err?.message || "Error al consultar entrega de orden de trabajo." };
  }
}

/**
 * 14. Enviar Notificación de Conclusión y Entrega al Cliente (Multicanal).
 * Puede enviarse vía Meta Cloud API (Plantilla UTILITY oficial) o Correo Corporativo (Resend).
 */
export async function enviarNotificacionEntregaCliente(params: {
  ordenTrabajoId: string;
  canal: "whatsapp_plantilla" | "whatsapp_directo" | "email";
  correoDestino?: string;
  telefonoDestino?: string;
  mensajePersonalizado?: string;
  plantillaNombre?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { orden, garantia, remisionFactura } = await obtenerOrdenTrabajoPorId(params.ordenTrabajoId);
    if (!orden) {
      return { ok: false, error: "Orden de trabajo no encontrada." };
    }

    const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://crm.saucedamx.com";
    const clienteNombre = orden.clienteNombre || "Estimado(a) Cliente";
    const telefono = params.telefonoDestino || orden.clienteTelefono;
    const correo = params.correoDestino || orden.clienteCorreo;
    const fechaEntrega = orden.fechaConclusion
      ? new Date(orden.fechaConclusion).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

    let messageId: string | undefined;

    if (params.canal === "whatsapp_plantilla") {
      if (!telefono) {
        return { ok: false, error: "El cliente no cuenta con teléfono registrado para WhatsApp." };
      }

      const plantillaElegida = params.plantillaNombre || "sauceda_entrega_servicio";
      let resWhatsApp: { ok: boolean; error?: string; messageId?: string };

      if (plantillaElegida === "entrega_documentos_remision_garantia") {
        // Plantilla oficial ya APROBADA en Meta (2 variables de texto)
        const urlEntrega = `${SITE_URL}/orden-trabajo/entrega/${orden.token}`;
        const urlRemision = orden.cotizacionToken ? `${SITE_URL}/cotizacion/remision/${orden.cotizacionToken}` : "";
        const urlGarantia = garantia?.token ? `${SITE_URL}/garantia/${garantia.token}` : "";

        let docsTexto = `📄 Reporte de Obra: ${urlEntrega}`;
        if (urlRemision) docsTexto += ` • 🧾 Remisión: ${urlRemision}`;
        if (urlGarantia) docsTexto += ` • 🛡️ Garantía: ${urlGarantia}`;

        resWhatsApp = await enviarWhatsAppPlantilla(
          telefono,
          "entrega_documentos_remision_garantia",
          "es_MX",
          [clienteNombre, docsTexto]
        );
      } else {
        // Plantilla UTILITY sauceda_entrega_servicio (enviada a aprobación con botón dinámico)
        resWhatsApp = await enviarWhatsAppPlantilla(
          telefono,
          PLANTILLA_ENTREGA_SERVICIO.nombre,
          PLANTILLA_ENTREGA_SERVICIO.idioma,
          [clienteNombre, orden.folio, orden.titulo, fechaEntrega],
          orden.token
        );
      }

      if (!resWhatsApp.ok) {
        return {
          ok: false,
          error: resWhatsApp.error || "No se pudo entregar el mensaje por WhatsApp Cloud API de Meta.",
        };
      }
      messageId = resWhatsApp.messageId;
    } else if (params.canal === "email") {
      if (!correo) {
        return { ok: false, error: "El cliente no tiene correo electrónico registrado." };
      }

      const urlEntrega = `${SITE_URL}/orden-trabajo/entrega/${orden.token}`;
      const urlRemision = orden.cotizacionToken ? `${SITE_URL}/cotizacion/remision/${orden.cotizacionToken}` : null;
      const urlGarantia = garantia?.token ? `${SITE_URL}/garantia/${garantia.token}` : null;

      const fotosEntrega = (orden.fotosEvidencia || [])
        .filter((f) => f.etapa === "entrega" || f.etapa === "proceso")
        .slice(0, 4);

      const htmlFotos =
        fotosEntrega.length > 0
          ? `<div style="margin-top:20px;margin-bottom:20px;">
              <p style="font-size:12px;font-weight:bold;color:#2D4A2B;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Evidencias de Entrega Técnica</p>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${fotosEntrega
                  .map(
                    (f) =>
                      `<a href="${f.url}" target="_blank" style="text-decoration:none;"><img src="${f.url}" width="115" height="115" style="object-fit:cover;border-radius:10px;border:1px solid #ddd;" alt="Evidencia de entrega" /></a>`
                  )
                  .join("")}
              </div>
            </div>`
          : "";

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#FDFCFA;border-radius:16px;overflow:hidden;border:1px solid #E6E1D8;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
          <!-- Header Corporativo -->
          <div style="background:#2D4A2B;padding:26px 20px;text-align:center;">
            <img src="${SITE_URL}/logo.svg" width="48" height="48" alt="SAUCEDA" style="display:block;margin:0 auto 8px;" />
            <div style="color:#F5F1E8;font-size:22px;font-weight:bold;letter-spacing:1px;">SAUCEDA</div>
            <div style="color:#C9A961;font-size:11px;letter-spacing:3px;">CONSTRUCCIÓN & BIENES RAÍCES</div>
          </div>

          <!-- Contenido Principal -->
          <div style="padding:28px 24px;color:#1A1A1A;background:#ffffff;">
            <div style="display:inline-block;background:#E7F3E5;color:#2D4A2B;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold;margin-bottom:14px;">
              ✓ Servicio Concluido & Entregado
            </div>

            <h2 style="color:#2D4A2B;margin-top:0;margin-bottom:8px;font-size:20px;">
              Entrega Oficial de Trabajos · ${orden.folio}
            </h2>
            <p style="font-size:14px;color:#4A4A4A;line-height:1.5;margin-bottom:18px;">
              Estimado/a <strong>${clienteNombre}</strong>, le informamos que los trabajos correspondientes a <strong>"${orden.titulo}"</strong> han finalizado a entera satisfacción el día <strong>${fechaEntrega}</strong>.
            </p>

            ${
              orden.notasConclusion
                ? `
              <div style="background:#F5F1E8;border-left:4px solid #C9A961;padding:14px;border-radius:6px;margin-bottom:20px;font-size:13px;color:#333;font-style:italic;">
                "${orden.notasConclusion}"
              </div>
            `
                : ""
            }

            ${htmlFotos}

            <!-- Botón Principal al Portal de Entrega -->
            <div style="text-align:center;margin:28px 0;">
              <a href="${urlEntrega}" style="display:inline-block;background:#2D4A2B;color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;box-shadow:0 3px 8px rgba(45,74,43,0.3);">
                📂 Ver Reporte Digital & Evidencias
              </a>
            </div>

            <!-- Accesos a Documentos Oficiales -->
            <div style="border-top:1px solid #EFECE6;padding-top:20px;margin-top:20px;">
              <p style="font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:12px;">Documentos Oficiales Disponibles</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${
                  urlRemision
                    ? `
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#2D4A2B;font-weight:bold;">🧾 Remisión de Entrega / Factura Fiscal</td>
                    <td style="text-align:right;padding:8px 0;"><a href="${urlRemision}" style="color:#C9A961;font-weight:bold;font-size:12px;text-decoration:none;">Consultar →</a></td>
                  </tr>
                `
                    : ""
                }
                ${
                  urlGarantia && garantia
                    ? `
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#2D4A2B;font-weight:bold;">🛡️ Póliza de Garantía Oficial (${garantia.anosGarantia} Años)</td>
                    <td style="text-align:right;padding:8px 0;"><a href="${urlGarantia}" style="color:#C9A961;font-weight:bold;font-size:12px;text-decoration:none;">Descargar →</a></td>
                  </tr>
                `
                    : ""
                }
              </table>
            </div>
          </div>

          <!-- Footer con Redes y WhatsApp -->
          <div style="padding:20px;background:#2D4A2B;color:#F5F1E8;text-align:center;font-size:12px;">
            <p style="margin:0 0 8px 0;color:#C9A961;font-weight:bold;">Atención Personalizada:</p>
            <p style="margin:0 0 14px 0;">WhatsApp: ${MARCA.whatsappTexto} · ${MARCA.web.replace("https://", "")}</p>
            <div style="font-size:11px;color:#9bb38f;">SAUCEDA · Tradición con tecnología.</div>
          </div>
        </div>
      `;

      await enviarCorreo(
        correo,
        `✅ Entrega Oficial de Obra / Servicio Concluido · ${orden.folio} - SAUCEDA`,
        html
      );
    }

    // Actualizar campos de notificación en la orden
    const canalUsado = params.canal.includes("whatsapp") ? "whatsapp" : "email";
    const nuevoCanal = orden.canalNotificacion
      ? orden.canalNotificacion === canalUsado
        ? canalUsado
        : "ambos"
      : canalUsado;

    await sb
      .from("ordenes_trabajo")
      .update({
        notificado_cliente_at: new Date().toISOString(),
        canal_notificacion: nuevoCanal,
      })
      .eq("id", params.ordenTrabajoId);

    // Registrar en actividades
    if (orden.prospectoId || orden.expedienteId) {
      await sb.from("actividades").insert({
        prospecto_id: orden.prospectoId || null,
        expediente_id: orden.expedienteId || null,
        tipo: "orden_trabajo",
        titulo: `Aviso de Entrega Concluida al Cliente (${orden.folio})`,
        detalle: `Se notificó la conclusión de la orden por canal ${params.canal} a ${
          params.canal === "email" ? correo : telefono
        }.`,
      });
    }

    // Integrar el envío al historial de conversaciones de WhatsApp, para que
    // aparezca en la bandeja y el webhook de Meta pueda actualizar su estado
    // de entregado/leído emparejando por wa_message_id.
    if (params.canal === "whatsapp_plantilla" && telefono) {
      const usuario = await usuarioActual();
      let agente = usuario?.email || "";
      if (usuario) {
        const { data: perfil } = await sb
          .from("perfiles")
          .select("nombre")
          .eq("id", usuario.id)
          .maybeSingle();
        agente = (perfil as { nombre?: string } | null)?.nombre?.trim() || agente;
      }

      const { error: insertErr } = await sb.from("mensajes_whatsapp").insert({
        telefono: normalizarTelefono(telefono),
        texto: `[plantilla: ${params.plantillaNombre || "sauceda_entrega_servicio"}] Aviso de entrega de la orden ${orden.folio}`,
        direccion: "out",
        expediente_id: orden.expedienteId,
        prospecto_id: orden.prospectoId,
        estado: "enviado",
        agente,
        wa_message_id: messageId || null,
      });

      if (insertErr) {
        console.error("Error al insertar notificación de entrega en historial de WhatsApp:", insertErr);
      }
    }

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/conversaciones");
    if (orden.expedienteId) revalidatePath(`/expediente/${orden.expedienteId}`);

    return { ok: true, messageId };
  } catch (err: any) {
    console.error("Error en enviarNotificacionEntregaCliente:", err);
    return { ok: false, error: err?.message || "Error al enviar la notificación de entrega." };
  }
}

/**
 * 15. Enviar Recibo de Pago por WhatsApp (Meta Cloud API).
 */
export async function enviarReciboPorWhatsApp(reciboId: string): Promise<{
  ok: boolean;
  error?: string;
  messageId?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: rec, error } = await sb
      .from("recibos_pago")
      .select("*, ordenes_trabajo(folio, titulo)")
      .eq("id", reciboId)
      .maybeSingle();

    if (error || !rec) {
      return { ok: false, error: "Recibo no encontrado." };
    }

    if (!rec.cliente_telefono) {
      return { ok: false, error: "El cliente no cuenta con teléfono registrado." };
    }

    const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://crm.saucedamx.com";
    const montoStr = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2 }).format(Number(rec.monto || 0));
    const saldoRestanteStr = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2 }).format(Number(rec.saldo_restante || 0));
    const fechaStr = new Date(rec.fecha_pago).toLocaleDateString("es-MX");
    const ordenFolio = rec.ordenes_trabajo?.folio || "Orden";

    // Intentar primero con la plantilla oficial sauceda_recibo_pago
    let res = await enviarWhatsAppPlantilla(
      rec.cliente_telefono,
      "sauceda_recibo_pago",
      "es_MX",
      [
        rec.cliente_nombre,
        montoStr,
        rec.monto_letra || "Pesos M.N.",
        ordenFolio,
        saldoRestanteStr,
        fechaStr,
      ],
      rec.token
    );

    // Si aún está en revisión en Meta, enviar mediante plantilla aprobada de entrega
    if (!res.ok && res.error && (res.error.includes("does not exist") || res.error.includes("not approved") || res.error.includes("PENDING"))) {
      const urlRecibo = `${SITE_URL}/recibo/${rec.token}`;
      res = await enviarWhatsAppPlantilla(
        rec.cliente_telefono,
        "entrega_documentos_remision_garantia",
        "es_MX",
        [
          rec.cliente_nombre,
          `💳 Recibo Oficial de Pago (${rec.folio}) por $${montoStr} MXN: ${urlRecibo}`,
        ]
      );
    }

    if (!res.ok) {
      return { ok: false, error: res.error || "No se pudo enviar el recibo por WhatsApp." };
    }

    // Registrar actividad en el CRM
    if (rec.expediente_id || rec.prospecto_id) {
      await sb.from("actividades").insert({
        prospecto_id: rec.prospecto_id || null,
        expediente_id: rec.expediente_id || null,
        tipo: "recibo_pago",
        titulo: `Recibo de Pago Enviado por WhatsApp (${rec.folio})`,
        detalle: `Se envió el recibo por $${montoStr} MXN al teléfono ${rec.cliente_telefono} vía Meta Cloud API.`,
      });
    }

    return { ok: true, messageId: res.messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al enviar recibo por WhatsApp." };
  }
}



