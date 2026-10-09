"use server";

/**
 * Server actions de aliados inmobiliarios (asesoría de compra, Fase 3).
 *
 * - Internas (requieren sesión): alta y edición de aliados, convenio, link de
 *   carga, lanzar búsquedas y consultar su estado.
 * - Públicas (link /aliados/carga/[token]): SIEMPRE validan el token del
 *   aliado en el servidor antes de leer o escribir. Nunca devuelven datos del
 *   cliente (nombre, teléfono) ni de otros aliados.
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, requireAdministrador, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import { formatoPesos } from "@/lib/formato";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { validarCompuertaEtapa } from "@/lib/asesoria/compuerta";
import { normalizarZonas } from "@/lib/asesoria/perfil";
import { calcularMatch, type PerfilMatch } from "@/lib/asesoria/match";
import { filaAPerfil } from "@/lib/asesoria/perfil";
import { filaInmuebleDesdeFormulario, type DatosInmuebleRapido } from "@/lib/asesoria/inmueble-form";
import { prepararSubidaFoto, rondaActual } from "@/lib/asesoria/servidor";
import {
  CONVENIO_ESTATUS,
  ESTATUS_ACEPTADA,
  HORAS_LIMITE_BUSQUEDA,
  armarMensajeBusqueda,
  calcularCalificacionAliado,
  construirCriteriosSnapshot,
  esTokenCargaValido,
  estadoEfectivo,
  generarTokenCarga,
  zonasSeCruzan,
  type ConvenioEstatus,
  type CriteriosBusqueda,
  type EstadoBusqueda,
} from "@/lib/asesoria/aliados";

type Sb = ReturnType<typeof supabaseServidor>;

const SITE_URL = () => (process.env.SITE_URL || "https://crm.saucedamx.com").replace(/\/$/, "");
const MIN_FOTOS_ALIADO = 5;
const MAX_FOTOS_ALIADO = 15;

const linkCarga = (token: string, busquedaId?: string | null) =>
  `${SITE_URL()}/aliados/carga/${token}${busquedaId ? `?b=${busquedaId}` : ""}`;

function nuevoToken(): string {
  return generarTokenCarga(crypto.getRandomValues(new Uint8Array(32)));
}

/** Marca como vencidas las solicitudes abiertas cuya fecha límite ya pasó. */
async function marcarVencidas(sb: Sb) {
  await sb
    .from("busquedas_aliados")
    .update({ estado: "vencida" })
    .in("estado", ["enviada", "vista"])
    .lt("fecha_limite", new Date().toISOString());
}

