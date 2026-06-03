"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import type {
  Automatizacion,
  DatosAutomatizacion,
  EjecucionAutomatizacion,
} from "@/lib/types";

/**
 * Server actions del módulo AUTOMATIZACIONES (CRUD de reglas + bitácora).
 * Todas exigen sesión de admin. El motor en sí vive en
 * `@/lib/automatizaciones/motor` y lo invocan los puntos de disparo.
 */

interface FilaAutomatizacion {
  id: string;
  nombre: string;
  activa: boolean;
  evento: Automatizacion["evento"];
  condiciones: Automatizacion["condiciones"] | null;
  acciones: Automatizacion["acciones"] | null;
}

function aAutomatizacion(fila: FilaAutomatizacion): Automatizacion {
  return {
    id: fila.id,
    nombre: fila.nombre,
    activa: fila.activa,
    evento: fila.evento,
    condiciones: fila.condiciones ?? [],
    acciones: fila.acciones ?? [],
  };
}

/** Normaliza los datos antes de guardar (limpia campos sobrantes por acción). */
function aFila(datos: DatosAutomatizacion): Record<string, unknown> {
  return {
    nombre: datos.nombre.trim(),
    activa: datos.activa,
    evento: datos.evento,
    condiciones: (datos.condiciones ?? []).filter((c) => c.campo),
    acciones: datos.acciones ?? [],
  };
}

export async function listarAutomatizaciones(): Promise<Automatizacion[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automatizaciones")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaAutomatizacion[]).map(aAutomatizacion);
}

export async function obtenerAutomatizacion(
  id: string,
): Promise<Automatizacion | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automatizaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aAutomatizacion(data as FilaAutomatizacion) : null;
}

export async function crearAutomatizacion(
  datos: DatosAutomatizacion,
): Promise<Automatizacion> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automatizaciones")
    .insert(aFila(datos))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aAutomatizacion(data as FilaAutomatizacion);
}

export async function actualizarAutomatizacion(
  id: string,
  datos: DatosAutomatizacion,
): Promise<Automatizacion> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automatizaciones")
    .update({ ...aFila(datos), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aAutomatizacion(data as FilaAutomatizacion);
}

/** Activa o desactiva una regla sin abrir el editor. */
export async function alternarAutomatizacion(
  id: string,
  activa: boolean,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("automatizaciones")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarAutomatizacion(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("automatizaciones").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

interface FilaLog {
  id: string;
  automatizacion_id: string | null;
  nombre: string;
  evento: string;
  expediente_id: string | null;
  prospecto_id: string | null;
  estado: EjecucionAutomatizacion["estado"];
  detalle: string;
  created_at: string;
}

/** Últimas ejecuciones del motor (para auditar qué se ha disparado). */
export async function listarEjecuciones(
  limite = 50,
): Promise<EjecucionAutomatizacion[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automatizaciones_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data as FilaLog[]).map((f) => ({
    id: f.id,
    automatizacionId: f.automatizacion_id,
    nombre: f.nombre,
    evento: f.evento,
    expedienteId: f.expediente_id,
    prospectoId: f.prospecto_id,
    estado: f.estado,
    detalle: f.detalle,
    fecha: f.created_at,
  }));
}
