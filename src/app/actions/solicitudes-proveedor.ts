"use server";

/**
 * Solicitudes de servicio a proveedores (CRM, requieren sesión). El motor de la
 * cascada vive en src/lib/solicitudes-proveedor.ts; el proveedor responde desde
 * su link (src/app/actions/portal-precios-proveedor.ts).
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { ordenesCerradas } from "@/lib/cierre-ot";
import {
  avanzarSolicitud,
  costoReferenciaOferta,
  iniciarSolicitud,
  siguienteFolioSolicitud,
} from "@/lib/solicitudes-proveedor";
import { MEDIDAS_TARIFA, medidaTarifa, normalizarCostosCapacidad } from "@/lib/tarifas-capacidad";

export type EstadoSolicitud = "abierta" | "asignada" | "confirmada" | "sin_proveedor" | "cancelada";
export type EstadoEnvio =
  | "en_espera"
  | "enviada"
  | "vista"
  | "aceptada"
  | "rechazada"
  | "requiere_visita"
  | "vencida"
  | "cancelada";

export interface CandidatoSolicitud {
  proveedorId: string;
  proveedorNombre: string;
  preferido: boolean;
  zonasCobertura: string;
  garantiaAnios: number;
  tiempoEjecucion: string;
  costoReferencia: number | null;
  tieneWhatsapp: boolean;
}

export interface EnvioSolicitud {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  orden: number;
  estado: EstadoEnvio;
  costoReferencia: number | null;
  fechaLimite: string | null;
  enviadaAt: string | null;
  respondidaAt: string | null;
  fechasPropuestas: string[];
  comentario: string;
  notificado: boolean;
  /** Respondió por Telegram (opciones día + franja). */
  porTelegram: boolean;
}

export interface SolicitudProveedor {
  id: string;
  folio: string;
  cotizacionId: string | null;
  ordenTrabajoId: string | null;
  productoId: string | null;
  productoNombre: string;
  descripcion: string;
  cantidad: number | null;
  unidad: string;
  zona: string;
  fotos: { url: string; titulo: string }[];
  fechasSugeridas: string;
  modo: "cascada" | "urgente";
  horasRespuesta: number;
  estado: EstadoSolicitud;
  proveedorAsignadoId: string | null;
  proveedorAsignadoNombre: string | null;
  costoAcordado: number | null;
  fechaAcordada: string | null;
  /** Cuándo se le ofrecieron al cliente las opciones del proveedor. */
  opcionesOfrecidasAt: string | null;
  ordenTrabajoFolio: string | null;
  createdAt: string;
  envios: EnvioSolicitud[];
}

const SELECT_SOLICITUD =
  "*, productos_servicios:producto_id ( nombre ), proveedor:proveedor_asignado_id ( nombre ), ordenes_trabajo:orden_trabajo_id ( folio ), solicitudes_proveedor_envios ( *, proveedores:proveedor_id ( nombre ) )";

function aSolicitud(f: any): SolicitudProveedor {
  return {
    id: f.id,
    folio: f.folio,
    cotizacionId: f.cotizacion_id,
    ordenTrabajoId: f.orden_trabajo_id,
    productoId: f.producto_id,
    productoNombre: f.productos_servicios?.nombre || "Servicio",
    descripcion: f.descripcion || "",
    cantidad: f.cantidad === null ? null : Number(f.cantidad),
    unidad: f.unidad || "",
    zona: f.zona || "",
    fotos: Array.isArray(f.fotos) ? f.fotos.filter((x: any) => x?.url).map((x: any) => ({ url: x.url, titulo: x.titulo || "" })) : [],
    fechasSugeridas: f.fechas_sugeridas || "",
    modo: f.modo === "urgente" ? "urgente" : "cascada",
    horasRespuesta: Number(f.horas_respuesta || 4),
    estado: f.estado,
    proveedorAsignadoId: f.proveedor_asignado_id,
    proveedorAsignadoNombre: f.proveedor?.nombre || null,
    costoAcordado: f.costo_acordado === null ? null : Number(f.costo_acordado),
    fechaAcordada: f.fecha_acordada || null,
    opcionesOfrecidasAt: f.opciones_ofrecidas_at || null,
    ordenTrabajoFolio: f.ordenes_trabajo?.folio || null,
    createdAt: f.created_at,
    envios: (f.solicitudes_proveedor_envios || [])
      .map((e: any) => ({
        id: e.id,
        proveedorId: e.proveedor_id,
        proveedorNombre: e.proveedores?.nombre || "",
        orden: e.orden,
        estado: e.estado,
        costoReferencia: e.costo_referencia === null ? null : Number(e.costo_referencia),
        fechaLimite: e.fecha_limite,
        enviadaAt: e.enviada_at,
        respondidaAt: e.respondida_at,
        fechasPropuestas: Array.isArray(e.fechas_propuestas) ? e.fechas_propuestas.map(String) : [],
        comentario: e.comentario || "",
        notificado: e.notificado === true,
        porTelegram: Array.isArray(e.tg_opciones) && e.tg_opciones.length > 0,
      }))
      .sort((a: EnvioSolicitud, b: EnvioSolicitud) => a.orden - b.orden),
  };
}

