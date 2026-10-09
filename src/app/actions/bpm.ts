"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { revalidatePath } from "next/cache";
import { resolverPasosAplicables, type CondicionCampoJson } from "@/lib/bpm/condiciones";

export interface BpmFlujo {
  id: string;
  tipoNegocio: string;
  activo: boolean;
}

export interface BpmPaso {
  id: string;
  flujoId: string;
  etapa: string;
  orden: number;
  tituloTarea: string;
  descripcion: string | null;
  rolResponsable: 'asesor' | 'operaciones' | 'tecnico' | 'admin' | 'gestor' | 'sistema';
  diasVencimiento: number;
  condicionActivacion: string;
  /** Condición opcional sobre campos del expediente (ver `@/lib/bpm/condiciones`). */
  condicionCampo?: CondicionCampoJson;
}

export interface BpmTareaInstanciada {
  id: string;
  expedienteId: string;
  pasoId: string | null;
  titulo: string;
  descripcion: string | null;
  estado: 'pendiente' | 'esperando_condicion' | 'completada' | 'cancelada';
  responsableId: string | null;
  responsableNombre?: string;
  diasVencimiento: number;
  agendadaPara: string | null;
  completadaEn: string | null;
  createdAt: string;
}

/** Obtiene el flujo BPM configurado para un tipo de negocio específico junto con todos sus pasos */
export async function obtenerFlujoPorProducto(tipoNegocio: string) {
  const sb = supabaseServidor();
  const { data: flujo, error: errFlujo } = await sb
    .from("bpm_flujos")
    .select("*")
    .eq("tipo_negocio", tipoNegocio)
    .eq("activo", true)
    .maybeSingle();

  if (errFlujo) {
    console.error("Error al obtener flujo BPM:", errFlujo);
    return null;
  }
  if (!flujo) return null;

  const { data: pasos, error: errPasos } = await sb
    .from("bpm_pasos")
    .select("*")
    .eq("flujo_id", flujo.id)
    .order("orden", { ascending: true });

  if (errPasos) {
    console.error("Error al obtener pasos del flujo BPM:", errPasos);
    return null;
  }

  return {
    flujo,
    pasos: pasos || []
  };
}

export async function guardarFlujoBPM(tipoNegocio: string, pasos: Omit<BpmPaso, "id" | "flujoId">[]) {
  try {
    const sb = supabaseServidor();
    
    // 1. Upsert del flujo
    const { data: flujo, error: errFlujo } = await sb
      .from("bpm_flujos")
      .upsert({ tipo_negocio: tipoNegocio, activo: true }, { onConflict: "tipo_negocio" })
      .select("id")
      .single();

    if (errFlujo) {
      console.error("Error upserting bpm_flujos:", errFlujo);
      return { success: false, error: "No se pudo guardar el flujo BPM: " + errFlujo.message };
    }

    // 2. Eliminar pasos existentes para rehacerlos
    const { error: errDelete } = await sb.from("bpm_pasos").delete().eq("flujo_id", flujo.id);
    if (errDelete) {
      console.error("Error deleting bpm_pasos:", errDelete);
      return { success: false, error: "No se pudieron limpiar los pasos previos: " + errDelete.message };
    }

    // 3. Insertar nuevos pasos
    if (pasos.length > 0) {
      const pasosInsert = pasos.map((p, idx) => ({
        flujo_id: flujo.id,
        etapa: p.etapa,
        orden: idx + 1,
        titulo_tarea: p.tituloTarea,
        descripcion: p.descripcion || "",
        rol_responsable: p.rolResponsable,
        dias_vencimiento: p.diasVencimiento,
        condicion_activacion: p.condicionActivacion || "inmediato",
        condicion_campo: p.condicionCampo ?? null
      }));

      const { error: errPasos } = await sb.from("bpm_pasos").insert(pasosInsert);
      if (errPasos) {
        console.error("Error inserting bpm_pasos:", errPasos);
        return { success: false, error: "No se pudieron guardar los pasos del flujo: " + errPasos.message };
      }
    }

    return { success: true, id: flujo.id };
  } catch (err: any) {
    console.error("Excepción inesperada en guardarFlujoBPM:", err);
    return { success: false, error: err.message || "Excepción inesperada en el servidor" };
  }
}

