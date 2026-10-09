"use server";

/**
 * Server actions de la asesoría y acompañamiento al comprador de vivienda
 * (`tipo_negocio = 'asesoria_compra'`).
 *
 * La operación vive en la ORDEN DE TRABAJO de tipo `asesoria_compra`: su ficha
 * (`ot_ficha_asesoria_compra`), sus etapas (`ot_etapas`), su flujo BPM, sus
 * opciones de casas y búsquedas a aliados. El expediente solo guarda la
 * información básica del negocio con el prospecto.
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual, rolDe } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { formatoPesos } from "@/lib/formato";
import { validarCompuertaEtapa } from "@/lib/asesoria/compuerta";
import {
  ETAPAS_ASESORIA_COMPRA_OT,
  etapasAplicables,
  filaAEtapaOT,
  normalizarEtapaActual,
  type EtapaOT,
} from "@/lib/asesoria/etapas-ot";
import {
  normalizarPerfil,
  perfilAFila,
  filaAPerfil,
  poderDeCompra,
  aMonto,
  type EntradaPerfil,
  type PerfilBusqueda,
} from "@/lib/asesoria/perfil";
import {
  normalizarCredito,
  rankearInmuebles,
  type OrigenInmueble,
  type PerfilMatch,
} from "@/lib/asesoria/match";
import {
  BUCKET_PRECALIFICACIONES,
  cargarRequisitos,
  firmarFotos,
  mapaActivo,
  notificarAsesorTelegram,
  pendientesDeFicha,
  prepararSubidaFoto,
  rondaActual,
} from "@/lib/asesoria/servidor";
import {
  DICTAMENES,
  ETIQUETA_DICTAMEN,
  evaluarRequisitos,
  normalizarEvidencias,
  normalizarRespuestas,
  validarDictamen,
  type Dictamen,
  type PendienteCompuerta,
  type RequisitoPrecalificacion,
  type Respuestas,
} from "@/lib/asesoria/precalificacion";
import { obtenerEtapasPorId, obtenerEtapasPorNegocio } from "@/lib/etapas";
import { obtenerIdAsesorGerardo } from "@/lib/asesores";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import {
  ESTATUS_RESPONDIBLES,
  ESTATUS_VISIBLES_CLIENTE,
  aOpcionCliente,
  esMotivoDescarte,
  esTokenPortalValido,
  validarFechaVisita,
  type OpcionCliente,
} from "@/lib/asesoria/portal";
import { calcularComisionAliado } from "@/lib/asesoria/convenio";
import {
  filaInmuebleDesdeFormulario,
  type DatosInmuebleRapido,
} from "@/lib/asesoria/inmueble-form";
import {
  ESTATUS_INMUEBLE,
  ETIQUETA_MOTIVO_DESCARTE,
  MAX_PUBLICADAS_POR_RONDA,
  descripcionAutomatica,
  filaAInmueble,
  type EstatusInmueble,
  type EstatusPropuesta,
  type Inmueble,
  type MotivoDescarte,
} from "@/lib/asesoria/inmuebles";


// ============================================================================
// Orden de trabajo de asesoría de compra: ficha, etapas y compuerta
// (el expediente solo guarda la información básica del negocio)
// ============================================================================

const TIPO_OT = "asesoria_compra";

interface ContextoOrden {
  ot: Record<string, any>;
  ficha: Record<string, any>;
  exp: Record<string, any> | null;
  etapas: EtapaOT[];
  aplicables: EtapaOT[];
}

/** Carga la OT de asesoría con su ficha, su expediente y sus etapas aplicables. */
async function cargarOrden(sb: Sb, ordenTrabajoId: string): Promise<ContextoOrden | null> {
  const { data: ot } = await sb
    .from("ordenes_trabajo")
    .select("id, folio, expediente_id, prospecto_id, tipo_negocio, etapa, estatus, token, asesor_responsable_id, asesor_ejecutor_id")
    .eq("id", ordenTrabajoId)
    .maybeSingle();
  if (!ot || ot.tipo_negocio !== TIPO_OT) return null;
  const [{ data: ficha }, { data: exp }, { data: filasEtapas }] = await Promise.all([
    sb.from("ot_ficha_asesoria_compra").select("*").eq("orden_trabajo_id", ot.id).maybeSingle(),
    ot.expediente_id
      ? sb.from("expedientes").select("id, cliente, telefono, token, asesor_id, operador_id, tipo_credito").eq("id", ot.expediente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("ot_etapas").select("*").eq("tipo_negocio", TIPO_OT),
  ]);
  const etapas = (filasEtapas ?? []).length ? (filasEtapas ?? []).map(filaAEtapaOT) : ETAPAS_ASESORIA_COMPRA_OT;
  const f = (ficha as Record<string, any>) || { orden_trabajo_id: ot.id, ya_tiene_casa: false };
  return { ot, ficha: f, exp: exp as any, etapas, aplicables: etapasAplicables(etapas, f) };
}

/** Asesor y operaciones solo pueden tocar sus propias órdenes (las de sus expedientes). */
async function verificarAccesoOrden(ctx: ContextoOrden) {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol } = await rolDe(usuario.id);
  if (rol === "asesor" && ctx.exp?.asesor_id !== usuario.id && ctx.ot.asesor_responsable_id !== usuario.id) {
    throw new Error("No estás autorizado para modificar esta orden de trabajo.");
  }
  if (rol === "operaciones" && ctx.exp?.operador_id !== usuario.id && ctx.ot.asesor_ejecutor_id !== usuario.id) {
    throw new Error("No estás autorizado para modificar esta orden de trabajo.");
  }
}

/** Acceso por la propuesta (que pertenece a una OT). */
async function verificarAccesoPropuesta(sb: Sb, ordenTrabajoId: string) {
  const ctx = await cargarOrden(sb, ordenTrabajoId);
  if (ctx) await verificarAccesoOrden(ctx);
  return ctx;
}

export interface OrdenAsesoria {
  id: string;
  folio: string;
  expedienteId: string | null;
  estatus: string;
  etapa: string | null;
  etapas: EtapaOT[];
  perfil: PerfilBusqueda;
  precalificacion: PrecalificacionOT;
  /** Lo que falta para salir de Precalificación (vacío = puede avanzar). */
  pendientes: PendienteCompuerta[];
  mapaActivo: boolean;
}

export interface EvidenciaConUrl {
  ruta: string;
  nombre: string;
  subidoEn: string;
  url: string | null;
}

export interface PrecalificacionOT {
  requisitos: RequisitoPrecalificacion[];
  respuestas: Respuestas;
  evidencias: EvidenciaConUrl[];
  dictamen: Dictamen | null;
  nota: string | null;
  dictamenEn: string | null;
  retomarEl: string | null;
}

