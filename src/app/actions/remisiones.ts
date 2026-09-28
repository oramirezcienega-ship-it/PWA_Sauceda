"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { revalidatePath } from "next/cache";

export interface RemisionFacturaEnriquecida {
  id: string;
  cotizacionId: string | null;
  ordenTrabajoId: string | null;
  expedienteId: string | null;
  tipo: "remision" | "factura";
  folio: string;
  fecha: string;
  tipoCambio: number;
  datosDocumento: Record<string, any>;
  serviciosExtra: number;
  costoFinanciero: number;
  otrosGastos: number;
  montoSubtotal: number;
  montoTotal: number;
  createdAt: string;
  updatedAt: string;

  // Datos Enriquecidos del Cliente
  clienteNombre: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  clienteDireccion?: string;
  prospectoId?: string;

  // Datos de la Orden de Trabajo
  ordenFolio?: string;
  ordenTitulo?: string;
  ordenEstatus?: string;
  ordenTipoNegocio?: string;
  ordenEntregaToken?: string;
  asesorId?: string;
  asesorNombre?: string;

  // Datos de la Cotización
  cotizacionFolio?: string;
  cotizacionToken?: string;
  cotizacionServicioTipo?: string;

  // Cobranza vinculada a la OT
  totalCobrado: number;
  saldoRestante: number;
}

export interface FiltrosRemisiones {
  tipo?: string; // "todas" | "remision" | "factura"
  busqueda?: string;
  fechaInicio?: string;
  fechaFin?: string;
}

/**
 * Obtiene la lista completa y enriquecida de remisiones y facturas
 * para el concentrado administrativo.
 */
