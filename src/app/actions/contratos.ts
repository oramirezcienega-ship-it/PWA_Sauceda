"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import {
  mapearTipoServicio,
  type ContratoRegistro,
  type DatosContrato,
  type EstadoContrato,
  type OverridesContrato,
  type PartidaContrato,
  type TipoServicioContrato,
} from "@/lib/contratos";

// ------------------------------------------------------------
// Utilidades internas
// ------------------------------------------------------------

const redondear = (n: number) => Math.round((n || 0) * 100) / 100;

function aRegistro(r: any): ContratoRegistro {
  return {
    id: r.id,
    folio: r.folio,
    version: r.version,
    ordenTrabajoId: r.orden_trabajo_id,
    cotizacionId: r.cotizacion_id,
    tipoServicio: r.tipo_servicio,
    estado: r.estado,
    fechaGeneracion: r.fecha_generacion,
    fechaFirma: r.fecha_firma,
    pdfFirmadoUrl: r.pdf_firmado_url,
  };
}

/** Plantillas del tipo indicado con respaldo en "general". */
async function cargarPlantillas(sb: any, tipo: TipoServicioContrato): Promise<Record<string, string>> {
  const { data } = await sb
    .from("plantillas_clausulas")
    .select("tipo_servicio, clave, texto")
    .in("tipo_servicio", [tipo, "general"]);

  const mapa: Record<string, string> = {};
  // Primero general, luego el tipo específico (que lo sobrescribe)
  for (const r of (data || []).filter((x: any) => x.tipo_servicio === "general")) mapa[r.clave] = r.texto;
  for (const r of (data || []).filter((x: any) => x.tipo_servicio === tipo)) mapa[r.clave] = r.texto;
  return mapa;
}

async function generarFolioContrato(sb: any): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = `CTR-${anio}-`;
  const { data } = await sb
    .from("contratos")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);
  let siguiente = 1;
  if (data && data.length > 0 && data[0]?.folio) {
    const n = parseInt(String(data[0].folio).replace(prefijo, ""), 10);
    if (!isNaN(n)) siguiente = n + 1;
  }
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/**
 * Arma los datos del contrato a partir de la OT, la cotización y el cliente,
 * con los valores por defecto de la configuración. Sin folio ni versión.
 */