async function precalificacionDeFicha(sb: Sb, ficha: Record<string, any>, requisitos: RequisitoPrecalificacion[]): Promise<PrecalificacionOT> {
  const evidencias = normalizarEvidencias(ficha.precalificacion_evidencias);
  const urls = new Map<string, string>();
  if (evidencias.length > 0) {
    const { data } = await sb.storage.from(BUCKET_PRECALIFICACIONES).createSignedUrls(evidencias.map((e) => e.ruta), 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return {
    requisitos,
    respuestas: (ficha.precalificacion_respuestas ?? {}) as Respuestas,
    evidencias: evidencias.map((e) => ({ ...e, url: urls.get(e.ruta) ?? null })),
    dictamen: (DICTAMENES as readonly string[]).includes(ficha.dictamen) ? ficha.dictamen : null,
    nota: ficha.dictamen_nota ?? null,
    dictamenEn: ficha.dictamen_en ?? null,
    retomarEl: ficha.dictamen_retomar_el ?? null,
  };
}

/** Ficha y etapas de la OT de asesoría (para el panel de la OT). */
export async function obtenerOrdenAsesoria(ordenTrabajoId: string): Promise<OrdenAsesoria | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const ctx = await cargarOrden(sb, ordenTrabajoId);
  if (!ctx) return null;
  const perfil = filaAPerfil(ctx.ficha);
  const requisitos = await cargarRequisitos(sb, perfil.tipoCredito);
  return {
    id: ctx.ot.id,
    folio: ctx.ot.folio,
    expedienteId: ctx.ot.expediente_id,
    estatus: ctx.ot.estatus,
    etapa: ctx.ot.etapa,
    etapas: ctx.aplicables,
    perfil,
    precalificacion: await precalificacionDeFicha(sb, ctx.ficha, requisitos),
    pendientes: await pendientesDeFicha(sb, ctx.ficha, requisitos),
    mapaActivo: mapaActivo(),
  };
}

/**
 * Al iniciar una OT de asesoría: crea su ficha (el tipo de crédito se toma del
 * expediente), la deja en su primera etapa e instancia su flujo BPM.
 * La llama `crearOrdenTrabajo`; la OT ya existe y quien la crea ya tiene sesión.
 */
export async function inicializarOrdenAsesoria(
  ordenTrabajoId: string,
  opciones: { yaTieneCasa?: boolean } = {},
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: ot } = await sb
      .from("ordenes_trabajo")
      .select("id, expediente_id, tipo_negocio")
      .eq("id", ordenTrabajoId)
      .maybeSingle();
    if (!ot || ot.tipo_negocio !== TIPO_OT) return { ok: false, mensaje: "La orden no es de asesoría de compra." };
    const { data: exp } = ot.expediente_id
      ? await sb.from("expedientes").select("tipo_credito").eq("id", ot.expediente_id).maybeSingle()
      : { data: null };
    const { error } = await sb.from("ot_ficha_asesoria_compra").upsert(
      {
        orden_trabajo_id: ot.id,
        ya_tiene_casa: Boolean(opciones.yaTieneCasa),
        tipo_credito: normalizarCredito(exp?.tipo_credito) ?? null,
      },
      { onConflict: "orden_trabajo_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    await sb.from("ordenes_trabajo").update({ etapa: "precalificacion", estatus: "en_proceso" }).eq("id", ot.id).is("etapa", null);
    const { instanciarFlujoEnOrden } = await import("@/app/actions/bpm");
    await instanciarFlujoEnOrden(ot.id);
    return { ok: true };
  } catch (err) {
    console.error("[inicializarOrdenAsesoria]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo inicializar la orden." };
  }
}

export type ResultadoGuardarPerfil =
  | { ok: true; perfil: PerfilBusqueda }
  | { ok: false; mensaje: string };

/**
 * Guarda la ficha (precalificación y perfil de búsqueda) de la OT. Si cambia
 * "ya tiene casa", ajusta las tareas BPM y la etapa. No lanza: devuelve el
 * error como dato para mostrarlo en la tarjeta.
 */
export async function guardarFichaAsesoria(
  ordenTrabajoId: string,
  entrada: EntradaPerfil,
): Promise<ResultadoGuardarPerfil> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    await verificarAccesoOrden(ctx);

    const r = normalizarPerfil(entrada);
    if (!r.ok) return { ok: false, mensaje: r.errores.join(" ") };
    const p = r.perfil;

    // El dictamen se hizo con los requisitos de un tipo de crédito: no se cambia por debajo.
    if (ctx.ficha.dictamen && (normalizarCredito(ctx.ficha.tipo_credito) ?? null) !== p.tipoCredito) {
      return { ok: false, mensaje: "La precalificación ya tiene dictamen: reábrela antes de cambiar el tipo de crédito." };
    }

    // Con la OT ya en búsqueda o negociación, la ficha no puede quedar sin
    // precalificación ni zonas (sería saltarse la compuerta).
    if (!p.yaTieneCasa) {
      const compuerta = validarCompuertaEtapa(
        { tipoNegocio: TIPO_OT, montoCreditoPrecalificado: p.montoCreditoPrecalificado, busquedaZonas: p.busquedaZonas, yaTieneCasa: false },
        ctx.ot.etapa ?? "",
      );
      if (!compuerta.ok) return { ok: false, mensaje: compuerta.mensaje };
    }

    const { error } = await sb
      .from("ot_ficha_asesoria_compra")
      .upsert({ orden_trabajo_id: ordenTrabajoId, ...perfilAFila(p) }, { onConflict: "orden_trabajo_id" });
    if (error) throw new Error(error.message);

    const detalle = [
      p.montoCreditoPrecalificado !== null ? `Crédito precalificado ${formatoPesos(p.montoCreditoPrecalificado)}` : null,
      p.montoAhorroPropio !== null ? `ahorro ${formatoPesos(p.montoAhorroPropio)}` : null,
      `poder de compra ${formatoPesos(poderDeCompra(p))}`,
      p.busquedaZonas.length > 0 ? `zonas: ${p.busquedaZonas.join(", ")}` : null,
      p.busquedaPrecioMin !== null || p.busquedaPrecioMax !== null
        ? `rango ${p.busquedaPrecioMin !== null ? formatoPesos(p.busquedaPrecioMin) : "—"} a ${p.busquedaPrecioMax !== null ? formatoPesos(p.busquedaPrecioMax) : "—"}`
        : null,
      p.busquedaRecamarasMin !== null ? `${p.busquedaRecamarasMin}+ recámaras` : null,
      p.yaTieneCasa ? "ya tiene casa" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (ctx.ot.expediente_id) {
      await registrarActividad(sb, {
        expedienteId: ctx.ot.expediente_id,
        tipo: "sistema",
        titulo: `🔎 Ficha de la orden ${ctx.ot.folio} actualizada`,
        detalle,
      });
    }

    if (Boolean(ctx.ficha.ya_tiene_casa) !== p.yaTieneCasa) {
      const { reevaluarCondicionesBpm } = await import("@/app/actions/bpm");
      await reevaluarCondicionesBpm(ordenTrabajoId);
      // Si la etapa actual dejó de aplicar (p. ej. Búsqueda), avanza a la siguiente que sí aplica.
      const fichaNueva = { ...ctx.ficha, ya_tiene_casa: p.yaTieneCasa };
      const etapa = normalizarEtapaActual(ctx.etapas, etapasAplicables(ctx.etapas, fichaNueva), ctx.ot.etapa);
      if (etapa !== ctx.ot.etapa) await sb.from("ordenes_trabajo").update({ etapa }).eq("id", ordenTrabajoId);
    }

    await sincronizarTareasPrecalificacion(sb, ordenTrabajoId);
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true, perfil: p };
  } catch (err) {
    console.error("[guardarFichaAsesoria]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar la ficha." };
  }
}

/**
 * Cambia la etapa de la OT de asesoría. Aplica la compuerta (no pasa a
 * Búsqueda sin monto precalificado y zonas) y, al entrar a Búsqueda, cruza el
 * perfil contra el inventario. La etapa final deja la OT completada.
 */
export async function cambiarEtapaOrdenAsesoria(
  ordenTrabajoId: string,
  etapa: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    await verificarAccesoOrden(ctx);
    const destino = ctx.aplicables.find((e) => e.clave === etapa);
    if (!destino) return { ok: false, mensaje: "Esa etapa no aplica a esta orden de trabajo." };
    if (ctx.ficha.dictamen === "no_apto" && etapa !== ctx.ot.etapa) {
      return { ok: false, mensaje: "La orden está en pausa (precalificación \"No apto\"). Reábrela desde la precalificación para continuar." };
    }
    // Precalificación como filtro: para salir de ella todo debe estar completo.
    const primera = ctx.aplicables[0]?.clave;
    if (etapa !== primera) {
      const pendientes = await pendientesDeFicha(sb, ctx.ficha);
      if (pendientes.length > 0) {
        return { ok: false, mensaje: `Antes de avanzar falta: ${pendientes.map((x) => x.texto).join(" ")}` };
      }
    }
    const compuerta = validarCompuertaEtapa(
      {
        tipoNegocio: TIPO_OT,
        montoCreditoPrecalificado: ctx.ficha.monto_credito_precalificado,
        busquedaZonas: ctx.ficha.busqueda_zonas,
        yaTieneCasa: ctx.ficha.ya_tiene_casa,
      },
      etapa,
    );
    if (!compuerta.ok) return { ok: false, mensaje: compuerta.mensaje };

    const cambios: Record<string, any> = { etapa, updated_at: new Date().toISOString() };
    if (destino.esFinal) {
      cambios.estatus = "completada";
      cambios.fecha_conclusion = new Date().toISOString();
    } else if (ctx.ot.estatus === "pendiente" || ctx.ot.estatus === "completada") {
      cambios.estatus = "en_proceso";
      cambios.fecha_conclusion = null;
    }
    const { error } = await sb.from("ordenes_trabajo").update(cambios).eq("id", ordenTrabajoId);
    if (error) throw new Error(error.message);

    if (ctx.ot.expediente_id) {
      await registrarActividad(sb, {
        expedienteId: ctx.ot.expediente_id,
        tipo: "etapa",
        titulo: `Orden ${ctx.ot.folio}: ${destino.nombre}`,
      });
    }
    if (etapa !== ctx.aplicables[0]?.clave) await sincronizarTareasPrecalificacion(sb, ordenTrabajoId);
    if (etapa === "busqueda") await generarSugerencias(ordenTrabajoId);
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo cambiar la etapa." };
  }
}

// ============================================================================
// Precalificación: requisitos, evidencias y dictamen (filtro para la búsqueda)
// ============================================================================

export interface EntradaPrecalificacion {
  respuestas: Record<string, unknown>;
  dictamen: Dictamen | null;
  nota: string | null;
  retomarEl: string | null;
}

/**
 * Guarda las respuestas a los requisitos y el dictamen. "No apto" deja la OT
 * en pausa y, si hay fecha para retomar, agenda una llamada de seguimiento al
 * asesor. Dictamen vacío = reabrir la precalificación.
 */
