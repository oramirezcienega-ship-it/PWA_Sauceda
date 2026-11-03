"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import type {
  MovimientoBalanceProveedor,
  AplicacionPagoProveedor,
  BalanceProveedorResumen,
  OrdenTrabajoBalanceProveedor,
  DocumentoBalanceProveedor,
  TipoMovimientoProveedor,
  SentidoBalanceProveedor,
  TipoDestinoAplicacion,
} from "@/lib/types";

export interface DatosNuevoMovimientoBalance {
  proveedorId: string;
  tipo: TipoMovimientoProveedor;
  sentido?: SentidoBalanceProveedor;
  monto: number;
  fecha: string;
  metodoPago?: "transferencia" | "efectivo" | "cheque" | "compensacion" | "otro";
  referencia?: string;
  concepto: string;
  comprobanteUrl?: string;
  comprobanteNombre?: string;
  notas?: string;
  /** Aplicaciones iniciales opcionales a órdenes de trabajo o documentos */
  aplicaciones?: Array<{
    ordenTrabajoId?: string | null;
    documentoProveedorId?: string | null;
    tipoDestino: TipoDestinoAplicacion;
    folioDestino?: string | null;
    descripcionDestino: string;
    montoAplicado: number;
    notas?: string;
  }>;
}

export interface RespuestaBalanceProveedor {
  ok: boolean;
  error?: string;
  resumen?: BalanceProveedorResumen;
  movimientos?: MovimientoBalanceProveedor[];
  ordenes?: OrdenTrabajoBalanceProveedor[];
  documentos?: DocumentoBalanceProveedor[];
}

