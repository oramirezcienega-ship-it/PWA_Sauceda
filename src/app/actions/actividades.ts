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

/** Registra una actividad manual (nota, llamada, correo, reunión). */
export async function crearActividadManual(datos: {
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
