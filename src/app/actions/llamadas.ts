"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";

export interface LlamadaConmutadorApp {
  id: string;
  twilio_call_sid: string;
  cliente_telefono: string;
  prospecto_id: string | null;
  prospecto_nombre?: string;
  agente_id: string | null;
  agente_nombre?: string;
  tipo: "entrante" | "saliente";
  estado: string;
  duracion: number | null;
  grabacion_url: string | null;
  transcripcion: string | null;
  resumen_ia: string | null;
  datos_perfilados: any | null;
  created_at: string;
}

export interface ConfiguracionLlamadas {
  telefono_desvio: string;
  disponible_llamadas: boolean;
  horario_inicio: string;
  horario_fin: string;
}

/**
 * Lista todas las llamadas registradas en el conmutador con joins a prospectos y agentes.
 */
export async function listarLlamadasConmutador(): Promise<LlamadaConmutadorApp[]> {
  const sb = supabaseServidor();
  
  // Realizar una consulta plana sin joins para evitar bloqueos por RLS de relaciones
  const { data, error } = await sb
    .from("llamadas_conmutador")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al listar llamadas del conmutador:", error);
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    twilio_call_sid: row.twilio_call_sid,
    cliente_telefono: row.cliente_telefono,
    prospecto_id: row.prospecto_id,
    prospecto_nombre: null, // Se resolverá dinámicamente si es necesario
    agente_id: row.agente_id,
    agente_nombre: null,    // Se resolverá dinámicamente si es necesario
    tipo: row.tipo,
    estado: row.estado,
    duracion: row.duracion,
    grabacion_url: row.grabacion_url,
    transcripcion: row.transcripcion,
    resumen_ia: row.resumen_ia,
    datos_perfilados: row.datos_perfilados,
    created_at: row.created_at,
  }));
}

/**
 * Obtiene la configuración de desvío y horarios del usuario actual.
 */
export async function obtenerMiConfiguracionLlamadas(): Promise<ConfiguracionLlamadas | null> {
  const user = await usuarioActual();
  if (!user) return null;

  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("telefono_desvio, disponible_llamadas, horario_inicio, horario_fin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      telefono_desvio: "",
      disponible_llamadas: false,
      horario_inicio: "09:00:00",
      horario_fin: "18:00:00",
    };
  }

  return {
    telefono_desvio: data.telefono_desvio || "",
    disponible_llamadas: data.disponible_llamadas || false,
    horario_inicio: data.horario_inicio || "09:00:00",
    horario_fin: data.horario_fin || "18:00:00",
  };
}

/**
 * Guarda la configuración de desvío y horarios del usuario actual.
 */
export async function guardarMiConfiguracionLlamadas(datos: ConfiguracionLlamadas): Promise<void> {
  const user = await usuarioActual();
  if (!user) throw new Error("No autenticado");

  const sb = supabaseServidor();
  
  // Limpieza simple de formato
  const tMin = datos.telefono_desvio.trim();
  
  const { error } = await sb
    .from("perfiles")
    .update({
      telefono_desvio: tMin,
      disponible_llamadas: datos.disponible_llamadas,
      horario_inicio: datos.horario_inicio,
      horario_fin: datos.horario_fin,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Obtiene la configuración de llamadas de cualquier agente (para administradores).
 */
export async function obtenerConfiguracionLlamadasAgente(agenteId: string): Promise<ConfiguracionLlamadas | null> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("telefono_desvio, disponible_llamadas, horario_inicio, horario_fin")
    .eq("id", agenteId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    telefono_desvio: data.telefono_desvio || "",
    disponible_llamadas: data.disponible_llamadas || false,
    horario_inicio: data.horario_inicio || "09:00:00",
    horario_fin: data.horario_fin || "18:00:00",
  };
}

/**
 * Guarda la configuración de llamadas de cualquier agente (para administradores).
 */
export async function guardarConfiguracionLlamadasAgente(
  agenteId: string,
  datos: ConfiguracionLlamadas
): Promise<void> {
  const sb = supabaseServidor();
  
  const { error } = await sb
    .from("perfiles")
    .update({
      telefono_desvio: datos.telefono_desvio.trim(),
      disponible_llamadas: datos.disponible_llamadas,
      horario_inicio: datos.horario_inicio,
      horario_fin: datos.horario_fin,
    })
    .eq("id", agenteId);

  if (error) {
    throw new Error(error.message);
  }
}