/** Obtiene las tareas BPM de un expediente (las de sus órdenes de trabajo viven en cada OT) */
export async function obtenerTareasExpediente(expedienteId: string): Promise<BpmTareaInstanciada[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("bpm_expediente_tareas")
    .select("*, paso:paso_id(*), responsable:responsable_id(nombre)")
    .eq("expediente_id", expedienteId)
    .is("orden_trabajo_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al obtener tareas del expediente:", error);
    return [];
  }
  return mapearTareas(data || []);
}

/** Tareas BPM de una orden de trabajo (flujos con ámbito `orden_trabajo`). */
export async function obtenerTareasOrden(ordenTrabajoId: string): Promise<BpmTareaInstanciada[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("bpm_expediente_tareas")
    .select("*, paso:paso_id(*), responsable:responsable_id(nombre)")
    .eq("orden_trabajo_id", ordenTrabajoId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error al obtener tareas de la orden de trabajo:", error);
    return [];
  }
  return mapearTareas(data || []);
}

function mapearTareas(data: any[]): BpmTareaInstanciada[] {
  return data.map((t) => ({
    id: t.id,
    expedienteId: t.expediente_id,
    pasoId: t.paso_id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    estado: t.estado,
    responsableId: t.responsable_id,
    responsableNombre: t.responsable?.nombre || undefined,
    diasVencimiento: t.dias_vencimiento,
    agendadaPara: t.agendada_para,
    completadaEn: t.completada_en,
    createdAt: t.created_at
  }));
}

/** Instancia el flujo de trabajo correspondiente para un expediente */
export async function instanciarFlujoEnExpediente(expedienteId: string, tipoNegocio: string) {
  const sb = supabaseServidor();
  
  // 1. Buscar si ya tiene tareas instanciadas (para no duplicar)
  const { count } = await sb
    .from("bpm_expediente_tareas")
    .select("id", { count: "exact", head: true })
    .eq("expediente_id", expedienteId)
    .is("orden_trabajo_id", null);

  if (count && count > 0) return; // ya inicializado

  // 1.5. Obtener los datos del expediente para ver quién es el asesor_id y el operador_id
  // (se lee el expediente completo para evaluar `condicion_campo` de los pasos)
  const { data: exp } = await sb
    .from("expedientes")
    .select("*")
    .eq("id", expedienteId)
    .maybeSingle();

  // 2. Obtener la plantilla de flujo
  const datosFlujo = await obtenerFlujoPorProducto(tipoNegocio);
  if (!datosFlujo || datosFlujo.pasos.length === 0) return;
  // Los flujos de orden de trabajo se instancian al iniciar la OT, no con el expediente.
  if ((datosFlujo.flujo as any).ambito === "orden_trabajo") return;

  // 3. Crear tareas (solo de los pasos que aplican al expediente)
  const ahora = new Date();
  const aplicables = resolverPasosAplicables(datosFlujo.pasos as any[], exp || {});
  const tareasInsert = aplicables.map(({ paso: p, condicionEfectiva, condicionHeredada }: any) =>
    construirTarea(expedienteId, p, condicionEfectiva, condicionHeredada, exp, ahora)
  );

  const { error } = await sb.from("bpm_expediente_tareas").insert(tareasInsert);
  if (error) {
    console.error("Error al instanciar tareas BPM:", error);
  } else {
    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: "🚀 Flujo de Trabajo BPM inicializado",
      detalle: `Se cargó la plantilla para ${tipoNegocio} con ${tareasInsert.length} pasos.`
    });

    // Registrar actividad interactiva en bitácora/agenda para las tareas iniciales en pendiente
    for (const t of tareasInsert.filter((x: any) => x.estado === "pendiente")) {
      const tipoAct = t.titulo.toLowerCase().includes("contactar") || t.titulo.toLowerCase().includes("llam")
        ? "llamada"
        : t.titulo.toLowerCase().includes("inspeccion") || t.titulo.toLowerCase().includes("visita")
        ? "inspeccion"
        : "tarea";

      await registrarActividad(sb, {
        expedienteId,
        tipo: tipoAct,
        titulo: `📌 Tarea Operativa: ${t.titulo}`,
        detalle: t.descripcion || "Tarea asignada por flujo BPM",
      });
    }
  }
}

