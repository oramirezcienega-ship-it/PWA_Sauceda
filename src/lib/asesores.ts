import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca y retorna el ID del perfil configurado para recibir asignación automática de leads.
 * 1. Primero busca el perfil activo marcado con `asignacion_automatica = true`.
 * 2. Fallback: Busca un perfil cuyo nombre contenga "Gerardo".
 * 3. Fallback: Busca el primer perfil activo con rol 'asesor'.
 * 4. Fallback final: Cualquier perfil activo.
 */
export async function obtenerIdAsesorDefault(
  sb: SupabaseClient<any, any, any>
): Promise<string | null> {
  try {
    // 1. Buscar perfil explícitamente asignado para automatización
    const { data: autoAsignado, error: errAuto } = await sb
      .from("perfiles")
      .select("id")
      .eq("asignacion_automatica", true)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!errAuto && autoAsignado?.id) {
      return autoAsignado.id as string;
    }

    // 2. Fallback: Buscar perfil por nombre ("Gerardo")
    const { data: gerardo, error: errGerardo } = await sb
      .from("perfiles")
      .select("id")
      .ilike("nombre", "%gerardo%")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!errGerardo && gerardo?.id) {
      return gerardo.id as string;
    }

    // 3. Fallback: Buscar primer perfil de asesor activo
    const { data: asesor, error: errAsesor } = await sb
      .from("perfiles")
      .select("id")
      .eq("rol", "asesor")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!errAsesor && asesor?.id) {
      return asesor.id as string;
    }

    // 4. Fallback final: Primer perfil activo de cualquier rol
    const { data: cualquierPerfil, error: errCualquiera } = await sb
      .from("perfiles")
      .select("id")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (!errCualquiera && cualquierPerfil?.id) {
      return cualquierPerfil.id as string;
    }

    return null;
  } catch (err) {
    console.error("Error al obtener ID del asesor por defecto:", err);
    return null;
  }
}

/**
 * Alias retrocompatible para obtenerIdAsesorDefault.
 */
export async function obtenerIdAsesorGerardo(
  sb: SupabaseClient<any, any, any>
): Promise<string | null> {
  return obtenerIdAsesorDefault(sb);
}