/** Obtiene el estado de cuenta completo y balance del proveedor con OTs y aplicaciones */
export async function obtenerBalanceProveedor(proveedorId: string): Promise<RespuestaBalanceProveedor> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Consultar movimientos registrados
    const { data: movsData, error: errMovs } = await sb
      .from("proveedores_movimientos_balance")
      .select("*")
      .eq("proveedor_id", proveedorId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (errMovs) {
      if (errMovs.message.includes("schema cache") || errMovs.message.includes("does not exist") || (errMovs as any).code === "42P01") {
        return {
          ok: false,
          error: "Falta ejecutar la migración 0186 en Supabase (las tablas de balance y cuenta corriente aún no existen en la base de datos).",
        };
      }
      return { ok: false, error: `Error al consultar movimientos: ${errMovs.message}` };
    }

    // 2. Consultar aplicaciones de pagos
    const { data: aplicData, error: errAplic } = await sb
      .from("proveedores_aplicaciones_pago")
      .select("*")
      .eq("proveedor_id", proveedorId)
      .order("created_at", { ascending: true });

    if (errAplic) {
      return { ok: false, error: `Error al consultar aplicaciones: ${errAplic.message}` };
    }

    // 3. Consultar órdenes de trabajo asignadas a este proveedor
    const { data: otsData, error: errOTs } = await sb
      .from("ordenes_trabajo")
      .select("id, folio, titulo, expediente_id, costo_proveedor, estatus, fecha_programada")
      .eq("proveedor_id", proveedorId)
      .order("created_at", { ascending: false });

    if (errOTs) {
      return { ok: false, error: `Error al consultar órdenes: ${errOTs.message}` };
    }

    // 4. Consultar documentos (remisiones/facturas) registrados de este proveedor
    const { data: docsData, error: errDocs } = await sb
      .from("documentos_proveedores")
      .select("id, folio, tipo, concepto, fecha, monto, orden_trabajo_id")
      .eq("proveedor_id", proveedorId)
      .order("fecha", { ascending: false });

    if (errDocs) {
      return { ok: false, error: `Error al consultar documentos: ${errDocs.message}` };
    }

    // Agrupar aplicaciones por movimiento_id, por orden_trabajo_id y por documento_proveedor_id
    const aplicacionesPorMov: Record<string, AplicacionPagoProveedor[]> = {};
    const aplicacionesPorOT: Record<string, AplicacionPagoProveedor[]> = {};
    const aplicacionesPorDoc: Record<string, AplicacionPagoProveedor[]> = {};

    (aplicData || []).forEach((a: any) => {
      const item: AplicacionPagoProveedor = {
        id: a.id,
        movimientoId: a.movimiento_id,
        proveedorId: a.proveedor_id,
        ordenTrabajoId: a.orden_trabajo_id,
        documentoProveedorId: a.documento_proveedor_id,
        tipoDestino: a.tipo_destino,
        folioDestino: a.folio_destino,
        descripcionDestino: a.descripcion_destino,
        montoAplicado: Number(a.monto_aplicado) || 0,
        notas: a.notas,
        creadoPor: a.creado_por,
        createdAt: a.created_at,
      };

      if (!aplicacionesPorMov[a.movimiento_id]) aplicacionesPorMov[a.movimiento_id] = [];
      aplicacionesPorMov[a.movimiento_id].push(item);

      if (a.orden_trabajo_id) {
        if (!aplicacionesPorOT[a.orden_trabajo_id]) aplicacionesPorOT[a.orden_trabajo_id] = [];
        aplicacionesPorOT[a.orden_trabajo_id].push(item);
      }

      if (a.documento_proveedor_id) {
        if (!aplicacionesPorDoc[a.documento_proveedor_id]) aplicacionesPorDoc[a.documento_proveedor_id] = [];
        aplicacionesPorDoc[a.documento_proveedor_id].push(item);
      }
    });

    // Mapear movimientos
    const movimientos: MovimientoBalanceProveedor[] = (movsData || []).map((m: any) => {
      const monto = Number(m.monto) || 0;
      const montoAplicado = Number(m.monto_aplicado) || 0;
      return {
        id: m.id,
        proveedorId: m.proveedor_id,
        tipo: m.tipo,
        sentido: m.sentido,
        monto,
        montoAplicado,
        montoDisponible: Math.max(0, monto - montoAplicado),
        fecha: m.fecha,
        metodoPago: m.metodo_pago,
        referencia: m.referencia,
        concepto: m.concepto,
        comprobanteUrl: m.comprobante_url,
        comprobanteNombre: m.comprobante_nombre,
        notas: m.notas,
        creadoPor: m.creado_por,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        aplicaciones: aplicacionesPorMov[m.id] || [],
      };
    });

    // Mapear órdenes de trabajo con su liquidación
    const ordenes: OrdenTrabajoBalanceProveedor[] = (otsData || []).map((ot: any) => {
      const costo = Number(ot.costo_proveedor) || 0;
      const apps = aplicacionesPorOT[ot.id] || [];
      const montoAplicado = apps.reduce((acc, a) => acc + a.montoAplicado, 0);
      const saldoPendiente = Math.max(0, costo - montoAplicado);
      const estaLiquidada = costo > 0 ? saldoPendiente <= 0 : false;
      const anticipoPagado = montoAplicado > 0;

      return {
        id: ot.id,
        folio: ot.folio,
        titulo: ot.titulo,
        expedienteId: ot.expediente_id,
        costoProveedor: costo,
        estatus: ot.estatus,
        fechaProgramada: ot.fecha_programada,
        anticipoPagado,
        liquidacionPagada: estaLiquidada,
        montoAplicado,
        saldoPendiente,
        estaLiquidada,
        aplicaciones: apps,
      };
    });

    // Mapear documentos
    const documentos: DocumentoBalanceProveedor[] = (docsData || []).map((d: any) => {
      const monto = Number(d.monto) || 0;
      const apps = aplicacionesPorDoc[d.id] || [];
      const montoAplicado = apps.reduce((acc, a) => acc + a.montoAplicado, 0);
      const saldoPendiente = Math.max(0, monto - montoAplicado);
      const estaLiquidado = monto > 0 && saldoPendiente <= 0;

      return {
        id: d.id,
        folio: d.folio,
        tipo: d.tipo,
        concepto: d.concepto,
        fecha: d.fecha,
        monto,
        ordenTrabajoId: d.orden_trabajo_id,
        montoAplicado,
        saldoPendiente,
        estaLiquidado,
        aplicaciones: apps,
      };
    });

    // 5. Calcular KPIs de balance
    let totalAnticiposPagados = 0;
    let totalPagosEntregados = 0;
    let totalPagosRecibidos = 0;
    let totalComisionesPorCobrar = 0;

    movimientos.forEach((m) => {
      if (m.tipo === "anticipo_a_proveedor") totalAnticiposPagados += m.monto;
      else if (m.tipo === "pago_a_proveedor") totalPagosEntregados += m.monto;
      else if (m.tipo === "pago_recibido_proveedor") totalPagosRecibidos += m.monto;
      else if (m.tipo === "comision_por_cobrar") totalComisionesPorCobrar += m.monto;
    });

    // Costo total pactado en órdenes
    const totalCostosOT = ordenes.reduce((acc, o) => acc + o.costoProveedor, 0);

    // Saldo pendiente que Sauceda le debe al proveedor en órdenes
    const saldoOtsPorPagar = ordenes
      .filter((o) => !o.estaLiquidada)
      .reduce((acc, o) => acc + o.saldoPendiente, 0);

    // Anticipos disponibles de Sauceda aún sin aplicar a órdenes
    const anticiposFlotantes = movimientos
      .filter((m) => m.tipo === "anticipo_a_proveedor")
      .reduce((acc, m) => acc + m.montoDisponible, 0);

    // Comisiones pendientes que el proveedor nos debe
    const comisionesPendientes = Math.max(0, totalComisionesPorCobrar - totalPagosRecibidos);

    // Saldo neto: (lo que el proveedor nos debe) - (lo que Sauceda le debe)
    // A favor de Sauceda: anticipos otorgados aún no amortizados + comisiones por cobrar
    const saldoAFavorSauceda = Math.round((anticiposFlotantes + comisionesPendientes) * 100) / 100;
    // A favor del proveedor: OTs pendientes de pagar
    const saldoAFavorProveedor = Math.round(saldoOtsPorPagar * 100) / 100;

    // Saldo neto: positivo = a favor Sauceda, negativo = a favor Proveedor
    const saldoNeto = Math.round((saldoAFavorSauceda - saldoAFavorProveedor) * 100) / 100;

    const estadoNeto: "a_favor_sauceda" | "a_favor_proveedor" | "al_dia" =
      saldoNeto > 0 ? "a_favor_sauceda" : saldoNeto < 0 ? "a_favor_proveedor" : "al_dia";

    const resumen: BalanceProveedorResumen = {
      proveedorId,
      totalCostosOT,
      totalAnticiposPagados,
      totalPagosEntregados,
      totalComisionesPorCobrar,
      totalPagosRecibidos,
      saldoAFavorSauceda,
      saldoAFavorProveedor,
      saldoNeto,
      estadoNeto,
    };

    return {
      ok: true,
      resumen,
      movimientos,
      ordenes,
      documentos,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al calcular balance del proveedor." };
  }
}

