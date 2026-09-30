"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { estadoContratoDeOrden } from "@/app/actions/contratos";
import { armarGarantiaDesdeCotizacion } from "@/lib/garantia-producto";
import { numeroALetras } from "@/lib/numero-a-letras";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { normalizarTelefono } from "@/lib/telefono";
import { enviarCorreo } from "@/lib/email";
import { PLANTILLA_ENTREGA_SERVICIO } from "@/lib/meta-plantillas";
import { MARCA } from "@/lib/marca";
import { generarDocumentoProveedorAutomatico } from "@/app/actions/proveedores";
import { aDocumentoProveedor } from "@/lib/supabase/mapeo";
import type { RemisionFactura, DocumentoProveedor } from "@/lib/types";

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
  // Campos de Gestión Compraventa INFONAVIT
  etapaInfonavitId?: string | null;
  motivoDetencion?: string | null;
  anticipoPagado?: boolean;
  anticipoPagadoAt?: string | null;
  liquidacionPagada?: boolean;
  liquidacionPagadaAt?: string | null;
  fechaFirmaEscritura?: string | null;
  notariaNumero?: string | null;
  notariaNombre?: string | null;
  politicaCancelacion?: string | null;
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

    // Solo se crea una OT desde una cotización aceptada por el cliente
    if (cotizacionId) {
      const { data: cotEstado } = await sb
        .from("cotizaciones")
        .select("estatus")
        .eq("id", cotizacionId)
        .maybeSingle();
      if (!cotEstado) {
        return { ok: false, error: "La cotización indicada no existe." };
      }
      if (cotEstado.estatus !== "aceptada" && cotEstado.estatus !== "instalacion") {
        return {
          ok: false,
          error: `La cotización ${cotizacionId} está en estado "${cotEstado.estatus}". Solo se puede crear una orden de trabajo desde una cotización aceptada por el cliente.`,
        };
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

    // Documentos base en automático (recibo si aplica, póliza de garantía,
    // remisión de venta si hay cotización con precio). Best-effort: si algo
    // falla aquí no debe impedir que la OT quede creada.
    try {
      let clienteNombre = "Cliente Sauceda";
      let direccionClienteOT: string | null = null;
      if (prospectoId) {
        const { data: prospecto } = await sb
          .from("prospectos")
          .select("nombre, direccion, fraccionamiento")
          .eq("id", prospectoId)
          .maybeSingle();
        if (prospecto?.nombre) clienteNombre = prospecto.nombre;
        direccionClienteOT = prospecto?.direccion || prospecto?.fraccionamiento || null;
      }
      await generarDocumentosAutomaticosOT(sb, {
        ordenTrabajoId: nuevaOT.id,
        ordenFolio: nuevaOT.folio,
        clienteNombre,
        direccionCliente: direccionClienteOT || undefined,
      });
    } catch (errAuto) {
      console.error("Aviso: no se pudieron generar documentos automáticos de la OT:", errAuto);
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
        cotizaciones(id, precio_final, condiciones_pago, token, expediente_id, prospecto_id),
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
        expedienteId: d.expediente_id || d.cotizaciones?.expediente_id || null,
        cotizacionId: d.cotizacion_id,
        prospectoId: d.prospecto_id || d.cotizaciones?.prospecto_id || d.prospectos?.id || null,
        tipoNegocio: d.tipo_negocio || "construccion",
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
        etapaInfonavitId: d.etapa_infonavit_id || null,
        motivoDetencion: d.motivo_detencion || null,
        anticipoPagado: Boolean(d.anticipo_pagado),
        anticipoPagadoAt: d.anticipo_pagado_at || null,
        liquidacionPagada: Boolean(d.liquidacion_pagada),
        liquidacionPagadaAt: d.liquidacion_pagada_at || null,
        fechaFirmaEscritura: d.fecha_firma_escritura || null,
        notariaNumero: d.notaria_numero || null,
        notariaNombre: d.notaria_nombre || null,
        politicaCancelacion: d.politica_cancelacion || null,
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
        cotizaciones(id, precio_final, condiciones_pago, token, expediente_id, prospecto_id),
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

    let expedienteId = d.expediente_id || d.cotizaciones?.expediente_id || null;
    let prospectoId = d.prospecto_id || d.cotizaciones?.prospecto_id || d.prospectos?.id || null;

    if (!expedienteId && prospectoId) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("id")
        .eq("prospecto_id", prospectoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (exp?.id) expedienteId = exp.id;
    }

    if (!prospectoId && expedienteId) {
      const { data: exp } = await sb
        .from("expedientes")
        .select("prospecto_id")
        .eq("id", expedienteId)
        .maybeSingle();
      if (exp?.prospecto_id) prospectoId = exp.prospecto_id;
    }

    const orden: OrdenTrabajo = {
      id: d.id,
      folio: d.folio,
      token: d.token || "",
      notificadoClienteAt: d.notificado_cliente_at,
      canalNotificacion: d.canal_notificacion,
      expedienteId,
      cotizacionId: d.cotizacion_id,
      prospectoId,
      tipoNegocio: d.tipo_negocio || "construccion",
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
      etapaInfonavitId: d.etapa_infonavit_id || null,
      motivoDetencion: d.motivo_detencion || null,
      anticipoPagado: Boolean(d.anticipo_pagado),
      anticipoPagadoAt: d.anticipo_pagado_at || null,
      liquidacionPagada: Boolean(d.liquidacion_pagada),
      liquidacionPagadaAt: d.liquidacion_pagada_at || null,
      fechaFirmaEscritura: d.fecha_firma_escritura || null,
      notariaNumero: d.notaria_numero || null,
      notariaNombre: d.notaria_nombre || null,
      politicaCancelacion: d.politica_cancelacion || null,
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
  extras?: { notasConclusion?: string; overrideContrato?: boolean }
): Promise<{ ok: boolean; error?: string; codigo?: "CONTRATO_PENDIENTE" }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // La OT no pasa a "En proceso" sin contrato firmado (si nace de una
    // cotización). Un administrador puede forzarlo; queda en la bitácora.
    if (nuevoEstatus === "en_proceso") {
      const ctr = await estadoContratoDeOrden(ordenId);
      if (ctr.aplica && !ctr.firmado) {
        const usuario = await usuarioActual();
        const esAdmin = usuario ? (await rolDe(usuario.id)).rol === "admin" : false;
        if (!extras?.overrideContrato || !esAdmin) {
          return {
            ok: false,
            codigo: "CONTRATO_PENDIENTE",
            error: ctr.estado
              ? "El contrato de esta orden aún no está firmado."
              : "Esta orden no tiene contrato generado ni firmado.",
          };
        }
        const { data: otReg } = await sb
          .from("ordenes_trabajo")
          .select("folio, expediente_id, prospecto_id")
          .eq("id", ordenId)
          .maybeSingle();
        const { registrarActividad } = await import("@/lib/actividades");
        await registrarActividad(sb, {
          expedienteId: otReg?.expediente_id || null,
          prospectoId: otReg?.prospecto_id || null,
          tipo: "construccion",
          titulo: "⚠️ OT iniciada sin contrato firmado (override de administrador)",
          detalle: `La orden ${otReg?.folio || ordenId} pasó a "En proceso" sin contrato firmado. Autorizó: ${usuario?.email || usuario?.id}.`,
        });
      }
    }

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

    // Al cancelar la orden, borrar los documentos auto-generados que no
    // tienen movimiento financiero propio (recibos y póliza de garantía).
    // La remisión/factura y el documento de proveedor, al tener movimientos
    // de Finanzas y comisiones ya sincronizados, sólo se desvinculan de la
    // OT en vez de borrarse, para no dejar huecos contables.
    if (nuevoEstatus === "cancelada") {
      try {
        await sb.from("recibos_pago").delete().eq("orden_trabajo_id", ordenId);

        await sb
          .from("garantias_documentos")
          .delete()
          .eq("orden_trabajo_id", ordenId)
          .is("cotizacion_id", null);
        await sb
          .from("garantias_documentos")
          .update({ orden_trabajo_id: null })
          .eq("orden_trabajo_id", ordenId);

        await sb
          .from("remisiones_facturas")
          .update({ orden_trabajo_id: null })
          .eq("orden_trabajo_id", ordenId);

        await sb
          .from("documentos_proveedores")
          .update({ orden_trabajo_id: null })
          .eq("orden_trabajo_id", ordenId);
      } catch (errCancel) {
        console.error("Aviso: no se pudieron limpiar los documentos de la OT cancelada:", errCancel);
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

    // 4b. Desvincular documento de proveedor (costo pactado) asociado a esta OT
    await sb
      .from("documentos_proveedores")
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
  /** Persona (perfil) que recibe el dinero. Si no se indica, el usuario en sesión. */
  recibidoPorId?: string | null;
}): Promise<{ ok: boolean; recibo?: ReciboPago; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    // Obtener orden y cotización vinculada para calcular saldos (consulta
    // plana, sin joins embebidos de PostgREST: ver nota en
    // obtenerDatosProgramacionInstalacion / programarInstalacionYDetonarOT
    // sobre por qué fallan de forma intermitente en producción).
    const { data: ot, error: otErr } = await sb
      .from("ordenes_trabajo")
      .select("id, expediente_id, cotizacion_id, prospecto_id, titulo")
      .eq("id", datos.ordenTrabajoId)
      .maybeSingle();

    if (otErr) return { ok: false, error: `Error al consultar la orden de trabajo: ${otErr.message}` };
    if (!ot) return { ok: false, error: "Orden de trabajo no encontrada." };

    const [prospectoRes, cotizacionRes, recibosPreviosRes] = await Promise.all([
      ot.prospecto_id
        ? sb.from("prospectos").select("nombre, telefono").eq("id", ot.prospecto_id).maybeSingle()
        : Promise.resolve({ data: null }),
      ot.cotizacion_id
        ? sb.from("cotizaciones").select("precio_final").eq("id", ot.cotizacion_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("recibos_pago").select("monto").eq("orden_trabajo_id", datos.ordenTrabajoId),
    ]);
    const prospecto = prospectoRes.data as any;
    const cotizacion = cotizacionRes.data as any;
    const recibosPrevios = recibosPreviosRes.data;

    const totalCotizado = Number(cotizacion?.precio_final || 0);
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
    let recibidoPorId: string | null = usuario?.id || null;
    const quienRecibe = datos.recibidoPorId || usuario?.id;
    if (quienRecibe) {
      const { data: perf } = await sb
        .from("perfiles")
        .select("id, nombre")
        .eq("id", quienRecibe)
        .maybeSingle();
      if (perf?.nombre) {
        recibidoPorNombre = perf.nombre;
        recibidoPorId = perf.id;
      } else if (datos.recibidoPorId) {
        return { ok: false, error: "La persona seleccionada para recibir el dinero no existe en el sistema." };
      }
    }

    const { data: nuevo, error: insertError } = await sb
      .from("recibos_pago")
      .insert({
        folio,
        orden_trabajo_id: datos.ordenTrabajoId,
        expediente_id: ot.expediente_id,
        cotizacion_id: ot.cotizacion_id,
        cliente_nombre: prospecto?.nombre || "Cliente Sauceda",
        cliente_telefono: prospecto?.telefono || null,
        cliente_direccion: null,
        monto,
        monto_letra: montoLetra,
        metodo_pago: datos.metodoPago || "transferencia",
        referencia_pago: datos.referenciaPago?.trim() || null,
        concepto: datos.concepto.trim(),
        saldo_anterior: saldoAnterior,
        saldo_restante: saldoRestante,
        recibido_por: recibidoPorId,
        recibido_por_nombre: recibidoPorNombre,
        fecha_pago: datos.fechaPago || new Date().toISOString().split("T")[0],
        notas: datos.notas?.trim() || null,
        token,
      })
      .select("*")
      .single();

    if (insertError) return { ok: false, error: insertError.message };

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

/** Personas que pueden recibir dinero: todos los usuarios activos (admin, asesor, operaciones/instalador). */
export async function listarReceptoresRecibo(): Promise<
  { id: string; nombre: string; rol: string }[]
> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data } = await sb
      .from("perfiles")
      .select("id, nombre, rol")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    return (data || []).map((p: any) => ({ id: p.id, nombre: p.nombre, rol: p.rol || "" }));
  } catch {
    return [];
  }
}

/**
 * Reparte un monto total en N recibos de igual importe (el último absorbe el
 * redondeo). N = 1 emite un solo recibo con el concepto tal cual.
 */
async function repartirEnRecibos(datos: {
  ordenTrabajoId: string;
  ordenFolio: string;
  montoTotal: number;
  numRecibos: number;
  metodoPago: "transferencia" | "efectivo" | "tarjeta" | "otro";
  recibidoPorId?: string | null;
  fechaPago?: string;
  conceptoBase?: string;
  referenciaPago?: string;
  notas?: string;
}): Promise<{ ok: boolean; recibos: ReciboPago[]; error?: string }> {
  const n = Math.min(12, Math.max(1, Math.floor(Number(datos.numRecibos) || 1)));
  const total = Math.round(Number(datos.montoTotal) * 100) / 100;
  if (!(total > 0)) return { ok: false, recibos: [], error: "El monto total debe ser mayor a cero." };

  const base = Math.floor((total / n) * 100) / 100;
  const recibos: ReciboPago[] = [];
  let acumulado = 0;

  for (let i = 1; i <= n; i++) {
    const monto = i === n ? Math.round((total - acumulado) * 100) / 100 : base;
    acumulado = Math.round((acumulado + monto) * 100) / 100;
    const pct = Math.round((monto / total) * 1000) / 10;
    const concepto =
      n === 1
        ? datos.conceptoBase?.trim() || `Pago único - Orden de Trabajo ${datos.ordenFolio}`
        : `${datos.conceptoBase?.trim() ? datos.conceptoBase.trim() + " · " : ""}Pago ${i} de ${n} (${pct}%) - Orden de Trabajo ${datos.ordenFolio}`;

    const res = await crearReciboPago({
      ordenTrabajoId: datos.ordenTrabajoId,
      monto,
      metodoPago: datos.metodoPago,
      referenciaPago: datos.referenciaPago,
      concepto,
      fechaPago: datos.fechaPago,
      notas: datos.notas,
      recibidoPorId: datos.recibidoPorId,
    });
    if (!res.ok || !res.recibo) {
      return {
        ok: false,
        recibos,
        error: `${res.error || "No se pudo crear el recibo"} (se alcanzaron a emitir ${recibos.length} de ${n}).`,
      };
    }
    recibos.push(res.recibo);
  }
  return { ok: true, recibos };
}

/** Emite 1..N recibos repartiendo un monto total; permite elegir quién recibe el dinero. */
export async function emitirRecibosEnPartes(datos: {
  ordenTrabajoId: string;
  montoTotal: number;
  numRecibos: number;
  metodoPago: "transferencia" | "efectivo" | "tarjeta" | "otro";
  recibidoPorId?: string | null;
  fechaPago?: string;
  concepto?: string;
  referenciaPago?: string;
  notas?: string;
}): Promise<{ ok: boolean; recibos: ReciboPago[]; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: ot } = await sb
      .from("ordenes_trabajo")
      .select("folio")
      .eq("id", datos.ordenTrabajoId)
      .maybeSingle();
    if (!ot) return { ok: false, recibos: [], error: "Orden de trabajo no encontrada." };

    return await repartirEnRecibos({
      ordenTrabajoId: datos.ordenTrabajoId,
      ordenFolio: ot.folio,
      montoTotal: datos.montoTotal,
      numRecibos: datos.numRecibos,
      metodoPago: datos.metodoPago,
      recibidoPorId: datos.recibidoPorId,
      fechaPago: datos.fechaPago,
      conceptoBase: datos.concepto,
      referenciaPago: datos.referenciaPago,
      notas: datos.notas,
    });
  } catch (err: any) {
    return { ok: false, recibos: [], error: err?.message || "Error al emitir los recibos." };
  }
}