/** Unidad para mostrar al proveedor: la medida del escalón (L, tubos) o la unidad del producto. */
async function unidadDeProducto(sb: ReturnType<typeof supabaseServidor>, productoId: string): Promise<string> {
  const { data } = await sb
    .from("productos_servicios")
    .select("unidad, tarifa_medida, tarifas_capacidad")
    .eq("id", productoId)
    .maybeSingle();
  if (!data) return "";
  if (normalizarCostosCapacidad(data.tarifas_capacidad).length > 0) return MEDIDAS_TARIFA[medidaTarifa(data.tarifa_medida)].abrev;
  return data.unidad || "";
}

/** Proveedores que ofrecen el producto, en el orden de la cascada: preferido primero, luego el de menor costo. */
export async function listarCandidatosSolicitud(productoId: string, cantidad: number | null): Promise<CandidatoSolicitud[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb
    .from("proveedor_productos")
    .select(
      "costo_unitario, costos_volumen, tarifas_capacidad, cantidad_minima, monto_minimo, zonas_cobertura, garantia_anios, tiempo_ejecucion, preferido, proveedores:proveedor_id ( id, nombre, activo, whatsapp, telefono )"
    )
    .eq("producto_id", productoId)
    .eq("activo", true);
  return (data || [])
    .filter((o: any) => o.proveedores?.activo !== false)
    .map((o: any) => ({
      proveedorId: o.proveedores.id,
      proveedorNombre: o.proveedores.nombre,
      preferido: o.preferido === true,
      zonasCobertura: o.zonas_cobertura || "",
      garantiaAnios: Number(o.garantia_anios || 0),
      tiempoEjecucion: o.tiempo_ejecucion || "",
      costoReferencia: costoReferenciaOferta(o, cantidad),
      tieneWhatsapp: Boolean(o.proveedores.whatsapp || o.proveedores.telefono),
    }))
    .sort(
      (a, b) =>
        Number(b.preferido) - Number(a.preferido) ||
        (a.costoReferencia ?? Number.MAX_SAFE_INTEGER) - (b.costoReferencia ?? Number.MAX_SAFE_INTEGER)
    );
}

/** Datos de la cotización para prellenar la solicitud: conceptos con producto y zona (sin datos del cliente). */
export async function prepararSolicitudDesdeCotizacion(cotizacionId: string): Promise<{
  zona: string;
  conceptos: { productoId: string; productoNombre: string; descripcion: string; cantidad: number; unidad: string }[];
}> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: cot } = await sb.from("cotizaciones").select("id, expediente_id").eq("id", cotizacionId).maybeSingle();
  let zona = "";
  if (cot?.expediente_id) {
    const { data: exp } = await sb.from("expedientes").select("fraccionamiento").eq("id", cot.expediente_id).maybeSingle();
    zona = exp?.fraccionamiento || "";
  }
  const { data: conceptos } = await sb
    .from("cotizacion_conceptos")
    .select("descripcion, cantidad, unidad, producto_servicio_id, productos_servicios:producto_servicio_id ( nombre )")
    .eq("cotizacion_id", cotizacionId);
  return {
    zona,
    conceptos: (conceptos || [])
      .filter((c: any) => c.producto_servicio_id)
      .map((c: any) => ({
        productoId: c.producto_servicio_id,
        productoNombre: c.productos_servicios?.nombre || c.descripcion || "",
        descripcion: c.descripcion || "",
        cantidad: Number(c.cantidad || 0),
        unidad: c.unidad || "",
      })),
  };
}