/** Registra un nuevo movimiento de balance (anticipo, pago a proveedor o pago recibido de comisiones) */
export async function registrarMovimientoBalanceAction(
  datos: DatosNuevoMovimientoBalance
): Promise<{ ok: boolean; error?: string; movimientoId?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    const monto = Number(datos.monto || 0);
    if (monto <= 0) {
      return { ok: false, error: "El monto debe ser mayor a cero." };
    }

    if (!datos.concepto || !datos.concepto.trim()) {
      return { ok: false, error: "El concepto es obligatorio." };
    }

    // Determinar sentido financiero por default
    let sentido: SentidoBalanceProveedor = "a_favor_sauceda";
    if (datos.tipo === "anticipo_a_proveedor" || datos.tipo === "comision_por_cobrar") {
      sentido = "a_favor_sauceda";
    } else if (datos.tipo === "cargo_orden_trabajo" || datos.tipo === "pago_recibido_proveedor") {
      sentido = "a_favor_proveedor";
    } else if (datos.tipo === "pago_a_proveedor") {
      sentido = "a_favor_sauceda";
    } else if (datos.sentido) {
      sentido = datos.sentido;
    }

    // Insertar movimiento
    const filaMov = {
      proveedor_id: datos.proveedorId,
      tipo: datos.tipo,
      sentido,
      monto,
      monto_aplicado: 0,
      fecha: datos.fecha || new Date().toISOString().split("T")[0],
      metodo_pago: datos.metodoPago || "transferencia",
      referencia: datos.referencia?.trim() || null,
      concepto: datos.concepto.trim(),
      comprobante_url: datos.comprobanteUrl?.trim() || null,
      comprobante_nombre: datos.comprobanteNombre?.trim() || null,
      notas: datos.notas?.trim() || null,
      creado_por: usuario?.id || null,
    };

    const { data: nuevoMov, error: errIns } = await sb
      .from("proveedores_movimientos_balance")
      .insert(filaMov)
      .select("id")
      .single();

    if (errIns || !nuevoMov) {
      return { ok: false, error: `Error al registrar movimiento: ${errIns?.message}` };
    }

    // Si incluyó aplicaciones inmediatas a órdenes o documentos:
    if (datos.aplicaciones && datos.aplicaciones.length > 0) {
      const filasAplic = datos.aplicaciones.map((a) => ({
        movimiento_id: nuevoMov.id,
        proveedor_id: datos.proveedorId,
        orden_trabajo_id: a.ordenTrabajoId || null,
        documento_proveedor_id: a.documentoProveedorId || null,
        tipo_destino: a.tipoDestino,
        folio_destino: a.folioDestino || null,
        descripcion_destino: a.descripcionDestino,
        monto_aplicado: Number(a.montoAplicado) || 0,
        notas: a.notas?.trim() || null,
        creado_por: usuario?.id || null,
      }));

      const { error: errAplic } = await sb.from("proveedores_aplicaciones_pago").insert(filasAplic);
      if (errAplic) {
        console.warn("Aviso al registrar aplicaciones del pago:", errAplic.message);
      }
    }

    revalidatePath(`/proveedores/${datos.proveedorId}`);
    return { ok: true, movimientoId: nuevoMov.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error inesperado al registrar movimiento." };
  }
}