/** Responsable por rol: asesor → asesor del expediente; operaciones/gestor → operador. */
function responsablePorRol(rol: string, exp: any): string | null {
  if (rol === "asesor") return exp?.asesor_id || null;
  if (rol === "operaciones" || rol === "gestor") return exp?.operador_id || null;
  return null;
}

/** Arma el registro de bpm_expediente_tareas para un paso del flujo. */
function construirTarea(
  expedienteId: string,
  p: any,
  condicionEfectiva: string,
  condicionHeredada: boolean,
  exp: any,
  ahora: Date,
  ordenTrabajoId: string | null = null
) {
  const agendadaPara = new Date(ahora.getTime() + p.dias_vencimiento * 24 * 60 * 60 * 1000).toISOString();
  // Si tiene condición especial (como esperar reporte técnico), inicia en "esperando_condicion"
  const estadoInicial = condicionEfectiva === "inmediato" ? "pendiente" : "esperando_condicion";
  const tarea: Record<string, any> = {
    expediente_id: expedienteId,
    paso_id: p.id,
    titulo: p.titulo_tarea,
    descripcion: p.descripcion,
    estado: estadoInicial,
    dias_vencimiento: p.dias_vencimiento,
    agendada_para: agendadaPara,
    responsable_id: responsablePorRol(p.rol_responsable, exp)
  };
  // Solo se escribe cuando difiere de la del paso (columna nueva, opcional).
  if (condicionHeredada) tarea.condicion_activacion_efectiva = condicionEfectiva;
  if (ordenTrabajoId) tarea.orden_trabajo_id = ordenTrabajoId;
  return tarea;
}

/** Condición con la que espera una tarea: la efectiva (si el paso previo se omitió) o la del paso. */
function condicionDeTarea(t: any): string | undefined {
  return t.condicion_activacion_efectiva || t.paso?.condicion_activacion;
}

/**
 * Contexto de una OT para su flujo BPM: la OT, su expediente (para asignar
 * responsables por rol) y su ficha particular (para evaluar `condicion_campo`).
 */
async function contextoOrden(sb: ReturnType<typeof supabaseServidor>, ordenTrabajoId: string) {
  const { data: ot } = await sb
    .from("ordenes_trabajo")
    .select("id, folio, expediente_id, tipo_negocio, asesor_responsable_id, asesor_ejecutor_id")
    .eq("id", ordenTrabajoId)
    .maybeSingle();
  if (!ot?.expediente_id) return null;
  const { data: exp } = await sb.from("expedientes").select("asesor_id, operador_id").eq("id", ot.expediente_id).maybeSingle();
  const tablaFicha = ot.tipo_negocio === "asesoria_compra" ? "ot_ficha_asesoria_compra" : null;
  const { data: ficha } = tablaFicha
    ? await sb.from(tablaFicha).select("*").eq("orden_trabajo_id", ordenTrabajoId).maybeSingle()
    : { data: null };
  // Responsables: los del expediente; si no hay, los de la OT.
  const responsables = {
    asesor_id: exp?.asesor_id || ot.asesor_responsable_id || null,
    operador_id: exp?.operador_id || ot.asesor_ejecutor_id || null,
  };
  return { ot, responsables, datos: (ficha as Record<string, unknown>) || {} };
}

