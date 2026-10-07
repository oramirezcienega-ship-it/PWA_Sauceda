import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESTADOS_RETRO_COORDINACION,
  ESTADOS_RETRO_LEAD,
  ETIQUETA_ESTADO_COORDINACION,
  type AsesorPortal,
  type CoordinacionPortal,
  type LeadCompartidoPortal,
  type OpcionHorario,
  type Retroalimentacion,
} from "@/lib/portal-asesor-tipos";

export * from "@/lib/portal-asesor-tipos";

/**
 * PORTAL DEL ASESOR (link personal sin login)
 *
 * Cada asesor tiene un token fijo en perfiles.portal_token. Con /asesor/{token}
 * ve sus coordinaciones de inspección y los clientes que se le compartieron,
 * vota horarios y deja retroalimentación. El token se regenera desde el CRM.
 */

export const URL_BASE_PORTAL = process.env.SITE_URL || "https://crm.saucedamx.com";

// Ventanas de tiempo que se muestran en el portal y en el CRM
const DIAS_COORDINACIONES = 45;
const DIAS_LEADS = 60;

const ESTADOS_VOTABLES = ["propuesta_enviada", "evaluando"];

export function generarTokenPortal(): string {
  return randomBytes(18).toString("base64url");
}

export function urlPortalAsesor(token: string): string {
  return `${URL_BASE_PORTAL}/asesor/${token}`;
}

/** Devuelve el asesor dueño del token, o null si no existe o está inactivo. */
export async function asesorPorToken(sb: SupabaseClient, token: string): Promise<AsesorPortal | null> {
  if (!token || token.length < 16) return null;
  const { data } = await sb
    .from("perfiles")
    .select("id, nombre, activo")
    .eq("portal_token", token)
    .maybeSingle();
  if (!data || data.activo === false) return null;
  return { id: data.id, nombre: data.nombre };
}

/** Token del asesor; lo crea si aún no tiene. */
export async function obtenerOCrearTokenPortal(sb: SupabaseClient, asesorId: string): Promise<string | null> {
  const { data } = await sb.from("perfiles").select("portal_token").eq("id", asesorId).maybeSingle();
  if (!data) return null;
  if (data.portal_token) return data.portal_token;
  const token = generarTokenPortal();
  const { error } = await sb.from("perfiles").update({ portal_token: token }).eq("id", asesorId);
  return error ? null : token;
}

const etiquetaRetro = (tipo: "coordinacion" | "lead", estado: string) =>
  (tipo === "coordinacion"
    ? (ESTADOS_RETRO_COORDINACION as Record<string, string>)[estado]
    : (ESTADOS_RETRO_LEAD as Record<string, string>)[estado]) || estado;

async function nombresPerfiles(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return new Map();
  const { data } = await sb.from("perfiles").select("id, nombre").in("id", unicos);
  return new Map((data || []).map((p: any) => [p.id, p.nombre]));
}

async function retroPorReferencia(
  sb: SupabaseClient,
  columna: "coordinacion_id" | "envio_lead_id",
  ids: string[]
): Promise<Map<string, Retroalimentacion[]>> {
  const mapa = new Map<string, Retroalimentacion[]>();
  if (ids.length === 0) return mapa;
  const { data } = await sb
    .from("retroalimentacion_asesor")
    .select("*")
    .in(columna, ids)
    .order("created_at", { ascending: false });
  const nombres = await nombresPerfiles(sb, (data || []).map((r: any) => r.asesor_id));
  (data || []).forEach((r: any) => {
    const clave = r[columna];
    const lista = mapa.get(clave) || [];
    lista.push({
      id: r.id,
      asesorId: r.asesor_id,
      asesorNombre: nombres.get(r.asesor_id) || "Asesor",
      estado: r.estado,
      estadoLabel: etiquetaRetro(r.tipo, r.estado),
      clientePresente: r.cliente_presente,
      siguientePaso: r.siguiente_paso || "",
      siguientePasoFecha: r.siguiente_paso_fecha,
      comentario: r.comentario || "",
      createdAt: r.created_at,
    });
    mapa.set(clave, lista);
  });
  return mapa;
}

/**
 * Coordinaciones recientes (sin canceladas en el portal). Con `asesorId`, solo las suyas
 * y con sus votos; sin él, todas (vista del CRM).
 */
