import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESTADOS_RETRO_COORDINACION,
  ESTADOS_RETRO_LEAD,
  ETIQUETA_ESTADO_COORDINACION,
  type AsesorPortal,
  type CoordinacionPortal,
  type DetalleLeadCompartido,
  type LeadCompartidoPortal,
  type OpcionHorario,
  type Retroalimentacion,
} from "@/lib/portal-asesor-tipos";
import { labelTipoNegocio } from "@/lib/types";
import { TODAS_LAS_ETAPAS_POR_ID } from "@/lib/etapas";

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

/** Clientes compartidos por Telegram. Con `asesorId`, solo los suyos; `conDetalle` agrega negocio/prospecto (CRM). */
export async function listarLeadsConRetro(
  sb: SupabaseClient,
  opciones: { asesorId?: string; dias?: number; conDetalle?: boolean } = {}
): Promise<LeadCompartidoPortal[]> {
  const desde = new Date(Date.now() - (opciones.dias ?? DIAS_LEADS) * 86400000).toISOString();
  let q = sb
    .from("leads_envios_telegram")
    .select(
      "id, cliente_nombre, telefono, nota, resumen, asesor_id, asesor_nombre, enviado_por_nombre, estado, created_at, prospecto_id, expediente_id"
    )
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (opciones.asesorId) q = q.eq("asesor_id", opciones.asesorId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const filas = data || [];
  const [retros, detalles] = await Promise.all([
    retroPorReferencia(sb, "envio_lead_id", filas.map((f: any) => f.id)),
    opciones.conDetalle ? detallesLeads(sb, filas) : Promise.resolve(new Map<string, DetalleLeadCompartido>()),
  ]);
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
    detalle: detalles.get(f.id),
  }));
}

/** Expediente, prospecto, cotizaciones y teléfono del asesor de cada envío. */
async function detallesLeads(sb: SupabaseClient, filas: any[]): Promise<Map<string, DetalleLeadCompartido>> {
  const unicos = (xs: any[]) => Array.from(new Set(xs.filter(Boolean))) as string[];
  const prosIds = unicos(filas.map((f) => f.prospecto_id));
  const expIdsDirectos = unicos(filas.map((f) => f.expediente_id));

  const [{ data: pros }, { data: exps }, { data: cots }, { data: asesores }] = await Promise.all([
    prosIds.length
      ? sb.from("prospectos").select("id, correo, origen, notas, direccion").in("id", prosIds)
      : Promise.resolve({ data: [] as any[] }),
    expIdsDirectos.length || prosIds.length
      ? sb
          .from("expedientes")
          .select(
            "id, prospecto_id, etapa, tipo_negocio, valor_estimado, saldo_deuda, tipo_credito, fraccionamiento, direccion_propiedad, necesidad, created_at"
          )
          .or(
            [
              expIdsDirectos.length ? `id.in.(${expIdsDirectos.join(",")})` : "",
              prosIds.length ? `prospecto_id.in.(${prosIds.join(",")})` : "",
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    prosIds.length
      ? sb
          .from("cotizaciones")
          .select("id, prospecto_id, estatus, precio_final, token, created_at")
          .in("prospecto_id", prosIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    sb.from("perfiles").select("id, telefono").in("id", unicos(filas.map((f) => f.asesor_id))),
  ]);

  const prosPorId = new Map((pros || []).map((p: any) => [p.id, p]));
  const expPorId = new Map((exps || []).map((e: any) => [e.id, e]));
  const expPorPros = new Map<string, any>();
  (exps || []).forEach((e: any) => e.prospecto_id && !expPorPros.has(e.prospecto_id) && expPorPros.set(e.prospecto_id, e));
  const cotsPorPros = new Map<string, any[]>();
  (cots || []).forEach((c: any) => cotsPorPros.set(c.prospecto_id, [...(cotsPorPros.get(c.prospecto_id) || []), c]));
  const telAsesor = new Map((asesores || []).map((a: any) => [a.id, a.telefono || ""]));

  const mapa = new Map<string, DetalleLeadCompartido>();
  filas.forEach((f) => {
    const p: any = f.prospecto_id ? prosPorId.get(f.prospecto_id) : null;
    const e: any = (f.expediente_id && expPorId.get(f.expediente_id)) || (f.prospecto_id && expPorPros.get(f.prospecto_id)) || null;
    const lista = (f.prospecto_id && cotsPorPros.get(f.prospecto_id)) || [];
    const vivas = lista.filter((c: any) => !["rechazada", "archivada"].includes(c.estatus));
    const ult = lista[0];
    mapa.set(f.id, {
      expedienteId: e?.id ?? f.expediente_id ?? null,
      prospectoId: f.prospecto_id ?? null,
      tipoNegocio: e?.tipo_negocio ? labelTipoNegocio(e.tipo_negocio) : "",
      etapa: e?.etapa ? TODAS_LAS_ETAPAS_POR_ID[e.etapa]?.nombre || e.etapa : "",
      valorEstimado: Number(e?.valor_estimado) || 0,
      saldoDeuda: Number(e?.saldo_deuda) || 0,
      tipoCredito: e?.tipo_credito || "",
      fraccionamiento: e?.fraccionamiento || "",
      direccion: e?.direccion_propiedad || p?.direccion || "",
      necesidad: String(e?.necesidad || p?.notas || "").trim(),
      correo: p?.correo || "",
      origen: p?.origen || "",
      cotizaciones: lista.length,
      montoCotizado: vivas.reduce((s: number, c: any) => s + (Number(c.precio_final) || 0), 0),
      ultimaCotizacion: ult ? { id: ult.id, estatus: ult.estatus, precio: Number(ult.precio_final) || 0, token: ult.token } : null,
      asesorTelefono: telAsesor.get(f.asesor_id) || "",
    });
  });
  return mapa;
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