/** Instancia el flujo BPM de una orden de trabajo (flujos con ámbito `orden_trabajo`). */
export async function instanciarFlujoEnOrden(ordenTrabajoId: string): Promise<{ ok: boolean; tareas: number }> {
  const sb = supabaseServidor();
  const ctx = await contextoOrden(sb, ordenTrabajoId);
  if (!ctx) return { ok: false, tareas: 0 };
  const { count } = await sb
    .from("bpm_expediente_tareas")
    .select("id", { count: "exact", head: true })
    .eq("orden_trabajo_id", ordenTrabajoId);
  if (count && count > 0) return { ok: true, tareas: count };

  const datosFlujo = await obtenerFlujoPorProducto(ctx.ot.tipo_negocio);
  if (!datosFlujo || datosFlujo.pasos.length === 0) return { ok: true, tareas: 0 };
  if ((datosFlujo.flujo as any).ambito !== "orden_trabajo") return { ok: true, tareas: 0 };

  const ahora = new Date();
  const aplicables = resolverPasosAplicables(datosFlujo.pasos as any[], ctx.datos);
  const tareasInsert = aplicables.map(({ paso, condicionEfectiva, condicionHeredada }: any) =>
    construirTarea(ctx.ot.expediente_id, paso, condicionEfectiva, condicionHeredada, ctx.responsables, ahora, ordenTrabajoId)
  );
  const { error } = await sb.from("bpm_expediente_tareas").insert(tareasInsert);
  if (error) {
    console.error("Error al instanciar tareas BPM de la OT:", error);
    return { ok: false, tareas: 0 };
  }
  await registrarActividad(sb, {
    expedienteId: ctx.ot.expediente_id,
    tipo: "sistema",
    titulo: `🚀 Flujo de trabajo de la orden ${ctx.ot.folio} inicializado`,
    detalle: `${tareasInsert.length} tareas de ${ctx.ot.tipo_negocio}.`
  });
  return { ok: true, tareas: tareasInsert.length };
}

/**
 * Reevalúa las condiciones de la ficha de la OT (p. ej. `ya_tiene_casa`)
 * después de que cambian: cancela las tareas abiertas de pasos que ya no
 * aplican, crea las de pasos que ahora sí aplican y recalcula de qué paso
 * depende cada tarea. No toca tareas completadas.
 */
