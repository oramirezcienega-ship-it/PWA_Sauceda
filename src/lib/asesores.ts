import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca y retorna el ID del perfil correspondiente al asesor Gerardo.
 * Si no se encuentra un usuario cuyo nombre contenga "Gerardo", busca el primer perfil
 * activo con rol 'asesor'. Si no se encuentra ninguno, retorna null.
 */
export async function obtenerIdAsesorGerardo(
  sb: SupabaseClient<any, any, any>
): Promise<string | null> {
  try {
    // 1. Buscar perfil por nombre ("Gerardo")
    const { data: gerardo, error: errGerardo } = await sb
      .from("perfiles")
      .select("id")
      .ilike("nombre", "%gerardo%")
      .limit(1)
      .maybeSingle();

    if (!errGerardo && gerardo?.id) {
      return gerardo.id as string;
    }

    // 2. Fallback: Buscar primer perfil de asesor activo
    const { data: asesor, error: errAsesor } = await sb
      .from("perfiles")
      .select("id")
      .eq("rol", "asesor")
      .limit(1)
      .maybeSingle();

    if (!errAsesor && asesor?.id) {
      return asesor.id as string;
    }

    return null;
  } catch (err) {
    console.error("Error al obtener ID del asesor Gerardo:", err);
    return null;
  }
}