/** Nombre de usuario del bot (para el enlace de vinculación t.me/<bot>?start=prov_<id>). */
async function usuarioBot(sb: Sb): Promise<string | null> {
  try {
    const { botToken } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return null;
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { cache: "no-store" });
    const j = await r.json();
    return j?.ok ? j.result?.username || null : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Internas: catálogo de aliados
// ============================================================================

export interface Aliado {
  id: string;
  nombre: string;
  contactoNombre: string;
  telefono: string;
  whatsapp: string | null;
  email: string;
  zonasCobertura: string[];
  convenioEstatus: ConvenioEstatus;
  convenioContratoId: string | null;
  comisionCompartidaPct: number | null;
  calificacion: number | null;
  activo: boolean;
  telegramVinculado: boolean;
  enlaceTelegram: string | null;
  linkCarga: string | null;
  busquedasTotal: number;
  busquedasRespondidas: number;
  busquedasAbiertas: number;
  casasAportadas: number;
  notas: string;
}

export interface DatosAliado {
  nombre: string;
  contactoNombre?: string;
  telefono?: string;
  whatsapp?: string;
  email?: string;
  zonasCobertura?: string[] | string;
  comisionCompartidaPct?: number | string | null;
  notas?: string;
}

/** Menú Aliados: lista con zonas, convenio, calificación, búsquedas y casas aportadas. */
export async function listarAliados(): Promise<Aliado[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  await marcarVencidas(sb);

  const { data: provs, error } = await sb
    .from("proveedores")
    .select("*")
    .eq("es_aliado_inmobiliario", true)
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (provs ?? []).map((p: any) => p.id);
  if (ids.length === 0) return [];

  const [{ data: busquedas }, { data: inmuebles }, bot] = await Promise.all([
    sb.from("busquedas_aliados").select("aliado_id, estado, fecha_limite").in("aliado_id", ids),
    sb.from("inmuebles").select("id, aliado_id").in("aliado_id", ids),
    usuarioBot(sb),
  ]);
  const inmuebleAliado = new Map((inmuebles ?? []).map((i: any) => [i.id, i.aliado_id]));
  const idsInmuebles = Array.from(inmuebleAliado.keys());
  const { data: propuestas } = idsInmuebles.length
    ? await sb.from("propuestas_inmuebles").select("inmueble_id, estatus, publicada_en").in("inmueble_id", idsInmuebles)
    : { data: [] as any[] };

  const resultado: Aliado[] = [];
  for (const p of provs ?? []) {
    const suyas = (busquedas ?? [])
      .filter((b: any) => b.aliado_id === p.id)
      .map((b: any) => ({ estado: estadoEfectivo(b.estado, b.fecha_limite) as EstadoBusqueda }));
    const props = (propuestas ?? []).filter((x: any) => inmuebleAliado.get(x.inmueble_id) === p.id && x.publicada_en);
    const calificacion = calcularCalificacionAliado({
      busquedas: suyas,
      propuestasPublicadas: props.length,
      propuestasAceptadas: props.filter((x: any) => ESTATUS_ACEPTADA.includes(x.estatus)).length,
    });
    // La calificación se guarda para usarla en reportes / KPIs.
    if (calificacion !== (p.calificacion === null ? null : Number(p.calificacion))) {
      await sb.from("proveedores").update({ calificacion }).eq("id", p.id);
    }
    resultado.push({
      id: p.id,
      nombre: p.nombre,
      contactoNombre: p.contacto_nombre || "",
      telefono: p.telefono || "",
      whatsapp: p.whatsapp,
      email: p.email || "",
      zonasCobertura: p.zonas_cobertura ?? [],
      convenioEstatus: p.convenio_estatus,
      convenioContratoId: p.convenio_contrato_id,
      comisionCompartidaPct: p.comision_compartida_pct != null ? Number(p.comision_compartida_pct) : null,
      calificacion,
      activo: p.activo,
      telegramVinculado: Boolean(p.telegram_chat_id),
      enlaceTelegram: bot ? `https://t.me/${bot}?start=prov_${p.id}` : null,
      linkCarga: p.token_carga ? linkCarga(p.token_carga) : null,
      busquedasTotal: suyas.length,
      busquedasRespondidas: suyas.filter((b) => b.estado === "respondida" || b.estado === "sin_resultados").length,
      busquedasAbiertas: suyas.filter((b) => b.estado === "enviada" || b.estado === "vista").length,
      casasAportadas: (inmuebles ?? []).filter((i: any) => i.aliado_id === p.id).length,
      notas: p.notas || "",
    });
  }
  return resultado;
}

/** Alta o edición de un aliado (se guarda como proveedor con es_aliado_inmobiliario = true). */
export async function guardarAliado(
  datos: DatosAliado,
  id?: string,
): Promise<{ ok: true; id: string } | { ok: false; mensaje: string }> {
  try {
    await requireAdmin();
    const nombre = (datos.nombre || "").trim();
    if (!nombre) return { ok: false, mensaje: "El nombre del aliado es obligatorio." };
    const pctTexto = datos.comisionCompartidaPct;
    const pct = pctTexto === null || pctTexto === undefined || pctTexto === "" ? null : Number(String(pctTexto).replace(/[^\d.]/g, ""));
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      return { ok: false, mensaje: "El % de comisión compartida debe estar entre 0 y 100." };
    }
    const fila = {
      nombre,
      contacto_nombre: (datos.contactoNombre || "").trim(),
      telefono: (datos.telefono || "").trim(),
      whatsapp: (datos.whatsapp || "").replace(/[^\d+]/g, "") || null,
      email: (datos.email || "").trim(),
      zonas_cobertura: normalizarZonas(datos.zonasCobertura ?? []),
      comision_compartida_pct: pct,
      notas: (datos.notas || "").trim(),
      es_aliado_inmobiliario: true,
      categoria: "Aliado inmobiliario",
    };
    const sb = supabaseServidor();
    if (id) {
      const { error } = await sb.from("proveedores").update(fila).eq("id", id).eq("es_aliado_inmobiliario", true);
      if (error) throw new Error(error.message);
      revalidatePath("/aliados");
      return { ok: true, id };
    }
    const { data, error } = await sb
      .from("proveedores")
      .insert({ ...fila, token_carga: nuevoToken() })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/aliados");
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo guardar el aliado." };
  }
}