async function armarDatosBase(sb: any, ordenId: string): Promise<{
  ok: boolean;
  error?: string;
  datos?: Omit<DatosContrato, "folio" | "version" | "fechaGeneracion">;
  cotizacionId?: string | null;
  clienteId?: string | null;
}> {
  const { data: ot } = await sb
    .from("ordenes_trabajo")
    .select("id, folio, titulo, descripcion, tipo_negocio, cotizacion_id, prospecto_id, fecha_programada, fotos_evidencia")
    .eq("id", ordenId)
    .maybeSingle();
  if (!ot) return { ok: false, error: "Orden de trabajo no encontrada." };
  if (!ot.cotizacion_id) {
    return { ok: false, error: "La orden de trabajo no está ligada a una cotización; el contrato requiere una cotización aceptada." };
  }

  const { data: cot } = await sb.from("cotizaciones").select("*").eq("id", ot.cotizacion_id).maybeSingle();
  if (!cot) return { ok: false, error: "No se encontró la cotización de la orden de trabajo." };

  const clienteId = ot.prospecto_id || cot.prospecto_id || null;
  const { data: pros } = clienteId
    ? await sb.from("prospectos").select("id, nombre, telefono, correo, direccion").eq("id", clienteId).maybeSingle()
    : { data: null };

  const { data: conceptos } = await sb
    .from("cotizacion_conceptos")
    .select("descripcion, cantidad, unidad, precio_unitario, importe")
    .eq("cotizacion_id", cot.id)
    .order("created_at", { ascending: true });

  const partidas: PartidaContrato[] = (conceptos || []).map((c: any) => ({
    descripcion: c.descripcion,
    cantidad: Number(c.cantidad || 0),
    unidad: c.unidad || "",
    precioUnitario: Number(c.precio_unitario || 0),
    importe: Number(c.importe || 0),
  }));

  const precioFinal = Number(cot.precio_final || 0);
  const subtotalPartidas = redondear(partidas.reduce((a, p) => a + p.importe, 0));
  const total = precioFinal > 0 ? precioFinal : subtotalPartidas;
  if (partidas.length === 0 && total > 0) {
    partidas.push({ descripcion: ot.titulo || "Servicios según cotización", cantidad: 1, unidad: "lote", precioUnitario: total, importe: total });
  }

  const tipoServicio = mapearTipoServicio(cot.servicio_tipo, ot.tipo_negocio, ot.titulo);
  const pl = await cargarPlantillas(sb, tipoServicio);

  const anticipoPct = Number(pl["anticipo_pct_default"] || 50);
  const anticipoMonto = redondear((total * anticipoPct) / 100);

  const alcanceDefault =
    (ot.descripcion && String(ot.descripcion).trim()) ||
    (partidas.length > 0
      ? partidas.map((p) => `${p.descripcion} (${p.cantidad} ${p.unidad})`).join("; ")
      : ot.titulo || "");

  const fotos = (Array.isArray(ot.fotos_evidencia) ? ot.fotos_evidencia : [])
    .filter((f: any) => f?.etapa === "inicio" && f?.url)
    .map((f: any) => ({ url: f.url, descripcion: f.descripcion || "", fecha: f.fecha || "" }));

  return {
    ok: true,
    cotizacionId: cot.id,
    clienteId,
    datos: {
      ordenFolio: ot.folio,
      cotizacionFolio: cot.id,
      cotizacionFecha: cot.created_at,
      tipoServicio,
      prestador: {
        razonSocial: pl["prestador_razon_social"] || "SAUCEDA",
        rfc: pl["prestador_rfc"] || "",
        domicilio: pl["prestador_domicilio"] || "",
      },
      cliente: {
        nombre: (cot.cliente_nombre_personalizado as string) || pros?.nombre || "",
        domicilio: pros?.direccion || "",
        telefono: pros?.telefono || "",
        correo: pros?.correo || "",
      },
      domicilioObra: pros?.direccion || "",
      alcanceTecnico: alcanceDefault,
      exclusiones: pl["exclusiones"] || "",
      partidas,
      subtotal: subtotalPartidas || total,
      total,
      leyendaIva: "(precio final acordado; si el Cliente requiere factura se agrega el IVA correspondiente)",
      anticipoPct,
      anticipoMonto,
      finiquitoMonto: redondear(total - anticipoMonto),
      formaPago: (cot.condiciones_pago as string) || "Transferencia, efectivo o tarjeta",
      fechaInicio: ot.fecha_programada || "",
      duracionDias: Number(pl["duracion_dias_default"] || 5),
      garantiaTexto: (cot.garantia as string) || pl["garantia_default"] || "1 año",
      garantiaObjeto: pl["garantia_objeto"] || "",
      garantiaExclusiones: pl["garantia_exclusiones"] || "",
      clausulaClima: pl["clausula_clima"] || "",
      fotos,
    },
  };
}

/** Valida los campos obligatorios; regresa la lista de faltantes. */
function validar(d: Omit<DatosContrato, "folio" | "version" | "fechaGeneracion">): string[] {
  const f: string[] = [];
  if (!d.cliente.nombre.trim()) f.push("nombre del cliente");
  if (!d.domicilioObra.trim()) f.push("domicilio de la obra");
  if (!d.alcanceTecnico.trim()) f.push("alcance técnico");
  if (!(d.total > 0)) f.push("total de la cotización (mayor a cero)");
  if (!(d.anticipoPct >= 0 && d.anticipoPct <= 100)) f.push("% de anticipo (0 a 100)");
  if (!(d.duracionDias > 0)) f.push("duración estimada en días hábiles");
  if (!d.fechaInicio) f.push("fecha estimada de inicio");
  if (!d.garantiaTexto.trim()) f.push("garantía");
  return f;
}

// ------------------------------------------------------------
// Consultas
// ------------------------------------------------------------