export async function listarRemisionesFacturas(
  filtros?: FiltrosRemisiones
): Promise<RemisionFacturaEnriquecida[]> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Consulta base de remisiones_facturas
    let query = sb
      .from("remisiones_facturas")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtros?.tipo && filtros.tipo !== "todas") {
      query = query.eq("tipo", filtros.tipo);
    }
    if (filtros?.fechaInicio) {
      query = query.gte("fecha", filtros.fechaInicio);
    }
    if (filtros?.fechaFin) {
      query = query.lte("fecha", filtros.fechaFin);
    }

    const { data: rows, error: errRem } = await query;
    if (errRem) {
      console.error("Error al consultar remisiones_facturas:", errRem);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    // 2. Extraer IDs únicos para enriquecer en paralelo sin joins frágiles
    const otIds = Array.from(new Set(rows.map((r: any) => r.orden_trabajo_id).filter(Boolean)));
    const cotIds = Array.from(new Set(rows.map((r: any) => r.cotizacion_id).filter(Boolean)));
    const expIds = Array.from(new Set(rows.map((r: any) => r.expediente_id).filter(Boolean)));

    // 3. Ejecutar consultas complementarias en paralelo
    const [otsRes, cotsRes, recsRes] = await Promise.all([
      otIds.length > 0
        ? sb
            .from("ordenes_trabajo")
            .select("id, folio, titulo, estatus, tipo_negocio, entrega_token, asesor_ejecutor_id, prospecto_id, cotizacion_id, cliente_nombre, cliente_telefono, cliente_direccion")
            .in("id", otIds)
        : Promise.resolve({ data: [] }),
      cotIds.length > 0
        ? sb
            .from("cotizaciones")
            .select("id, token, servicio_tipo, folio, prospecto_id, expediente_id, precio_final")
            .in("id", cotIds)
        : Promise.resolve({ data: [] }),
      otIds.length > 0
        ? sb
            .from("recibos_pago")
            .select("orden_trabajo_id, monto")
            .in("orden_trabajo_id", otIds)
        : Promise.resolve({ data: [] }),
    ]);

    const otsMap = new Map<string, any>();
    (otsRes.data || []).forEach((ot: any) => otsMap.set(ot.id, ot));

    const cotsMap = new Map<string, any>();
    (cotsRes.data || []).forEach((c: any) => cotsMap.set(c.id, c));

    // Sumar recibos de pago por orden de trabajo
    const cobradoPorOt = new Map<string, number>();
    (recsRes.data || []).forEach((r: any) => {
      const prev = cobradoPorOt.get(r.orden_trabajo_id) || 0;
      cobradoPorOt.set(r.orden_trabajo_id, prev + Number(r.monto || 0));
    });

    // 4. Reunir IDs de prospectos y asesores
    const prospectoIds = new Set<string>();
    (otsRes.data || []).forEach((ot: any) => {
      if (ot.prospecto_id) prospectoIds.add(ot.prospecto_id);
    });
    (cotsRes.data || []).forEach((c: any) => {
      if (c.prospecto_id) prospectoIds.add(c.prospecto_id);
    });

    const asesorIds = Array.from(
      new Set(
        (otsRes.data || [])
          .map((ot: any) => ot.asesor_ejecutor_id)
          .filter(Boolean)
      )
    );

    const [prospRes, expRes, asesoresRes] = await Promise.all([
      prospectoIds.size > 0
        ? sb
            .from("prospectos")
            .select("id, nombre, primer_apellido, segundo_apellido, telefono, email, correo, direccion, empresa")
            .in("id", Array.from(prospectoIds))
        : Promise.resolve({ data: [] }),
      expIds.length > 0
        ? sb
            .from("expedientes")
            .select("id, cliente, telefono, fraccionamiento")
            .in("id", expIds)
        : Promise.resolve({ data: [] }),
      asesorIds.length > 0
        ? sb
            .from("usuarios")
            .select("id, nombre")
            .in("id", asesorIds)
        : Promise.resolve({ data: [] }),
    ]);

    const prospMap = new Map<string, any>();
    (prospRes.data || []).forEach((p: any) => prospMap.set(p.id, p));

    const expMap = new Map<string, any>();
    (expRes.data || []).forEach((e: any) => expMap.set(e.id, e));

    const asesoresMap = new Map<string, string>();
    (asesoresRes.data || []).forEach((a: any) => asesoresMap.set(a.id, a.nombre));

    // 5. Ensamblar los registros enriquecidos
    const listaEnriquecida: RemisionFacturaEnriquecida[] = rows.map((r: any) => {
      const ot = r.orden_trabajo_id ? otsMap.get(r.orden_trabajo_id) : null;
      const cot = r.cotizacion_id ? cotsMap.get(r.cotizacion_id) : null;
      const exp = r.expediente_id ? expMap.get(r.expediente_id) : null;

      const pId = ot?.prospecto_id || cot?.prospecto_id;
      const prosp = pId ? prospMap.get(pId) : null;

      // Determinación del nombre de cliente más preciso disponible
      let nombreCliente = "Cliente General";
      if (r.tipo === "factura" && r.datos_documento?.razonSocial) {
        nombreCliente = r.datos_documento.razonSocial;
      } else if (r.datos_documento?.personaRecibe) {
        nombreCliente = r.datos_documento.personaRecibe;
      } else if (ot?.cliente_nombre) {
        nombreCliente = ot.cliente_nombre;
      } else if (prosp) {
        const parts = [prosp.nombre, prosp.primer_apellido, prosp.segundo_apellido].filter(Boolean);
        nombreCliente = parts.join(" ") || "Cliente General";
      } else if (exp?.cliente) {
        nombreCliente = exp.cliente;
      }

      // Teléfono y Correo
      const telefonoCliente =
        ot?.cliente_telefono || prosp?.telefono || exp?.telefono || "";
      const emailCliente =
        prosp?.correo || prosp?.email || r.datos_documento?.email || "";
      const direccionCliente =
        r.datos_documento?.direccionEntrega ||
        ot?.cliente_direccion ||
        prosp?.direccion ||
        exp?.fraccionamiento ||
        "";

      // Asesor
      const asesorNombre = ot?.asesor_ejecutor_id
        ? asesoresMap.get(ot.asesor_ejecutor_id) || "Sin asignar"
        : "Sin asignar";

      // Cobranza
      const cobrado = r.orden_trabajo_id
        ? cobradoPorOt.get(r.orden_trabajo_id) || 0
        : 0;
      const montoTotal = Number(r.monto_total || 0);
      const saldoRestante = Math.max(0, montoTotal - cobrado);

      return {
        id: r.id,
        cotizacionId: r.cotizacion_id || null,
        ordenTrabajoId: r.orden_trabajo_id || null,
        expedienteId: r.expediente_id || null,
        tipo: r.tipo as "remision" | "factura",
        folio: r.folio || "SIN-FOLIO",
        fecha: r.fecha || r.created_at?.split("T")[0] || "",
        tipoCambio: Number(r.tipo_cambio || 1.0),
        datosDocumento: r.datos_documento || {},
        serviciosExtra: Number(r.servicios_extra || 0),
        costoFinanciero: Number(r.costo_financiero || 0),
        otrosGastos: Number(r.otros_gastos || 0),
        montoSubtotal: Number(r.monto_subtotal || 0),
        montoTotal,
        createdAt: r.created_at,
        updatedAt: r.updated_at,

        clienteNombre: nombreCliente,
        clienteTelefono: telefonoCliente,
        clienteEmail: emailCliente,
        clienteDireccion: direccionCliente,
        prospectoId: pId,

        ordenFolio: ot?.folio,
        ordenTitulo: ot?.titulo,
        ordenEstatus: ot?.estatus,
        ordenTipoNegocio: ot?.tipo_negocio || cot?.servicio_tipo,
        ordenEntregaToken: ot?.entrega_token,
        asesorId: ot?.asesor_ejecutor_id,
        asesorNombre,

        cotizacionFolio: cot?.folio || cot?.id,
        cotizacionToken: cot?.token,
        cotizacionServicioTipo: cot?.servicio_tipo,

        totalCobrado: cobrado,
        saldoRestante,
      };
    });

    // 6. Filtro en memoria por búsqueda si se envió
    if (filtros?.busqueda?.trim()) {
      const q = filtros.busqueda.toLowerCase().trim();
      return listaEnriquecida.filter((item) => {
        return (
          item.folio.toLowerCase().includes(q) ||
          item.clienteNombre.toLowerCase().includes(q) ||
          (item.clienteTelefono && item.clienteTelefono.toLowerCase().includes(q)) ||
          (item.ordenFolio && item.ordenFolio.toLowerCase().includes(q)) ||
          (item.ordenTitulo && item.ordenTitulo.toLowerCase().includes(q)) ||
          (item.datosDocumento?.rfc && String(item.datosDocumento.rfc).toLowerCase().includes(q)) ||
          (item.datosDocumento?.razonSocial && String(item.datosDocumento.razonSocial).toLowerCase().includes(q))
        );
      });
    }

    return listaEnriquecida;
  } catch (error) {
    console.error("Error catastrófico en listarRemisionesFacturas:", error);
    return [];
  }
}

/**
 * Obtiene el detalle completo de una remisión o factura específica por su ID
 */
export async function obtenerRemisionFacturaPorId(
  id: string
): Promise<{ ok: boolean; remision?: RemisionFacturaEnriquecida; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: rem, error } = await sb
      .from("remisiones_facturas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !rem) {
      return { ok: false, error: "Documento no encontrado." };
    }

    const lista = await listarRemisionesFacturas();
    const encontrado = lista.find((r) => r.id === id);

    if (encontrado) {
      return { ok: true, remision: encontrado };
    }

    return {
      ok: true,
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
        clienteNombre: rem.datos_documento?.razonSocial || rem.datos_documento?.personaRecibe || "Cliente General",
        totalCobrado: 0,
        saldoRestante: Number(rem.monto_total || 0),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al obtener documento." };
  }
}

/**
 * Elimina una remisión o factura (Solo administradores)
 */
export async function eliminarRemisionFactura(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { error } = await sb.from("remisiones_facturas").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/remisiones");
    revalidatePath("/ordenes-trabajo");
    revalidatePath("/comisiones");

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al eliminar remisión." };
  }
}