export async function reevaluarCondicionesBpm(ordenTrabajoId: string) {
  const sb = supabaseServidor();
  const ctx = await contextoOrden(sb, ordenTrabajoId);
  if (!ctx) return;
  const expedienteId = ctx.ot.expediente_id as string;

  const datosFlujo = await obtenerFlujoPorProducto(ctx.ot.tipo_negocio);
  if (!datosFlujo || datosFlujo.pasos.length === 0) return;
  // Solo aplica a flujos que usan condiciones por campo.
  if (!datosFlujo.pasos.some((p: any) => p.condicion_campo)) return;

  const { data: tareas } = await sb
    .from("bpm_expediente_tareas")
    .select("*, paso:paso_id(*)")
    .eq("orden_trabajo_id", ordenTrabajoId);
  if (!tareas || tareas.length === 0) return; // el flujo aún no se instancia

  const aplicables = resolverPasosAplicables(datosFlujo.pasos as any[], ctx.datos);
  const idsAplicables = new Set(aplicables.map((a) => a.paso.id));
  const abiertas = (t: any) => t.estado === "pendiente" || t.estado === "esperando_condicion";
  const ahora = new Date();
  const cambios: string[] = [];

  // 1. Cancelar tareas abiertas de pasos que ya no aplican
  for (const t of tareas) {
    if (t.paso_id && abiertas(t) && datosFlujo.pasos.some((p: any) => p.id === t.paso_id) && !idsAplicables.has(t.paso_id)) {
      await sb.from("bpm_expediente_tareas").update({ estado: "cancelada" }).eq("id", t.id);
      t.estado = "cancelada";
      cambios.push(`omitida: ${t.titulo}`);
    }
  }

  // 2. Crear / actualizar las tareas de pasos que aplican
  const tituloCompletado = new Set(
    tareas.filter((t: any) => t.estado === "completada" && t.paso).map((t: any) => t.paso.titulo_tarea)
  );
  const idCompletado = new Set(tareas.filter((t: any) => t.estado === "completada").map((t: any) => t.paso_id));
  const yaCumplida = (cond: string) =>
    cond === "inmediato" || tituloCompletado.has(cond) || Array.from(idCompletado).some((id) => `completar_${id}` === cond);

  for (const { paso, condicionEfectiva, condicionHeredada } of aplicables as any[]) {
    const existentes = tareas.filter((t: any) => t.paso_id === paso.id);
    const vigente = existentes.find((t: any) => t.estado !== "cancelada");
    if (!vigente) {
      const nueva = construirTarea(expedienteId, paso, condicionEfectiva, condicionHeredada, ctx.responsables, ahora, ordenTrabajoId);
      if (nueva.estado === "esperando_condicion" && yaCumplida(condicionEfectiva)) nueva.estado = "pendiente";
      await sb.from("bpm_expediente_tareas").insert(nueva);
      cambios.push(`agregada: ${paso.titulo_tarea}`);
      continue;
    }
    if (!abiertas(vigente)) continue;
    const payload: Record<string, any> = {};
    const efectivaGuardada = vigente.condicion_activacion_efectiva || null;
    const efectivaNueva = condicionHeredada ? condicionEfectiva : null;
    if (efectivaGuardada !== efectivaNueva) payload.condicion_activacion_efectiva = efectivaNueva;
    if (vigente.estado === "esperando_condicion" && yaCumplida(condicionEfectiva)) payload.estado = "pendiente";
    if (Object.keys(payload).length > 0) {
      await sb.from("bpm_expediente_tareas").update(payload).eq("id", vigente.id);
    }
  }

  if (cambios.length > 0) {
    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: `🔀 Flujo de la orden ${ctx.ot.folio} ajustado a su ficha`,
      detalle: cambios.join(" · ")
    });
  }
  revalidatePath("/ordenes-trabajo/[id]");
}

/** Sincroniza los responsables de las tareas pendientes de un expediente tras cambiar el asesor u operador */
export async function sincronizarAsignadosBpm(
  expedienteId: string,
  asesorId: string | null,
  operadorId: string | null
) {
  const sb = supabaseServidor();

  // 1. Obtener todas las tareas pendientes del expediente junto con su rol_responsable
  const { data: tareas, error } = await sb
    .from("bpm_expediente_tareas")
    .select("id, paso:paso_id(rol_responsable)")
    .eq("expediente_id", expedienteId)
    .in("estado", ["pendiente", "esperando_condicion"]);

  if (error || !tareas) return;

  for (const t of tareas) {
    const rol = (t.paso as any)?.rol_responsable;
    let nuevoResponsableId = undefined;

    if (rol === "asesor") {
      nuevoResponsableId = asesorId;
    } else if (rol === "operaciones" || rol === "gestor") {
      nuevoResponsableId = operadorId;
    }

    if (nuevoResponsableId !== undefined) {
      await sb
        .from("bpm_expediente_tareas")
        .update({ responsable_id: nuevoResponsableId })
        .eq("id", t.id);
    }
  }
}