/**
 * Recalcula saldo anterior / saldo restante de todos los recibos de una OT
 * en orden cronológico, para que sigan siendo coherentes tras editar o
 * eliminar alguno.
 */
async function recalcularSaldosRecibosOT(sb: any, ordenTrabajoId: string): Promise<void> {
  const { data: ot } = await sb
    .from("ordenes_trabajo")
    .select("cotizacion_id")
    .eq("id", ordenTrabajoId)
    .maybeSingle();

  let total = 0;
  if (ot?.cotizacion_id) {
    const { data: cot } = await sb
      .from("cotizaciones")
      .select("precio_final")
      .eq("id", ot.cotizacion_id)
      .maybeSingle();
    total = Number(cot?.precio_final || 0);
  }

  const { data: recibos } = await sb
    .from("recibos_pago")
    .select("id, monto")
    .eq("orden_trabajo_id", ordenTrabajoId)
    .order("fecha_pago", { ascending: true })
    .order("created_at", { ascending: true });

  let pagado = 0;
  for (const r of recibos || []) {
    const saldoAnterior = total > 0 ? Math.max(0, Math.round((total - pagado) * 100) / 100) : 0;
    const monto = Number(r.monto || 0);
    const saldoRestante = total > 0 ? Math.max(0, Math.round((saldoAnterior - monto) * 100) / 100) : 0;
    await sb
      .from("recibos_pago")
      .update({ saldo_anterior: saldoAnterior, saldo_restante: saldoRestante })
      .eq("id", r.id);
    pagado += monto;
  }
}