/**
 * Cambia el estatus del convenio (solo administradores). En la fase de
 * convenios esto lo hará el flujo de `contratos`; mientras, se registra a mano.
 */
export async function cambiarConvenioAliado(
  id: string,
  estatus: ConvenioEstatus,
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    await requireAdministrador();
    if (!(CONVENIO_ESTATUS as readonly string[]).includes(estatus)) return { ok: false, mensaje: "Estatus inválido." };
    const { error } = await supabaseServidor()
      .from("proveedores")
      .update({ convenio_estatus: estatus })
      .eq("id", id)
      .eq("es_aliado_inmobiliario", true);
    if (error) throw new Error(error.message);
    revalidatePath("/aliados");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo actualizar el convenio." };
  }
}

/** Devuelve el link permanente de carga (lo crea si no existe; `regenerar` invalida el anterior). */
export async function obtenerLinkCarga(
  id: string,
  regenerar = false,
): Promise<{ ok: boolean; link?: string; mensaje?: string }> {
  try {
    if (regenerar) await requireAdministrador();
    else await requireAdmin();
    const sb = supabaseServidor();
    const { data: p } = await sb
      .from("proveedores")
      .select("token_carga")
      .eq("id", id)
      .eq("es_aliado_inmobiliario", true)
      .maybeSingle();
    if (!p) return { ok: false, mensaje: "El aliado no existe." };
    let token = p.token_carga as string | null;
    if (!token || regenerar) {
      token = nuevoToken();
      const { error } = await sb.from("proveedores").update({ token_carga: token }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/aliados");
    return { ok: true, link: linkCarga(token) };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "No se pudo obtener el link." };
  }
}

// ============================================================================
// Internas: búsquedas desde el expediente comprador
// ============================================================================

export interface AliadoParaBusqueda {
  id: string;
  nombre: string;
  zonasCobertura: string[];
  convenioEstatus: ConvenioEstatus;
  calificacion: number | null;
  telegramVinculado: boolean;
  /** Sus zonas se cruzan con las del cliente (preseleccionado). */
  sugerido: boolean;
  /** Solo se puede enviar con convenio firmado. */
  habilitado: boolean;
  motivo: string | null;
}

/** Aliados para el panel "Lanzar búsqueda", con preselección por zona y bloqueo sin convenio. */
export async function aliadosParaExpediente(expedienteId: string): Promise<AliadoParaBusqueda[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data: exp }, { data: provs }] = await Promise.all([
    sb.from("expedientes").select("busqueda_zonas").eq("id", expedienteId).maybeSingle(),
    sb
      .from("proveedores")
      .select("id, nombre, zonas_cobertura, convenio_estatus, calificacion, telegram_chat_id, activo")
      .eq("es_aliado_inmobiliario", true)
      .eq("activo", true)
      .order("nombre"),
  ]);
  return (provs ?? [])
    .map((p: any) => {
      const habilitado = p.convenio_estatus === "firmado";
      return {
        id: p.id,
        nombre: p.nombre,
        zonasCobertura: p.zonas_cobertura ?? [],
        convenioEstatus: p.convenio_estatus,
        calificacion: p.calificacion != null ? Number(p.calificacion) : null,
        telegramVinculado: Boolean(p.telegram_chat_id),
        sugerido: habilitado && zonasSeCruzan(p.zonas_cobertura, exp?.busqueda_zonas),
        habilitado,
        motivo: habilitado ? null : p.convenio_estatus === "suspendido" ? "Convenio suspendido" : "Sin convenio firmado",
      };
    })
    .sort((a, b) => Number(b.sugerido) - Number(a.sugerido) || Number(b.habilitado) - Number(a.habilitado));
}

export interface BusquedaAliado {
  id: string;
  aliadoId: string;
  aliadoNombre: string;
  ronda: number;
  canal: string | null;
  estado: EstadoBusqueda;
  fechaLimite: string;
  inmueblesRecibidos: number;
  createdAt: string;
  respondidaAt: string | null;
  criterios: CriteriosBusqueda;
  /** Link de carga ligado a esta solicitud. */
  link: string | null;
  /** Texto listo para compartir por WhatsApp si no tiene Telegram. */
  mensajeTexto: string | null;
  whatsappAliado: string | null;
}