/** Cambia el estado de una tarea y evalúa si desbloquea pasos dependientes */
export async function actualizarEstadoTarea(
  tareaId: string, 
  nuevoEstado: 'pendiente' | 'esperando_condicion' | 'completada' | 'cancelada',
  responsableId?: string | null
) {
  const sb = supabaseServidor();
  const completadaEn = nuevoEstado === 'completada' ? new Date().toISOString() : null;

  const payload: any = { estado: nuevoEstado, completada_en: completadaEn };
  if (responsableId !== undefined) {
    payload.responsable_id = responsableId;
  }

  const { data: tareaActualizada, error: errUpdate } = await sb
    .from("bpm_expediente_tareas")
    .update(payload)
    .eq("id", tareaId)
    .select("*, paso:paso_id(*)")
    .single();

  if (errUpdate) throw new Error("Error al actualizar tarea: " + errUpdate.message);

  await registrarActividad(sb, {
    expedienteId: tareaActualizada.expediente_id,
    tipo: "tarea",
    titulo: `Tarea "${tareaActualizada.titulo}" marcada como ${nuevoEstado}`,
  });

  // Si se completó la tarea, verificar si hay otras tareas esperando este desencadenante
  if (nuevoEstado === 'completada' && tareaActualizada.paso) {
    const pasoTrigger = tareaActualizada.paso.titulo_tarea; // ej: "Subir presupuesto técnico"
    
    // Buscar tareas del mismo flujo (misma OT, o el expediente si no es de OT) en "esperando_condicion"
    let consultaEsperando = sb
      .from("bpm_expediente_tareas")
      .select("*, paso:paso_id(*)")
      .eq("expediente_id", tareaActualizada.expediente_id)
      .eq("estado", "esperando_condicion");
    consultaEsperando = tareaActualizada.orden_trabajo_id
      ? consultaEsperando.eq("orden_trabajo_id", tareaActualizada.orden_trabajo_id)
      : consultaEsperando.is("orden_trabajo_id", null);
    const { data: tareasEsperando } = await consultaEsperando;

    if (tareasEsperando && tareasEsperando.length > 0) {
      for (const t of tareasEsperando) {
        // Si el paso dependiente tiene como condición de activación la conclusión de esta tarea
        const condicion = condicionDeTarea(t);
        if (condicion === pasoTrigger || condicion === `completar_${tareaActualizada.paso.id}`) {
          await sb
            .from("bpm_expediente_tareas")
            .update({ estado: "pendiente" })
            .eq("id", t.id);

          const tipoAct = t.titulo.toLowerCase().includes("inspeccion") || t.titulo.toLowerCase().includes("visita")
            ? "inspeccion"
            : t.titulo.toLowerCase().includes("cotiz")
            ? "correo"
            : "tarea";

          await registrarActividad(sb, {
            expedienteId: tareaActualizada.expediente_id,
            tipo: tipoAct,
            titulo: `⚡ Tarea Activada: "${t.titulo}"`,
            detalle: `Desbloqueada automáticamente tras completarse "${tareaActualizada.titulo}". ${t.descripcion || ""}`
          });
        }
      }
    }
  }

  revalidatePath("/expediente/[id]");
}

/** Desbloquea tareas que esperan un evento específico (ej. al subir cotización o reporte de visita) */
export async function activarTareasBPMPorEvento(expedienteId: string, nombreEvento: string) {
  const sb = supabaseServidor();
  
  // Buscar tareas esperando esta condición
  const { data: tareasEsperando } = await sb
    .from("bpm_expediente_tareas")
    .select("*, paso:paso_id(*)")
    .eq("expediente_id", expedienteId)
    .eq("estado", "esperando_condicion")
    .is("orden_trabajo_id", null);

  if (!tareasEsperando || tareasEsperando.length === 0) return;

  for (const t of tareasEsperando) {
    if (condicionDeTarea(t) === nombreEvento) {
      await sb
        .from("bpm_expediente_tareas")
        .update({ estado: "pendiente" })
        .eq("id", t.id);

      await registrarActividad(sb, {
        expedienteId,
        tipo: "sistema",
        titulo: `⚡ Tarea desbloqueada por evento: "${t.titulo}"`,
        detalle: `Activada por el evento de sistema: ${nombreEvento}.`
      });
    }
  }
}

