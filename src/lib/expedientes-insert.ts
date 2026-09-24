import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inserta un expediente desde los canales automáticos (WhatsApp, Messenger,
 * campañas) sin perder el lead: si la BD rechaza el `tipo_negocio` por la
 * restricción check, reintenta con "otro". Cualquier otro error se registra
 * en el log en vez de ignorarse en silencio.
 */
export async function insertarExpedienteSeguro(
  sb: SupabaseClient,
  fila: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await sb.from("expedientes").insert(fila);
  if (!error) return true;

  if (error.code === "23514" && fila.tipo_negocio && fila.tipo_negocio !== "otro") {
    console.error(
      `[insertarExpedienteSeguro] tipo_negocio "${String(fila.tipo_negocio)}" rechazado para ${String(fila.id)}; se reintenta como "otro".`,
      error.message,
    );
    const reintento = await sb
      .from("expedientes")
      .insert({ ...fila, tipo_negocio: "otro" });
    if (!reintento.error) return true;
    console.error(`[insertarExpedienteSeguro] Falló el reintento de ${String(fila.id)}:`, reintento.error.message);
    return false;
  }

  console.error(`[insertarExpedienteSeguro] No se pudo crear ${String(fila.id)}:`, error.message);
  return false;
}