/** Estado de cada solicitud a aliados del expediente. */
export async function listarBusquedasExpediente(expedienteId: string): Promise<BusquedaAliado[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  await marcarVencidas(sb);
  const { data, error } = await sb
    .from("busquedas_aliados")
    .select("*, aliado:aliado_id(nombre, token_carga, whatsapp, telefono)")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((b: any) => {
    const link = b.aliado?.token_carga ? linkCarga(b.aliado.token_carga, b.id) : null;
    return {
      id: b.id,
      aliadoId: b.aliado_id,
      aliadoNombre: b.aliado?.nombre ?? "—",
      ronda: b.ronda,
      canal: b.canal,
      estado: b.estado,
      fechaLimite: b.fecha_limite,
      inmueblesRecibidos: b.inmuebles_recibidos,
      createdAt: b.created_at,
      respondidaAt: b.respondida_at,
      criterios: b.criterios_snapshot,
      link,
      mensajeTexto: link
        ? armarMensajeBusqueda(b.criterios_snapshot, { link, fechaLimite: b.fecha_limite, formato: "texto" })
        : null,
      whatsappAliado: (b.aliado?.whatsapp || b.aliado?.telefono || "").replace(/\D/g, "") || null,
    };
  });
}

export interface ResultadoLanzarBusqueda {
  ok: boolean;
  mensaje?: string;
  enviadas: number;
  porTelegram: number;
  /** Aliados sin Telegram: hay que compartirles el mensaje a mano (WhatsApp). */
  manuales: string[];
  rechazados: string[];
}

/**
 * Lanza la búsqueda a aliados: guarda una `busquedas_aliados` por aliado con
 * el snapshot de criterios (sin datos personales del cliente) y les envía por
 * Telegram la solicitud con el link de carga. Solo aliados con convenio firmado.
 */
