"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import {
  aProveedor,
  aFilaProveedor,
  aDocumentoProveedor,
  aFilaDocumentoProveedor,
  type FilaProveedor,
  type FilaDocumentoProveedor,
} from "@/lib/supabase/mapeo";
import { registrarActividad } from "@/lib/actividades";
import type { DatosProveedor, Proveedor, DatosDocumentoProveedor, DocumentoProveedor } from "@/lib/types";

export interface FiltrosProveedores {
  search?: string;
  categoria?: string;
  soloActivos?: boolean;
}

/** Genera el folio interno consecutivo anual del documento de proveedor: REM-PROV-2026-0001 / FACT-PROV-2026-0001. */
async function generarFolioDocumentoProveedor(
  sb: ReturnType<typeof supabaseServidor>,
  tipo: "remision" | "factura"
): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = tipo === "factura" ? `FACT-PROV-${anio}-` : `REM-PROV-${anio}-`;

  const { data } = await sb
    .from("documentos_proveedores")
    .select("folio")
    .ilike("folio", `${prefijo}%`)
    .order("folio", { ascending: false })
    .limit(1);

  let siguienteNum = 1;
  if (data && data.length > 0 && data[0]?.folio) {
    const ultimo = data[0].folio.replace(prefijo, "");
    const parsed = parseInt(ultimo, 10);
    if (!isNaN(parsed)) siguienteNum = parsed + 1;
  }

  return `${prefijo}${String(siguienteNum).padStart(4, "0")}`;
}