/**
 * Permite al administrador asignar o aplicar un pago ya registrado (o anticipo)
 * directamente a una o varias órdenes de trabajo, facturas o servicios específicos.
 */
export async function aplicarPagoAOrdenesAction(params: {
  movimientoId: string;
  proveedorId: string;
  aplicaciones: Array<{
    ordenTrabajoId?: string | null;
    documentoProveedorId?: string | null;
    tipoDestino: TipoDestinoAplicacion;
    folioDestino?: string | null;
    descripcionDestino: string;
    montoAplicado: number;
    notas?: string;
  }>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    const { movimientoId, proveedorId, aplicaciones } = params;

    if (!aplicaciones || aplicaciones.length === 0) {
      return { ok: false, error: "Selecciona al menos una orden o factura para aplicar el pago." };
    }

    // Verificar que el movimiento exista y tenga saldo disponible
    const { data: mov, error: errMov } = await sb
      .from("proveedores_movimientos_balance")
      .select("id, monto, monto_aplicado")
      .eq("id", movimientoId)
      .eq("proveedor_id", proveedorId)
      .maybeSingle();

    if (errMov || !mov) {
      return { ok: false, error: "No se encontró el movimiento o pago especificado." };
    }

    const disponible = Number(mov.monto) - Number(mov.monto_aplicado);
    const sumaAplicar = aplicaciones.reduce((acc, a) => acc + Number(a.montoAplicado || 0), 0);

    if (sumaAplicar > disponible + 0.01) {
      return {
        ok: false,
        error: `La suma a aplicar ($${sumaAplicar.toLocaleString("es-MX")}) excede el monto disponible del pago ($${disponible.toLocaleString("es-MX")}).`,
      };
    }

    const filas = aplicaciones
      .filter((a) => Number(a.montoAplicado) > 0)
      .map((a) => ({
        movimiento_id: movimientoId,
        proveedor_id: proveedorId,
        orden_trabajo_id: a.ordenTrabajoId || null,
        documento_proveedor_id: a.documentoProveedorId || null,
        tipo_destino: a.tipoDestino,
        folio_destino: a.folioDestino || null,
        descripcion_destino: a.descripcionDestino,
        monto_aplicado: Number(a.montoAplicado),
        notas: a.notas?.trim() || null,
        creado_por: usuario?.id || null,
      }));

    const { error: errIns } = await sb.from("proveedores_aplicaciones_pago").insert(filas);
    if (errIns) {
      return { ok: false, error: `Error al aplicar el pago: ${errIns.message}` };
    }

    revalidatePath(`/proveedores/${proveedorId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al aplicar el pago." };
  }
}

/** Elimina una aplicación de pago, liberando el saldo disponible del movimiento */
export async function eliminarAplicacionPagoAction(
  aplicacionId: string,
  proveedorId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb
      .from("proveedores_aplicaciones_pago")
      .delete()
      .eq("id", aplicacionId)
      .eq("proveedor_id", proveedorId);

    if (error) {
      return { ok: false, error: `No se pudo eliminar la aplicación: ${error.message}` };
    }

    revalidatePath(`/proveedores/${proveedorId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al desvincular pago." };
  }
}

/** Elimina un movimiento de balance (y todas sus aplicaciones en cascada) */
export async function eliminarMovimientoBalanceAction(
  movimientoId: string,
  proveedorId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb
      .from("proveedores_movimientos_balance")
      .delete()
      .eq("id", movimientoId)
      .eq("proveedor_id", proveedorId);

    if (error) {
      return { ok: false, error: `No se pudo eliminar el movimiento: ${error.message}` };
    }

    revalidatePath(`/proveedores/${proveedorId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar movimiento." };
  }
}