/** Datos precargados para el modal "Revisar datos del contrato". */
export async function obtenerDatosPrecargadosContrato(ordenId: string): Promise<{
  ok: boolean;
  error?: string;
  datos?: Omit<DatosContrato, "folio" | "version" | "fechaGeneracion">;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const r = await armarDatosBase(sb, ordenId);
    return r.ok ? { ok: true, datos: r.datos } : { ok: false, error: r.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar los datos del contrato." };
  }
}

/**
 * Datos para EDITAR el contrato vigente: parte de lo que ya se capturó
 * (snapshot), no de los valores por defecto de la cotización. Si no hay
 * contrato vigente, cae a los datos precargados.
 */
export async function obtenerDatosEdicionContrato(ordenId: string): Promise<{
  ok: boolean;
  error?: string;
  datos?: Omit<DatosContrato, "folio" | "version" | "fechaGeneracion">;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: vigente } = await sb
      .from("contratos")
      .select("datos_snapshot")
      .eq("orden_trabajo_id", ordenId)
      .neq("estado", "cancelado")
      .maybeSingle();
    if (vigente?.datos_snapshot) {
      return { ok: true, datos: vigente.datos_snapshot as DatosContrato };
    }
    const r = await armarDatosBase(sb, ordenId);
    return r.ok ? { ok: true, datos: r.datos } : { ok: false, error: r.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al preparar los datos del contrato." };
  }
}

/** Contratos de una OT (el vigente primero, luego versiones anteriores). */
export async function listarContratosOT(ordenId: string): Promise<ContratoRegistro[]> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data } = await sb
      .from("contratos")
      .select("id, folio, version, orden_trabajo_id, cotizacion_id, tipo_servicio, estado, fecha_generacion, fecha_firma, pdf_firmado_url")
      .eq("orden_trabajo_id", ordenId)
      .order("version", { ascending: false });
    return (data || []).map(aRegistro);
  } catch {
    return [];
  }
}

/** Contrato con su snapshot, para la vista imprimible. */
export async function obtenerContrato(
  contratoId: string
): Promise<{ registro: ContratoRegistro; datos: DatosContrato } | null> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data } = await sb.from("contratos").select("*").eq("id", contratoId).maybeSingle();
    if (!data) return null;
    return { registro: aRegistro(data), datos: data.datos_snapshot as DatosContrato };
  } catch {
    return null;
  }
}

/** ¿La OT tiene un contrato vigente firmado? (`aplica` = la OT requiere contrato). */
export async function estadoContratoDeOrden(ordenId: string): Promise<{
  aplica: boolean;
  firmado: boolean;
  estado: EstadoContrato | null;
}> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: ot } = await sb.from("ordenes_trabajo").select("cotizacion_id").eq("id", ordenId).maybeSingle();
  const aplica = Boolean(ot?.cotizacion_id);
  const { data: c } = await sb
    .from("contratos")
    .select("estado")
    .eq("orden_trabajo_id", ordenId)
    .neq("estado", "cancelado")
    .maybeSingle();
  return { aplica, firmado: c?.estado === "firmado", estado: (c?.estado as EstadoContrato) || null };
}

// ------------------------------------------------------------
// Generación / regeneración
// ------------------------------------------------------------

/**
 * Genera el contrato de una OT. Idempotente: si ya hay uno vigente y no se
 * pide `regenerar`, devuelve el existente. Al regenerar (si está firmado,
 * solo con `permitirFirmado`) se crea una nueva versión y la anterior queda "cancelado".
 */