export async function guardarPrecalificacion(
  ordenTrabajoId: string,
  entrada: EntradaPrecalificacion,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    await verificarAccesoOrden(ctx);

    const tipoCredito = normalizarCredito(ctx.ficha.tipo_credito);
    const requisitos = await cargarRequisitos(sb, tipoCredito);
    const respuestas = normalizarRespuestas(requisitos, entrada.respuestas);
    const dictamen = entrada.dictamen && (DICTAMENES as readonly string[]).includes(entrada.dictamen) ? entrada.dictamen : null;
    if (entrada.dictamen && !dictamen) return { ok: false, mensaje: "Dictamen no válido." };
    if (dictamen && !tipoCredito) return { ok: false, mensaje: "Primero define el tipo de crédito del cliente en la ficha." };
    const nota = (entrada.nota ?? "").trim().slice(0, 1000) || null;
    const retomarEl = dictamen === "no_apto" ? (entrada.retomarEl ?? "").trim() || null : null;

    const evaluacion = evaluarRequisitos(requisitos, respuestas);
    const evidencias = normalizarEvidencias(ctx.ficha.precalificacion_evidencias).length;
    const errores = validarDictamen({ dictamen, nota, retomarEl }, evaluacion, evidencias);
    if (errores.length > 0) return { ok: false, mensaje: errores.join(" ") };

    const cambioDictamen = dictamen !== (ctx.ficha.dictamen ?? null);
    const { error } = await sb.from("ot_ficha_asesoria_compra").upsert(
      {
        orden_trabajo_id: ordenTrabajoId,
        precalificacion_respuestas: respuestas,
        dictamen,
        dictamen_nota: dictamen ? nota : null,
        dictamen_retomar_el: retomarEl,
        ...(cambioDictamen ? { dictamen_en: dictamen ? new Date().toISOString() : null, dictamen_por: dictamen ? usuario?.id ?? null : null } : {}),
      },
      { onConflict: "orden_trabajo_id" },
    );
    if (error) throw new Error(error.message);

    if (cambioDictamen && ctx.ot.expediente_id) {
      const titulo = dictamen
        ? `📋 Precalificación ${ctx.ot.folio}: ${ETIQUETA_DICTAMEN[dictamen]}`
        : `📋 Precalificación ${ctx.ot.folio} reabierta`;
      const detalle = [
        `${evaluacion.cumplen} de ${evaluacion.total} requisitos cumplen`,
        nota,
        retomarEl ? `retomar el ${retomarEl}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      await registrarActividad(sb, { expedienteId: ctx.ot.expediente_id, tipo: "sistema", titulo, detalle });
    }

    // Pausa con recordatorio: llamada de seguimiento en la agenda del asesor.
    if (cambioDictamen && dictamen === "no_apto" && retomarEl) {
      const perfilId = ctx.exp?.asesor_id || ctx.ot.asesor_responsable_id || usuario?.id;
      if (perfilId) {
        const { error: e } = await sb.from("agenda_citas").insert({
          perfil_id: perfilId,
          prospecto_id: ctx.ot.prospecto_id ?? null,
          expediente_id: ctx.ot.expediente_id ?? null,
          cliente_nombre: ctx.exp?.cliente || "Cliente",
          cliente_telefono: ctx.exp?.telefono || "",
          tipo_cita: "llamada",
          fecha: retomarEl,
          hora_inicio: "10:00",
          hora_fin: "10:30",
          notas: `Retomar precalificación de la orden ${ctx.ot.folio}. Motivo de la pausa: ${nota}`,
          estado: "pendiente",
        });
        if (e) console.error("[guardarPrecalificacion] recordatorio", e);
      }
    }

    await sincronizarTareasPrecalificacion(sb, ordenTrabajoId);
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true };
  } catch (err) {
    console.error("[guardarPrecalificacion]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar la precalificación." };
  }
}

const EXT_EVIDENCIA = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const MAX_EVIDENCIAS = 10;

/** URL firmada para subir una evidencia al bucket privado `precalificaciones`. */
export async function prepararSubidaEvidencia(
  ordenTrabajoId: string,
  nombre: string,
): Promise<{ ok: boolean; ruta?: string; token?: string; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const ctx = await cargarOrden(sb, ordenTrabajoId);
  if (!ctx) return { ok: false, error: "La orden de trabajo no existe." };
  await verificarAccesoOrden(ctx);
  if (normalizarEvidencias(ctx.ficha.precalificacion_evidencias).length >= MAX_EVIDENCIAS) {
    return { ok: false, error: `Máximo ${MAX_EVIDENCIAS} evidencias.` };
  }
  const ext = (nombre || "").match(EXT_EVIDENCIA)?.[1]?.toLowerCase();
  if (!ext) return { ok: false, error: "Solo se aceptan PDF o imágenes (JPG, PNG, WEBP, HEIC)." };
  // Ruta opaca: sin el nombre original del archivo ni datos del cliente.
  const ruta = `${ctx.ot.id}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { data, error } = await sb.storage.from(BUCKET_PRECALIFICACIONES).createSignedUploadUrl(ruta);
  if (error || !data) {
    console.error("[prepararSubidaEvidencia]", error);
    return { ok: false, error: "No se pudo preparar la subida." };
  }
  return { ok: true, ruta: data.path, token: data.token };
}

/** Registra en la ficha una evidencia ya subida. */
export async function registrarEvidencia(
  ordenTrabajoId: string,
  ruta: string,
  nombre: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    await verificarAccesoOrden(ctx);
    // Solo rutas generadas por prepararSubidaEvidencia para esta misma OT.
    const archivo = ruta.startsWith(`${ctx.ot.id}/`) ? ruta.slice(ctx.ot.id.length + 1) : "";
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic|heif)$/i.test(archivo)) return { ok: false, mensaje: "Ruta de evidencia no válida." };
    const { data: existe } = await sb.storage.from(BUCKET_PRECALIFICACIONES).list(ctx.ot.id, { search: archivo, limit: 1 });
    if (!existe?.some((o) => o.name === archivo)) return { ok: false, mensaje: "El archivo no se subió." };

    const actuales = normalizarEvidencias(ctx.ficha.precalificacion_evidencias);
    if (actuales.some((e) => e.ruta === ruta)) return { ok: true };
    if (actuales.length >= MAX_EVIDENCIAS) return { ok: false, mensaje: `Máximo ${MAX_EVIDENCIAS} evidencias.` };
    const lista = [...actuales, { ruta, nombre: (nombre || "evidencia").slice(0, 120), subidoEn: new Date().toISOString() }];
    const { error } = await sb
      .from("ot_ficha_asesoria_compra")
      .upsert({ orden_trabajo_id: ordenTrabajoId, precalificacion_evidencias: lista }, { onConflict: "orden_trabajo_id" });
    if (error) throw new Error(error.message);
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true };
  } catch (err) {
    console.error("[registrarEvidencia]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo registrar la evidencia." };
  }
}

/** Quita una evidencia (no deja sin evidencia un dictamen favorable). */
export async function eliminarEvidencia(ordenTrabajoId: string, ruta: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    await verificarAccesoOrden(ctx);
    const actuales = normalizarEvidencias(ctx.ficha.precalificacion_evidencias);
    if (!actuales.some((e) => e.ruta === ruta)) return { ok: true };
    const lista = actuales.filter((e) => e.ruta !== ruta);
    if (lista.length === 0 && (ctx.ficha.dictamen === "apto" || ctx.ficha.dictamen === "apto_condiciones")) {
      return { ok: false, mensaje: "El dictamen favorable necesita al menos una evidencia. Sube otra antes de quitar esta." };
    }
    const { error } = await sb
      .from("ot_ficha_asesoria_compra")
      .update({ precalificacion_evidencias: lista })
      .eq("orden_trabajo_id", ordenTrabajoId);
    if (error) throw new Error(error.message);
    await sb.storage.from(BUCKET_PRECALIFICACIONES).remove([ruta]);
    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true };
  } catch (err) {
    console.error("[eliminarEvidencia]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo quitar la evidencia." };
  }
}

/**
 * Si la precalificación ya pasó el filtro, completa las tareas BPM de la etapa
 * Precalificación que sigan abiertas (en orden: cada una desbloquea la
 * siguiente). Así el flujo queda listo en "Cruzar perfil contra inventario".
 */
async function sincronizarTareasPrecalificacion(sb: Sb, ordenTrabajoId: string) {
  const ctx = await cargarOrden(sb, ordenTrabajoId);
  if (!ctx || ctx.ficha.dictamen === "no_apto") return;
  if ((await pendientesDeFicha(sb, ctx.ficha)).length > 0) return;
  const primera = ctx.aplicables[0]?.clave ?? "precalificacion";
  const { actualizarEstadoTarea } = await import("@/app/actions/bpm");
  // Máximo tantas vueltas como tareas haya en la etapa (cada vuelta completa la que quedó pendiente).
  for (let i = 0; i < 10; i++) {
    const { data: tareas } = await sb
      .from("bpm_expediente_tareas")
      .select("id, estado, paso:paso_id(etapa, orden)")
      .eq("orden_trabajo_id", ordenTrabajoId)
      .eq("estado", "pendiente");
    const siguiente = (tareas ?? [])
      .filter((t: any) => t.paso?.etapa === primera)
      .sort((a: any, b: any) => (a.paso?.orden ?? 0) - (b.paso?.orden ?? 0))[0];
    if (!siguiente) return;
    await actualizarEstadoTarea(siguiente.id, "completada");
  }
}

