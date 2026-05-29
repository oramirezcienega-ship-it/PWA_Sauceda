"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import type { DatosMensaje, Mensaje, MensajeEnviado } from "@/lib/types";

/**
 * Server actions del módulo MENSAJES.
 * Las del admin exigen sesión. La pública (obtenerMensajesPorToken) la usa
 * el portal del cliente y valida por el token del expediente.
 */

interface FilaMensaje {
  id: string;
  titulo: string;
  texto: string;
}
interface FilaEnviado {
  id: string;
  expediente_id: string;
  titulo: string;
  texto: string;
}

function aMensaje(f: FilaMensaje): Mensaje {
  return { id: f.id, titulo: f.titulo, texto: f.texto };
}
function aEnviado(f: FilaEnviado): MensajeEnviado {
  return {
    id: f.id,
    expedienteId: f.expediente_id,
    titulo: f.titulo,
    texto: f.texto,
  };
}

function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `MSG-${String(max + 1).padStart(3, "0")}`;
}

// ---------- Admin: CRUD de plantillas ----------

export async function listarMensajes(): Promise<Mensaje[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FilaMensaje[]).map(aMensaje);
}

export async function obtenerMensaje(id: string): Promise<Mensaje | null> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aMensaje(data as FilaMensaje) : null;
}

export async function crearMensaje(datos: DatosMensaje): Promise<Mensaje> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: existentes, error: errLista } = await sb
    .from("mensajes")
    .select("id");
  if (errLista) throw new Error(errLista.message);
  const id = siguienteId((existentes ?? []).map((r) => r.id as string));
  const { data, error } = await sb
    .from("mensajes")
    .insert({ id, ...datos })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aMensaje(data as FilaMensaje);
}

export async function actualizarMensaje(
  id: string,
  datos: DatosMensaje,
): Promise<Mensaje> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes")
    .update(datos)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return aMensaje(data as FilaMensaje);
}

export async function eliminarMensaje(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("mensajes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Admin: mensajes enviados a expedientes ----------

export async function enviarMensaje(
  expedienteId: string,
  titulo: string,
  texto: string,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("mensajes_enviados")
    .insert({ expediente_id: expedienteId, titulo, texto });
  if (error) throw new Error(error.message);
}

export async function listarMensajesDeExpediente(
  expedienteId: string,
): Promise<MensajeEnviado[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("mensajes_enviados")
    .select("*")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnviado[]).map(aEnviado);
}

export async function eliminarMensajeEnviado(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("mensajes_enviados").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Público: portal del cliente ----------

export async function obtenerMensajesPorToken(
  token: string,
): Promise<MensajeEnviado[]> {
  const sb = supabaseServidor();
  const { data: exp } = await sb
    .from("expedientes")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!exp) return [];
  const { data, error } = await sb
    .from("mensajes_enviados")
    .select("*")
    .eq("expediente_id", (exp as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FilaEnviado[]).map(aEnviado);
}