/** Obtiene todos los flujos BPM registrados y sus pasos */
export async function listarFlujosBPM() {
  const sb = supabaseServidor();
  const { data: flujos, error: errFlujos } = await sb
    .from("bpm_flujos")
    .select("*")
    .order("tipo_negocio", { ascending: true });

  if (errFlujos) {
    console.error("Error al listar flujos BPM:", errFlujos);
    return [];
  }

  const { data: pasos, error: errPasos } = await sb
    .from("bpm_pasos")
    .select("*")
    .order("orden", { ascending: true });

  if (errPasos) {
    console.error("Error al listar pasos BPM:", errPasos);
    return [];
  }

  // Agrupar pasos por flujo
  return (flujos || []).map((f) => ({
    id: f.id,
    tipoNegocio: f.tipo_negocio,
    activo: f.activo,
    pasos: (pasos || [])
      .filter((p) => p.flujo_id === f.id)
      .map((p) => ({
        id: p.id,
        flujoId: p.flujo_id,
        etapa: p.etapa,
        orden: p.orden,
        tituloTarea: p.titulo_tarea,
        descripcion: p.descripcion,
        rolResponsable: p.rol_responsable,
        diasVencimiento: p.dias_vencimiento,
        condicionActivacion: p.condicion_activacion,
        condicionCampo: p.condicion_campo ?? null
      }))
  }));
}

export interface ConcluirTareaParams {
  expedienteId?: string | null;
  prospectoId?: string | null;
  tareaId?: string | null; // bpm_expediente_tareas ID
  taskAsesorId?: string | null; // asesor_tasks ID
  citaId?: string | null; // agenda_citas ID
  resultadoNotas: string;
  reprogramarSiguiente: boolean;
  diasSiguiente?: number;
  fechaSiguiente?: string | null;
  tituloSiguiente?: string;
  responsableId?: string | null;
}

/**
 * Concluye la tarea/cita de seguimiento actual y (opcionalmente) programa en automático 
 * la siguiente llamada o acción de seguimiento en el BPM con responsable y reglas de fecha.
 */
