import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers de la bitácora de actividades (uso en el servidor).
 * El registro es "best-effort": si algo falla (p. ej. la tabla aún no
 * existe), no se interrumpe la operación principal.
 */

/** Obtiene el prospecto enlazado a un expediente. */
export async function prospectoDeExpediente(
  sb: SupabaseClient,
  expedienteId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("expedientes")
    .select("prospecto_id")
    .eq("id", expedienteId)
    .maybeSingle();
  return (data as { prospecto_id: string | null } | null)?.prospecto_id ?? null;
}

/** Registra una actividad (relacionada a expediente y/o prospecto). */
export async function registrarActividad(
  sb: SupabaseClient,
  datos: {
    expedienteId?: string | null;
    prospectoId?: string | null;
    tipo: string;
    titulo: string;
    detalle?: string;
  },
): Promise<void> {
  try {
    let prospectoId = datos.prospectoId ?? null;
    if (!prospectoId && datos.expedienteId) {
      prospectoId = await prospectoDeExpediente(sb, datos.expedienteId);
    }
    await sb.from("actividades").insert({
      expediente_id: datos.expedienteId ?? null,
      prospecto_id: prospectoId,
      tipo: datos.tipo,
      titulo: datos.titulo,
      detalle: datos.detalle ?? "",
    });
  } catch (err) {
    console.error("No se pudo registrar la actividad:", err);
  }
}
