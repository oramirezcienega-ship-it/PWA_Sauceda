"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import type {
  OtInfonavitEtapa,
  OtInfonavitParte,
  OtInfonavitInmueble,
  OtCatalogoDocumento,
  OtInfonavitDocumento,
  OtInfonavitHistorial,
  ExpedienteInfonavitDetalle,
  RolParteInfonavit,
  EstatusDocumentoInfonavit,
} from "@/lib/types";

// ============================================================
// Utilidades de Mapeo Interno
// ============================================================

function aParte(r: any): OtInfonavitParte {
  return {
    id: r.id,
    ordenTrabajoId: r.orden_trabajo_id,
    rol: r.rol,
    nombre: r.nombre,
    telefono: r.telefono,
    email: r.email,
    curp: r.curp,
    rfc: r.rfc,
    estadoCivil: r.estado_civil,
    regimenMatrimonial: r.regimen_matrimonial,
    tokenFormulario: r.token_formulario,
    tokenExpiraAt: r.token_expira_at,
    formularioCompletado: Boolean(r.formulario_completado),
    formularioCompletadoAt: r.formulario_completado_at,
    avisoPrivacidadAceptado: Boolean(r.aviso_privacidad_aceptado),
    avisoPrivacidadAceptadoAt: r.aviso_privacidad_aceptado_at,
    notas: r.notas,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function aInmueble(r: any): OtInfonavitInmueble {
  return {
    id: r.id,
    ordenTrabajoId: r.orden_trabajo_id,
    direccion: r.direccion,
    fraccionamiento: r.fraccionamiento,
    ciudad: r.ciudad,
    cuentaPredial: r.cuenta_predial,
    tieneCreditoVigente: Boolean(r.tiene_credito_vigente),
    institucionAcreedora: r.institucion_acreedora,
    saldoCreditoAprox: r.saldo_credito_aprox ? Number(r.saldo_credito_aprox) : 0,
    esRegimenCondominio: Boolean(r.es_regimen_condominio),
    estaHabitada: Boolean(r.esta_habitada),
    nombreContactoVisita: r.nombre_contacto_visita,
    telefonoContactoVisita: r.telefono_contacto_visita,
    notasAcceso: r.notas_acceso,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function aCatalogoDoc(r: any): OtCatalogoDocumento {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    rolAplicable: r.rol_aplicable,
    obligatorio: Boolean(r.obligatorio),
    tieneVigencia: Boolean(r.tiene_vigencia),
    diasVigenciaDefault: r.dias_vigencia_default,
    condicionRegla: r.condicion_regla,
    orden: r.orden,
    activo: Boolean(r.activo),
    createdAt: r.created_at,
  };
}

function aDocumento(r: any): OtInfonavitDocumento {
  return {
    id: r.id,
    ordenTrabajoId: r.orden_trabajo_id,
    parteId: r.parte_id,
    tipoDocumentoId: r.tipo_documento_id,
    archivoPath: r.archivo_path,
    archivoNombreOriginal: r.archivo_nombre_original,
    archivoTipo: r.archivo_tipo,
    tamanoBytes: r.tamano_bytes ? Number(r.tamano_bytes) : undefined,
    estatus: r.estatus,
    motivoRechazo: r.motivo_rechazo,
    fechaVigencia: r.fecha_vigencia,
    validadoPor: r.validado_por,
    validadoAt: r.validado_at,
    notas: r.notas,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ============================================================
// 1. Obtener Expediente Completo de la OT para Vista Admin
// ============================================================

export async function obtenerExpedienteInfonavitAction(
  ordenTrabajoId: string
): Promise<{ ok: boolean; data?: ExpedienteInfonavitDetalle; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    // 1. Catálogos
    const [resEtapas, resCatDocs] = await Promise.all([
      sb.from("ot_infonavit_etapas_catalogo").select("*").eq("activo", true).order("orden", { ascending: true }),
      sb.from("ot_catalogo_documentos").select("*").eq("activo", true).order("orden", { ascending: true }),
    ]);

    const etapas: OtInfonavitEtapa[] = (resEtapas.data || []).map((e: any) => ({
      id: e.id,
      orden: e.orden,
      nombre: e.nombre,
      descripcion: e.descripcion,
      requiereDocsValidados: Boolean(e.requiere_docs_validados),
      activo: Boolean(e.activo),
      createdAt: e.created_at,
    }));

    const catalogoDocs: OtCatalogoDocumento[] = (resCatDocs.data || []).map(aCatalogoDoc);
    const mapaCatDocs = new Map<string, OtCatalogoDocumento>(catalogoDocs.map((c) => [c.id, c]));

    // 2. Partes, Inmueble y Documentos
    const [resPartes, resInmueble, resDocs, resHistorial] = await Promise.all([
      sb.from("ot_infonavit_partes").select("*").eq("orden_trabajo_id", ordenTrabajoId).order("created_at", { ascending: true }),
      sb.from("ot_infonavit_inmueble").select("*").eq("orden_trabajo_id", ordenTrabajoId).maybeSingle(),
      sb.from("ot_infonavit_documentos").select("*").eq("orden_trabajo_id", ordenTrabajoId).order("created_at", { ascending: false }),
      sb.from("ot_infonavit_historial").select("*, perfiles(nombre)").eq("orden_trabajo_id", ordenTrabajoId).order("created_at", { ascending: false }),
    ]);

    const partes = (resPartes.data || []).map(aParte);
    const mapaPartes = new Map<string, OtInfonavitParte>(partes.map((p) => [p.id, p]));
    const inmueble = resInmueble.data ? aInmueble(resInmueble.data) : null;

    // 3. Documentos con URL firmada temporal (60 minutos)
    const docsRaw = resDocs.data || [];
    const documentos: OtInfonavitDocumento[] = [];

    for (const d of docsRaw) {
      const doc = aDocumento(d);
      doc.tipoDocumento = mapaCatDocs.get(doc.tipoDocumentoId);
      if (doc.parteId) doc.parte = mapaPartes.get(doc.parteId);

      if (doc.archivoPath) {
        try {
          const { data: signed } = await sb.storage
            .from("expedientes_infonavit")
            .createSignedUrl(doc.archivoPath, 3600);
          if (signed?.signedUrl) {
            doc.urlFirmada = signed.signedUrl;
          }
        } catch (errSign) {
          console.error(`Error generando URL firmada para ${doc.archivoPath}:`, errSign);
        }
      }
      documentos.push(doc);
    }

    // 4. Historial
    const historial: OtInfonavitHistorial[] = (resHistorial.data || []).map((h: any) => ({
      id: h.id,
      ordenTrabajoId: h.orden_trabajo_id,
      etapaAnterior: h.etapa_anterior,
      etapaNueva: h.etapa_nueva,
      motivo: h.motivo,
      usuarioId: h.usuario_id,
      usuarioNombre: h.perfiles?.nombre || "Sistema",
      createdAt: h.created_at,
    }));

    return {
      ok: true,
      data: {
        partes,
        inmueble,
        documentos,
        etapas,
        catalogoDocs,
        historial,
      },
    };
  } catch (err: any) {
    console.error("Error en obtenerExpedienteInfonavitAction:", err);
    return { ok: false, error: err?.message || "Error al obtener expediente INFONAVIT." };
  }
}

// ============================================================
// 2. Control y Avance de Etapas con Validación de Regla Dura
// ============================================================

export async function cambiarEtapaInfonavitAction(
  ordenTrabajoId: string,
  nuevaEtapaId: string,
  motivo?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    // 1. Obtener la OT actual
    const { data: ot, error: errOt } = await sb
      .from("ordenes_trabajo")
      .select("id, etapa_infonavit_id, estatus, anticipo_pagado, liquidacion_pagada")
      .eq("id", ordenTrabajoId)
      .maybeSingle();

    if (errOt || !ot) {
      return { ok: false, error: "Orden de trabajo no encontrada." };
    }

    const etapaAnterior = ot.etapa_infonavit_id || "1_cotizacion_enviada";

    // 2. Obtener orden de la etapa destino
    const { data: etapasCat } = await sb
      .from("ot_infonavit_etapas_catalogo")
      .select("id, orden, requiere_docs_validados")
      .in("id", [etapaAnterior, nuevaEtapaId]);

    const mapaEtapas = new Map<string, any>((etapasCat || []).map((e) => [e.id, e]));
    const etapaNuevaInfo = mapaEtapas.get(nuevaEtapaId);
    const etapaAnteriorInfo = mapaEtapas.get(etapaAnterior);

    const ordenNuevo = etapaNuevaInfo?.orden || 1;
    const ordenAnterior = etapaAnteriorInfo?.orden || 1;

    // REGLA CRÍTICA: No avanzar de la etapa 4 (Validación documental) a la 5 (Avalúo)
    // o superior si existen documentos obligatorios sin validar.
    if (ordenAnterior <= 4 && ordenNuevo >= 5) {
      // Consultar partes e inmueble para evaluar condiciones aplicables
      const [resPartes, resInmueble, resDocs, resCat] = await Promise.all([
        sb.from("ot_infonavit_partes").select("*").eq("orden_trabajo_id", ordenTrabajoId),
        sb.from("ot_infonavit_inmueble").select("*").eq("orden_trabajo_id", ordenTrabajoId).maybeSingle(),
        sb.from("ot_infonavit_documentos").select("tipo_documento_id, estatus").eq("orden_trabajo_id", ordenTrabajoId),
        sb.from("ot_catalogo_documentos").select("*").eq("activo", true),
      ]);

      const partes = resPartes.data || [];
      const inmueble = resInmueble.data;
      const docsSubidos = resDocs.data || [];
      const catalogo = resCat.data || [];

      const comprador = partes.find((p) => p.rol === "comprador");
      const vendedor = partes.find((p) => p.rol === "vendedor");

      // Filtrar qué documentos son obligatorios para este caso particular
      const docsFaltantesSinValidar: string[] = [];

      for (const cat of catalogo) {
        if (!cat.obligatorio && !cat.condicion_regla) continue;

        // Evaluar condiciones
        let aplica = Boolean(cat.obligatorio);

        if (cat.condicion_regla === "si_casado") {
          const parte = cat.rol_aplicable === "comprador" ? comprador : vendedor;
          aplica = parte?.estado_civil === "casado";
        } else if (cat.condicion_regla === "si_mancomunados") {
          const parte = cat.rol_aplicable === "comprador" ? comprador : vendedor;
          aplica = parte?.regimen_matrimonial === "sociedad_conyugal";
        } else if (cat.condicion_regla === "si_credito_vigente") {
          aplica = Boolean(inmueble?.tiene_credito_vigente);
        } else if (cat.condicion_regla === "si_condominio") {
          aplica = Boolean(inmueble?.es_regimen_condominio);
        }

        if (!aplica) continue;

        // Verificar si existe un documento con este tipo_documento_id y estatus 'validado'
        const docValido = docsSubidos.find(
          (d) => d.tipo_documento_id === cat.id && d.estatus === "validado"
        );

        if (!docValido) {
          docsFaltantesSinValidar.push(cat.nombre);
        }
      }

      if (docsFaltantesSinValidar.length > 0) {
        const detalleFaltantes = docsFaltantesSinValidar.slice(0, 3).join(", ");
        const extra = docsFaltantesSinValidar.length > 3 ? ` y ${docsFaltantesSinValidar.length - 3} más` : "";
        return {
          ok: false,
          error: `No se puede avanzar a la etapa 5 (Avalúo y certificados): faltan documentos obligatorios con estatus "validado" (${detalleFaltantes}${extra}).`,
        };
      }
    }

    // 3. Actualizar la orden de trabajo
    const updatePayload: Record<string, any> = {
      etapa_infonavit_id: nuevaEtapaId,
      updated_at: new Date().toISOString(),
    };

    // Automatizaciones de marcado de pago según etapa
    if (nuevaEtapaId === "2_aceptada_anticipo" && !ot.anticipo_pagado) {
      updatePayload.anticipo_pagado = true;
      updatePayload.anticipo_pagado_at = new Date().toISOString();
      updatePayload.estatus = "en_proceso";
    } else if (nuevaEtapaId === "8_firma_liquidacion" && !ot.liquidacion_pagada) {
      updatePayload.liquidacion_pagada = true;
      updatePayload.liquidacion_pagada_at = new Date().toISOString();
    } else if (nuevaEtapaId === "10_escritura_cierre") {
      updatePayload.estatus = "completada";
    }

    const { error: errUpd } = await sb
      .from("ordenes_trabajo")
      .update(updatePayload)
      .eq("id", ordenTrabajoId);

    if (errUpd) throw new Error(errUpd.message);

    // 4. Registrar en historial
    await sb.from("ot_infonavit_historial").insert({
      orden_trabajo_id: ordenTrabajoId,
      etapa_anterior: etapaAnterior,
      etapa_nueva: nuevaEtapaId,
      motivo: motivo?.trim() || null,
      usuario_id: usuario?.id || null,
    });

    // 5. Registrar evento para n8n
    await sb.from("ot_infonavit_eventos").insert({
      orden_trabajo_id: ordenTrabajoId,
      evento: "etapa_cambiada",
      payload: {
        etapaAnterior,
        etapaNueva: nuevaEtapaId,
        ordenNuevo,
        motivo: motivo?.trim() || null,
        usuario: usuario?.nombre || "Asesor",
      },
    });

    revalidatePath("/ordenes-trabajo");
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);

    return { ok: true };
  } catch (err: any) {
    console.error("Error en cambiarEtapaInfonavitAction:", err);
    return { ok: false, error: err?.message || "Error al cambiar de etapa." };
  }
}

// ============================================================
// 3. Cambiar Estatus Paralelo (Activa / Detenida / Cancelada)
// ============================================================

export async function cambiarEstatusOTInfonavitAction(
  ordenTrabajoId: string,
  nuevoEstatus: "activa" | "en_proceso" | "detenida" | "cancelada" | "cerrada",
  motivo?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    if ((nuevoEstatus === "detenida" || nuevoEstatus === "cancelada") && !motivo?.trim()) {
      return { ok: false, error: "El motivo es estrictamente obligatorio para pausar o cancelar la orden de trabajo." };
    }

    const { error } = await sb
      .from("ordenes_trabajo")
      .update({
        estatus: nuevoEstatus === "activa" ? "en_proceso" : nuevoEstatus,
        motivo_detencion: motivo?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ordenTrabajoId);

    if (error) throw new Error(error.message);

    await sb.from("ot_infonavit_historial").insert({
      orden_trabajo_id: ordenTrabajoId,
      etapa_anterior: null,
      etapa_nueva: `estatus_${nuevoEstatus}`,
      motivo: motivo?.trim() || null,
      usuario_id: usuario?.id || null,
    });

    await sb.from("ot_infonavit_eventos").insert({
      orden_trabajo_id: ordenTrabajoId,
      evento: `ot_${nuevoEstatus}`,
      payload: {
        estatus: nuevoEstatus,
        motivo: motivo?.trim() || null,
      },
    });

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    console.error("Error en cambiarEstatusOTInfonavitAction:", err);
    return { ok: false, error: err?.message || "Error al actualizar estatus." };
  }
}

// ============================================================
// 4. Validación / Rechazo Documental en CRM
// ============================================================

export async function validarORechazarDocumentoAction(
  documentoId: string,
  accion: "validar" | "rechazar",
  motivoRechazo?: string,
  fechaVigencia?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    if (accion === "rechazar" && !motivoRechazo?.trim()) {
      return { ok: false, error: "Debes ingresar el motivo de rechazo para orientar al cliente sobre cómo corregir el documento." };
    }

    // Obtener info del documento y de la orden
    const { data: doc, error: errDoc } = await sb
      .from("ot_infonavit_documentos")
      .select("*, ot_infonavit_partes(nombre, telefono), ot_catalogo_documentos(nombre)")
      .eq("id", documentoId)
      .maybeSingle();

    if (errDoc || !doc) return { ok: false, error: "Documento no encontrado." };

    const updatePayload: Record<string, any> = {
      estatus: accion === "validar" ? "validado" : "rechazado",
      motivo_rechazo: accion === "rechazar" ? motivoRechazo?.trim() : null,
      validado_por: usuario?.id || null,
      validado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (fechaVigencia) {
      updatePayload.fecha_vigencia = fechaVigencia;
    }

    const { error: errUpd } = await sb
      .from("ot_infonavit_documentos")
      .update(updatePayload)
      .eq("id", documentoId);

    if (errUpd) throw new Error(errUpd.message);

    // Si se rechaza, generar evento para n8n para enviar WhatsApp al cliente
    if (accion === "rechazar") {
      await sb.from("ot_infonavit_eventos").insert({
        orden_trabajo_id: doc.orden_trabajo_id,
        evento: "documento_rechazado",
        payload: {
          documentoId,
          nombreDocumento: doc.ot_catalogo_documentos?.nombre || "Documento",
          clienteNombre: doc.ot_infonavit_partes?.nombre || "Cliente",
          clienteTelefono: doc.ot_infonavit_partes?.telefono || "",
          motivoRechazo: motivoRechazo?.trim(),
        },
      });
    }

    revalidatePath("/ordenes-trabajo");
    return { ok: true };
  } catch (err: any) {
    console.error("Error en validarORechazarDocumentoAction:", err);
    return { ok: false, error: err?.message || "Error al calificar documento." };
  }
}

// ============================================================
// 5. Inicializar / Crear Partes e Inmueble para una OT INFONAVIT
// ============================================================

export async function inicializarPartesOTInfonavit(
  ordenTrabajoId: string,
  datos: {
    compradorNombre: string;
    compradorTelefono: string;
    compradorEmail?: string;
    vendedorNombre: string;
    vendedorTelefono: string;
    vendedorEmail?: string;
    direccionInmueble?: string;
    fraccionamientoInmueble?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = supabaseServidor();

    // 1. Crear o actualizar Comprador
    const tokenComprador = crypto.randomBytes(18).toString("hex");
    const { error: errComp } = await sb.from("ot_infonavit_partes").insert({
      orden_trabajo_id: ordenTrabajoId,
      rol: "comprador",
      nombre: datos.compradorNombre.trim(),
      telefono: datos.compradorTelefono.trim(),
      email: datos.compradorEmail?.trim() || null,
      token_formulario: tokenComprador,
      token_expira_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (errComp) throw new Error(errComp.message);

    // 2. Crear o actualizar Vendedor
    const tokenVendedor = crypto.randomBytes(18).toString("hex");
    const { error: errVend } = await sb.from("ot_infonavit_partes").insert({
      orden_trabajo_id: ordenTrabajoId,
      rol: "vendedor",
      nombre: datos.vendedorNombre.trim(),
      telefono: datos.vendedorTelefono.trim(),
      email: datos.vendedorEmail?.trim() || null,
      token_formulario: tokenVendedor,
      token_expira_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (errVend) throw new Error(errVend.message);

    // 3. Crear registro de Inmueble
    await sb.from("ot_infonavit_inmueble").insert({
      orden_trabajo_id: ordenTrabajoId,
      direccion: datos.direccionInmueble?.trim() || null,
      fraccionamiento: datos.fraccionamientoInmueble?.trim() || null,
    });

    // 4. Registrar evento de bienvenida para n8n
    await sb.from("ot_infonavit_eventos").insert({
      orden_trabajo_id: ordenTrabajoId,
      evento: "bienvenida_formularios_generados",
      payload: {
        comprador: {
          nombre: datos.compradorNombre,
          telefono: datos.compradorTelefono,
          token: tokenComprador,
        },
        vendedor: {
          nombre: datos.vendedorNombre,
          telefono: datos.vendedorTelefono,
          token: tokenVendedor,
        },
      },
    });

    return { ok: true };
  } catch (err: any) {
    console.error("Error en inicializarPartesOTInfonavit:", err);
    return { ok: false, error: err?.message || "Error al inicializar partes de la compraventa." };
  }
}

// ============================================================
// 6. Formulario Público por Token (Cliente / Comprador / Vendedor)
// ============================================================

export async function obtenerFormularioPublicoPorTokenAction(token: string): Promise<{
  ok: boolean;
  parte?: OtInfonavitParte;
  inmueble?: OtInfonavitInmueble | null;
  orden?: {
    id: string;
    folio: string;
    titulo: string;
    estatus: string;
    etapaNombre: string;
    etapaOrden: number;
    motivoDetencion?: string | null;
  };
  catalogoDocs?: OtCatalogoDocumento[];
  documentosSubidos?: OtInfonavitDocumento[];
  error?: string;
}> {
  try {
    const sb = supabaseServidor();

    // 1. Buscar parte por token
    const { data: parteRaw, error: errParte } = await sb
      .from("ot_infonavit_partes")
      .select("*, ordenes_trabajo(id, folio, titulo, estatus, etapa_infonavit_id, motivo_detencion)")
      .eq("token_formulario", token)
      .maybeSingle();

    if (errParte || !parteRaw) {
      return { ok: false, error: "El enlace es inválido o ha caducado. Solicita a tu asesor de SAUCEDA un nuevo acceso." };
    }

    // Verificar vigencia del token
    if (new Date(parteRaw.token_expira_at).getTime() < Date.now()) {
      return { ok: false, error: "Tu enlace ha vencido por seguridad. Pide a tu asesor que te lo reactive." };
    }

    const parte = aParte(parteRaw);
    const otRaw = parteRaw.ordenes_trabajo;

    // Obtener etapa actual
    let etapaNombre = "En integración";
    let etapaOrden = 1;
    if (otRaw?.etapa_infonavit_id) {
      const { data: etapa } = await sb
        .from("ot_infonavit_etapas_catalogo")
        .select("nombre, orden")
        .eq("id", otRaw.etapa_infonavit_id)
        .maybeSingle();
      if (etapa) {
        etapaNombre = etapa.nombre;
        etapaOrden = etapa.orden;
      }
    }

    // 2. Obtener datos del inmueble
    const { data: inmRaw } = await sb
      .from("ot_infonavit_inmueble")
      .select("*")
      .eq("orden_trabajo_id", parte.ordenTrabajoId)
      .maybeSingle();
    const inmueble = inmRaw ? aInmueble(inmRaw) : null;

    // 3. Catálogo de documentos aplicables para este rol y para el inmueble si es vendedor
    const rolesConsulta = [parte.rol];
    if (parte.rol === "vendedor") {
      rolesConsulta.push("inmueble");
    }

    const { data: catDocsRaw } = await sb
      .from("ot_catalogo_documentos")
      .select("*")
      .in("rol_aplicable", rolesConsulta)
      .eq("activo", true)
      .order("orden", { ascending: true });

    const catalogoDocs = (catDocsRaw || []).map(aCatalogoDoc);
    const mapaCat = new Map<string, OtCatalogoDocumento>(catalogoDocs.map((c) => [c.id, c]));

    // 4. Documentos ya subidos por esta parte o del inmueble
    const queryDocs = sb
      .from("ot_infonavit_documentos")
      .select("*")
      .eq("orden_trabajo_id", parte.ordenTrabajoId);

    if (parte.rol === "vendedor") {
      queryDocs.or(`parte_id.eq.${parte.id},parte_id.is.null`);
    } else {
      queryDocs.eq("parte_id", parte.id);
    }

    const { data: docsRaw } = await queryDocs;
    const documentosSubidos: OtInfonavitDocumento[] = [];

    for (const d of docsRaw || []) {
      const doc = aDocumento(d);
      doc.tipoDocumento = mapaCat.get(doc.tipoDocumentoId);
      if (doc.archivoPath) {
        try {
          const { data: signed } = await sb.storage
            .from("expedientes_infonavit")
            .createSignedUrl(doc.archivoPath, 1800);
          if (signed?.signedUrl) {
            doc.urlFirmada = signed.signedUrl;
          }
        } catch {}
      }
      documentosSubidos.push(doc);
    }

    return {
      ok: true,
      parte,
      inmueble,
      orden: {
        id: otRaw.id,
        folio: otRaw.folio,
        titulo: otRaw.titulo,
        estatus: otRaw.estatus,
        etapaNombre,
        etapaOrden,
        motivoDetencion: otRaw.motivo_detencion,
      },
      catalogoDocs,
      documentosSubidos,
    };
  } catch (err: any) {
    console.error("Error en obtenerFormularioPublicoPorTokenAction:", err);
    return { ok: false, error: err?.message || "Error al cargar formulario." };
  }
}

// ============================================================
// 7. Guardar Datos Generales del Cliente desde el Formulario
// ============================================================

export async function guardarDatosFormularioPublicoAction(
  token: string,
  datosParte: {
    curp?: string;
    rfc?: string;
    estadoCivil?: "soltero" | "casado" | "union_libre" | "divorciado" | "viudo";
    regimenMatrimonial?: "separacion_bienes" | "sociedad_conyugal" | "no_aplica";
    avisoPrivacidadAceptado?: boolean;
  },
  datosInmueble?: {
    cuentaPredial?: string;
    tieneCreditoVigente?: boolean;
    institucionAcreedora?: string;
    saldoCreditoAprox?: number;
    esRegimenCondominio?: boolean;
    estaHabitada?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = supabaseServidor();

    const { data: parte, error: errParte } = await sb
      .from("ot_infonavit_partes")
      .select("id, orden_trabajo_id, rol")
      .eq("token_formulario", token)
      .maybeSingle();

    if (errParte || !parte) return { ok: false, error: "Enlace inválido o expirado." };

    // Actualizar datos de la parte
    const updateParte: Record<string, any> = {
      curp: datosParte.curp?.trim()?.toUpperCase() || null,
      rfc: datosParte.rfc?.trim()?.toUpperCase() || null,
      estado_civil: datosParte.estadoCivil || null,
      regimen_matrimonial: datosParte.regimenMatrimonial || null,
      updated_at: new Date().toISOString(),
    };

    if (datosParte.avisoPrivacidadAceptado) {
      updateParte.aviso_privacidad_aceptado = true;
      updateParte.aviso_privacidad_aceptado_at = new Date().toISOString();
    }

    const { error: errUpdParte } = await sb
      .from("ot_infonavit_partes")
      .update(updateParte)
      .eq("id", parte.id);

    if (errUpdParte) throw new Error(errUpdParte.message);

    // Si es vendedor y envió datos del inmueble, actualizar tabla inmueble
    if (parte.rol === "vendedor" && datosInmueble) {
      await sb
        .from("ot_infonavit_inmueble")
        .upsert({
          orden_trabajo_id: parte.orden_trabajo_id,
          cuenta_predial: datosInmueble.cuentaPredial?.trim() || null,
          tiene_credito_vigente: Boolean(datosInmueble.tieneCreditoVigente),
          institucion_acreedora: datosInmueble.institucionAcreedora?.trim() || null,
          saldo_credito_aprox: datosInmueble.saldoCreditoAprox || 0,
          es_regimen_condominio: Boolean(datosInmueble.esRegimenCondominio),
          esta_habitada: Boolean(datosInmueble.estaHabitada),
          updated_at: new Date().toISOString(),
        }, { onConflict: "orden_trabajo_id" });
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Error en guardarDatosFormularioPublicoAction:", err);
    return { ok: false, error: err?.message || "Error al guardar datos." };
  }
}

// ============================================================
// 8. Subida de Documento desde Formulario Móvil
// ============================================================

export async function subirDocumentoPublicoAction(
  token: string,
  tipoDocumentoId: string,
  formData: FormData
): Promise<{ ok: boolean; documento?: OtInfonavitDocumento; error?: string }> {
  try {
    const sb = supabaseServidor();

    const { data: parte, error: errParte } = await sb
      .from("ot_infonavit_partes")
      .select("id, orden_trabajo_id, rol")
      .eq("token_formulario", token)
      .maybeSingle();

    if (errParte || !parte) return { ok: false, error: "Enlace inválido o expirado." };

    const archivo = formData.get("archivo") as File;
    if (!archivo || archivo.size === 0) {
      return { ok: false, error: "No se seleccionó ningún archivo para subir." };
    }

    // Máximo 15MB
    if (archivo.size > 15 * 1024 * 1024) {
      return { ok: false, error: "El archivo excede el tamaño máximo permitido de 15 MB." };
    }

    // Obtener catálogo de este documento
    const { data: catDoc } = await sb
      .from("ot_catalogo_documentos")
      .select("*")
      .eq("id", tipoDocumentoId)
      .maybeSingle();

    if (!catDoc) return { ok: false, error: "Tipo de documento no reconocido." };

    const extOriginal = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const extension = ["jpg", "jpeg", "png", "webp", "pdf"].includes(extOriginal) ? extOriginal : "jpg";
    const pathStorage = `${parte.orden_trabajo_id}/${catDoc.rol_aplicable === "inmueble" ? "inmueble" : parte.id}/${tipoDocumentoId}_${Date.now()}.${extension}`;

    // Subir archivo al bucket privado
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const { error: errUpload } = await sb.storage
      .from("expedientes_infonavit")
      .upload(pathStorage, buffer, {
        contentType: archivo.type || "application/octet-stream",
        upsert: true,
      });

    if (errUpload) throw new Error(errUpload.message);

    // Insertar o actualizar registro en ot_infonavit_documentos
    const docPayload = {
      orden_trabajo_id: parte.orden_trabajo_id,
      parte_id: catDoc.rol_aplicable === "inmueble" ? null : parte.id,
      tipo_documento_id: tipoDocumentoId,
      archivo_path: pathStorage,
      archivo_nombre_original: archivo.name,
      archivo_tipo: archivo.type,
      tamano_bytes: archivo.size,
      estatus: "recibido",
      motivo_rechazo: null,
      updated_at: new Date().toISOString(),
    };

    const { data: docGuardado, error: errDb } = await sb
      .from("ot_infonavit_documentos")
      .insert(docPayload)
      .select("*")
      .single();

    if (errDb) throw new Error(errDb.message);

    // Obtener URL firmada
    const { data: signed } = await sb.storage
      .from("expedientes_infonavit")
      .createSignedUrl(pathStorage, 3600);

    const docFinal = aDocumento(docGuardado);
    docFinal.tipoDocumento = aCatalogoDoc(catDoc);
    docFinal.urlFirmada = signed?.signedUrl || null;

    // Verificar si ya subió todos los obligatorios para marcar formulario como completado
    await evaluarFinalizacionFormulario(sb, parte.id, parte.orden_trabajo_id, parte.rol);

    return { ok: true, documento: docFinal };
  } catch (err: any) {
    console.error("Error en subirDocumentoPublicoAction:", err);
    return { ok: false, error: err?.message || "Error al procesar archivo." };
  }
}

async function evaluarFinalizacionFormulario(
  sb: any,
  parteId: string,
  ordenTrabajoId: string,
  rol: RolParteInfonavit
) {
  try {
    const roles = [rol];
    if (rol === "vendedor") roles.push("inmueble" as any);

    const { data: catObligatorios } = await sb
      .from("ot_catalogo_documentos")
      .select("id")
      .in("rol_aplicable", roles)
      .eq("obligatorio", true)
      .eq("activo", true);

    const reqIds = (catObligatorios || []).map((c: any) => c.id);
    if (reqIds.length === 0) return;

    const { data: docsSubidos } = await sb
      .from("ot_infonavit_documentos")
      .select("tipo_documento_id")
      .eq("orden_trabajo_id", ordenTrabajoId);

    const subidosSet = new Set((docsSubidos || []).map((d: any) => d.tipo_documento_id));
    const todosSubidos = reqIds.every((id: string) => subidosSet.has(id));

    if (todosSubidos) {
      await sb
        .from("ot_infonavit_partes")
        .update({
          formulario_completado: true,
          formulario_completado_at: new Date().toISOString(),
        })
        .eq("id", parteId);

      await sb.from("ot_infonavit_eventos").insert({
        orden_trabajo_id: ordenTrabajoId,
        evento: "formulario_completado",
        payload: { parteId, rol },
      });
    }
  } catch (err) {
    console.error("Error al evaluar finalización:", err);
  }
}
