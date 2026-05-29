"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { aExpediente, aFila, type FilaExpediente } from "@/lib/supabase/mapeo";
import type { DatosExpediente, EtapaId, Expediente } from "@/lib/types";

/**
 * Server actions del módulo OPERACIÓN.
 * Toda la lectura/escritura de expedientes en Supabase pasa por aquí
 * (en el servidor). El navegador nunca habla directo con la base de datos.
 */

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Genera el siguiente folio correlativo tipo EXP-007. */
function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

/** Lista todos los expedientes (panel del admin). */
export async function listarExpedientes(): Promise<Expediente[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaExpediente[]).map(aExpediente);
}

/** Obtiene un expediente por su token público (portal del cliente). */
export async function obtenerPorToken(
  token: string,
): Promise<Expediente | null> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aExpediente(data as FilaExpediente) : null;
}

/** Crea un expediente nuevo y devuelve el registro creado. */
export async function crearExpediente(
  datos: DatosExpediente,
): Promise<Expediente> {
  const sb = supabaseServidor();

  // Genera el folio correlativo a partir de los existentes.
  const { data: existentes, error: errLista } = await sb
    .from("expedientes")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));

  const { data, error } = await sb
    .from("expedientes")
    .insert({ id, ...aFila(datos), ultimo_movimiento: hoyISO() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aExpediente(data as FilaExpediente);
}

/** Actualiza los datos editables de un expediente. */
export async function actualizarExpediente(
  id: string,
  datos: DatosExpediente,
): Promise<Expediente> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("expedientes")
    .update({ ...aFila(datos), ultimo_movimiento: hoyISO() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aExpediente(data as FilaExpediente);
}

/** Cambia la etapa de un expediente. */
export async function moverEtapa(id: string, etapa: EtapaId): Promise<void> {
  const sb = supabaseServidor();
  const { error } = await sb
    .from("expedientes")
    .update({ etapa, ultimo_movimiento: hoyISO() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Elimina un expediente. */
export async function eliminarExpediente(id: string): Promise<void> {
  const sb = supabaseServidor();
  const { error } = await sb.from("expedientes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