export async function concluirTareaYProgramarSiguiente(params: ConcluirTareaParams) {
  const sb = supabaseServidor();
  const hoyIso = new Date().toISOString();

  // 1. Marcar la tarea o cita actual como completada
  if (params.tareaId) {
    await sb
      .from("bpm_expediente_tareas")
      .update({ estado: "completada", completada_en: hoyIso })
      .eq("id", params.tareaId);
  }

  if (params.taskAsesorId) {
    await sb
      .from("asesor_tasks")
      .update({ status: "completada", completada_en: hoyIso })
      .eq("id", params.taskAsesorId);
  }

  const notaConclusion = `✅ Finalizada / Retro: ${params.resultadoNotas || ""}`.trim();

  if (params.citaId) {
    const { error: errCita } = await sb
      .from("agenda_citas")
      .update({ estado: "completada", notas: params.resultadoNotas })
      .eq("id", params.citaId);

    if (errCita && errCita.code === "23514") {
      await sb
        .from("agenda_citas")
        .update({ estado: "cancelada", notas: notaConclusion })
        .eq("id", params.citaId);
    }
  }

  if (params.expedienteId) {
    const { error: errExp } = await sb
      .from("agenda_citas")
      .update({ estado: "completada", notas: params.resultadoNotas })
      .eq("expediente_id", params.expedienteId)
      .neq("estado", "cancelada");

    if (errExp && errExp.code === "23514") {
      await sb
        .from("agenda_citas")
        .update({ estado: "cancelada", notas: notaConclusion })
        .eq("expediente_id", params.expedienteId)
        .neq("estado", "cancelada");
    }
  }

  if (params.prospectoId) {
    const { error: errPros } = await sb
      .from("agenda_citas")
      .update({ estado: "completada", notas: params.resultadoNotas })
      .eq("prospecto_id", params.prospectoId)
      .neq("estado", "cancelada");

    if (errPros && errPros.code === "23514") {
      await sb
        .from("agenda_citas")
        .update({ estado: "cancelada", notas: notaConclusion })
        .eq("prospecto_id", params.prospectoId)
        .neq("estado", "cancelada");
    }
  }

  // 1b. Si se concluyó una cita de inspección técnica o el expediente/prospecto tiene inspecciones asociadas, sincronizar comisión fija
  try {
    const { sincronizarComisionParaInspeccion } = await import("@/app/actions/comisiones");
    if (params.citaId) {
      await sincronizarComisionParaInspeccion(params.citaId);
    }
    if (params.expedienteId) {
      const { data: citasInspExp } = await sb
        .from("agenda_citas")
        .select("id")
        .eq("expediente_id", params.expedienteId)
        .eq("tipo_cita", "inspeccion");
      for (const c of citasInspExp || []) {
        await sincronizarComisionParaInspeccion(c.id);
      }
    }
    if (params.prospectoId) {
      const { data: citasInspPros } = await sb
        .from("agenda_citas")
        .select("id")
        .eq("prospecto_id", params.prospectoId)
        .eq("tipo_cita", "inspeccion");
      for (const c of citasInspPros || []) {
        await sincronizarComisionParaInspeccion(c.id);
      }
    }
  } catch (errCom) {
    console.warn("Aviso al sincronizar comisión por inspección en bpm:", errCom);
  }

  // 2. Registrar en la bitácora de actividades
  const textoActividad = params.resultadoNotas?.trim() 
    ? `✅ Actividad/Seguimiento concluido: "${params.resultadoNotas.trim()}"`
    : `✅ Actividad/Seguimiento marcado como concluido.`;

  await registrarActividad(sb, {
    expedienteId: params.expedienteId || null,
    prospectoId: params.prospectoId || null,
    tipo: "tarea",
    titulo: "Seguimiento Concluido",
    detalle: textoActividad
  });

  // 3. Si se solicita reprogramar / agendar automáticamente la siguiente llamada en el BPM
  if (params.reprogramarSiguiente && (params.expedienteId || params.prospectoId)) {
    let fechaFinal = params.fechaSiguiente;
    if (!fechaFinal && params.diasSiguiente) {
      const d = new Date();
      d.setDate(d.getDate() + Number(params.diasSiguiente));
      fechaFinal = d.toISOString().slice(0, 10);
    }
    if (!fechaFinal) {
      const d = new Date();
      d.setDate(d.getDate() + 2); // Por defecto en 2 días
      fechaFinal = d.toISOString().slice(0, 10);
    }

    const tituloSiguiente = params.tituloSiguiente?.trim() || "📞 Llamada de seguimiento";

    if (params.expedienteId) {
      await sb.from("bpm_expediente_tareas").insert({
        expediente_id: params.expedienteId,
        titulo: tituloSiguiente,
        descripcion: `Llamada de seguimiento programada. Retro previa: ${params.resultadoNotas || "Sin notas"}`,
        estado: "pendiente",
        responsable_id: params.responsableId || null,
        agendada_para: `${fechaFinal}T10:00:00`
      });
    }

    await registrarActividad(sb, {
      expedienteId: params.expedienteId || null,
      prospectoId: params.prospectoId || null,
      tipo: "sistema",
      titulo: `⚡ Siguiente llamada agendada para el ${fechaFinal}`,
      detalle: `Título: "${tituloSiguiente}". Responsable: ${params.responsableId ? "Asignado" : "Sin asignar"}.`
    });
  }

  revalidatePath("/expediente/[id]");
  revalidatePath("/prospectos/[id]");
  revalidatePath("/dashboard");
  revalidatePath("/agenda");
  revalidatePath("/");

  return { ok: true, mensaje: "Seguimiento concluido y reprogramado exitosamente." };
}
