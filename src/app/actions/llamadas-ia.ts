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
import { analizarPendientes, type SugerenciaLlamada } from "@/features/llamadas-ia/sugerencias";

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
  // Respaldo del webhook: las que llevan más de 2 min "en curso" se consultan en Vapi.
  const { data: atoradas } = await supabaseServidor()
    .from("llamadas_campana")
    .select("vapi_call_id")
    .eq("estado", "en_curso")
    .not("vapi_call_id", "is", null)
    .lt("updated_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(10);
  await Promise.all((atoradas ?? []).map((r) => sincronizarConVapi(r.vapi_call_id as string)));

  const { data, error } = await supabaseServidor()
    .from("llamadas_campana")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
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

/** Aprueba sugerencias: cada una queda programada a su hora sugerida (si ya pasó, en cuanto haya horario). */
export async function aprobarLlamadasIA(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!ids.length) return { ok: true };
  const sb = supabaseServidor();
  const { data, error: errLectura } = await sb
    .from("llamadas_campana")
    .select("id, hora_sugerida")
    .in("id", ids)
    .eq("estado", "pendiente");
  if (errLectura) return { ok: false, error: errLectura.message };

  const ahora = Date.now();
  const errores = await Promise.all(
    (data ?? []).map(async (r) => {
      const hora = r.hora_sugerida as string | null;
      const { error } = await sb
        .from("llamadas_campana")
        .update({
          estado: "aprobada",
          proximo_intento: hora && Date.parse(hora) > ahora ? hora : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("estado", "pendiente");
      return error?.message;
    }),
  );
  revalidatePath(RUTA);
  const err = errores.find(Boolean);
  return err ? { ok: false, error: err } : { ok: true };
}

/** Cambia la hora o el gancho de una sugerencia (o la hora de una aprobada). */
export async function editarSugerenciaIA(
  id: string,
  cambios: { hora?: string; gancho?: string },
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb.from("llamadas_campana").select("estado, sugerencia").eq("id", id).maybeSingle();
  if (!data || !["pendiente", "aprobada"].includes(data.estado as string)) {
    return { ok: false, error: "Solo se editan llamadas por aprobar o aprobadas." };
  }
  const hora = cambios.hora ? new Date(cambios.hora) : null;
  if (hora && (Number.isNaN(hora.getTime()) || hora.getTime() < Date.now())) {
    return { ok: false, error: "La hora debe ser futura." };
  }
  const previa = (data.sugerencia ?? {}) as SugerenciaLlamada;
  const sugerencia: SugerenciaLlamada = {
    ...previa,
    ...(cambios.gancho !== undefined ? { gancho: cambios.gancho.trim() } : {}),
    editada: true,
  };
  const { error } = await sb
    .from("llamadas_campana")
    .update({
      sugerencia,
      ...(hora ? { hora_sugerida: hora.toISOString() } : {}),
      ...(hora && data.estado === "aprobada" ? { proximo_intento: hora.toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath(RUTA);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * La IA analiza las sugerencias pendientes. Con ids (pocas) corre aquí; sin ids,
 * todas las que no tienen análisis, en la función en segundo plano.
 */
export async function analizarSugerenciasIA(ids?: string[]): Promise<{ ok: boolean; enSegundoPlano?: boolean; error?: string }> {
  await requireAdmin();
  if (ids?.length) {
    const r = await analizarPendientes({ ids: ids.slice(0, 4) });
    revalidatePath(RUTA);
    return r.errores.length ? { ok: false, error: r.errores[0] } : { ok: true };
  }
  const serverless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!serverless) {
    void analizarPendientes().catch((err) => console.error("[analizarSugerenciasIA]", err));
    return { ok: true, enSegundoPlano: true };
  }
  const base = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
  if (!base || !process.env.CRON_SECRET) return { ok: false, error: "Falta SITE_URL o CRON_SECRET para analizar en segundo plano." };
  try {
    const r = await fetch(`${base}/.netlify/functions/sugerencias-llamadas-background`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
    });
    if (r.ok || r.status === 202) return { ok: true, enSegundoPlano: true };
    return { ok: false, error: `La función en segundo plano respondió ${r.status}.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo iniciar el análisis." };
  }
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
    if (agregadas) await analizarSugerenciasIA();
    revalidatePath(RUTA);
    return { ok: true, agregadas };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la lista." };
  }
}