export async function listarCoordinacionesConRetro(
  sb: SupabaseClient,
  opciones: { asesorId?: string; incluirCanceladas?: boolean; dias?: number } = {}
): Promise<CoordinacionPortal[]> {
  const desde = new Date(Date.now() - (opciones.dias ?? DIAS_COORDINACIONES) * 86400000).toISOString();
  let q = sb
    .from("coordinaciones_inspeccion")
    .select(
      "id, cliente_nombre, cliente_telefono, servicio_nombre, ubicacion, fraccionamiento, detalles_tecnicos, estado, asesores_ids, opciones_horarios, opciones_validadas, opcion_seleccionada_id, respuestas_asesores, created_at"
    )
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (opciones.asesorId) q = q.contains("asesores_ids", [opciones.asesorId]);
  if (!opciones.incluirCanceladas) q = q.neq("estado", "cancelada");
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const filas = data || [];
  const nombres = await nombresPerfiles(sb, filas.flatMap((f: any) => f.asesores_ids || []));
  const retros = await retroPorReferencia(sb, "coordinacion_id", filas.map((f: any) => f.id));

  return filas.map((f: any) => {
    const respuestas = (f.respuestas_asesores || {}) as Record<string, any>;
    const opcionesH: OpcionHorario[] = (f.opciones_horarios || []).map((o: any) => ({
      id: String(o.id),
      label: o.label || `${o.fecha} ${o.horaInicio || ""}`.trim(),
      fecha: o.fecha || "",
    }));
    const seleccionada = opcionesH.find((o) => o.id === f.opcion_seleccionada_id) || null;
    return {
      id: f.id,
      clienteNombre: f.cliente_nombre || "",
      clienteTelefono: f.cliente_telefono || "",
      servicioNombre: f.servicio_nombre || "",
      ubicacion: f.ubicacion || "",
      fraccionamiento: f.fraccionamiento || "",
      detalles: f.detalles_tecnicos || "",
      estado: f.estado,
      estadoLabel: ETIQUETA_ESTADO_COORDINACION[f.estado] || f.estado,
      asesores: (f.asesores_ids || []).map((id: string) => ({
        id,
        nombre: nombres.get(id) || respuestas[id]?.nombre || "Asesor",
        respondio: Boolean(respuestas[id]?.respondidoAt),
      })),
      opciones: opcionesH,
      opcionesValidadas: f.opciones_validadas || [],
      misVotos: opciones.asesorId ? respuestas[opciones.asesorId]?.votos || {} : {},
      puedeVotar: ESTADOS_VOTABLES.includes(f.estado) && opcionesH.length > 0,
      horarioConfirmado: seleccionada?.label || null,
      fechaInspeccion: seleccionada?.fecha || null,
      createdAt: f.created_at,
      retro: retros.get(f.id) || [],
    };
  });
}

/** Clientes compartidos por Telegram. Con `asesorId`, solo los suyos. */
export async function listarLeadsConRetro(
  sb: SupabaseClient,
  opciones: { asesorId?: string; dias?: number } = {}
): Promise<LeadCompartidoPortal[]> {
  const desde = new Date(Date.now() - (opciones.dias ?? DIAS_LEADS) * 86400000).toISOString();
  let q = sb
    .from("leads_envios_telegram")
    .select("id, cliente_nombre, telefono, nota, resumen, asesor_id, asesor_nombre, enviado_por_nombre, estado, created_at")
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (opciones.asesorId) q = q.eq("asesor_id", opciones.asesorId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const filas = data || [];
  const retros = await retroPorReferencia(sb, "envio_lead_id", filas.map((f: any) => f.id));
  return filas.map((f: any) => ({
    id: f.id,
    clienteNombre: f.cliente_nombre || "Cliente",
    telefono: f.telefono || "",
    nota: f.nota || "",
    resumen: f.resumen || "",
    asesorId: f.asesor_id,
    asesorNombre: f.asesor_nombre || "",
    enviadoPor: f.enviado_por_nombre || "",
    estadoEnvio: f.estado,
    createdAt: f.created_at,
    retro: retros.get(f.id) || [],
  }));
}

export async function guardarRetroalimentacion(
  sb: SupabaseClient,
  datos: {
    asesorId: string;
    tipo: "coordinacion" | "lead";
    referenciaId: string;
    estado: string;
    clientePresente?: boolean | null;
    siguientePaso?: string;
    siguientePasoFecha?: string | null;
    comentario?: string;
  }
): Promise<void> {
  const validos = datos.tipo === "coordinacion" ? ESTADOS_RETRO_COORDINACION : ESTADOS_RETRO_LEAD;
  if (!(datos.estado in validos)) throw new Error("Estado no válido.");
  const { error } = await sb.from("retroalimentacion_asesor").insert({
    asesor_id: datos.asesorId,
    tipo: datos.tipo,
    coordinacion_id: datos.tipo === "coordinacion" ? datos.referenciaId : null,
    envio_lead_id: datos.tipo === "lead" ? datos.referenciaId : null,
    estado: datos.estado,
    cliente_presente: datos.tipo === "coordinacion" ? datos.clientePresente ?? null : null,
    siguiente_paso: (datos.siguientePaso || "").trim().slice(0, 500),
    siguiente_paso_fecha: datos.siguientePasoFecha || null,
    comentario: (datos.comentario || "").trim().slice(0, 2000),
  });
  if (error) throw new Error(error.message);
}
