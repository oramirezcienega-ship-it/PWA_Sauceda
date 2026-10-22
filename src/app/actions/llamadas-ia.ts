"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { usuarioActual, requireAdmin } from "@/lib/supabase/cliente-sesion";
import {
  crearLlamadaPrueba,
  despacharLlamada,
  generarListaReagendarVisitas,
  sincronizarConVapi,
  type LlamadaIA,
} from "@/features/llamadas-ia/service";

const RUTA = "/dashboard/llamadas/ia";

export interface ConfiguracionLlamadasIA {
  vapiApiKey: boolean;
  vapiNumero: boolean;
  siteUrl: string;
}

export async function obtenerConfiguracionLlamadasIA(): Promise<ConfiguracionLlamadasIA> {
  await requireAdmin();
  return {
    vapiApiKey: !!process.env.VAPI_API_KEY,
    vapiNumero: !!process.env.VAPI_PHONE_NUMBER_ID,
    siteUrl: process.env.SITE_URL || "https://crm.saucedamx.com",
  };
}

export async function listarLlamadasIA(): Promise<LlamadaIA[]> {
  await requireAdmin();
  const { data, error } = await supabaseServidor()
    .from("llamadas_campana")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as LlamadaIA[];
}

/** Crea una llamada de prueba a un número propio y la marca de inmediato. */
export async function probarLlamadaIA(datos: {
  telefono: string;
  nombre?: string;
  servicio?: string;
  colonia?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const user = await usuarioActual();
  const creada = await crearLlamadaPrueba({ ...datos, creadoPor: user?.id ?? null });
  if (!creada.ok || !creada.id) return { ok: false, error: creada.error };
  const r = await despacharLlamada(creada.id);
  revalidatePath(RUTA);
  return r;
}

export async function aprobarLlamadasIA(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!ids.length) return { ok: true };
  const { error } = await supabaseServidor()
    .from("llamadas_campana")
    .update({ estado: "aprobada", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("estado", "pendiente");
  revalidatePath(RUTA);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function cancelarLlamadaIA(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const { error } = await supabaseServidor()
    .from("llamadas_campana")
    .update({ estado: "cancelada", proximo_intento: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("estado", ["pendiente", "aprobada", "fallida"]);
  revalidatePath(RUTA);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function llamarAhoraIA(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const r = await despacharLlamada(id);
  revalidatePath(RUTA);
  return r;
}

/** Vuelve a consultar en Vapi una llamada en curso (por si el webhook no llegó). */
export async function sincronizarLlamadaIA(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const { data } = await supabaseServidor().from("llamadas_campana").select("vapi_call_id").eq("id", id).maybeSingle();
  if (!data?.vapi_call_id) return { ok: false, error: "La llamada aún no tiene id de Vapi." };
  const r = await sincronizarConVapi(data.vapi_call_id as string);
  revalidatePath(RUTA);
  return r;
}

export async function generarListaReagendarIA(): Promise<{ ok: boolean; agregadas?: number; error?: string }> {
  await requireAdmin();
  const user = await usuarioActual();
  try {
    const { agregadas } = await generarListaReagendarVisitas(user?.id ?? null);
    revalidatePath(RUTA);
    return { ok: true, agregadas };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la lista." };
  }
}
