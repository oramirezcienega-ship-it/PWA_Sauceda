import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstatusProspecto, CalificacionProspecto } from "@/lib/types";

/**
 * Recalcula y actualiza el estatus y calificación de un prospecto basándose en el estado de sus expedientes.
 */
export async function sincronizarEstatusProspecto(
  sb: SupabaseClient,
  prospectoId: string,
): Promise<void> {
  if (!prospectoId) return;

  // 1. Obtener todos los expedientes del prospecto
  const { data: exps, error } = await sb
    .from("expedientes")
    .select("etapa")
    .eq("prospecto_id", prospectoId);

  if (error || !exps) {
    console.error(`[Sincronizar Estatus] Error al obtener expedientes del prospecto ${prospectoId}:`, error);
    return;
  }

  let nuevoEstatus: EstatusProspecto = "lead";
  let nuevaCalificacion: CalificacionProspecto = "frio";

  if (exps.length > 0) {
    const tieneCerrado = exps.some((e) => e.etapa === "cerrado" || e.etapa === "venta");
    const todosPerdidos = exps.every((e) => e.etapa === "perdido");

    if (tieneCerrado) {
      nuevoEstatus = "cliente";
      nuevaCalificacion = "caliente";
    } else if (todosPerdidos) {
      nuevoEstatus = "no_viable";
      nuevaCalificacion = "descalificado";
    } else {
      // Tiene expedientes activos/en proceso -> Pasa a ventas (SQL)
      nuevoEstatus = "sql";
      nuevaCalificacion = "templado";
    }
  } else {
    // Si no tiene expedientes, ver si tiene mensajes de whatsapp/sociales para marcar MQL
    const { data: prospecto } = await sb
      .from("prospectos")
      .select("telefono, canal_id")
      .eq("id", prospectoId)
      .maybeSingle();

    if (prospecto) {
      // Validar si tiene mensajes entrantes/salientes
      const { count, error: errMsgs } = await sb
        .from("mensajes_whatsapp")
        .select("id", { count: "exact", head: true })
        .or(`telefono.eq.${prospecto.telefono},canal_id.eq.${prospecto.canal_id ?? ""}`);

      if (!errMsgs && count && count > 0) {
        nuevoEstatus = "mql";
        nuevaCalificacion = "templado";
      }
    }
  }

  // Actualizar el prospecto
  const { error: errUpdate } = await sb
    .from("prospectos")
    .update({ estatus: nuevoEstatus, calificacion: nuevaCalificacion })
    .eq("id", prospectoId);

  if (errUpdate) {
    console.error(`[Sincronizar Estatus] Error al actualizar prospecto ${prospectoId}:`, errUpdate);
  }
}

/**
 * Sincroniza la etapa de los expedientes enlazados a un prospecto
 * según la etapa del prospecto (matriz comercial).
 */
export async function sincronizarEtapaExpediente(
  sb: SupabaseClient,
  prospectoIds: string[],
  nuevoEstatus: EstatusProspecto,
): Promise<void> {
  if (!prospectoIds || prospectoIds.length === 0) return;

  const hoyISO = new Date().toISOString().slice(0, 10);

  if (nuevoEstatus === "lead" || nuevoEstatus === "mql" || nuevoEstatus === "nuevo") {
    await sb
      .from("expedientes")
      .update({ etapa: "nuevo-lead", ultimo_movimiento: hoyISO })
      .in("prospecto_id", prospectoIds);
  } else if (nuevoEstatus === "cliente") {
    await sb
      .from("expedientes")
      .update({ etapa: "cerrado", ultimo_movimiento: hoyISO })
      .in("prospecto_id", prospectoIds);
  } else if (nuevoEstatus === "no_viable") {
    await sb
      .from("expedientes")
      .update({ etapa: "perdido", asesor_id: null, ultimo_movimiento: hoyISO })
      .in("prospecto_id", prospectoIds);
  } else if (nuevoEstatus === "sql" || nuevoEstatus === "expediente_abierto") {
    await sb
      .from("expedientes")
      .update({ etapa: "nuevo-lead", ultimo_movimiento: hoyISO })
      .in("prospecto_id", prospectoIds)
      .in("etapa", ["cerrado", "perdido"]);
  }
}

/**
 * Helper para clasificar la prioridad de atención de prospectos inactivos.
 */
export function clasificarPrioridadLead(dias: number, tieneTelefono: boolean): "alta" | "media" | "baja" {
  if (dias > 2 && tieneTelefono) return "alta";
  return dias > 1 ? "media" : "baja";
}