/** Lista proveedores con métricas de documentos/monto acumulado. */
export async function listarProveedores(filtros?: FiltrosProveedores): Promise<Proveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  let query = sb.from("proveedores").select("*").order("nombre", { ascending: true });

  if (filtros?.categoria && filtros.categoria !== "todas") {
    query = query.eq("categoria", filtros.categoria);
  }
  if (filtros?.soloActivos) {
    query = query.eq("activo", true);
  }
  if (filtros?.search && filtros.search.trim()) {
    query = query.ilike("nombre", `%${filtros.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("Aviso al consultar proveedores:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const proveedorIds = data.map((p) => p.id);

  let metricasPorProveedor: Record<string, { totalDocumentos: number; montoTotal: number }> = {};
  try {
    const { data: docsData } = await sb
      .from("documentos_proveedores")
      .select("proveedor_id, monto")
      .in("proveedor_id", proveedorIds);

    if (docsData) {
      docsData.forEach((d) => {
        const actual = metricasPorProveedor[d.proveedor_id] || { totalDocumentos: 0, montoTotal: 0 };
        metricasPorProveedor[d.proveedor_id] = {
          totalDocumentos: actual.totalDocumentos + 1,
          montoTotal: actual.montoTotal + (Number(d.monto) || 0),
        };
      });
    }
  } catch (e) {
    console.warn("No se pudieron calcular métricas de documentos de proveedores:", e);
  }

  return (data as FilaProveedor[]).map((f) => aProveedor(f, metricasPorProveedor[f.id]));
}

/** Lista mínima de proveedores activos para selects. */
export async function listarProveedoresMin(): Promise<{ id: string; nombre: string }[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  try {
    const { data, error } = await sb
      .from("proveedores")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** Obtiene el detalle de un proveedor con sus documentos (facturas/remisiones) registrados. */
export async function obtenerProveedor(
  id: string
): Promise<{ proveedor: Proveedor; documentos: DocumentoProveedor[] } | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: proveedorData, error: errProveedor } = await sb
    .from("proveedores")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errProveedor || !proveedorData) return null;

  let documentos: DocumentoProveedor[] = [];
  try {
    const { data: docsData } = await sb
      .from("documentos_proveedores")
      .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
      .eq("proveedor_id", id)
      .order("fecha", { ascending: false });

    if (docsData) {
      documentos = (docsData as FilaDocumentoProveedor[]).map(aDocumentoProveedor);
    }
  } catch (e) {
    console.warn("No se pudieron cargar los documentos del proveedor:", e);
  }

  const montoTotal = documentos.reduce((acc, d) => acc + d.monto, 0);

  const proveedor = aProveedor(proveedorData as FilaProveedor, {
    totalDocumentos: documentos.length,
    montoTotal,
  });

  return { proveedor, documentos };
}

/** Crea un nuevo proveedor. */
export async function crearProveedor(datos: DatosProveedor): Promise<Proveedor> {
  await requireAdmin();
  if (!datos.nombre || !datos.nombre.trim()) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  const sb = supabaseServidor();
  const fila = aFilaProveedor(datos);

  const { data, error } = await sb.from("proveedores").insert(fila).select("*").single();
  if (error) {
    throw new Error(`Error al crear proveedor: ${error.message}`);
  }

  return aProveedor(data as FilaProveedor);
}

/** Actualiza los datos de un proveedor existente. */
export async function actualizarProveedor(id: string, datos: Partial<DatosProveedor>): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const camposActualizar: Record<string, any> = {};
  if (datos.nombre !== undefined) camposActualizar.nombre = datos.nombre.trim();
  if (datos.razonSocial !== undefined) camposActualizar.razon_social = datos.razonSocial.trim();
  if (datos.rfc !== undefined) camposActualizar.rfc = datos.rfc.trim();
  if (datos.categoria !== undefined) camposActualizar.categoria = datos.categoria.trim();
  if (datos.contactoNombre !== undefined) camposActualizar.contacto_nombre = datos.contactoNombre.trim();
  if (datos.telefono !== undefined) camposActualizar.telefono = datos.telefono.trim();
  if (datos.email !== undefined) camposActualizar.email = datos.email.trim();
  if (datos.direccion !== undefined) camposActualizar.direccion = datos.direccion.trim();
  if (datos.notas !== undefined) camposActualizar.notas = datos.notas.trim();
  if (datos.activo !== undefined) camposActualizar.activo = datos.activo;

  const { error } = await sb.from("proveedores").update(camposActualizar).eq("id", id);
  if (error) {
    throw new Error(`Error al actualizar proveedor: ${error.message}`);
  }
}

/** Elimina un proveedor y (por cascada) sus documentos asociados. */
export async function eliminarProveedor(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("proveedores").delete().eq("id", id);
  if (error) {
    throw new Error(`Error al eliminar proveedor: ${error.message}`);
  }
}

/** Lista los documentos (facturas/remisiones) de proveedores vinculados a una cotización/orden de trabajo. */
export async function listarDocumentosProveedorPorCotizacion(
  cotizacionId: string
): Promise<DocumentoProveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("documentos_proveedores")
      .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
      .eq("cotizacion_id", cotizacionId)
      .order("fecha", { ascending: false });

    if (error || !data) return [];
    return (data as FilaDocumentoProveedor[]).map(aDocumentoProveedor);
  } catch {
    return [];
  }
}

/** Sube el archivo adjunto (PDF/imagen) de una factura o remisión de proveedor al storage. */
export async function subirArchivoDocumentoProveedor(
  formData: FormData
): Promise<{ ok: boolean; url?: string; nombre?: string; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const archivo = formData.get("archivo") as File | null;
  if (!archivo || archivo.size === 0) return { ok: false, error: "No se adjuntó ningún archivo." };

  const MAX_MB = 16;
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera el límite de ${MAX_MB} MB.` };
  }

  const path = `${Date.now()}-${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  let { data: uploadData, error: uploadError } = await sb.storage
    .from("proveedores-documentos")
    .upload(path, buffer, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });

  if (
    uploadError &&
    (uploadError.message.toLowerCase().includes("not found") || uploadError.message.toLowerCase().includes("bucket"))
  ) {
    try {
      await sb.storage.createBucket("proveedores-documentos", { public: true });
      const retry = await sb.storage
        .from("proveedores-documentos")
        .upload(path, buffer, {
          contentType: archivo.type || "application/octet-stream",
          upsert: false,
        });
      uploadData = retry.data;
      uploadError = retry.error;
    } catch (e) {
      console.warn("No se pudo crear el bucket proveedores-documentos automáticamente:", e);
    }
  }

  if (uploadError || !uploadData) {
    return { ok: false, error: uploadError?.message || "Error al subir el archivo." };
  }

  const { data: urlData } = sb.storage.from("proveedores-documentos").getPublicUrl(uploadData.path);

  return { ok: true, url: urlData.publicUrl, nombre: archivo.name };
}

/** Registra una nueva factura/remisión de un proveedor, ligada opcionalmente a una orden de trabajo (cotización) o expediente. */
export async function registrarDocumentoProveedor(datos: DatosDocumentoProveedor): Promise<DocumentoProveedor> {
  await requireAdmin();
  if (!datos.proveedorId) {
    throw new Error("Debes seleccionar el proveedor.");
  }
  if (!datos.monto || Number(datos.monto) <= 0) {
    throw new Error("El monto del documento debe ser mayor a cero.");
  }

  const sb = supabaseServidor();
  const folio = await generarFolioDocumentoProveedor(sb, datos.tipo);
  const fila = { ...aFilaDocumentoProveedor(datos), folio, origen: "manual" as const };

  const { data, error } = await sb
    .from("documentos_proveedores")
    .insert(fila)
    .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
    .single();

  if (error) {
    throw new Error(`Error al registrar el documento del proveedor: ${error.message}`);
  }

  const documento = aDocumentoProveedor(data as FilaDocumentoProveedor);

  if (documento.expedienteId) {
    await registrarActividad(sb, {
      expedienteId: documento.expedienteId,
      tipo: "nota",
      titulo: `Costo de proveedor registrado: ${documento.proveedorNombre || "Proveedor"}`,
      detalle: `${documento.tipo === "factura" ? "Factura" : "Remisión"} ${documento.folio || "s/folio"} por ${documento.monto.toLocaleString(
        "es-MX",
        { style: "currency", currency: "MXN" }
      )}${documento.cotizacionId ? ` (Orden ${documento.cotizacionId})` : ""}.`,
    });
  }

  await registrarCompraProveedorEnFinanzas(documento);

  return documento;
}

/** Reflejar automáticamente una compra/costo de proveedor en Finanzas (costo_directo). */
async function registrarCompraProveedorEnFinanzas(documento: DocumentoProveedor): Promise<void> {
  try {
    const { registrarMovimientoAutomaticoCRM } = await import("@/app/actions/finanzas");
    await registrarMovimientoAutomaticoCRM({
      tipo: "egreso",
      lineaPnl: "costo_directo",
      monto: documento.monto,
      concepto: `Compra a Proveedor - ${documento.proveedorNombre || "Proveedor"} - ${documento.folio || "s/folio"}`,
      fecha: documento.fecha,
      estado: "pendiente",
      contraparte: documento.proveedorNombre || "Proveedor",
      crmDealId: documento.id,
    });
  } catch (errFin) {
    console.error("Error al registrar movimiento financiero de compra a proveedor:", errFin);
  }
}

/** Actualiza un documento (factura/remisión) de proveedor existente. */
export async function actualizarDocumentoProveedor(
  id: string,
  datos: Partial<DatosDocumentoProveedor>
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const camposActualizar: Record<string, any> = {};
  if (datos.cotizacionId !== undefined) camposActualizar.cotizacion_id = datos.cotizacionId || null;
  if (datos.expedienteId !== undefined) camposActualizar.expediente_id = datos.expedienteId || null;
  if (datos.tipo !== undefined) camposActualizar.tipo = datos.tipo;
  if (datos.folioProveedor !== undefined) camposActualizar.folio_proveedor = (datos.folioProveedor || "").trim() || null;
  if (datos.concepto !== undefined) camposActualizar.concepto = datos.concepto.trim();
  if (datos.fecha !== undefined) camposActualizar.fecha = datos.fecha;
  if (datos.monto !== undefined) camposActualizar.monto = Number(datos.monto) || 0;
  if (datos.archivoUrl !== undefined) camposActualizar.archivo_url = datos.archivoUrl || null;
  if (datos.archivoNombre !== undefined) camposActualizar.archivo_nombre = datos.archivoNombre || null;
  if (datos.notas !== undefined) camposActualizar.notas = datos.notas.trim();

  const { error } = await sb.from("documentos_proveedores").update(camposActualizar).eq("id", id);
  if (error) {
    throw new Error(`Error al actualizar el documento: ${error.message}`);
  }
}

/** Elimina un documento (factura/remisión) de proveedor. */
export async function eliminarDocumentoProveedor(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: doc } = await sb
    .from("documentos_proveedores")
    .select("archivo_url")
    .eq("id", id)
    .maybeSingle();

  if (doc?.archivo_url) {
    const match = doc.archivo_url.match(/proveedores-documentos\/(.+)$/);
    if (match) {
      await sb.storage.from("proveedores-documentos").remove([match[1]]);
    }
  }

  const { error } = await sb.from("documentos_proveedores").delete().eq("id", id);
  if (error) {
    throw new Error(`Error al eliminar el documento: ${error.message}`);
  }
}

/** Lista mínima de cotizaciones (órdenes de trabajo) para vincular un documento de proveedor. */
export async function listarCotizacionesMinParaProveedor(): Promise<
  { id: string; prospectoNombre: string; estatus: string }[]
> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("cotizaciones")
      .select("id, estatus, prospectos:prospecto_id(nombre, primer_apellido)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error || !data) return [];
    return data.map((c: any) => ({
      id: c.id,
      estatus: c.estatus,
      prospectoNombre: [c.prospectos?.nombre, c.prospectos?.primer_apellido].filter(Boolean).join(" ") || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Genera automáticamente la remisión de costo del proveedor asignado a una orden de
 * trabajo, jalando producto/cantidades de la cotización, cliente y folio de la orden.
 * Se llama al concluir la orden de trabajo. Es idempotente: si ya existe un documento
 * automático para esa orden, lo regresa en vez de duplicarlo.
 */
export async function generarDocumentoProveedorAutomatico(
  ordenTrabajoId: string
): Promise<{ ok: boolean; documento?: DocumentoProveedor; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existente } = await sb
    .from("documentos_proveedores")
    .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
    .eq("orden_trabajo_id", ordenTrabajoId)
    .eq("origen", "automatico")
    .maybeSingle();

  if (existente) {
    return { ok: true, documento: aDocumentoProveedor(existente as FilaDocumentoProveedor) };
  }

  const { data: ot, error: errOt } = await sb
    .from("ordenes_trabajo")
    .select("id, folio, titulo, proveedor_id, costo_proveedor, proveedor_concepto, cotizacion_id, expediente_id, prospectos:prospecto_id(nombre)")
    .eq("id", ordenTrabajoId)
    .maybeSingle();

  if (errOt || !ot) return { ok: false, error: "No se encontró la orden de trabajo." };
  if (!ot.proveedor_id) return { ok: false, error: "La orden de trabajo no tiene un proveedor asignado." };
  if (!ot.costo_proveedor || Number(ot.costo_proveedor) <= 0) {
    return { ok: false, error: "La orden de trabajo no tiene un costo pactado con el proveedor." };
  }

  // Jalar producto y cantidades de la cotización, si existe
  let concepto = (ot.proveedor_concepto || "").trim();
  if (!concepto && ot.cotizacion_id) {
    const { data: conceptos } = await sb
      .from("cotizacion_conceptos")
      .select("descripcion, cantidad, unidad")
      .eq("cotizacion_id", ot.cotizacion_id);

    if (conceptos && conceptos.length > 0) {
      concepto = conceptos
        .map((c: any) => `${c.cantidad ?? ""}${c.unidad ? ` ${c.unidad}` : ""} ${c.descripcion ?? ""}`.trim())
        .filter(Boolean)
        .join("; ");
    }
  }
  if (!concepto) concepto = ot.titulo || "Trabajo realizado";

  const clienteNombre = (ot as any).prospectos?.nombre || "Cliente";
  const folio = await generarFolioDocumentoProveedor(sb, "remision");

  const { data, error } = await sb
    .from("documentos_proveedores")
    .insert({
      proveedor_id: ot.proveedor_id,
      cotizacion_id: ot.cotizacion_id,
      expediente_id: ot.expediente_id,
      orden_trabajo_id: ot.id,
      tipo: "remision",
      folio,
      concepto,
      fecha: new Date().toISOString().slice(0, 10),
      monto: Number(ot.costo_proveedor),
      notas: `Generado automáticamente al concluir la orden de trabajo ${ot.folio} de ${clienteNombre}.`,
      origen: "automatico",
    })
    .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "No se pudo generar el documento del proveedor." };
  }

  const documento = aDocumentoProveedor(data as FilaDocumentoProveedor);
  await registrarCompraProveedorEnFinanzas(documento);

  return { ok: true, documento };
}

/** Lista los documentos (facturas/remisiones) de proveedores ligados a una orden de trabajo específica. */
export async function listarDocumentosProveedorPorOrdenTrabajo(
  ordenTrabajoId: string
): Promise<DocumentoProveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  try {
    const { data, error } = await sb
      .from("documentos_proveedores")
      .select("*, proveedores:proveedor_id(nombre), ordenes_trabajo:orden_trabajo_id(folio)")
      .eq("orden_trabajo_id", ordenTrabajoId)
      .order("fecha", { ascending: false });

    if (error || !data) return [];
    return (data as FilaDocumentoProveedor[]).map(aDocumentoProveedor);
  } catch {
    return [];
  }
}