/** Edita un recibo ya emitido (monto, método, concepto, referencia, fecha, quién recibió, notas). */
export async function actualizarReciboPago(
  reciboId: string,
  datos: {
    monto?: number;
    metodoPago?: "transferencia" | "efectivo" | "tarjeta" | "otro";
    referenciaPago?: string;
    concepto?: string;
    fechaPago?: string;
    notas?: string;
    recibidoPorId?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: actual } = await sb
      .from("recibos_pago")
      .select("id, orden_trabajo_id")
      .eq("id", reciboId)
      .maybeSingle();
    if (!actual) return { ok: false, error: "Recibo no encontrado." };

    const cambios: Record<string, any> = { updated_at: new Date().toISOString() };

    if (datos.monto !== undefined) {
      const monto = Math.round(Number(datos.monto) * 100) / 100;
      if (!(monto > 0)) return { ok: false, error: "El monto debe ser mayor a cero." };
      cambios.monto = monto;
      cambios.monto_letra = numeroALetras(monto);
    }
    if (datos.metodoPago) cambios.metodo_pago = datos.metodoPago;
    if (datos.referenciaPago !== undefined) cambios.referencia_pago = datos.referenciaPago.trim() || null;
    if (datos.concepto !== undefined) {
      if (!datos.concepto.trim()) return { ok: false, error: "El concepto no puede estar vacío." };
      cambios.concepto = datos.concepto.trim();
    }
    if (datos.fechaPago) cambios.fecha_pago = datos.fechaPago;
    if (datos.notas !== undefined) cambios.notas = datos.notas.trim() || null;

    if (datos.recibidoPorId) {
      const { data: perf } = await sb
        .from("perfiles")
        .select("id, nombre")
        .eq("id", datos.recibidoPorId)
        .maybeSingle();
      if (!perf) return { ok: false, error: "La persona seleccionada no existe en el sistema." };
      cambios.recibido_por = perf.id;
      cambios.recibido_por_nombre = perf.nombre;
    }

    const { error } = await sb.from("recibos_pago").update(cambios).eq("id", reciboId);
    if (error) return { ok: false, error: error.message };

    await recalcularSaldosRecibosOT(sb, actual.orden_trabajo_id);

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al editar el recibo." };
  }
}

