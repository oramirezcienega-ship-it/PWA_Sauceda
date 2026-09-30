"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { registrarActividad } from "@/lib/actividades";
import type { Actividad, TipoActividad } from "@/lib/types";

interface FilaActividad {
  id: string;
  tipo: TipoActividad;
  titulo: string;
  detalle: string;
  created_at: string;
}

function aActividad(f: FilaActividad): Actividad {
  return {
    id: f.id,
    tipo: f.tipo,
    titulo: f.titulo,
    detalle: f.detalle,
    fecha: f.created_at,
  };
}

export async function listarActividadesDeExpediente(
  expedienteId: string,
): Promise<Actividad[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("actividades")
    .select("*")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaActividad[]).map(aActividad);
}

export async function listarActividadesDeProspecto(
  prospectoId: string,
): Promise<Actividad[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("actividades")
    .select("*")
    .eq("prospecto_id", prospectoId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaActividad[]).map(aActividad);
}

export async function listarActividadesDeEmpresa(
  empresaId: string,
): Promise<Actividad[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("actividades")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false });
  if (error) {
    // Fallback tolerante si la columna aún no está migrada
    console.warn("No se pudieron cargar actividades de empresa:", error.message);
    return [];
  }
  return (data as FilaActividad[]).map(aActividad);
}

/** Registra una actividad manual (nota, llamada, correo, reunión). */
export async function crearActividadManual(datos: {
  empresaId?: string | null;
  expedienteId?: string | null;
  prospectoId?: string | null;
  tipo: TipoActividad;
  titulo: string;
  detalle?: string;
}): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  await registrarActividad(sb, datos);
}

export interface MensajeCampanaTimeline {
  id: string;
  campana_origen: string | null;
  texto: string;
  created_at: string;
  leido_at: string | null;
  entregado_at: string | null;
  estado: string;
  agente: string;
}

/** Devuelve los mensajes de campañas de WhatsApp (Mautic / automatizaciones) vinculados a la entidad */
export async function listarCampanasWhatsAppDeEntidad(
  prospectoId?: string | null,
  expedienteId?: string | null,
): Promise<MensajeCampanaTimeline[]> {
  await requireAdmin();
  const sb = supabaseServidor();

  const filtros: string[] = [];
  if (expedienteId) filtros.push(`expediente_id.eq.${expedienteId}`);
  if (prospectoId) filtros.push(`prospecto_id.eq.${prospectoId}`);

  if (filtros.length === 0) return [];

  const { data, error } = await sb
    .from("mensajes_whatsapp")
    .select("id, campana_origen, texto, created_at, leido_at, entregado_at, estado, agente")
    .eq("direccion", "out")
    .or(filtros.join(","))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("No se pudieron cargar mensajes de campaña:", error.message);
    return [];
  }

  // Filtrar los que tengan campana_origen o contengan la etiqueta [Campaña:
  const items = (data || []).filter(
    (m: any) =>
      Boolean(m.campana_origen) ||
      m.texto?.includes("[Campaña:") ||
      m.texto?.includes("[campaña:")
  );

  return items as MensajeCampanaTimeline[];
}

