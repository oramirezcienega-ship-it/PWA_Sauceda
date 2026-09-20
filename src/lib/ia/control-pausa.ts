import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "@/lib/telefono";

/**
 * Consulta si las respuestas automáticas de la IA Sofía están pausadas para un teléfono / expediente.
 * Utiliza estrategia híbrida:
 * 1. Intenta leer la columna ia_pausada en expedientes (si la migración está aplicada).
 * 2. Fallback garantizado en configuracion_agente (clave-valor: ia_pausada:<tel10>).
 */
export async function esConversacionPausada(
  sb: SupabaseClient,
  telefono: string,
  expedienteId?: string | null
): Promise<boolean> {
  const tel10 = (normalizarTelefono(telefono) || telefono).replace(/\D/g, "").slice(-10);
  if (!tel10) return false;

  // 1. Verificar columna en expedientes si se cuenta con el ID
  if (expedienteId) {
    try {
      const { data: exp } = await sb
        .from("expedientes")
        .select("ia_pausada")
        .eq("id", expedienteId)
        .maybeSingle();

      if (exp && typeof (exp as any).ia_pausada === "boolean") {
        return (exp as any).ia_pausada;
      }
    } catch {
      // Ignorar si la columna aún no está presente en la BD
    }
  }

  // 2. Fallback de persistencia en configuracion_agente
  try {
    const { data } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", `ia_pausada:${tel10}`)
      .maybeSingle();

    if (data && data.valor === "true") {
      return true;
    }
  } catch (err) {
    console.warn("Error al verificar configuracion_agente para ia_pausada:", err);
  }

  return false;
}

/**
 * Actualiza el estado de pausa de Sofía para una conversación.
 */
export async function setConversacionPausada(
  sb: SupabaseClient,
  telefono: string,
  pausada: boolean,
  expedienteId?: string | null,
  prospectoId?: string | null
): Promise<{ ok: boolean; pausada: boolean; error?: string }> {
  const tel10 = (normalizarTelefono(telefono) || telefono).replace(/\D/g, "").slice(-10);
  if (!tel10) {
    return { ok: false, pausada: false, error: "Teléfono inválido." };
  }

  const valorStr = pausada ? "true" : "false";

  // 1. Guardar en configuracion_agente (garantía de persistencia inmediata)
  try {
    const { data: existente } = await sb
      .from("configuracion_agente")
      .select("clave")
      .eq("clave", `ia_pausada:${tel10}`)
      .maybeSingle();

    if (existente) {
      await sb
        .from("configuracion_agente")
        .update({ valor: valorStr, updated_at: new Date().toISOString() })
        .eq("clave", `ia_pausada:${tel10}`);
    } else {
      await sb
        .from("configuracion_agente")
        .insert({ clave: `ia_pausada:${tel10}`, valor: valorStr });
    }
  } catch (err) {
    console.error("Error al guardar estado de pausa en configuracion_agente:", err);
  }

  // 2. Intentar sincronizar columna ia_pausada en expedientes (best-effort)
  if (expedienteId) {
    try {
      await sb
        .from("expedientes")
        .update({ ia_pausada: pausada })
        .eq("id", expedienteId);
    } catch {
      // Ignorar si la columna aún no está migrada
    }
  }

  // 3. Intentar sincronizar columna ia_pausada en prospectos (best-effort)
  if (prospectoId) {
    try {
      await sb
        .from("prospectos")
        .update({ ia_pausada: pausada })
        .eq("id", prospectoId);
    } catch {
      // Ignorar si la columna aún no está migrada
    }
  }

  return { ok: true, pausada };
}