/** Elimina un recibo emitido (p. ej. para rehacerlo). Recalcula los saldos de los demás. */
export async function eliminarReciboPago(reciboId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: actual } = await sb
      .from("recibos_pago")
      .select("id, orden_trabajo_id, folio")
      .eq("id", reciboId)
      .maybeSingle();
    if (!actual) return { ok: false, error: "Recibo no encontrado." };

    // No se elimina si una comisión ligada a este recibo ya tiene pagos aplicados
    const { data: coms } = await sb
      .from("comisiones")
      .select("id, monto_pagado")
      .eq("recibo_pago_id", reciboId);
    if ((coms || []).some((c: any) => Number(c.monto_pagado || 0) > 0)) {
      return {
        ok: false,
        error: `El recibo ${actual.folio} tiene una comisión con pagos aplicados; primero cancela o ajusta esa comisión.`,
      };
    }

    const { error } = await sb.from("recibos_pago").delete().eq("id", reciboId);
    if (error) return { ok: false, error: error.message };

    await recalcularSaldosRecibosOT(sb, actual.orden_trabajo_id);

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/comisiones");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar el recibo." };
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
    // Se suma en meses para admitir plazos menores a un año (p. ej. 6 meses)
    fechaVencimientoDate.setMonth(fechaVencimientoDate.getMonth() + Math.round(anos * 12));
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
        costo_proveedor,
        comision_bancaria_pct,
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

    // El costo financiero (comisión bancaria/pasarela) se hereda automáticamente
    // del % capturado en la orden de trabajo al programar la instalación
    // (terminal, meses sin intereses, etc.), en vez de partir siempre de $0.
    const comisionBancariaPctOt = Number(ot.comision_bancaria_pct || 0);
    const costoFinancieroAuto = Math.round(montoBase * (comisionBancariaPctOt / 100) * 100) / 100;

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
        costo_financiero: costoFinancieroAuto,
        costo_proveedor: Number(ot.costo_proveedor || 0),
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

    // Reflejar automáticamente la venta en Finanzas (ingresos_ventas). Si ya
    // se cobró por completo vía recibos_pago se registra como "pagado";
    // de lo contrario queda como cuenta por cobrar pendiente.
    try {
      const { registrarMovimientoAutomaticoCRM } = await import("@/app/actions/finanzas");
      const { data: recibosOt } = await sb
        .from("recibos_pago")
        .select("monto, fecha_pago")
        .eq("orden_trabajo_id", ot.id);
      const totalCobrado = (recibosOt || []).reduce((acc, r: any) => acc + Number(r.monto || 0), 0);
      const yaLiquidada = montoBase > 0 && totalCobrado >= montoBase;
      const ultimaFechaCobro = (recibosOt || [])
        .map((r: any) => r.fecha_pago)
        .filter(Boolean)
        .sort()
        .pop();

      await registrarMovimientoAutomaticoCRM({
        tipo: "ingreso",
        lineaPnl: "ingresos_ventas",
        monto: montoBase,
        concepto: `Venta - ${folio} - ${ot.titulo}`,
        fecha: datos.fecha || new Date().toISOString().split("T")[0],
        fechaPago: yaLiquidada ? ultimaFechaCobro || undefined : undefined,
        estado: yaLiquidada ? "pagado" : "pendiente",
        contraparte: ot.prospectos?.nombre || "Cliente",
        crmDealId: ot.expediente_id || null,
      });
    } catch (errFin) {
      console.error("Error al registrar movimiento financiero de venta desde OT:", errFin);
    }

    // Si tiene cotización, asegurar que pase a 'instalacion'
    if (ot.cotizacion_id) {
      await sb
        .from("cotizaciones")
        .update({ estatus: "instalacion", updated_at: new Date().toISOString() })
        .eq("id", ot.cotizacion_id);
    }

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/remisiones");
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
 * Vuelve a armar la póliza de garantía de una OT con la plantilla vigente del
 * producto vendido (descripción de la cotización, características y plazo).
 * Sustituye el contenido, el título y la vigencia de la póliza actual.
 */
export async function regenerarGarantiaDesdeProducto(
  ordenId: string
): Promise<{ ok: boolean; garantia?: CartaGarantiaOT; usoPlantillaProducto?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: ot } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, cotizacion_id, prospecto_id")
      .eq("id", ordenId)
      .maybeSingle();
    if (!ot) return { ok: false, error: "Orden de trabajo no encontrada." };
    if (!ot.cotizacion_id) {
      return { ok: false, error: "La orden no está ligada a una cotización; no hay producto del cual tomar la garantía." };
    }

    let clienteNombre = "Cliente Sauceda";
    let direccion = "Domicilio en Obra";
    if (ot.prospecto_id) {
      const { data: pros } = await sb
        .from("prospectos")
        .select("nombre, direccion, fraccionamiento")
        .eq("id", ot.prospecto_id)
        .maybeSingle();
      if (pros?.nombre) clienteNombre = pros.nombre;
      direccion = pros?.direccion || pros?.fraccionamiento || direccion;
    }

    const g = await armarGarantiaDesdeCotizacion(sb, {
      cotizacionId: ot.cotizacion_id,
      ordenFolio: ot.folio,
      clienteNombre,
      direccion,
    });

    const res = await guardarGarantiaOT({
      ordenTrabajoId: ordenId,
      titulo: g.titulo,
      contenido: g.contenido,
      anosGarantia: g.anos,
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, garantia: res.garantia, usoPlantillaProducto: g.usoPlantillaProducto };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al regenerar la póliza de garantía." };
  }
}

/** Texto por defecto de la póliza de garantía cuando se genera en automático al crear la OT. */
function generarContenidoGarantiaPorDefecto(clienteNombre: string, direccion: string): string {
  const ahora = new Date();
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const fechaTexto = `${ahora.getDate()} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}`;

  return `SAUCEDA CONSTRUYE
PÓLIZA DE GARANTÍA POR SERVICIO

Por la presente garantizamos los trabajos realizados en la siguiente propiedad:

Cliente: ${clienteNombre}
Ubicación: ${direccion}
Fecha de inicio de garantía: ${fechaTexto}

CONDICIONES DE GARANTÍA:

Cobertura de defectos
Si se detecta cualquier defecto de mano de obra o material relacionado con los trabajos realizados, SAUCEDA Construye se compromete a rectificar dichas fallas sin cargo extra por mano de obra ni materiales.

Tramitación de reclamaciones
SAUCEDA Construye se compromete a tramitar cualquier reclamación bajo garantía de forma rápida y justa. Para reportar un problema, contáctanos al +52 477 465 4700 o a través de WhatsApp.

Limitaciones de la garantía
SAUCEDA Construye no será responsable de daños ocasionados por manipulación del trabajo, negligencia del cliente o fenómenos naturales fuera de nuestro control.

Esta garantía es válida únicamente en la propiedad especificada y no es transferible.

SAUCEDA Construye · Tradición con tecnología · +52 477 465 4700 · saucedamx.com`;
}

/**
 * Genera en automático los documentos base de una Orden de Trabajo recién
 * creada: recibo(s) de cobro, póliza de garantía y remisión de venta.
 * Cada paso es "best effort": si uno falla no debe impedir que la OT quede
 * creada, sólo se registra un aviso en consola.
 */
