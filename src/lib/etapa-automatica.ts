import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";

/** Etapas iniciales que pasan a "Contacto inicial" cuando una persona responde en el chat. */
const ETAPAS_INICIALES = ["nuevo-lead", "interes"];

/**
 * Cuando un usuario (no Sofía) responde al cliente desde Conversaciones, el
 * negocio en etapa inicial avanza solo a "Contacto inicial". No retrocede
 * negocios en etapas más avanzadas. Best-effort: nunca interrumpe el envío.
 */
export async function avanzarAContactoInicialPorRespuesta(
  sb: SupabaseClient,
  expedienteId: string | null | undefined,
  agente: string
): Promise<void> {
  if (!expedienteId || !agente || agente === "IA") return;
  try {
    // Solo cuenta si quien envía es un usuario real (no "IA (Retoque)", "Sistema", automatizaciones…)
    const { data: perfil } = await sb.from("perfiles").select("id").ilike("nombre", agente).limit(1).maybeSingle();
    if (!perfil) return;

    const { data } = await sb
      .from("expedientes")
      .update({ etapa: "contactado", ultimo_movimiento: new Date().toISOString().slice(0, 10) })
      .eq("id", expedienteId)
      .in("etapa", ETAPAS_INICIALES)
      .select("prospecto_id")
      .maybeSingle();
    if (!data) return;

    await registrarActividad(sb, {
      expedienteId,
      tipo: "etapa",
      titulo: "Movido a Contacto inicial",
      detalle: `Automático: ${agente} respondió al cliente en el chat.`,
    });
    if (data.prospecto_id) {
      const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
      await sincronizarEstatusProspecto(sb, data.prospecto_id);
    }
  } catch (err) {
    console.error("[Etapa automática] No se pudo mover a Contacto inicial:", err);
  }
}