export async function lanzarBusqueda(
  expedienteId: string,
  aliadoIds: string[],
  opciones: { nuevaRonda?: boolean } = {},
): Promise<ResultadoLanzarBusqueda> {
  const r: ResultadoLanzarBusqueda = { ok: false, enviadas: 0, porTelegram: 0, manuales: [], rechazados: [] };
  try {
    await requireAdmin();
    const usuario = await usuarioActual();
    const ids = Array.from(new Set(aliadoIds)).filter(Boolean);
    if (ids.length === 0) return { ...r, mensaje: "Selecciona al menos un aliado." };

    const sb = supabaseServidor();
    const { data: exp } = await sb.from("expedientes").select("*").eq("id", expedienteId).maybeSingle();
    if (!exp) return { ...r, mensaje: "El expediente no existe." };
    if (exp.tipo_negocio !== "asesoria_compra") return { ...r, mensaje: "Solo aplica a expedientes de asesoría de compra." };
    const compuerta = validarCompuertaEtapa(
      {
        tipoNegocio: exp.tipo_negocio,
        montoCreditoPrecalificado: exp.monto_credito_precalificado,
        busquedaZonas: exp.busqueda_zonas,
        yaTieneCasa: exp.ya_tiene_casa,
      },
      "busqueda",
    );
    if (!compuerta.ok) return { ...r, mensaje: compuerta.mensaje };

    const { data: provs } = await sb
      .from("proveedores")
      .select("id, nombre, convenio_estatus, activo, es_aliado_inmobiliario, telegram_chat_id, token_carga")
      .in("id", ids);
    const validos = (provs ?? []).filter(
      (p: any) => p.es_aliado_inmobiliario && p.activo && p.convenio_estatus === "firmado",
    );
    r.rechazados = (provs ?? []).filter((p: any) => !validos.includes(p)).map((p: any) => p.nombre);
    if (validos.length === 0) {
      return { ...r, mensaje: "Ninguno de los aliados seleccionados tiene convenio firmado." };
    }

    const ronda = (await rondaActual(sb, expedienteId)) + (opciones.nuevaRonda ? 1 : 0);
    const criterios = construirCriteriosSnapshot(exp);
    const fechaLimite = new Date(Date.now() + HORAS_LIMITE_BUSQUEDA * 3600 * 1000).toISOString();
    const { botToken } = await obtenerConfiguracionTelegram(sb);

    for (const p of validos as any[]) {
      let token = p.token_carga as string | null;
      if (!token) {
        token = nuevoToken();
        await sb.from("proveedores").update({ token_carga: token }).eq("id", p.id);
      }
      const { data: busqueda, error } = await sb
        .from("busquedas_aliados")
        .insert({
          expediente_id: expedienteId,
          aliado_id: p.id,
          ronda,
          criterios_snapshot: criterios,
          canal: "manual",
          fecha_limite: fechaLimite,
          enviada_por: usuario?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !busqueda) throw new Error(error?.message || "No se pudo registrar la búsqueda.");
      r.enviadas++;

      const link = linkCarga(token, busqueda.id);
      let enviadoTelegram = false;
      if (p.telegram_chat_id && botToken) {
        const envio = await enviarMensajeTelegram({
          botToken,
          chatId: p.telegram_chat_id,
          parseMode: "HTML",
          texto: armarMensajeBusqueda(criterios, { link, fechaLimite, formato: "html" }),
          inlineKeyboard: [
            [{ text: "📤 Subir casas", url: link }],
            [{ text: "🚫 No tengo casas para esta búsqueda", callback_data: `bsr:${busqueda.id}` }],
          ],
        });
        if (envio.ok) {
          enviadoTelegram = true;
          r.porTelegram++;
          await sb
            .from("busquedas_aliados")
            .update({ canal: "telegram", telegram_message_id: envio.messageId ? String(envio.messageId) : null })
            .eq("id", busqueda.id);
        }
      }
      if (!enviadoTelegram) r.manuales.push(p.nombre);
    }

    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: `📨 Búsqueda enviada a ${r.enviadas} aliado${r.enviadas === 1 ? "" : "s"} (ronda ${ronda})`,
      detalle: [
        `Por Telegram: ${r.porTelegram}.`,
        r.manuales.length ? `Compartir a mano: ${r.manuales.join(", ")}.` : null,
        r.rechazados.length ? `Sin convenio firmado (no se enviaron): ${r.rechazados.join(", ")}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });

    // Completar la tarea BPM "Enviar solicitud a aliados de la zona" (desbloquea "Validar y publicar").
    const { data: tareas } = await sb
      .from("bpm_expediente_tareas")
      .select("id, estado, paso:paso_id(titulo_tarea)")
      .eq("expediente_id", expedienteId)
      .eq("estado", "pendiente");
    const tarea = (tareas ?? []).find((t: any) => t.paso?.titulo_tarea === "Enviar solicitud a aliados de la zona");
    if (tarea) {
      const { actualizarEstadoTarea } = await import("@/app/actions/bpm");
      await actualizarEstadoTarea(tarea.id, "completada");
    }

    revalidatePath(`/expediente/${expedienteId}`);
    return { ...r, ok: true };
  } catch (err) {
    console.error("[lanzarBusqueda]", err);
    return { ...r, ok: false, mensaje: err instanceof Error ? err.message : "No se pudo lanzar la búsqueda." };
  }
}

// ============================================================================
// Públicas: link de carga /aliados/carga/[token]  (validan el token SIEMPRE)
// ============================================================================

interface AliadoToken {
  id: string;
  nombre: string;
  convenio_estatus: ConvenioEstatus;
}

async function aliadoPorToken(sb: Sb, token: string): Promise<AliadoToken | null> {
  if (!esTokenCargaValido(token)) return null;
  const { data } = await sb
    .from("proveedores")
    .select("id, nombre, convenio_estatus, activo, es_aliado_inmobiliario")
    .eq("token_carga", token)
    .maybeSingle();
  if (!data || !data.activo || !data.es_aliado_inmobiliario || data.convenio_estatus === "suspendido") return null;
  return { id: data.id, nombre: data.nombre, convenio_estatus: data.convenio_estatus };
}

/** Solicitud del aliado (solo si le pertenece). */
async function busquedaDelAliado(sb: Sb, aliadoId: string, busquedaId: string | null | undefined) {
  if (!busquedaId || !/^[0-9a-f-]{36}$/i.test(busquedaId)) return null;
  const { data } = await sb
    .from("busquedas_aliados")
    .select("id, expediente_id, aliado_id, ronda, criterios_snapshot, estado, fecha_limite, inmuebles_recibidos, respondida_at")
    .eq("id", busquedaId)
    .eq("aliado_id", aliadoId)
    .maybeSingle();
  return data;
}

export interface ContextoCarga {
  ok: boolean;
  mensaje?: string;
  aliadoNombre?: string;
  busqueda?: {
    id: string;
    criterios: CriteriosBusqueda;
    fechaLimite: string;
    estado: EstadoBusqueda;
    inmueblesRecibidos: number;
  } | null;
}

/** Datos que ve el aliado al abrir su link. Marca la solicitud como vista. */
export async function obtenerContextoCarga(token: string, busquedaId?: string | null): Promise<ContextoCarga> {
  const sb = supabaseServidor();
  const aliado = await aliadoPorToken(sb, token);
  if (!aliado) return { ok: false, mensaje: "Este link no es válido o fue desactivado. Pide uno nuevo a SAUCEDA." };
  const b = await busquedaDelAliado(sb, aliado.id, busquedaId);
  let estado = b ? estadoEfectivo(b.estado, b.fecha_limite) : null;
  if (b && estado === "enviada") {
    await sb.from("busquedas_aliados").update({ estado: "vista" }).eq("id", b.id).eq("estado", "enviada");
    estado = "vista";
  }
  return {
    ok: true,
    aliadoNombre: aliado.nombre,
    busqueda: b
      ? {
          id: b.id,
          criterios: b.criterios_snapshot,
          fechaLimite: b.fecha_limite,
          estado: estado as EstadoBusqueda,
          inmueblesRecibidos: b.inmuebles_recibidos,
        }
      : null,
  };
}

/** URL firmada para que el aliado suba una foto (carpeta propia del aliado). */
export async function prepararSubidaFotoAliado(
  token: string,
  nombre: string,
): Promise<{ ok: boolean; ruta?: string; token?: string; error?: string }> {
  const sb = supabaseServidor();
  const aliado = await aliadoPorToken(sb, token);
  if (!aliado) return { ok: false, error: "Link no válido." };
  return prepararSubidaFoto(nombre, "externas");
}

/** Notifica al asesor del expediente (o al grupo) que llegó una casa de un aliado. */
async function notificarCasaRecibida(
  sb: Sb,
  datos: { aliado: string; folio: string; precio: number; zona: string | null; expedienteId: string | null; asesorId: string | null },
) {
  try {
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (!botToken) return;
    let chatId: string | null = null;
    if (datos.asesorId) {
      const { data: perfil } = await sb.from("perfiles").select("telegram_chat_id").eq("id", datos.asesorId).maybeSingle();
      chatId = perfil?.telegram_chat_id || null;
    }
    chatId = chatId || chatIdGrupo || null;
    if (!chatId) return;
    const destino = datos.expedienteId ? `${SITE_URL()}/expediente/${datos.expedienteId}` : `${SITE_URL()}/inventario`;
    await enviarMensajeTelegram({
      botToken,
      chatId,
      parseMode: "HTML",
      texto: [
        `🏠 <b>${datos.aliado}</b> subió una casa: <b>${datos.folio}</b>`,
        `💰 ${formatoPesos(datos.precio)}${datos.zona ? ` · 📍 ${datos.zona}` : ""}`,
        datos.expedienteId ? `Para el expediente <b>${datos.expedienteId}</b>: revísala en la bandeja Opciones.` : "Queda por validar en Inventario.",
      ].join("\n"),
      inlineKeyboard: [[{ text: "Abrir en el CRM", url: destino }]],
    });
  } catch (err) {
    console.warn("[notificarCasaRecibida]", err);
  }
}

/**
 * El aliado sube una casa desde su link. Se crea el inmueble `por_validar`;
 * si viene de una solicitud, se suma a `inmuebles_recibidos` y se propone como
 * `sugerida` en el expediente comprador de esa solicitud.
 */
export async function enviarInmuebleAliado(
  token: string,
  busquedaId: string | null,
  datos: DatosInmuebleRapido,
): Promise<{ ok: boolean; mensaje?: string; folio?: string }> {
  try {
    const sb = supabaseServidor();
    const aliado = await aliadoPorToken(sb, token);
    if (!aliado) return { ok: false, mensaje: "Este link no es válido o fue desactivado." };

    // Solo rutas generadas por prepararSubidaFotoAliado (carpeta externa, nombre aleatorio).
    const fotos = (datos.fotos ?? []).filter(
      (f) => typeof f === "string" && /^externas\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpe?g|png|webp|heic|heif)$/i.test(f),
    );
    if (fotos.length < MIN_FOTOS_ALIADO) return { ok: false, mensaje: `Sube al menos ${MIN_FOTOS_ALIADO} fotos.` };
    if (fotos.length > MAX_FOTOS_ALIADO) return { ok: false, mensaje: `Máximo ${MAX_FOTOS_ALIADO} fotos.` };

    // El aliado no captura litigios, URL de portal ni notas internas.
    const r = filaInmuebleDesdeFormulario({ ...datos, fotos, tieneLitigios: null, urlFuente: "", notasInternas: "" });
    if (!r.ok) return r;

    const b = await busquedaDelAliado(sb, aliado.id, busquedaId);
    const { data: inm, error } = await sb
      .from("inmuebles")
      .insert({ ...r.fila, origen: "aliado", aliado_id: aliado.id, estatus: "por_validar" })
      .select("*")
      .single();
    if (error || !inm) throw new Error(error?.message || "No se pudo guardar la casa.");

    let asesorId: string | null = null;
    if (b) {
      await sb
        .from("busquedas_aliados")
        .update({
          estado: "respondida",
          respondida_at: b.respondida_at ?? new Date().toISOString(),
          inmuebles_recibidos: (b.inmuebles_recibidos ?? 0) + 1,
        })
        .eq("id", b.id);

      const { data: exp } = await sb.from("expedientes").select("*").eq("id", b.expediente_id).maybeSingle();
      if (exp) {
        asesorId = exp.asesor_id;
        const perfil: PerfilMatch = { ...filaAPerfil(exp), tipoCredito: exp.tipo_credito ?? null };
        // Se puntúa como si ya estuviera validada; el asesor la valida al publicar.
        const match = calcularMatch(perfil, { ...inm, origen: "aliado", estatus: "disponible", precio: Number(inm.precio) });
        await sb.from("propuestas_inmuebles").upsert(
          {
            expediente_id: b.expediente_id,
            inmueble_id: inm.id,
            busqueda_id: b.id,
            ronda: b.ronda,
            score_match: match.score,
            razones_match: ["⚠ Casa de aliado por validar", ...match.razones],
            estatus: "sugerida",
          },
          { onConflict: "expediente_id,inmueble_id", ignoreDuplicates: true },
        );
        await registrarActividad(sb, {
          expedienteId: b.expediente_id,
          tipo: "sistema",
          titulo: `🏠 ${aliado.nombre} envió la casa ${inm.folio}`,
          detalle: `${formatoPesos(Number(inm.precio))}${inm.fraccionamiento || inm.zona ? ` en ${inm.fraccionamiento || inm.zona}` : ""}. Match ${match.score}${match.cumple ? "" : " (no cumple algún filtro)"}.`,
        });
      }
    }

    await notificarCasaRecibida(sb, {
      aliado: aliado.nombre,
      folio: inm.folio,
      precio: Number(inm.precio),
      zona: inm.fraccionamiento || inm.zona,
      expedienteId: b?.expediente_id ?? null,
      asesorId,
    });

    return { ok: true, folio: inm.folio };
  } catch (err) {
    console.error("[enviarInmuebleAliado]", err);
    return { ok: false, mensaje: "No se pudo guardar la casa. Intenta de nuevo." };
  }
}

/** El aliado indica que no tiene casas para la solicitud. */
export async function marcarSinResultadosAliado(token: string, busquedaId: string): Promise<{ ok: boolean; mensaje?: string }> {
  const sb = supabaseServidor();
  const aliado = await aliadoPorToken(sb, token);
  if (!aliado) return { ok: false, mensaje: "Link no válido." };
  const b = await busquedaDelAliado(sb, aliado.id, busquedaId);
  if (!b) return { ok: false, mensaje: "La solicitud no existe." };
  if (b.estado === "respondida") return { ok: true };
  await sb
    .from("busquedas_aliados")
    .update({ estado: "sin_resultados", respondida_at: new Date().toISOString() })
    .eq("id", b.id);
  await registrarActividad(sb, {
    expedienteId: b.expediente_id,
    tipo: "sistema",
    titulo: `🚫 ${aliado.nombre} no tiene casas para la búsqueda`,
  });
  return { ok: true };
}