async function generarDocumentosAutomaticosOT(
  sb: any,
  params: {
    ordenTrabajoId: string;
    ordenFolio: string;
    clienteNombre: string;
    montoCobro?: number | null;
    metodoPago?: string | null;
    direccionCliente?: string;
    /** Cantidad de recibos en que se reparte el cobro. Por omisión: 1 si el monto es <= $10,000; 2 si es mayor. */
    numRecibos?: number | null;
    /** Persona que recibe el dinero (perfil). Por omisión, el usuario en sesión. */
    recibidoPorId?: string | null;
  }
): Promise<void> {
  const { ordenTrabajoId, ordenFolio, clienteNombre, montoCobro, metodoPago, direccionCliente } = params;

  // 1. Recibo(s) de pago: la cantidad es parametrizable; si no se indica,
  // un único recibo si el monto es <= $10,000 y dos (50% / 50%) si es mayor.
  const monto = Number(montoCobro || 0);
  if (monto > 0) {
    try {
      const metodoRecibo: "transferencia" | "efectivo" | "tarjeta" | "otro" =
        metodoPago === "efectivo"
          ? "efectivo"
          : metodoPago === "transferencia"
          ? "transferencia"
          : metodoPago === "terminal_tarjeta" || metodoPago === "meses_sin_intereses"
          ? "tarjeta"
          : "otro";

      const numRecibos =
        params.numRecibos && params.numRecibos > 0 ? params.numRecibos : monto <= 10000 ? 1 : 2;
      const resRec = await repartirEnRecibos({
        ordenTrabajoId,
        ordenFolio,
        montoTotal: monto,
        numRecibos,
        metodoPago: metodoRecibo,
        recibidoPorId: params.recibidoPorId,
      });
      if (!resRec.ok) {
        console.error("Aviso: recibos automáticos incompletos para OT", ordenFolio, resRec.error);
      }
    } catch (errRec) {
      console.error("Aviso: no se pudo generar recibo(s) automático(s) para OT", ordenFolio, errRec);
    }
  }

  // 2. Póliza de garantía: si la OT nace de una cotización se arma con la
  // plantilla del producto vendido (descripción, características y plazo);
  // si no, se usa el texto genérico.
  try {
    const { data: otGar } = await sb
      .from("ordenes_trabajo")
      .select("cotizacion_id")
      .eq("id", ordenTrabajoId)
      .maybeSingle();

    if (otGar?.cotizacion_id) {
      const g = await armarGarantiaDesdeCotizacion(sb, {
        cotizacionId: otGar.cotizacion_id,
        ordenFolio,
        clienteNombre,
        direccion: direccionCliente || "Domicilio en Obra",
      });
      await guardarGarantiaOT({
        ordenTrabajoId,
        titulo: g.titulo,
        contenido: g.contenido,
        anosGarantia: g.anos,
      });
    } else {
      const contenido = generarContenidoGarantiaPorDefecto(
        clienteNombre,
        direccionCliente || "Domicilio en Obra"
      );
      await guardarGarantiaOT({
        ordenTrabajoId,
        titulo: "Póliza de Garantía por Servicio",
        contenido,
      });
    }
  } catch (errGar) {
    console.error("Aviso: no se pudo generar póliza automática para OT", ordenFolio, errGar);
  }

  // 3. Remisión de venta: sólo si hay un precio real que facturar (evita
  // generar remisiones en $0 para OTs manuales sin cotización).
  try {
    const { data: otCheck } = await sb
      .from("ordenes_trabajo")
      .select("cotizacion_id")
      .eq("id", ordenTrabajoId)
      .maybeSingle();
    let precioFinal = 0;
    if (otCheck?.cotizacion_id) {
      const { data: cotCheck } = await sb
        .from("cotizaciones")
        .select("precio_final")
        .eq("id", otCheck.cotizacion_id)
        .maybeSingle();
      precioFinal = Number(cotCheck?.precio_final || 0);
    }
    if (otCheck?.cotizacion_id && precioFinal > 0) {
      await generarRemisionDesdeOrdenTrabajo({ ordenTrabajoId, tipo: "remision" });
    }
  } catch (errRem) {
    console.error("Aviso: no se pudo generar remisión automática para OT", ordenFolio, errRem);
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
      tipoNegocio: d.tipo_negocio || "construccion",
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
 * Consulta pública de la remisión/factura de una orden de trabajo que NO está
 * vinculada a una cotización (por eso no tiene cotizacionToken). Se usa el
 * propio token de la orden de trabajo para localizar el documento generado
 * con generarRemisionDesdeOrdenTrabajo.
 */
export async function obtenerRemisionOrdenTrabajoPorToken(token: string): Promise<{
  ok: boolean;
  error?: string;
  orden?: { folio: string; titulo: string; clienteNombre: string; clienteTelefono: string };
  remision?: RemisionFactura;
}> {
  try {
    const sb = supabaseServidor();

    const { data: ot, error } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, titulo, prospectos(nombre, telefono)")
      .eq("token", token)
      .maybeSingle();

    if (error || !ot) {
      return { ok: false, error: "Orden de trabajo no encontrada o enlace caducado." };
    }

    const { data: rem } = await sb
      .from("remisiones_facturas")
      .select("*")
      .eq("orden_trabajo_id", ot.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rem) {
      return { ok: false, error: "Aún no se ha generado una remisión/factura para esta orden de trabajo." };
    }

    return {
      ok: true,
      orden: {
        folio: ot.folio,
        titulo: ot.titulo,
        clienteNombre: (ot.prospectos as any)?.nombre || "Cliente General",
        clienteTelefono: (ot.prospectos as any)?.telefono || "",
      },
      remision: {
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
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al consultar la remisión de la orden de trabajo." };
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


/**
 * 23. Obtener datos completos para el formulario de programación de instalación
 */
export async function obtenerDatosProgramacionInstalacion(cotizacionId: string): Promise<{
  ok: boolean;
  cotizacion?: any;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  servicioTipo?: string;
  montoTotal?: number;
  saldoRestante?: number;
  conceptos?: Array<{ descripcion: string; cantidad: number; unidad: string; importe: number }>;
  /** Suma de cantidad × costo_unitario de los conceptos de la cotización: lo que costaría pagarle al proveedor según el catálogo, calculado automáticamente. */
  costoProveedorSugerido?: number;
  ordenExistente?: any;
  citaExistente?: any;
  asesores: Array<{ id: string; nombre: string; telefono?: string }>;
  proveedores: Array<{ id: string; nombre: string }>;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Obtener cotización (consulta plana, sin joins embebidos de PostgREST:
    // en este proyecto ya se identificó que fallan de forma intermitente en
    // producción y hacían que funciones similares reportaran "no encontrado"
    // aun existiendo el registro; ver listarComisiones / sincronizarComision*).
    const { data: cot, error: cotErr } = await sb
      .from("cotizaciones")
      .select("id, token, estatus, servicio_tipo, precio_final, prospecto_id, expediente_id")
      .eq("id", cotizacionId)
      .maybeSingle();

    if (cotErr) {
      console.error("obtenerDatosProgramacionInstalacion: error al consultar cotización", cotizacionId, cotErr.message);
      return { ok: false, error: `Error al consultar la cotización: ${cotErr.message}`, asesores: [], proveedores: [] };
    }
    if (!cot) {
      return { ok: false, error: `Cotización "${cotizacionId}" no encontrada.`, asesores: [], proveedores: [] };
    }

    // 2. Consultar conceptos, prospecto/expediente, orden de trabajo existente, cita de agenda y recibos
    const [conceptosRes, prospectoRes, expedienteRes, otRes, citaRes, recsRes, asesores, proveedores] = await Promise.all([
      sb.from("cotizacion_conceptos").select("descripcion, cantidad, unidad, importe, costo_unitario").eq("cotizacion_id", cot.id),
      cot.prospecto_id
        ? sb
            .from("prospectos")
            .select("id, nombre, primer_apellido, segundo_apellido, telefono, email, direccion, fraccionamiento")
            .eq("id", cot.prospecto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      cot.expediente_id
        ? sb
            .from("expedientes")
            .select("id, cliente, primer_apellido, segundo_apellido, telefono, fraccionamiento, fecha_instalacion, operador_id")
            .eq("id", cot.expediente_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("ordenes_trabajo").select("*").eq("cotizacion_id", cot.id).maybeSingle(),
      sb.from("agenda_citas").select("*").eq("cotizacion_id", cot.id).eq("tipo_cita", "instalacion").maybeSingle(),
      sb.from("recibos_pago").select("monto").eq("cotizacion_id", cot.id),
      import("@/app/actions/usuarios").then((m) => m.listarAsesoresActivos().catch(() => [])),
      import("@/app/actions/proveedores").then((m) => m.listarProveedoresMin().catch(() => [])),
    ]);

    // Resolver cliente
    const p = prospectoRes.data as any;
    const e = expedienteRes.data as any;
    const nombreCliente = [
      p?.nombre || e?.cliente,
      p?.primer_apellido || e?.primer_apellido,
      p?.segundo_apellido || e?.segundo_apellido,
    ]
      .filter(Boolean)
      .join(" ") || "Cliente General";

    const telefonoCliente = p?.telefono || e?.telefono || "";
    const direccionCliente = p?.direccion || p?.fraccionamiento || e?.fraccionamiento || "";

    const montoTotal = Number(cot.precio_final || 0);
    const totalPagado = (recsRes.data || []).reduce((acc: number, r: any) => acc + Number(r.monto || 0), 0);
    const saldoRestante = Math.max(0, montoTotal - totalPagado);

    // Costo de proveedor sugerido: se calcula automáticamente sumando
    // cantidad × costo_unitario de cada concepto de la cotización (ese costo
    // ya viene del catálogo de productos al armar la cotización).
    const costoProveedorSugerido = (conceptosRes.data || []).reduce(
      (acc: number, c: any) => acc + Number(c.cantidad || 0) * Number(c.costo_unitario || 0),
      0
    );

    return {
      ok: true,
      cotizacion: {
        id: cot.id,
        token: cot.token,
        folio: cot.id,
        estatus: cot.estatus,
        servicioTipo: cot.servicio_tipo || "impermeabilizacion",
        precioFinal: montoTotal,
        prospectoId: cot.prospecto_id,
        expedienteId: cot.expediente_id,
      },
      clienteNombre: nombreCliente,
      clienteTelefono: telefonoCliente,
      clienteDireccion: direccionCliente,
      servicioTipo: cot.servicio_tipo || "Servicio General",
      montoTotal,
      saldoRestante,
      conceptos: conceptosRes.data || [],
      costoProveedorSugerido: Math.round(costoProveedorSugerido * 100) / 100,
      ordenExistente: otRes.data || null,
      citaExistente: citaRes.data || null,
      asesores,
      proveedores,
    };
  } catch (err: any) {
    console.error("Error en obtenerDatosProgramacionInstalacion:", err);
    return { ok: false, error: err?.message || "Error al obtener datos.", asesores: [], proveedores: [] };
  }
}

/**
 * 24. Programar Instalación, Detonar Orden de Trabajo y Notificar a Proveedor y Cliente
 */
export async function programarInstalacionYDetonarOT(datos: {
  cotizacionId: string;
  fechaInstalacion: string; // YYYY-MM-DD
  horaInicio?: string;      // default "09:00"
  horaFin?: string;         // default "14:00"
  asesorEjecutorId?: string | null;
  proveedorId?: string | null;
  costoProveedor?: number | null;
  proveedorConcepto?: string | null;
  metodoPagoSaldo?: string; // "terminal_tarjeta" | "meses_sin_intereses" | "transferencia" | "efectivo" | "liquidado"
  mesesSinIntereses?: number | null;
  comisionBancariaPct?: number;
  montoSaldo?: number;
  /** Cantidad de recibos en que se reparte el saldo (por omisión 1 si <= $10,000; 2 si es mayor). */
  numRecibos?: number | null;
  /** Persona (perfil) que recibe el dinero. */
  recibidoPorId?: string | null;
  notasInstalacion?: string;
  notificarClienteWhatsApp?: boolean;
  notificarProveedorWhatsApp?: boolean;
  notificarAsesorApp?: boolean;
}): Promise<{
  ok: boolean;
  ordenId?: string;
  ordenFolio?: string;
  mensajeCliente?: string;
  mensajeProveedor?: string;
  urlWhatsAppCliente?: string;
  urlWhatsAppProveedor?: string;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    // 1. Validar y obtener cotización completa (consulta plana, sin joins
    // embebidos de PostgREST: en este proyecto ya se identificó que fallan
    // de forma intermitente en producción; ver listarComisiones,
    // sincronizarComision* y obtenerDatosProgramacionInstalacion).
    const { data: cot, error: errCot } = await sb
      .from("cotizaciones")
      .select("id, token, estatus, servicio_tipo, precio_final, prospecto_id, expediente_id")
      .eq("id", datos.cotizacionId)
      .maybeSingle();

    if (errCot) {
      console.error("programarInstalacionYDetonarOT: error al consultar cotización", datos.cotizacionId, errCot.message);
      return { ok: false, error: `Error al consultar la cotización: ${errCot.message}` };
    }
    if (!cot) {
      return { ok: false, error: `Cotización "${datos.cotizacionId}" no encontrada para programar instalación.` };
    }

    // 2. Resolver datos del cliente (prospecto/expediente por separado)
    const [prospectoRes, expedienteRes] = await Promise.all([
      cot.prospecto_id
        ? sb
            .from("prospectos")
            .select("id, nombre, primer_apellido, segundo_apellido, telefono, email, direccion, fraccionamiento")
            .eq("id", cot.prospecto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      cot.expediente_id
        ? sb
            .from("expedientes")
            .select("id, cliente, primer_apellido, segundo_apellido, telefono, fraccionamiento, operador_id")
            .eq("id", cot.expediente_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const p = prospectoRes.data as any;
    const e = expedienteRes.data as any;
    const nombreCliente = [
      p?.nombre || e?.cliente,
      p?.primer_apellido || e?.primer_apellido,
      p?.segundo_apellido || e?.segundo_apellido,
    ]
      .filter(Boolean)
      .join(" ") || "Cliente General";

    const telefonoCliente = p?.telefono || e?.telefono || "";
    const direccionCliente = p?.direccion || p?.fraccionamiento || e?.fraccionamiento || "Domicilio en Obra";
    const servicioTipo = (cot.servicio_tipo || "impermeabilizacion").replace(/_/g, " ");

    const horaInicio = datos.horaInicio || "09:00";
    const horaFin = datos.horaFin || "14:00";
    const fechaISO = `${datos.fechaInstalacion}T${horaInicio}:00`;

    // 3. Obtener conceptos de la cotización para armar el alcance de la orden
    const { data: conceptos } = await sb
      .from("cotizacion_conceptos")
      .select("descripcion, cantidad, unidad, importe")
      .eq("cotizacion_id", cot.id);

    const resumenConceptos = (conceptos || [])
      .map((c: any) => `• ${c.cantidad || 1} ${c.unidad || "serv"} - ${c.descripcion}`)
      .join("\n") || `• 1 servicio - ${servicioTipo}`;

    // 4. Saldo y método de pago
    const montoSaldo = datos.montoSaldo !== undefined ? Number(datos.montoSaldo) : Number(cot.precio_final || 0);
    const metodoPago = datos.metodoPagoSaldo || "terminal_tarjeta";
    const comisionBancariaPct = Math.max(0, Number(datos.comisionBancariaPct || 0));
    const mesesSinIntereses = datos.mesesSinIntereses ? Number(datos.mesesSinIntereses) : null;
    const metodoPagoLabel =
      metodoPago === "terminal_tarjeta"
        ? "Terminal Bancaria en Sitio (Tarjeta de Débito / Crédito)"
        : metodoPago === "meses_sin_intereses"
        ? `Meses Sin Intereses${mesesSinIntereses ? ` (${mesesSinIntereses} MSI)` : ""}`
        : metodoPago === "transferencia"
        ? "Transferencia bancaria previa"
        : metodoPago === "efectivo"
        ? "Efectivo contra entrega"
        : "Previamente Liquidado";

    const saldoFormateado = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(montoSaldo);

    // Formatear fecha amigable para mensajes
    let fechaLegible = datos.fechaInstalacion;
    try {
      const fParts = datos.fechaInstalacion.split("-");
      const d = new Date(Number(fParts[0]), Number(fParts[1]) - 1, Number(fParts[2]));
      fechaLegible = d.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {}

    // 5. Actualizar estatus de la cotización a 'instalacion'
    await sb
      .from("cotizaciones")
      .update({
        estatus: "instalacion",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cot.id);

    // 6. Actualizar expediente si existe
    if (cot.expediente_id) {
      await sb
        .from("expedientes")
        .update({
          fecha_instalacion: fechaISO,
          operador_id: datos.asesorEjecutorId || e?.operador_id || null,
          etapa: "propuesta-aceptada",
          ultimo_movimiento: new Date().toISOString().split("T")[0],
        })
        .eq("id", cot.expediente_id);
    }

    // 7. Sincronizar Cita en Agenda (agenda_citas)
    const { data: citaExistente } = await sb
      .from("agenda_citas")
      .select("id")
      .eq("cotizacion_id", cot.id)
      .eq("tipo_cita", "instalacion")
      .maybeSingle();

    const notasCita = [
      datos.notasInstalacion?.trim(),
      `Cobro saldo: ${saldoFormateado} (${metodoPagoLabel})`,
    ]
      .filter(Boolean)
      .join(" · ");

    if (citaExistente) {
      await sb
        .from("agenda_citas")
        .update({
          perfil_id: datos.asesorEjecutorId || usuario?.id,
          fecha: datos.fechaInstalacion,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          notas: notasCita,
          estado: "confirmada",
        })
        .eq("id", citaExistente.id);
    } else {
      await sb.from("agenda_citas").insert({
        perfil_id: datos.asesorEjecutorId || usuario?.id,
        prospecto_id: cot.prospecto_id || null,
        expediente_id: cot.expediente_id || null,
        cotizacion_id: cot.id,
        cliente_nombre: nombreCliente,
        cliente_telefono: telefonoCliente,
        fraccionamiento: direccionCliente,
        tipo_cita: "instalacion",
        fecha: datos.fechaInstalacion,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        notas: notasCita,
        estado: "confirmada",
      });
    }

    // 8. DETONAR / ASEGURAR ORDEN DE TRABAJO
    let otId = "";
    let otFolio = "";

    const { data: otExistente } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, estatus")
      .eq("cotizacion_id", cot.id)
      .maybeSingle();

    const descripcionOT = [
      `INSTALACIÓN TÉCNICA PROGRAMADA PARA: ${fechaLegible} (${horaInicio} a ${horaFin} hrs)`,
      `\nALCANCE DE TRABAJO:\n${resumenConceptos}`,
      `\nCONDICIÓN DE COBRO: Saldo por ${saldoFormateado} vía ${metodoPagoLabel}.` +
        (metodoPago === "terminal_tarjeta" ? " ⚠️ Asegurar llevar terminal bancaria con carga y señal." : ""),
      datos.notasInstalacion ? `\nINDICACIONES ESPECIALES:\n${datos.notasInstalacion}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (otExistente) {
      otId = otExistente.id;
      otFolio = otExistente.folio;
      await sb
        .from("ordenes_trabajo")
        .update({
          fecha_programada: datos.fechaInstalacion,
          asesor_ejecutor_id: datos.asesorEjecutorId || null,
          proveedor_id: datos.proveedorId || null,
          costo_proveedor: datos.costoProveedor && datos.costoProveedor > 0 ? datos.costoProveedor : null,
          proveedor_concepto: datos.proveedorConcepto || null,
          metodo_pago_saldo: metodoPago,
          meses_sin_intereses: mesesSinIntereses,
          comision_bancaria_pct: comisionBancariaPct,
          descripcion: descripcionOT,
          estatus: otExistente.estatus === "completada" ? "completada" : "en_proceso",
          updated_at: new Date().toISOString(),
        })
        .eq("id", otExistente.id);
    } else {
      const folioOT = await generarFolioOT(sb);
      const tokenOT = crypto.randomBytes(16).toString("hex");

      const { data: nuevaOT, error: errNuevaOT } = await sb
        .from("ordenes_trabajo")
        .insert({
          folio: folioOT,
          token: tokenOT,
          expediente_id: cot.expediente_id || null,
          cotizacion_id: cot.id,
          prospecto_id: cot.prospecto_id || null,
          tipo_negocio: cot.servicio_tipo || "construccion",
          estatus: "en_proceso",
          titulo: `${servicioTipo.toUpperCase()} - ${nombreCliente}`,
          descripcion: descripcionOT,
          fecha_programada: datos.fechaInstalacion,
          asesor_responsable_id: usuario?.id || null,
          asesor_ejecutor_id: datos.asesorEjecutorId || null,
          creado_por: usuario?.id || null,
          fotos_evidencia: [],
          proveedor_id: datos.proveedorId || null,
          costo_proveedor: datos.costoProveedor && datos.costoProveedor > 0 ? datos.costoProveedor : null,
          proveedor_concepto: datos.proveedorConcepto || null,
          metodo_pago_saldo: metodoPago,
          meses_sin_intereses: mesesSinIntereses,
          comision_bancaria_pct: comisionBancariaPct,
        })
        .select("id, folio")
        .single();

      if (errNuevaOT || !nuevaOT) {
        throw new Error(errNuevaOT?.message || "No se pudo crear la orden de trabajo automática.");
      }
      otId = nuevaOT.id;
      otFolio = nuevaOT.folio;
    }

    // Si se asignó proveedor y costo, asegurar documento de proveedor
    if (datos.proveedorId && datos.costoProveedor && datos.costoProveedor > 0) {
      try {
        await generarDocumentoProveedorAutomatico(otId);
      } catch (errProvDoc) {
        console.warn("Aviso al generar documento proveedor automático:", errProvDoc);
      }
    }

    // Documentos base en automático (recibo del saldo, póliza de garantía y
    // remisión de venta), únicamente cuando la OT se acaba de crear: si ya
    // existía (re-programación), no se vuelven a generar para no duplicar
    // recibos ni remisiones.
    if (!otExistente) {
      try {
        await generarDocumentosAutomaticosOT(sb, {
          ordenTrabajoId: otId,
          ordenFolio: otFolio,
          clienteNombre: nombreCliente,
          montoCobro: montoSaldo,
          metodoPago,
          direccionCliente,
          numRecibos: datos.numRecibos,
          recibidoPorId: datos.recibidoPorId,
        });
      } catch (errAuto) {
        console.error("Aviso: no se pudieron generar documentos automáticos de la OT:", errAuto);
      }
    }

    // 9. CONSTRUIR MENSAJES Y NOTIFICACIONES
    // Mensaje para el Cliente
    const mensajeCliente =
      `¡Hola ${nombreCliente}! 🛠️ Te confirmamos que tu instalación con SAUCEDA ha quedado programada:\n\n` +
      `📅 *Fecha:* ${fechaLegible}\n` +
      `⏰ *Horario estimado:* ${horaInicio} a ${horaFin} hrs\n` +
      `📍 *Ubicación:* ${direccionCliente}\n` +
      `🔨 *Trabajo:* ${servicioTipo}\n` +
      `💳 *Saldo a liquidar:* ${saldoFormateado} (${metodoPagoLabel})\n\n` +
      (datos.notasInstalacion ? `📌 *Notas:* ${datos.notasInstalacion}\n\n` : "") +
      `Por favor asegúrate de tener libre el acceso al área de trabajo. ¡Cualquier duda quedamos a tus órdenes! 💚`;

    // Resolver datos del proveedor si aplica
    let mensajeProveedor = "";
    let telefonoProveedor = "";
    if (datos.proveedorId) {
      const { data: provData } = await sb
        .from("proveedores")
        .select("nombre, telefono")
        .eq("id", datos.proveedorId)
        .maybeSingle();

      if (provData) {
        telefonoProveedor = provData.telefono || "";
        mensajeProveedor =
          `🛠️ *NUEVA ASIGNACIÓN DE TRABAJO - SAUCEDA*\n\n` +
          `📋 *Orden de Trabajo:* ${otFolio} (Cotización ${cot.id})\n` +
          `📅 *Fecha de Instalación:* ${fechaLegible} (${horaInicio} hrs)\n` +
          `👤 *Cliente:* ${nombreCliente} (Tel: ${telefonoCliente || "N/A"})\n` +
          `📍 *Dirección de Obra:* ${direccionCliente}\n` +
          `🔨 *Especialidad:* ${servicioTipo}\n\n` +
          `*Trabajos a ejecutar:*\n${resumenConceptos}\n\n` +
          `💳 *Condición de Cobro:* Saldo de ${saldoFormateado} vía ${metodoPagoLabel}` +
          (metodoPago === "terminal_tarjeta" ? "\n⚠️ *IMPORTANTE:* Llevar terminal bancaria con batería y señal para el cobro." : "") +
          (datos.notasInstalacion ? `\n\n📝 *Indicaciones:* ${datos.notasInstalacion}` : "");
      }
    }

    // Intentar envíos por Meta WhatsApp API si está habilitado
    if (datos.notificarClienteWhatsApp && telefonoCliente) {
      try {
        const { enviarWhatsAppPlantilla, enviarWhatsAppTexto } = await import("@/lib/whatsapp");
        let resCli = await enviarWhatsAppPlantilla(
          telefonoCliente,
          "confirmacion_instalacion",
          "es_MX",
          [
            nombreCliente.split(" ")[0] || nombreCliente,
            servicioTipo,
            fechaLegible,
            `${horaInicio} a ${horaFin} hrs`,
            "Alejandro y Gerardo",
            "524776735044",
          ]
        );
        let textoRegistrado = `[plantilla: confirmacion_instalacion] ${mensajeCliente}`;
        if (!resCli.ok) {
          resCli = await enviarWhatsAppPlantilla(
            telefonoCliente,
            "confirmacion_instalacion",
            "es",
            [
              nombreCliente.split(" ")[0] || nombreCliente,
              servicioTipo,
              fechaLegible,
              `${horaInicio} a ${horaFin} hrs`,
              "Alejandro y Gerardo",
              "524776735044",
            ]
          );
        }
        if (!resCli.ok) {
          resCli = await enviarWhatsAppTexto(telefonoCliente, mensajeCliente);
          textoRegistrado = mensajeCliente;
        }

        // Registrar el envío en el historial de conversaciones de WhatsApp,
        // igual que el resto de los envíos del CRM, para que aparezca en la
        // bandeja de Conversaciones y reciba las actualizaciones de estado
        // (entregado/leído) del webhook de Meta.
        const { error: errMsg } = await sb.from("mensajes_whatsapp").insert({
          telefono: normalizarTelefono(telefonoCliente),
          texto: textoRegistrado,
          direccion: "out",
          expediente_id: cot.expediente_id,
          prospecto_id: cot.prospecto_id,
          estado: resCli.ok ? "enviado" : `error:${(resCli as any).errorDetail || resCli.error || "desconocido"}`,
          agente: usuario?.email || "",
          wa_message_id: (resCli as any).messageId || null,
        });
        if (errMsg) {
          console.error("Error al registrar en historial de WhatsApp la confirmación de instalación:", errMsg.message);
        }
      } catch (errW) {
        console.warn("Aviso WhatsApp cliente:", errW);
      }
    }

    if (datos.notificarProveedorWhatsApp && telefonoProveedor) {
      try {
        const { enviarWhatsAppTexto } = await import("@/lib/whatsapp");
        await enviarWhatsAppTexto(telefonoProveedor, mensajeProveedor);
      } catch (errWProv) {
        console.warn("Aviso WhatsApp proveedor:", errWProv);
      }
    }

    // Notificación en la aplicación para el asesor asignado
    if (datos.notificarAsesorApp && datos.asesorEjecutorId) {
      try {
        await sb.from("notificaciones").insert({
          perfil_id: datos.asesorEjecutorId,
          titulo: `🛠️ Nueva Orden de Trabajo Programada: ${otFolio}`,
          cuerpo: `Instalación el ${fechaLegible} para ${nombreCliente}. Trabajo: ${servicioTipo}.`,
          enlace: `/ordenes-trabajo/${otId}`,
          leido: false,
        });
      } catch (errNotif) {
        console.warn("Aviso al notificar asesor:", errNotif);
      }
    }

    // Registrar en bitácora de actividades
    try {
      const { registrarActividad } = await import("@/lib/actividades");
      await registrarActividad(sb, {
        expedienteId: cot.expediente_id || undefined,
        prospectoId: cot.prospecto_id || undefined,
        tipo: "construccion",
        titulo: `🛠️ Instalación Programada y OT Generada (${otFolio})`,
        detalle: `Instalación programada para el ${fechaLegible}. Orden de Trabajo ${otFolio} creada con cobranza esperada vía ${metodoPagoLabel}.`,
      });
    } catch (errAct) {
      console.warn("Aviso al registrar actividad:", errAct);
    }

    // Revalidaciones
    revalidatePath(`/construccion/${cot.id}`);
    revalidatePath("/construccion");
    revalidatePath("/ordenes-trabajo");
    revalidatePath(`/ordenes-trabajo/${otId}`);
    revalidatePath("/remisiones");
    if (cot.expediente_id) revalidatePath(`/expediente/${cot.expediente_id}`);

    // URLs directas de WhatsApp
    const telClienteNorm = telefonoCliente ? normalizarTelefono(telefonoCliente) : "";
    const telProvNorm = telefonoProveedor ? normalizarTelefono(telefonoProveedor) : "";

    const urlWhatsAppCliente = telClienteNorm
      ? `https://wa.me/${telClienteNorm}?text=${encodeURIComponent(mensajeCliente)}`
      : undefined;

    const urlWhatsAppProveedor = telProvNorm && mensajeProveedor
      ? `https://wa.me/${telProvNorm}?text=${encodeURIComponent(mensajeProveedor)}`
      : undefined;

    return {
      ok: true,
      ordenId: otId,
      ordenFolio: otFolio,
      mensajeCliente,
      mensajeProveedor,
      urlWhatsAppCliente,
      urlWhatsAppProveedor,
    };
  } catch (err: any) {
    console.error("Error catastrófico en programarInstalacionYDetonarOT:", err);
    return { ok: false, error: err?.message || "Error al programar instalación." };
  }
}