/** Sube una foto del servicio (bucket público del catálogo, carpeta de solicitudes). */
export async function subirFotoSolicitud(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdmin();
  const archivo = formData.get("archivo") as File | null;
  if (!archivo || archivo.size === 0) return { ok: false, error: "No se recibió la foto." };
  if (archivo.size > 12 * 1024 * 1024) return { ok: false, error: "La foto supera 12 MB." };
  const ext = ((archivo.name || "").match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] || "jpg").toLowerCase();
  const ruta = `solicitudes/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const sb = supabaseServidor();
  const { data, error } = await sb.storage
    .from("expedientes-fotos")
    .upload(ruta, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type || "image/jpeg" });
  if (error || !data) return { ok: false, error: error?.message || "No se pudo subir la foto." };
  return { ok: true, url: sb.storage.from("expedientes-fotos").getPublicUrl(data.path).data.publicUrl };
}

/** Crea la solicitud y la manda: urgente → a todos; cascada → al primero de la lista. */
export async function crearSolicitudProveedor(datos: {
  cotizacionId?: string | null;
  ordenTrabajoId?: string | null;
  productoId: string;
  descripcion: string;
  cantidad: number | null;
  zona: string;
  fotos: { url: string; titulo: string }[];
  fechasSugeridas: string;
  modo: "cascada" | "urgente";
  horasRespuesta: number;
  /** Proveedores en el orden de la cascada. */
  proveedorIds: string[];
  notasInternas?: string;
}): Promise<{ ok: boolean; solicitud?: SolicitudProveedor; error?: string }> {
  try {
    await requireAdmin();
    if (!datos.productoId) return { ok: false, error: "Selecciona el producto o servicio." };
    if (!datos.proveedorIds.length) return { ok: false, error: "Selecciona al menos un proveedor." };
    if (/\b(\d{10}|\d{3}[\s-]\d{3}[\s-]\d{4})\b/.test(`${datos.descripcion} ${datos.zona}`)) {
      return { ok: false, error: "Quita teléfonos de la descripción o la zona: el proveedor no debe recibir datos de contacto del cliente." };
    }
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    let expedienteId: string | null = null;
    let ordenTrabajoId = datos.ordenTrabajoId || null;
    if (datos.cotizacionId) {
      const { data: cot } = await sb.from("cotizaciones").select("expediente_id").eq("id", datos.cotizacionId).maybeSingle();
      expedienteId = cot?.expediente_id || null;
      if (!ordenTrabajoId) {
        const { data: ots } = await sb.from("ordenes_trabajo").select("id").eq("cotizacion_id", datos.cotizacionId).limit(2);
        if (ots && ots.length === 1) ordenTrabajoId = ots[0].id;
      }
    }

    const { data: ofertas } = await sb
      .from("proveedor_productos")
      .select("proveedor_id, costo_unitario, costos_volumen, tarifas_capacidad, cantidad_minima, monto_minimo")
      .eq("producto_id", datos.productoId)
      .in("proveedor_id", datos.proveedorIds);
    const porProveedor = new Map((ofertas || []).map((o: any) => [o.proveedor_id, o]));

    const folio = await siguienteFolioSolicitud(sb);
    const { data: sol, error } = await sb
      .from("solicitudes_proveedor")
      .insert({
        folio,
        cotizacion_id: datos.cotizacionId || null,
        expediente_id: expedienteId,
        orden_trabajo_id: ordenTrabajoId,
        producto_id: datos.productoId,
        descripcion: (datos.descripcion || "").trim().slice(0, 4000),
        cantidad: datos.cantidad && datos.cantidad > 0 ? datos.cantidad : null,
        unidad: await unidadDeProducto(sb, datos.productoId),
        zona: (datos.zona || "").trim().slice(0, 300),
        fotos: (datos.fotos || []).filter((f) => f?.url).slice(0, 15),
        fechas_sugeridas: (datos.fechasSugeridas || "").trim().slice(0, 500),
        modo: datos.modo === "urgente" ? "urgente" : "cascada",
        horas_respuesta: Math.min(72, Math.max(0.25, Number(datos.horasRespuesta) || 4)),
        notas_internas: (datos.notasInternas || "").trim(),
        creado_por: usuario?.id || null,
      })
      .select("id")
      .single();
    if (error || !sol) return { ok: false, error: error?.message || "No se pudo crear la solicitud." };

    const filas = datos.proveedorIds.map((pid, i) => ({
      solicitud_id: sol.id,
      proveedor_id: pid,
      orden: i,
      costo_referencia: porProveedor.has(pid) ? costoReferenciaOferta(porProveedor.get(pid), datos.cantidad) : null,
    }));
    const { error: errEnv } = await sb.from("solicitudes_proveedor_envios").insert(filas);
    if (errEnv) return { ok: false, error: errEnv.message };

    await iniciarSolicitud(sb, sol.id);
    revalidatePath("/cotizaciones");
    return { ok: true, solicitud: (await obtenerSolicitud(sol.id)) || undefined };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo crear la solicitud." };
  }
}

async function obtenerSolicitud(id: string): Promise<SolicitudProveedor | null> {
  const sb = supabaseServidor();
  const { data } = await sb.from("solicitudes_proveedor").select(SELECT_SOLICITUD).eq("id", id).maybeSingle();
  return data ? aSolicitud(data) : null;
}

/** Solicitudes de una cotización (las pone al día antes de mostrarlas). */
export async function listarSolicitudesCotizacion(cotizacionId: string): Promise<SolicitudProveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: abiertas } = await sb
    .from("solicitudes_proveedor")
    .select("id")
    .eq("cotizacion_id", cotizacionId)
    .eq("estado", "abierta");
  for (const s of abiertas || []) await avanzarSolicitud(sb, s.id);
  const { data } = await sb
    .from("solicitudes_proveedor")
    .select(SELECT_SOLICITUD)
    .eq("cotizacion_id", cotizacionId)
    .order("created_at", { ascending: false });
  return (data || []).map(aSolicitud);
}

/**
 * El cliente eligió fecha: la solicitud queda confirmada, se avisa al proveedor por Telegram y
 * la orden de trabajo queda lista con proveedor, costo, servicio, cantidad y fecha. Si la
 * cotización aún no tiene orden de trabajo, se crea.
 */
export async function confirmarSolicitudProveedor(
  solicitudId: string,
  fechaAcordada: string
): Promise<{ ok: boolean; mensaje?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!fechaAcordada.trim()) return { ok: false, error: "Indica la fecha que eligió el cliente." };
    const sb = supabaseServidor();
    const { data: sol } = await sb
      .from("solicitudes_proveedor")
      .select(
        "id, folio, estado, cotizacion_id, orden_trabajo_id, proveedor_asignado_id, costo_acordado, producto_id, cantidad, productos_servicios:producto_id ( nombre )"
      )
      .eq("id", solicitudId)
      .maybeSingle();
    if (!sol) return { ok: false, error: "Solicitud no encontrada." };
    if (sol.estado !== "asignada") return { ok: false, error: "Solo se confirma una solicitud que un proveedor ya aceptó." };

    const fecha = fechaAcordada.trim();
    const producto = (sol as any).productos_servicios?.nombre || "Servicio";
    const { error } = await sb
      .from("solicitudes_proveedor")
      .update({ estado: "confirmada", fecha_acordada: fecha, updated_at: new Date().toISOString() })
      .eq("id", solicitudId);
    if (error) return { ok: false, error: error.message };

    // Fecha programada exacta si la opción vino de Telegram (código día + franja).
    const { data: aceptado } = await sb
      .from("solicitudes_proveedor_envios")
      .select("fechas_propuestas, tg_opciones")
      .eq("solicitud_id", solicitudId)
      .eq("estado", "aceptada")
      .maybeSingle();
    const { fechaProgramadaDeOpcion, avisarConfirmacionProveedor } = await import("@/lib/solicitudes-telegram");
    const idx = Array.isArray(aceptado?.fechas_propuestas) ? aceptado!.fechas_propuestas.map(String).indexOf(fecha) : -1;
    const codigo = idx >= 0 && Array.isArray(aceptado?.tg_opciones) ? String(aceptado!.tg_opciones[idx] || "") : "";
    const fechaProgramada = fechaProgramadaDeOpcion(codigo);

    const datosOT = {
      proveedor_id: sol.proveedor_asignado_id,
      costo_proveedor: sol.costo_acordado,
      proveedor_concepto: `${producto} · ${sol.folio} · ${fecha}`,
      producto_id: sol.producto_id,
      cantidad_servicio: sol.cantidad,
      ...(fechaProgramada ? { fecha_programada: fechaProgramada } : {}),
      updated_at: new Date().toISOString(),
    };

    let mensaje = "Solicitud confirmada.";
    let ordenFolio: string | null = null;
    let ordenId = sol.orden_trabajo_id as string | null;
    if (ordenId) {
      const cerrada = (await ordenesCerradas(sb, [ordenId])).get(ordenId);
      if (!cerrada) {
        await sb.from("ordenes_trabajo").update(datosOT).eq("id", ordenId);
        mensaje = "Solicitud confirmada y orden de trabajo actualizada con el proveedor, su costo y la fecha.";
      }
    } else if (sol.cotizacion_id) {
      const { crearOrdenTrabajo } = await import("@/app/actions/ordenes-trabajo");
      const ot = await crearOrdenTrabajo({
        cotizacionId: sol.cotizacion_id,
        titulo: `${producto} — ${fecha}`,
        fechaProgramada: fechaProgramada || undefined,
        proveedorId: sol.proveedor_asignado_id,
        costoProveedor: sol.costo_acordado === null ? null : Number(sol.costo_acordado),
        proveedorConcepto: datosOT.proveedor_concepto,
      });
      if (ot.ok && ot.id) {
        ordenId = ot.id;
        await sb.from("ordenes_trabajo").update({ producto_id: sol.producto_id, cantidad_servicio: sol.cantidad }).eq("id", ot.id);
        await sb.from("solicitudes_proveedor").update({ orden_trabajo_id: ot.id }).eq("id", solicitudId);
        mensaje = `Solicitud confirmada y orden de trabajo ${ot.folio} creada con el proveedor, su costo y la fecha.`;
      } else {
        mensaje = `Solicitud confirmada, pero no se pudo crear la orden de trabajo: ${ot.error || "error desconocido"}.`;
      }
    }
    if (ordenId) {
      const { data: otFolio } = await sb.from("ordenes_trabajo").select("folio").eq("id", ordenId).maybeSingle();
      ordenFolio = otFolio?.folio || null;
    }

    if (sol.proveedor_asignado_id) {
      await avisarConfirmacionProveedor(sb, {
        proveedorId: sol.proveedor_asignado_id,
        folio: sol.folio,
        producto,
        fecha,
        ordenFolio,
      });
    }
    revalidatePath("/ordenes-trabajo");
    return { ok: true, mensaje };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo confirmar." };
  }
}

/** Manda al cliente, por su conversación, las opciones de fecha que propuso el proveedor. */
export async function ofrecerOpcionesSolicitudCliente(
  solicitudId: string,
  telefono: string
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: sol } = await sb
    .from("solicitudes_proveedor")
    .select("id, estado, productos_servicios:producto_id ( nombre )")
    .eq("id", solicitudId)
    .maybeSingle();
  if (!sol || sol.estado !== "asignada") return { ok: false, error: "La solicitud aún no tiene un proveedor que la haya aceptado." };
  const { data: aceptado } = await sb
    .from("solicitudes_proveedor_envios")
    .select("fechas_propuestas")
    .eq("solicitud_id", solicitudId)
    .eq("estado", "aceptada")
    .maybeSingle();
  const opciones: string[] = Array.isArray(aceptado?.fechas_propuestas) ? aceptado!.fechas_propuestas.map(String) : [];
  if (opciones.length === 0) return { ok: false, error: "El proveedor no propuso fechas." };

  const producto = (sol as any).productos_servicios?.nombre || "tu servicio";
  const texto =
    `¡Listo! Ya tenemos disponibilidad para *${producto}*. Estas son las opciones:\n\n` +
    opciones.map((o, i) => `${i + 1}. ${o}`).join("\n") +
    `\n\n¿Cuál te acomoda? Responde con el número.`;
  const { responderConversacion } = await import("@/app/actions/conversaciones");
  const r = await responderConversacion(telefono, texto);
  if (!r.ok) return { ok: false, error: r.error || "No se pudo enviar al cliente." };
  await sb
    .from("solicitudes_proveedor")
    .update({ opciones_ofrecidas_at: new Date().toISOString() })
    .eq("id", solicitudId);
  return { ok: true };
}

/** Cotizaciones aceptadas de la conversación (para coordinar su instalación) y sus solicitudes. */
export async function coordinacionConversacion(
  prospectoId: string | null,
  expedienteId: string | null
): Promise<{ cotizaciones: { id: string; titulo: string; estatus: string }[]; solicitudes: SolicitudProveedor[] }> {
  await requireAdmin();
  if (!prospectoId && !expedienteId) return { cotizaciones: [], solicitudes: [] };
  const sb = supabaseServidor();
  let q = sb.from("cotizaciones").select("id, servicio_tipo, estatus, precio_final, created_at").in("estatus", ["aceptada", "instalacion"]);
  q = prospectoId && expedienteId
    ? q.or(`prospecto_id.eq.${prospectoId},expediente_id.eq.${expedienteId}`)
    : prospectoId
    ? q.eq("prospecto_id", prospectoId)
    : q.eq("expediente_id", expedienteId!);
  const { data: cots } = await q.order("created_at", { ascending: false }).limit(5);
  const ids = (cots || []).map((c: any) => c.id);
  // También las solicitudes directas (Coordinar Servicio), que cuelgan del expediente sin cotización.
  const filtro = [ids.length ? `cotizacion_id.in.(${ids.join(",")})` : "", expedienteId ? `expediente_id.eq.${expedienteId}` : ""]
    .filter(Boolean)
    .join(",");
  if (!filtro) return { cotizaciones: [], solicitudes: [] };

  const { data: abiertas } = await sb.from("solicitudes_proveedor").select("id").or(filtro).eq("estado", "abierta");
  for (const a of abiertas || []) await avanzarSolicitud(sb, a.id);
  const { data } = await sb
    .from("solicitudes_proveedor")
    .select(SELECT_SOLICITUD)
    .or(filtro)
    .neq("estado", "cancelada")
    .order("created_at", { ascending: false });
  return {
    cotizaciones: (cots || []).map((c: any) => ({
      id: c.id,
      titulo: `${c.id} · ${Number(c.precio_final || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}`,
      estatus: c.estatus,
    })),
    solicitudes: (data || []).map(aSolicitud),
  };
}

/** Cancela la solicitud y retira los envíos pendientes. */
export async function cancelarSolicitudProveedor(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const ahora = new Date().toISOString();
  const { error } = await sb
    .from("solicitudes_proveedor")
    .update({ estado: "cancelada", updated_at: ahora })
    .eq("id", solicitudId)
    .in("estado", ["abierta", "asignada", "sin_proveedor"]);
  if (error) return { ok: false, error: error.message };
  await sb
    .from("solicitudes_proveedor_envios")
    .update({ estado: "cancelada", updated_at: ahora })
    .eq("solicitud_id", solicitudId)
    .in("estado", ["en_espera", "enviada", "vista"]);
  return { ok: true };
}