/** Completa una tarea BPM pendiente de la OT por el título de su paso (pasos automáticos). */
async function completarTareaOrden(sb: Sb, ordenTrabajoId: string, tituloPaso: string) {
  const { data: tareas } = await sb
    .from("bpm_expediente_tareas")
    .select("id, estado, paso:paso_id(titulo_tarea)")
    .eq("orden_trabajo_id", ordenTrabajoId)
    .eq("estado", "pendiente");
  const tarea = (tareas ?? []).find((t: any) => t.paso?.titulo_tarea === tituloPaso);
  if (tarea) {
    const { actualizarEstadoTarea } = await import("@/app/actions/bpm");
    await actualizarEstadoTarea(tarea.id, "completada");
  }
}

// ============================================================================
// Fase 2: inventario de inmuebles, inventario propio y sugerencias (match)
// ============================================================================

const SELECT_INMUEBLE = "*, aliado:aliado_id(nombre)";

type Sb = ReturnType<typeof supabaseServidor>;

export interface FiltrosInventario {
  zona?: string;
  precioMin?: number | null;
  precioMax?: number | null;
  origen?: OrigenInmueble | "";
  estatus?: EstatusInmueble | "";
}

/** Lista el inventario con filtros (menú Inventario). */
export async function listarInmuebles(filtros: FiltrosInventario = {}): Promise<Inmueble[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  let q = sb.from("inmuebles").select(SELECT_INMUEBLE).order("created_at", { ascending: false }).limit(500);
  if (filtros.origen) q = q.eq("origen", filtros.origen);
  if (filtros.estatus) q = q.eq("estatus", filtros.estatus);
  if (filtros.precioMin) q = q.gte("precio", filtros.precioMin);
  if (filtros.precioMax) q = q.lte("precio", filtros.precioMax);
  const zona = (filtros.zona ?? "").trim().replace(/[%,()]/g, " ");
  if (zona) q = q.or(`zona.ilike.%${zona}%,fraccionamiento.ilike.%${zona}%,colonia.ilike.%${zona}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return firmarFotos(sb, (data ?? []).map(filaAInmueble));
}

/** Detalle de un inmueble con todas sus fotos firmadas. */
export async function obtenerInmueble(id: string): Promise<Inmueble | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb.from("inmuebles").select(SELECT_INMUEBLE).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [i] = await firmarFotos(sb, [filaAInmueble(data)]);
  return i;
}

/** URL firmada para que el navegador suba una foto directo al bucket `inmuebles`. */
export async function prepararSubidaFotoInmueble(
  nombre: string,
): Promise<{ ok: boolean; ruta?: string; token?: string; error?: string }> {
  await requireAdmin();
  return prepararSubidaFoto(nombre, "internas");
}

/** "Agregar desde portal": inmueble capturado a mano por SAUCEDA (queda disponible). */
export async function crearInmueblePortal(
  datos: DatosInmuebleRapido,
): Promise<{ ok: true; inmueble: Inmueble } | { ok: false; mensaje: string }> {
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const r = filaInmuebleDesdeFormulario(datos);
    if (!r.ok) return r;
    if (!r.fila.url_fuente) return { ok: false, mensaje: "Pega la URL de la publicación en el portal." };
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("inmuebles")
      .insert({
        ...r.fila,
        origen: "portal",
        estatus: "disponible",
        validado_por: usuario?.id ?? null,
        validado_en: new Date().toISOString(),
      })
      .select(SELECT_INMUEBLE)
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/inventario");
    const [i] = await firmarFotos(sb, [filaAInmueble(data)]);
    return { ok: true, inmueble: i };
  } catch (err) {
    console.error("[crearInmueblePortal]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar el inmueble." };
  }
}

/** Aprobar (→ disponible) o descartar un inmueble; también apartado / vendido. */
export async function cambiarEstatusInmueble(
  id: string,
  estatus: EstatusInmueble,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    if (!(ESTATUS_INMUEBLE as readonly string[]).includes(estatus)) return { ok: false, mensaje: "Estatus inválido." };
    const usuario = await usuarioActual();
    const payload: Record<string, any> = { estatus };
    if (estatus === "disponible") {
      payload.validado_por = usuario?.id ?? null;
      payload.validado_en = new Date().toISOString();
    }
    const sb = supabaseServidor();
    const { error } = await sb.from("inmuebles").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/inventario");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo actualizar." };
  }
}

// ---------------- Inventario propio ----------------

const TIPOS_VENDEDOR = ["promocion_venta", "traspaso_compra"];

/** Expediente vendedor + su ficha de promoción → columnas de `inmuebles` (sin estatus). */
async function filaInventarioPropio(sb: Sb, exp: Record<string, any>, promo: Record<string, any>) {
  const { data: fotos } = await sb
    .from("fotos_expedientes")
    .select("url")
    .eq("expediente_id", exp.id)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  const direccion = [promo.calle, promo.numero_exterior].filter(Boolean).join(" ").trim();
  const colonia = promo.colonia || null;
  const fraccionamiento = exp.fraccionamiento || null;
  const datos = {
    fraccionamiento,
    zona: fraccionamiento || colonia,
    recamaras: promo.num_recamaras ?? null,
    banos: promo.num_banos != null ? Number(promo.num_banos) : null,
    metrosConstruccion: promo.metros_construccion != null ? Number(promo.metros_construccion) : null,
    metrosTerreno: promo.metros_terreno != null ? Number(promo.metros_terreno) : null,
  };
  return {
    origen: "propio",
    expediente_origen_id: exp.id,
    precio: Number(exp.valor_estimado),
    zona: datos.zona,
    fraccionamiento,
    colonia,
    ciudad: promo.ciudad || "León",
    direccion_privada:
      [direccion, colonia, exp.direccion_propiedad && !direccion ? exp.direccion_propiedad : null]
        .filter(Boolean)
        .join(", ") || null,
    metros_construccion: promo.metros_construccion,
    metros_terreno: promo.metros_terreno,
    recamaras: promo.num_recamaras,
    banos: promo.num_banos,
    anio_construccion: promo.anio_construccion,
    estado_conservacion: promo.estado_conservacion,
    tiene_escritura: promo.tiene_escritura,
    tiene_adeudos: promo.tiene_adeudos,
    tiene_litigios: promo.tiene_litigios === true || exp.hay_litigios === true ? true : promo.tiene_litigios,
    fotos: (fotos ?? []).map((f: any) => f.url).filter(Boolean),
    descripcion_publica: descripcionAutomatica(datos),
  };
}

export interface ResultadoSincronizacion {
  ok: boolean;
  creados: number;
  actualizados: number;
  omitidos: { expedienteId: string; motivo: string }[];
  mensaje?: string;
}

/**
 * Convierte los expedientes vendedores (promocion_venta / traspaso_compra) con
 * ficha en `promociones_expedientes` en inmuebles `origen = 'propio'`.
 * Los nuevos quedan `por_validar` (o `disponible` si se publican desde el
 * expediente); los existentes solo actualizan sus datos y conservan su estatus.
 */
export async function sincronizarInventarioPropio(
  opciones: { expedienteId?: string; publicar?: boolean } = {},
): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = { ok: true, creados: 0, actualizados: 0, omitidos: [] };
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const sb = supabaseServidor();

    let q = sb
      .from("expedientes")
      .select("id, tipo_negocio, etapa, fraccionamiento, valor_estimado, direccion_propiedad, hay_litigios")
      .in("tipo_negocio", TIPOS_VENDEDOR);
    if (opciones.expedienteId) q = q.eq("id", opciones.expedienteId);
    const { data: exps, error } = await q;
    if (error) throw new Error(error.message);
    if (opciones.expedienteId && (!exps || exps.length === 0)) {
      return { ...resultado, ok: false, mensaje: "Solo los expedientes de Promoción de venta o Traspaso/Compra se publican al inventario." };
    }

    const ids = (exps ?? []).map((e) => e.id);
    if (ids.length === 0) return resultado;
    const [{ data: promos }, { data: existentes }] = await Promise.all([
      sb.from("promociones_expedientes").select("*").in("expediente_id", ids),
      sb.from("inmuebles").select("id, expediente_origen_id, estatus").in("expediente_origen_id", ids),
    ]);
    const promoPorExp = new Map((promos ?? []).map((p: any) => [p.expediente_id, p]));
    const inmueblePorExp = new Map((existentes ?? []).map((i: any) => [i.expediente_origen_id, i]));

    for (const exp of exps ?? []) {
      const promo = promoPorExp.get(exp.id);
      if (!promo) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Sin ficha de la propiedad (promoción)" });
        continue;
      }
      if (!(Number(exp.valor_estimado) > 0)) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Sin precio (valor estimado)" });
        continue;
      }
      const existente = inmueblePorExp.get(exp.id);
      if (!existente && exp.etapa === "perdido" && !opciones.expedienteId) {
        resultado.omitidos.push({ expedienteId: exp.id, motivo: "Expediente perdido" });
        continue;
      }
      const fila: Record<string, any> = await filaInventarioPropio(sb, exp, promo);
      if (opciones.publicar) {
        fila.estatus = "disponible";
        fila.validado_por = usuario?.id ?? null;
        fila.validado_en = new Date().toISOString();
      }
      if (existente) {
        // Si SAUCEDA ya cerró o descartó el inmueble, no se reabre al sincronizar en lote.
        if (!opciones.publicar) delete fila.estatus;
        const { error: e } = await sb.from("inmuebles").update(fila).eq("id", existente.id);
        if (e) throw new Error(e.message);
        resultado.actualizados++;
      } else {
        if (!fila.estatus) fila.estatus = "por_validar";
        const { error: e } = await sb.from("inmuebles").insert(fila);
        if (e) throw new Error(e.message);
        resultado.creados++;
      }
      if (opciones.expedienteId) {
        await registrarActividad(sb, {
          expedienteId: exp.id,
          tipo: "sistema",
          titulo: "🏘️ Publicado al inventario",
          detalle: existente ? "Se actualizaron los datos del inmueble en el inventario." : "La propiedad ya forma parte del inventario propio.",
        });
      }
    }
    revalidatePath("/inventario");
    return resultado;
  } catch (err) {
    console.error("[sincronizarInventarioPropio]", err);
    return { ...resultado, ok: false, mensaje: err instanceof Error ? err.message : "No se pudo sincronizar." };
  }
}

/** Botón "Publicar al inventario" en el expediente del vendedor. */
export async function publicarAlInventario(expedienteId: string): Promise<ResultadoSincronizacion> {
  return sincronizarInventarioPropio({ expedienteId, publicar: true });
}

/** Inmueble ligado a un expediente vendedor (para mostrar su estado en el botón). */
export async function obtenerInmuebleDeExpediente(expedienteId: string): Promise<{ id: string; folio: string; estatus: EstatusInmueble } | null> {
  await requireAdmin();
  const { data } = await supabaseServidor()
    .from("inmuebles")
    .select("id, folio, estatus")
    .eq("expediente_origen_id", expedienteId)
    .maybeSingle();
  return (data as any) ?? null;
}

// ---------------- Sugerencias y bandeja "Opciones" ----------------

export interface PropuestaInmueble {
  id: string;
  expedienteId: string;
  ordenTrabajoId: string;
  ronda: number;
  scoreMatch: number | null;
  razonesMatch: string[];
  estatus: EstatusPropuesta;
  motivoDescarte: string | null;
  comentarioCliente: string | null;
  publicadaEn: string | null;
  vistaEn: string | null;
  respondidaEn: string | null;
  createdAt: string;
  inmueble: Inmueble;
}

/** Perfil de match a partir de la ficha de la OT. */
function perfilMatchDeFicha(ficha: Record<string, any>): PerfilMatch {
  return { ...filaAPerfil(ficha), tipoCredito: ficha.tipo_credito ?? null };
}

/**
 * Cruza la ficha de la OT contra el inventario disponible y guarda las
 * coincidencias como propuestas `sugerida` (solo las ve SAUCEDA). No duplica
 * inmuebles ya propuestos. Completa la tarea BPM "Cruzar perfil contra
 * inventario propio" si estaba pendiente.
 */
export async function generarSugerencias(
  ordenTrabajoId: string,
): Promise<{ ok: boolean; nuevas: number; evaluados: number; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const ctx = await cargarOrden(sb, ordenTrabajoId);
    if (!ctx) return { ok: false, nuevas: 0, evaluados: 0, mensaje: "La orden de trabajo no existe." };
    if (!ctx.ot.expediente_id) return { ok: false, nuevas: 0, evaluados: 0, mensaje: "La orden no está ligada a un expediente." };
    if (ctx.ficha.ya_tiene_casa) {
      return { ok: false, nuevas: 0, evaluados: 0, mensaje: "El cliente ya tiene casa: no hay búsqueda." };
    }
    const pendientes = await pendientesDeFicha(sb, ctx.ficha);
    if (pendientes.length > 0) {
      return { ok: false, nuevas: 0, evaluados: 0, mensaje: `Antes de buscar falta: ${pendientes.map((x) => x.texto).join(" ")}` };
    }

    const { data: inventario, error } = await sb.from("inmuebles").select("*").eq("estatus", "disponible").limit(2000);
    if (error) throw new Error(error.message);
    const { data: yaPropuestos } = await sb.from("propuestas_inmuebles").select("inmueble_id").eq("orden_trabajo_id", ordenTrabajoId);
    const excluidos = new Set((yaPropuestos ?? []).map((p: any) => p.inmueble_id));
    // El comprador nunca recibe como opción su propia casa (si también es vendedor).
    const candidatos = (inventario ?? []).filter(
      (i: any) => !excluidos.has(i.id) && i.expediente_origen_id !== ctx.ot.expediente_id,
    );

    const ranking = rankearInmuebles(perfilMatchDeFicha(ctx.ficha), candidatos as any[]);
    const ronda = await rondaActual(sb, ordenTrabajoId);
    if (ranking.length > 0) {
      const { error: e } = await sb.from("propuestas_inmuebles").upsert(
        ranking.map((r) => ({
          orden_trabajo_id: ordenTrabajoId,
          expediente_id: ctx.ot.expediente_id,
          inmueble_id: (r.inmueble as any).id,
          ronda,
          score_match: r.score,
          razones_match: r.razones,
          estatus: "sugerida",
        })),
        { onConflict: "orden_trabajo_id,inmueble_id", ignoreDuplicates: true },
      );
      if (e) throw new Error(e.message);
    }

    await registrarActividad(sb, {
      expedienteId: ctx.ot.expediente_id,
      tipo: "sistema",
      titulo: `🏘️ Cruce contra inventario (orden ${ctx.ot.folio})`,
      detalle: `Se evaluaron ${candidatos.length} inmuebles disponibles; ${ranking.length} coinciden con el perfil.`,
    });

    // Completar el paso de sistema del flujo BPM (desbloquea "Enviar solicitud a aliados").
    await completarTareaOrden(sb, ordenTrabajoId, "Cruzar perfil contra inventario propio");

    revalidatePath(`/ordenes-trabajo/${ordenTrabajoId}`);
    return { ok: true, nuevas: ranking.length, evaluados: candidatos.length };
  } catch (err) {
    console.error("[generarSugerencias]", err);
    return { ok: false, nuevas: 0, evaluados: 0, mensaje: err instanceof Error ? err.message : "No se pudo generar." };
  }
}

/** Bandeja "Opciones": propuestas de la OT con su inmueble (vista interna). */
export async function listarPropuestas(ordenTrabajoId: string): Promise<PropuestaInmueble[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("propuestas_inmuebles")
    .select("*, inmueble:inmueble_id(*, aliado:aliado_id(nombre))")
    .eq("orden_trabajo_id", ordenTrabajoId)
    .order("ronda", { ascending: false })
    .order("score_match", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  const filas = (data ?? []).filter((p: any) => p.inmueble);
  const inmuebles = await firmarFotos(sb, filas.map((p: any) => filaAInmueble(p.inmueble)), true);
  return filas.map((p: any, idx: number) => ({
    id: p.id,
    expedienteId: p.expediente_id,
    ordenTrabajoId: p.orden_trabajo_id,
    ronda: p.ronda,
    scoreMatch: p.score_match != null ? Number(p.score_match) : null,
    razonesMatch: p.razones_match ?? [],
    estatus: p.estatus,
    motivoDescarte: p.motivo_descarte,
    comentarioCliente: p.comentario_cliente,
    publicadaEn: p.publicada_en,
    vistaEn: p.vista_en,
    respondidaEn: p.respondida_en,
    createdAt: p.created_at,
    inmueble: inmuebles[idx],
  }));
}

/**
 * Publica una sugerencia para que el cliente la vea en su portal. Más de 5
 * publicadas en la ronda solo genera advertencia (la UI pide confirmación).
 */
export async function publicarPropuesta(
  propuestaId: string,
): Promise<{ ok: boolean; publicadasEnRonda?: number; advertencia?: string; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("propuestas_inmuebles")
      .select("id, expediente_id, orden_trabajo_id, inmueble_id, ronda, estatus, inmueble:inmueble_id(folio, estatus)")
      .eq("id", propuestaId)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    if (p.estatus !== "sugerida") return { ok: false, mensaje: "Solo se publican propuestas sugeridas." };
    const estatusInmueble = (p as any).inmueble?.estatus;
    if (estatusInmueble !== "disponible" && estatusInmueble !== "por_validar") {
      return { ok: false, mensaje: "El inmueble ya no está disponible." };
    }
    await verificarAccesoPropuesta(sb, p.orden_trabajo_id);

    // Casa de aliado aún sin validar: publicar = el asesor la revisó y la valida.
    if (estatusInmueble === "por_validar") {
      const usuario = await usuarioActual();
      const { error: errVal } = await sb
        .from("inmuebles")
        .update({ estatus: "disponible", validado_por: usuario?.id ?? null, validado_en: new Date().toISOString() })
        .eq("id", (p as any).inmueble_id ?? (p as any).inmueble?.id)
        .eq("estatus", "por_validar");
      if (errVal) throw new Error(errVal.message);
    }

    // ¿Ya se avisó al cliente hace poco? (para no mandar un WhatsApp por cada opción publicada)
    const hace15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recientes } = await sb
      .from("propuestas_inmuebles")
      .select("id", { count: "exact", head: true })
      .eq("orden_trabajo_id", p.orden_trabajo_id)
      .gte("publicada_en", hace15);

    const { error } = await sb
      .from("propuestas_inmuebles")
      .update({ estatus: "publicada", publicada_en: new Date().toISOString() })
      .eq("id", propuestaId)
      .eq("estatus", "sugerida");
    if (error) throw new Error(error.message);

    let avisoCliente: string | undefined;
    if (!recientes) {
      const { data: cli } = await sb.from("expedientes").select("cliente, telefono, token").eq("id", p.expediente_id).maybeSingle();
      if (cli?.telefono && cli?.token) {
        const nombre = String(cli.cliente || "").trim().split(/\s+/)[0];
        const wa = await enviarWhatsAppTexto(
          cli.telefono,
          `Hola${nombre ? ` ${nombre}` : ""}, te compartimos nuevas opciones de casa que encontramos para ti 🏡. Revísalas y dinos cuáles te interesan o agenda una visita aquí: ${SITE()}/seguimiento/${cli.token}`,
        );
        avisoCliente = wa.ok
          ? "Se avisó al cliente por WhatsApp."
          : "No se pudo avisar por WhatsApp (puede que la ventana de 24 h esté cerrada); comparte el portal desde Conversaciones.";
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "whatsapp",
          titulo: wa.ok ? "📲 Aviso de nuevas opciones enviado al cliente" : "⚠️ No se pudo enviar el aviso de nuevas opciones",
          detalle: wa.ok ? undefined : wa.error,
        });
      }
    }

    const { count } = await sb
      .from("propuestas_inmuebles")
      .select("id", { count: "exact", head: true })
      .eq("orden_trabajo_id", p.orden_trabajo_id)
      .eq("ronda", p.ronda)
      .not("publicada_en", "is", null);
    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: `📤 Opción publicada al cliente (${(p as any).inmueble?.folio ?? ""})`,
      detalle: `Ronda ${p.ronda}: ${count ?? 0} opciones publicadas.`,
    });
    revalidatePath(`/ordenes-trabajo/${p.orden_trabajo_id}`);
    const publicadas = count ?? 0;
    return {
      ok: true,
      publicadasEnRonda: publicadas,
      advertencia:
        [
          publicadas > MAX_PUBLICADAS_POR_RONDA
            ? `Ya hay ${publicadas} opciones publicadas en la ronda ${p.ronda}; se recomiendan de 3 a ${MAX_PUBLICADAS_POR_RONDA}.`
            : null,
          avisoCliente ?? null,
        ]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo publicar." };
  }
}

/** El asesor descarta una sugerencia (no la verá el cliente). */
export async function descartarSugerencia(propuestaId: string): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { error } = await sb
      .from("propuestas_inmuebles")
      .update({ estatus: "descartada", motivo_descarte: "otro", comentario_cliente: null })
      .eq("id", propuestaId)
      .eq("estatus", "sugerida");
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo descartar." };
  }
}

// ============================================================================
// Fase 4: portal del cliente /seguimiento/[token] — "Tus opciones"
// Todas estas acciones son públicas: validan `expedientes.token` SIEMPRE y
// devuelven solo lo que arma `aOpcionCliente` (lista blanca de campos).
// ============================================================================

export interface PasoPortal {
  id: string;
  nombre: string;
  estado: "hecho" | "actual" | "pendiente";
}

/** Una orden de trabajo de asesoría tal como la ve el cliente. */
export interface ProcesoPortal {
  folio: string;
  titulo: string;
  etapaNombre: string;
  etapaDescripcion: string;
  pasos: PasoPortal[];
  /** Con búsqueda de casa (no aplica si el cliente ya tiene casa). */
  conOpciones: boolean;
  opciones: OpcionCliente[];
}

export interface PortalCliente {
  ok: boolean;
  mensaje?: string;
  primerNombre?: string;
  tipoNegocio?: string;
  etapaNombre?: string;
  etapaDescripcion?: string;
  pasos?: PasoPortal[];
  asesorNombre?: string | null;
  /** Órdenes de trabajo de asesoría de compra del expediente. */
  procesos?: ProcesoPortal[];
}

const SITE = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");

/** Expediente por token público (columnas mínimas). */
async function expedientePorToken(sb: Sb, token: string) {
  if (!esTokenPortalValido(token)) return null;
  const { data } = await sb
    .from("expedientes")
    .select("id, cliente, telefono, prospecto_id, tipo_negocio, etapa, asesor_id, asesor:asesor_id(nombre)")
    .eq("token", token)
    .maybeSingle();
  return data as any;
}

/** Propuesta visible para el cliente dueño del token. */
async function propuestaDelCliente(sb: Sb, expedienteId: string, propuestaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(propuestaId)) return null;
  const { data } = await sb
    .from("propuestas_inmuebles")
    .select("id, expediente_id, orden_trabajo_id, estatus, vista_en, inmueble:inmueble_id(folio, precio, fraccionamiento, zona)")
    .eq("id", propuestaId)
    .eq("expediente_id", expedienteId)
    .maybeSingle();
  if (!data || !ESTATUS_VISIBLES_CLIENTE.includes(data.estatus as EstatusPropuesta)) return null;
  return data as any;
}

/** Pasos para el cliente a partir de una lista ordenada y la posición actual. */
function armarPasos(lista: { id: string; nombre: string }[], actual: string | null): PasoPortal[] {
  const idx = lista.findIndex((e) => e.id === actual);
  return lista.map((e, i) => ({
    id: e.id,
    nombre: e.nombre,
    estado: idx === -1 ? "pendiente" : i < idx ? "hecho" : i === idx ? "actual" : "pendiente",
  }));
}

/**
 * Portal del cliente: estatus de su expediente y, por cada orden de trabajo
 * de asesoría de compra, su avance y sus opciones de casa.
 */
export async function obtenerPortalCliente(token: string): Promise<PortalCliente> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Este enlace no es válido. Usa el que te enviamos por WhatsApp." };

  const lista = obtenerEtapasPorNegocio(exp.tipo_negocio).filter((e) => e.id !== "perdido" && e.id !== "en_pausa");
  const actual = obtenerEtapasPorId(exp.tipo_negocio)[exp.etapa];
  const pasos = armarPasos(lista.map((e) => ({ id: e.id, nombre: e.nombreCliente })), exp.etapa);

  const { data: ots } = await sb
    .from("ordenes_trabajo")
    .select("id")
    .eq("expediente_id", exp.id)
    .eq("tipo_negocio", TIPO_OT)
    .neq("estatus", "cancelada")
    .order("created_at", { ascending: true });

  const procesos: ProcesoPortal[] = [];
  for (const { id } of ots ?? []) {
    const ctx = await cargarOrden(sb, id);
    if (!ctx) continue;
    const etapaActual = ctx.aplicables.find((e) => e.clave === ctx.ot.etapa) ?? ctx.aplicables[0];
    const conOpciones = !ctx.ficha.ya_tiene_casa;
    let opciones: OpcionCliente[] = [];
    if (conOpciones) {
      const { data: props } = await sb
        .from("propuestas_inmuebles")
        .select("id, estatus, publicada_en, inmueble:inmueble_id(*)")
        .eq("orden_trabajo_id", id)
        .in("estatus", ESTATUS_VISIBLES_CLIENTE)
        .order("publicada_en", { ascending: false });
      const filas = (props ?? []).filter((p: any) => p.inmueble);
      const ids = filas.map((p: any) => p.id);
      const { data: citas } = ids.length
        ? await sb
            .from("agenda_citas")
            .select("propuesta_id, fecha, hora_inicio, estado")
            .in("propuesta_id", ids)
            .neq("estado", "cancelada")
            .order("fecha", { ascending: false })
        : { data: [] as any[] };
      const firmados = await firmarFotos(sb, filas.map((p: any) => filaAInmueble(p.inmueble)));
      opciones = filas.map((p: any, i: number) =>
        aOpcionCliente(
          { id: p.id, estatus: p.estatus },
          p.inmueble,
          firmados[i].fotosUrl,
          (citas ?? []).find((c: any) => c.propuesta_id === p.id) ?? null,
        ),
      );
    }
    procesos.push({
      folio: ctx.ot.folio,
      titulo: ctx.ficha.ya_tiene_casa ? "Trámite de compra de tu casa" : "Búsqueda y compra de tu casa",
      etapaNombre: etapaActual?.nombreCliente ?? "En proceso",
      etapaDescripcion: etapaActual?.descripcionCliente ?? "",
      pasos: armarPasos(ctx.aplicables.map((e) => ({ id: e.clave, nombre: e.nombreCliente })), ctx.ot.etapa),
      conOpciones,
      opciones,
    });
  }

  return {
    ok: true,
    primerNombre: String(exp.cliente || "").trim().split(/\s+/)[0] || "",
    tipoNegocio: exp.tipo_negocio,
    etapaNombre: actual?.nombreCliente ?? "En proceso",
    etapaDescripcion: actual?.descripcionCliente ?? "",
    pasos,
    asesorNombre: exp.asesor?.nombre ?? null,
    procesos,
  };
}

/** El cliente abrió la opción: publicada → vista. */
export async function marcarOpcionVista(token: string, propuestaId: string): Promise<{ ok: boolean }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p || p.estatus !== "publicada") return { ok: Boolean(p) };
  await sb
    .from("propuestas_inmuebles")
    .update({ estatus: "vista", vista_en: new Date().toISOString() })
    .eq("id", p.id)
    .eq("estatus", "publicada");
  return { ok: true };
}

/** "Me interesa" o "Descartar" (con motivo) desde el portal. */
export async function responderOpcion(
  token: string,
  propuestaId: string,
  respuesta: { accion: "me_interesa" | "descartar"; motivo?: string; comentario?: string },
): Promise<{ ok: boolean; mensaje?: string }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Enlace no válido." };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p) return { ok: false, mensaje: "Esta opción ya no está disponible." };
  if (!ESTATUS_RESPONDIBLES.includes(p.estatus)) return { ok: false, mensaje: "Esta opción ya tiene una visita en proceso." };

  const comentario = (respuesta.comentario ?? "").trim().slice(0, 500) || null;
  const ahora = new Date().toISOString();
  let payload: Record<string, any>;
  if (respuesta.accion === "descartar") {
    if (!esMotivoDescarte(respuesta.motivo)) return { ok: false, mensaje: "Elige un motivo." };
    payload = { estatus: "descartada", motivo_descarte: respuesta.motivo, comentario_cliente: comentario, respondida_en: ahora };
  } else {
    payload = { estatus: "me_interesa", comentario_cliente: comentario, respondida_en: ahora };
  }
  payload.vista_en = p.vista_en ?? ahora;
  const { error } = await sb.from("propuestas_inmuebles").update(payload).eq("id", p.id);
  if (error) return { ok: false, mensaje: "No se pudo guardar tu respuesta." };

  const casa = `${p.inmueble?.folio ?? ""} (${formatoPesos(Number(p.inmueble?.precio ?? 0))}${p.inmueble?.fraccionamiento ? `, ${p.inmueble.fraccionamiento}` : ""})`;
  const titulo =
    respuesta.accion === "descartar"
      ? `👎 El cliente descartó ${casa}: ${ETIQUETA_MOTIVO_DESCARTE[respuesta.motivo as MotivoDescarte]}`
      : `👍 Al cliente le interesa ${casa}`;
  await registrarActividad(sb, { expedienteId: exp.id, tipo: "sistema", titulo, detalle: comentario ?? undefined });
  if (respuesta.accion === "me_interesa") {
    await notificarAsesorTelegram(sb, {
      asesorId: exp.asesor_id,
      expedienteId: exp.id,
      texto: `👍 <b>${exp.id}</b>: al cliente le interesa ${casa}.${comentario ? `\n💬 ${comentario}` : ""}`,
    });
  }
  return { ok: true };
}

/** "Agendar visita": crea la cita ligada a la propuesta y avisa al asesor. */
export async function agendarVisitaOpcion(
  token: string,
  propuestaId: string,
  fecha: string,
  hora: string,
  comentario?: string,
): Promise<{ ok: boolean; mensaje?: string }> {
  const sb = supabaseServidor();
  const exp = await expedientePorToken(sb, token);
  if (!exp) return { ok: false, mensaje: "Enlace no válido." };
  const p = await propuestaDelCliente(sb, exp.id, propuestaId);
  if (!p) return { ok: false, mensaje: "Esta opción ya no está disponible." };
  if (!ESTATUS_RESPONDIBLES.includes(p.estatus)) return { ok: false, mensaje: "Esta opción ya tiene una visita agendada." };
  const v = validarFechaVisita(fecha, hora);
  if (!v.ok) return v;

  const perfilId = exp.asesor_id || (await obtenerIdAsesorGerardo(sb));
  if (!perfilId) return { ok: false, mensaje: "No pudimos agendar en este momento. Escríbenos por WhatsApp." };
  const nota = (comentario ?? "").trim().slice(0, 500);
  const { error } = await sb.from("agenda_citas").insert({
    perfil_id: perfilId,
    expediente_id: exp.id,
    prospecto_id: exp.prospecto_id ?? null,
    propuesta_id: p.id,
    cliente_nombre: exp.cliente || "Cliente",
    cliente_telefono: exp.telefono || "",
    tipo_cita: "venta",
    fecha,
    hora_inicio: `${hora}:00`,
    hora_fin: `${v.horaFin}:00`,
    estado: "pendiente",
    fraccionamiento: p.inmueble?.fraccionamiento || p.inmueble?.zona || null,
    notas: `Visita a ${p.inmueble?.folio ?? "inmueble"} solicitada por el cliente desde su portal.${nota ? ` Comentario: ${nota}` : ""}`,
  });
  if (error) {
    console.error("[agendarVisitaOpcion]", error);
    return { ok: false, mensaje: "No se pudo agendar la visita." };
  }
  await sb
    .from("propuestas_inmuebles")
    .update({ estatus: "visita_agendada", respondida_en: new Date().toISOString(), comentario_cliente: nota || null })
    .eq("id", p.id);

  const casa = `${p.inmueble?.folio ?? ""} (${formatoPesos(Number(p.inmueble?.precio ?? 0))})`;
  await registrarActividad(sb, {
    expedienteId: exp.id,
    tipo: "visita",
    titulo: `🗓️ El cliente agendó visita a ${casa}`,
    detalle: `${fecha} a las ${hora}. Confirma con el cliente y coordina el acceso.`,
  });
  await notificarAsesorTelegram(sb, {
    asesorId: exp.asesor_id,
    expedienteId: exp.id,
    texto: `🗓️ <b>${exp.id}</b>: el cliente pidió visitar ${casa} el <b>${fecha}</b> a las <b>${hora}</b>.${nota ? `\n💬 ${nota}` : ""}\nConfirma la cita y coordina el acceso con el vendedor o aliado.`,
  });
  return { ok: true };
}

// ============================================================================
// Fase 5: seguimiento de la propuesta, cierre y KPIs
// ============================================================================

/** El asesor registra el avance de una propuesta tras la visita (visitada / ofertada). */
export async function actualizarEstatusPropuesta(
  propuestaId: string,
  estatus: "visitada" | "ofertada",
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdmin();
    if (estatus !== "visitada" && estatus !== "ofertada") return { ok: false, mensaje: "Estatus inválido." };
    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("propuestas_inmuebles")
      .select("id, expediente_id, orden_trabajo_id, estatus")
      .eq("id", propuestaId)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    const permitidos = estatus === "visitada" ? ["me_interesa", "visita_agendada"] : ["me_interesa", "visita_agendada", "visitada"];
    if (!permitidos.includes(p.estatus)) return { ok: false, mensaje: "La propuesta no está en una etapa que permita ese cambio." };
    await verificarAccesoPropuesta(sb, p.orden_trabajo_id);
    const { error } = await sb.from("propuestas_inmuebles").update({ estatus }).eq("id", p.id);
    if (error) throw new Error(error.message);
    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: estatus === "visitada" ? "🏠 Visita realizada" : "💬 Oferta presentada",
    });
    // Con la oferta presentada, la OT pasa a Negociación (si seguía en Búsqueda).
    if (estatus === "ofertada") {
      await sb.from("ordenes_trabajo").update({ etapa: "negociacion" }).eq("id", p.orden_trabajo_id).eq("etapa", "busqueda");
    }
    revalidatePath(`/ordenes-trabajo/${p.orden_trabajo_id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo actualizar." };
  }
}

/**
 * Cierre de la compra: la propuesta queda `elegida`, el inmueble `vendido`,
 * se guardan el precio y la fecha de escritura y, si la casa la aportó un
 * aliado, se crea en `comisiones` su pago (honorarios del lado comprador de
 * `comisiones_reglas` × su % compartido). Idempotente por propuesta.
 */
export async function registrarCierreCompra(
  propuestaId: string,
  datos: { precioCompraventa: number | string; fechaEscritura: string },
): Promise<{ ok: boolean; mensaje?: string; comisionAliado?: number | null }> {
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const precio = aMonto(datos.precioCompraventa);
    if (!precio || precio <= 0) return { ok: false, mensaje: "Captura el precio de compraventa." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaEscritura)) return { ok: false, mensaje: "Captura la fecha de firma de la escritura." };

    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("propuestas_inmuebles")
      .select("id, expediente_id, orden_trabajo_id, estatus, inmueble:inmueble_id(id, folio, origen, aliado_id, estatus)")
      .eq("id", propuestaId)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "La propuesta no existe." };
    if (!["me_interesa", "visita_agendada", "visitada", "ofertada", "elegida"].includes(p.estatus)) {
      return { ok: false, mensaje: "Solo se cierra una opción que el cliente ya visitó u ofertó." };
    }
    const inm = (p as any).inmueble;
    const ctx = await verificarAccesoPropuesta(sb, p.orden_trabajo_id);
    if (!ctx) return { ok: false, mensaje: "La orden de trabajo no existe." };
    const exp = { cliente: ctx.exp?.cliente ?? "" };

    // Otra propuesta de la misma OT ya elegida → no se permiten dos cierres.
    const { data: otra } = await sb
      .from("propuestas_inmuebles")
      .select("id")
      .eq("orden_trabajo_id", p.orden_trabajo_id)
      .eq("estatus", "elegida")
      .neq("id", p.id)
      .limit(1);
    if (otra && otra.length > 0) return { ok: false, mensaje: "Esta orden de trabajo ya tiene otra casa elegida." };

    const ahora = new Date().toISOString();
    await sb.from("propuestas_inmuebles").update({ estatus: "elegida", respondida_en: ahora }).eq("id", p.id);
    if (inm?.id) await sb.from("inmuebles").update({ estatus: "vendido" }).eq("id", inm.id);
    // El cierre se guarda en la ficha de la OT (no en el expediente).
    await sb
      .from("ot_ficha_asesoria_compra")
      .upsert(
        { orden_trabajo_id: p.orden_trabajo_id, precio_compraventa: precio, fecha_escritura: datos.fechaEscritura },
        { onConflict: "orden_trabajo_id" },
      );
    // Con la escritura firmada, la OT pasa a Entrega (si no estaba ya ahí o cerrada).
    if (!["entrega", "cerrada"].includes(ctx.ot.etapa ?? "")) {
      await sb.from("ordenes_trabajo").update({ etapa: "entrega", estatus: "en_proceso" }).eq("id", p.orden_trabajo_id);
    }

    let comisionAliado: number | null = null;
    if (inm?.origen === "aliado" && inm.aliado_id) {
      const [{ data: aliado }, { data: regla }] = await Promise.all([
        sb.from("proveedores").select("nombre, comision_compartida_pct, convenio_estatus, convenio_contrato_id").eq("id", inm.aliado_id).maybeSingle(),
        sb
          .from("comisiones_reglas")
          .select("porcentaje")
          .eq("tipo", "servicio")
          .eq("clave", "asesoria_compra_honorarios")
          .eq("activo", true)
          .maybeSingle(),
      ]);
      if (!regla) {
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "sistema",
          titulo: "⚠️ Falta la regla de honorarios del lado comprador",
          detalle: "Configura en Comisiones la regla de servicio 'asesoria_compra_honorarios' para calcular el pago al aliado.",
        });
      } else if (aliado && aliado.comision_compartida_pct != null) {
        const calc = calcularComisionAliado(precio, Number(regla.porcentaje), Number(aliado.comision_compartida_pct));
        comisionAliado = calc.montoAliado;
        const { data: existente } = await sb
          .from("comisiones")
          .select("id")
          .eq("propuesta_id", p.id)
          .eq("tipo_comision", "aliado")
          .neq("estatus", "cancelada")
          .maybeSingle();
        const fila = {
          tipo_comision: "aliado",
          proveedor_id: inm.aliado_id,
          asesor_id: null,
          expediente_id: p.expediente_id,
          orden_trabajo_id: p.orden_trabajo_id,
          propuesta_id: p.id,
          fecha: datos.fechaEscritura,
          monto_venta: precio,
          base_comisionable: calc.honorarios,
          porcentaje_comision: calc.pctEfectivo,
          monto_comision: calc.montoAliado,
          saldo_pendiente: calc.montoAliado,
          notas: `Comisión compartida con ${aliado.nombre} por ${inm.folio}.`,
          detalles_calculo: {
            origen: "asesoria_compra",
            folio: inm.folio,
            clienteNombre: exp.cliente,
            aliado: aliado.nombre,
            precioCompraventa: precio,
            pctHonorarios: calc.pctHonorarios,
            honorarios: calc.honorarios,
            pctAliado: calc.pctAliado,
            convenioContratoId: aliado.convenio_contrato_id,
            convenioEstatus: aliado.convenio_estatus,
          },
        };
        const { error: errCom } = existente
          ? await sb.from("comisiones").update(fila).eq("id", existente.id)
          : await sb.from("comisiones").insert(fila);
        if (errCom) throw new Error(errCom.message);
      } else {
        await registrarActividad(sb, {
          expedienteId: p.expediente_id,
          tipo: "sistema",
          titulo: "⚠️ El aliado no tiene % de comisión compartida",
          detalle: "Captura el % en el menú Aliados y vuelve a registrar el cierre para generar su comisión.",
        });
      }
    }

    await registrarActividad(sb, {
      expedienteId: p.expediente_id,
      tipo: "sistema",
      titulo: `🔑 Cierre: ${inm?.folio ?? "inmueble"} por ${formatoPesos(precio)}`,
      detalle: [
        `Escritura firmada el ${datos.fechaEscritura}.`,
        comisionAliado !== null ? `Comisión al aliado: ${formatoPesos(comisionAliado)}.` : null,
        usuario?.email ? `Registró: ${usuario.email}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
    revalidatePath(`/ordenes-trabajo/${p.orden_trabajo_id}`);
    return { ok: true, comisionAliado };
  } catch (err) {
    console.error("[registrarCierreCompra]", err);
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo registrar el cierre." };
  }
}

export interface KpisAsesoriaCompra {
  expedientes: number;
  diasPrecalificacionAPrimeraOpcion: number | null;
  opcionesPorRonda: number | null;
  tasaMeInteresa: number | null;
  tasaVisitaAOferta: number | null;
  cierres: number;
  cierresPorOrigen: { propio: number; aliado: number; portal: number };
  diasCaptacionAEscritura: number | null;
  aliados: { nombre: string; busquedas: number; tasaRespuesta: number | null; casas: number }[];
}

const promedio = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** KPIs de la línea (vistas v_asesoria_compra_kpis y v_asesoria_compra_aliados_kpis). */
export async function obtenerKpisAsesoriaCompra(): Promise<KpisAsesoriaCompra> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data: filas }, { data: aliados }] = await Promise.all([
    sb.from("v_asesoria_compra_kpis").select("*"),
    sb.from("v_asesoria_compra_aliados_kpis").select("*").order("busquedas", { ascending: false }),
  ]);
  const f = (filas ?? []) as any[];
  const num = (k: string) => f.map((r) => r[k]).filter((v) => v !== null && v !== undefined).map(Number);
  const publicadas = f.reduce((a, r) => a + Number(r.opciones_publicadas || 0), 0);
  const conInteres = f.reduce((a, r) => a + Number(r.opciones_con_interes || 0), 0);
  const visitadas = f.reduce((a, r) => a + Number(r.opciones_visitadas || 0), 0);
  const ofertadas = f.reduce((a, r) => a + Number(r.opciones_ofertadas || 0), 0);
  const rondas = f.reduce((a, r) => a + Number(r.rondas || 0), 0);
  const cierres = f.filter((r) => r.origen_cierre);
  return {
    expedientes: f.length,
    diasPrecalificacionAPrimeraOpcion: promedio(num("dias_precalificacion_a_primera_opcion")),
    opcionesPorRonda: rondas ? Math.round((publicadas / rondas) * 10) / 10 : null,
    tasaMeInteresa: publicadas ? conInteres / publicadas : null,
    tasaVisitaAOferta: visitadas ? ofertadas / visitadas : null,
    cierres: cierres.length,
    cierresPorOrigen: {
      propio: cierres.filter((r) => r.origen_cierre === "propio").length,
      aliado: cierres.filter((r) => r.origen_cierre === "aliado").length,
      portal: cierres.filter((r) => r.origen_cierre === "portal").length,
    },
    diasCaptacionAEscritura: promedio(num("dias_captacion_a_escritura")),
    aliados: ((aliados ?? []) as any[]).map((a) => ({
      nombre: a.nombre,
      busquedas: Number(a.busquedas),
      tasaRespuesta: a.tasa_respuesta === null ? null : Number(a.tasa_respuesta),
      casas: Number(a.casas_recibidas),
    })),
  };
}