export async function generarContrato(
  ordenId: string,
  overrides?: OverridesContrato,
  opciones?: { regenerar?: boolean; permitirFirmado?: boolean }
): Promise<{ ok: boolean; contratoId?: string; folio?: string; version?: number; yaExistia?: boolean; faltantes?: string[]; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    const { data: vigente } = await sb
      .from("contratos")
      .select("id, folio, version, estado")
      .eq("orden_trabajo_id", ordenId)
      .neq("estado", "cancelado")
      .maybeSingle();

    if (vigente && !opciones?.regenerar) {
      return { ok: true, contratoId: vigente.id, folio: vigente.folio, version: vigente.version, yaExistia: true };
    }
    if (vigente && vigente.estado === "firmado" && !opciones?.permitirFirmado) {
      return { ok: false, error: "El contrato ya está firmado; no se puede regenerar." };
    }

    const base = await armarDatosBase(sb, ordenId);
    if (!base.ok || !base.datos) return { ok: false, error: base.error };

    // Las cláusulas dependen del tipo: si cambia el tipo, se recargan sus defaults
    let datos = base.datos;
    if (overrides?.tipoServicio && overrides.tipoServicio !== datos.tipoServicio) {
      const pl = await cargarPlantillas(sb, overrides.tipoServicio);
      datos = {
        ...datos,
        tipoServicio: overrides.tipoServicio,
        exclusiones: pl["exclusiones"] || "",
        garantiaObjeto: pl["garantia_objeto"] || "",
        garantiaExclusiones: pl["garantia_exclusiones"] || "",
        clausulaClima: pl["clausula_clima"] || "",
      };
    }

    // Aplicar ajustes del usuario
    const o = overrides || {};
    datos = {
      ...datos,
      domicilioObra: o.domicilioObra ?? datos.domicilioObra,
      alcanceTecnico: o.alcanceTecnico ?? datos.alcanceTecnico,
      exclusiones: o.exclusiones ?? datos.exclusiones,
      leyendaIva: o.leyendaIva ?? datos.leyendaIva,
      anticipoPct: o.anticipoPct ?? datos.anticipoPct,
      formaPago: o.formaPago ?? datos.formaPago,
      fechaInicio: o.fechaInicio ?? datos.fechaInicio,
      duracionDias: o.duracionDias ?? datos.duracionDias,
      garantiaTexto: o.garantiaTexto ?? datos.garantiaTexto,
      garantiaObjeto: o.garantiaObjeto ?? datos.garantiaObjeto,
      garantiaExclusiones: o.garantiaExclusiones ?? datos.garantiaExclusiones,
      clausulaClima: o.clausulaClima ?? datos.clausulaClima,
    };
    datos.anticipoMonto = redondear((datos.total * datos.anticipoPct) / 100);
    datos.finiquitoMonto = redondear(datos.total - datos.anticipoMonto);

    const faltantes = validar(datos);
    if (faltantes.length > 0) {
      return { ok: false, faltantes, error: `Faltan datos obligatorios: ${faltantes.join(", ")}.` };
    }

    // Folio: se conserva al regenerar; nuevo consecutivo si es el primero
    let folio: string;
    let version = 1;
    if (vigente) {
      folio = vigente.folio;
      version = vigente.version + 1;
      await sb
        .from("contratos")
        .update({ estado: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", vigente.id);
    } else {
      // Si hubo contratos cancelados previos de esta OT, se conserva su folio
      const { data: previo } = await sb
        .from("contratos")
        .select("folio, version")
        .eq("orden_trabajo_id", ordenId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previo) {
        folio = previo.folio;
        version = previo.version + 1;
      } else {
        folio = await generarFolioContrato(sb);
      }
    }

    const snapshot: DatosContrato = {
      ...datos,
      folio,
      version,
      fechaGeneracion: new Date().toISOString(),
    };

    const { data: nuevo, error } = await sb
      .from("contratos")
      .insert({
        folio,
        version,
        orden_trabajo_id: ordenId,
        cotizacion_id: base.cotizacionId,
        cliente_id: base.clienteId,
        tipo_servicio: datos.tipoServicio,
        estado: "generado",
        datos_snapshot: snapshot,
        generado_por: usuario?.id || null,
      })
      .select("id")
      .single();

    if (error || !nuevo) {
      // Restaurar la versión anterior si ya se había cancelado para reemplazarla
      if (vigente) {
        await sb.from("contratos").update({ estado: vigente.estado }).eq("id", vigente.id);
      }
      return { ok: false, error: error?.message || "No se pudo guardar el contrato." };
    }

    revalidatePath(`/ordenes-trabajo/${ordenId}`);
    return { ok: true, contratoId: nuevo.id, folio, version };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al generar el contrato." };
  }
}

// ------------------------------------------------------------
// Firma
// ------------------------------------------------------------

/**
 * Marca el contrato como firmado y, opcionalmente, guarda la foto o escaneo
 * del documento firmado en el bucket privado "contratos".
 * FormData: contratoId, fechaFirma (AAAA-MM-DD), archivo (opcional).
 */
export async function marcarContratoFirmado(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const contratoId = String(formData.get("contratoId") || "");
    const fechaFirma = String(formData.get("fechaFirma") || "");
    const archivo = formData.get("archivo");
    if (!contratoId || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFirma)) {
      return { ok: false, error: "Indica la fecha de firma." };
    }

    const { data: c } = await sb
      .from("contratos")
      .select("id, orden_trabajo_id, estado")
      .eq("id", contratoId)
      .maybeSingle();
    if (!c) return { ok: false, error: "Contrato no encontrado." };
    if (c.estado === "cancelado") return { ok: false, error: "Este contrato fue cancelado (hay una versión más reciente)." };

    let ruta: string | null = null;
    if (archivo instanceof File && archivo.size > 0) {
      if (archivo.size > 15 * 1024 * 1024) return { ok: false, error: "El archivo excede 15 MB." };
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      ruta = `${c.orden_trabajo_id}/firmado-${contratoId}-${Date.now()}.${ext}`;
      const buffer = Buffer.from(await archivo.arrayBuffer());
      const { error: errUp } = await sb.storage
        .from("contratos")
        .upload(ruta, buffer, { contentType: archivo.type || "application/octet-stream", upsert: true });
      if (errUp) return { ok: false, error: `No se pudo subir el archivo: ${errUp.message}` };
    }

    const cambios: Record<string, any> = {
      estado: "firmado",
      fecha_firma: fechaFirma,
      updated_at: new Date().toISOString(),
    };
    if (ruta) cambios.pdf_firmado_url = ruta;

    const { error } = await sb.from("contratos").update(cambios).eq("id", contratoId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/ordenes-trabajo/${c.orden_trabajo_id}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al marcar el contrato como firmado." };
  }
}

