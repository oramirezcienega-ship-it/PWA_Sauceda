"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import {
  aExpediente,
  aProspecto,
  aFilaProspecto,
  type FilaExpediente,
  type FilaProspecto,
} from "@/lib/supabase/mapeo";
import type { DatosProspecto, Expediente, Prospecto } from "@/lib/types";

/**
 * Server actions del módulo PROSPECTOS (CRM de personas).
 * Todas exigen sesión de admin.
 */

/** Genera el siguiente folio correlativo (PRO-00N). */
function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `PRO-${String(max + 1).padStart(3, "0")}`;
}

/** Lista todos los prospectos. */
export async function listarProspectos(): Promise<Prospecto[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaProspecto[]).map(aProspecto);
}

/** Obtiene un prospecto con sus expedientes relacionados. */
export async function obtenerProspecto(
  id: string,
): Promise<{ prospecto: Prospecto; expedientes: Expediente[] } | null> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: filaProspecto, error } = await sb
    .from("prospectos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!filaProspecto) return null;

  const { data: filasExp, error: errExp } = await sb
    .from("expedientes")
    .select("*")
    .eq("prospecto_id", id)
    .order("id", { ascending: true });
  if (errExp) throw new Error(errExp.message);

  return {
    prospecto: aProspecto(filaProspecto as FilaProspecto),
    expedientes: (filasExp as FilaExpediente[]).map(aExpediente),
  };
}

/** Crea un prospecto y devuelve el registro creado. */
export async function crearProspecto(
  datos: DatosProspecto,
): Promise<Prospecto> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: existentes, error: errLista } = await sb
    .from("prospectos")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("prospectos")
    .insert({ id, ...aFilaProspecto(datos) })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aProspecto(data as FilaProspecto);
}

/** Actualiza un prospecto. */
export async function actualizarProspecto(
  id: string,
  datos: DatosProspecto,
): Promise<Prospecto> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .update(aFilaProspecto(datos))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aProspecto(data as FilaProspecto);
}

/** Elimina un prospecto (sus expedientes quedan sin prospecto). */
export async function eliminarProspecto(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("prospectos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Lista mínima (id + nombre) para selects de formularios. */
export async function listarProspectosMin(): Promise<
  { id: string; nombre: string }[]
> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .select("id, nombre")
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; nombre: string }[];
}