/** URL firmada (temporal) del contrato firmado subido a Storage. */
export async function urlContratoFirmado(contratoId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: c } = await sb.from("contratos").select("pdf_firmado_url").eq("id", contratoId).maybeSingle();
    if (!c?.pdf_firmado_url) return { ok: false, error: "No hay archivo firmado cargado." };
    const { data, error } = await sb.storage.from("contratos").createSignedUrl(c.pdf_firmado_url, 60 * 10);
    if (error || !data) return { ok: false, error: error?.message || "No se pudo generar la URL." };
    return { ok: true, url: data.signedUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al obtener el archivo." };
  }
}

// ------------------------------------------------------------
// Configuración de cláusulas (editable sin desplegar)
// ------------------------------------------------------------

export async function listarPlantillasClausulas(): Promise<
  { tipoServicio: string; clave: string; texto: string }[]
> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data } = await sb
      .from("plantillas_clausulas")
      .select("tipo_servicio, clave, texto")
      .order("tipo_servicio", { ascending: true })
      .order("clave", { ascending: true });
    return (data || []).map((r: any) => ({ tipoServicio: r.tipo_servicio, clave: r.clave, texto: r.texto }));
  } catch {
    return [];
  }
}

export async function guardarPlantillaClausula(
  tipoServicio: string,
  clave: string,
  texto: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { error } = await sb
      .from("plantillas_clausulas")
      .upsert(
        { tipo_servicio: tipoServicio, clave, texto, updated_at: new Date().toISOString() },
        { onConflict: "tipo_servicio,clave" }
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al guardar." };
  }
}

/** Valores por defecto de cláusulas para un tipo de servicio (al cambiar el tipo en el modal). */
export async function obtenerDefaultsTipoServicio(tipo: TipoServicioContrato): Promise<{
  exclusiones: string;
  garantiaObjeto: string;
  garantiaExclusiones: string;
  clausulaClima: string;
  garantiaTexto: string;
}> {
  await requireAdmin();
  const sb = supabaseServidor();
  const pl = await cargarPlantillas(sb, tipo);
  return {
    exclusiones: pl["exclusiones"] || "",
    garantiaObjeto: pl["garantia_objeto"] || "",
    garantiaExclusiones: pl["garantia_exclusiones"] || "",
    clausulaClima: pl["clausula_clima"] || "",
    garantiaTexto: pl["garantia_default"] || "1 año",
  };
}
