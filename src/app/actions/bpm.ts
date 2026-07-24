"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { revalidatePath } from "next/cache";

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
  rolResponsable: 'asesor' | 'operaciones' | 'tecnico' | 'admin';
  diasVencimiento: number;
  condicionActivacion: string;
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

/** Crea o actualiza un flujo BPM plantilla */
export async function guardarFlujoBPM(tipoNegocio: string, pasos: Omit<BpmPaso, "id" | "flujoId">[]) {
  const sb = supabaseServidor();
  
  // 1. Upsert del flujo
  const { data: flujo, error: errFlujo } = await sb
    .from("bpm_flujos")
    .upsert({ tipo_negocio: tipoNegocio, activo: true }, { onConflict: "tipo_negocio" })
    .select("id")
    .single();

  if (errFlujo) throw new Error("No se pudo guardar el flujo BPM: " + errFlujo.message);

  // 2. Eliminar pasos existentes para rehacerlos
  await sb.from("bpm_pasos").delete().eq("flujo_id", flujo.id);

  // 3. Insertar nuevos pasos
  if (pasos.length > 0) {
    const pasosInsert = pasos.map((p, idx) => ({
      flujo_id: flujo.id,
      etapa: p.etapa,
      orden: idx + 1,
      titulo_tarea: p.tituloTarea,
      descripcion: p.descripcion,
      rol_responsable: p.rolResponsable,
      dias_vencimiento: p.diasVencimiento,
      condicion_activacion: p.condicionActivacion || "inmediato"
    }));

    const { error: errPasos } = await sb.from("bpm_pasos").insert(pasosInsert);
    if (errPasos) throw new Error("No se pudieron guardar los pasos del flujo: " + errPasos.message);
  }

  return flujo.id;
}

/** Obtiene todas las tareas BPM de un expediente específico */
export async function obtenerTareasExpediente(expedienteId: string): Promise<BpmTareaInstanciada[]> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("bpm_expediente_tareas")
    .select("*, paso:paso_id(*), responsable:responsable_id(nombre)")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al obtener tareas del expediente:", error);
    return [];
  }

  return (data || []).map((t) => ({
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
    .eq("expediente_id", expedienteId);

  if (count && count > 0) return; // ya inicializado

  // 2. Obtener la plantilla de flujo
  const datosFlujo = await obtenerFlujoPorProducto(tipoNegocio);
  if (!datosFlujo || datosFlujo.pasos.length === 0) return;

  // 3. Crear tareas
  const ahora = new Date();
  const tareasInsert = datosFlujo.pasos.map((p: any) => {
    const agendadaPara = new Date(ahora.getTime() + p.dias_vencimiento * 24 * 60 * 60 * 1000).toISOString();
    
    // Si tiene condición especial (como esperar reporte técnico), inicia en "esperando_condicion"
    const estadoInicial = p.condicion_activacion === "inmediato" ? "pendiente" : "esperando_condicion";

    return {
      expediente_id: expedienteId,
      paso_id: p.id,
      titulo: p.titulo_tarea,
      descripcion: p.descripcion,
      estado: estadoInicial,
      dias_vencimiento: p.dias_vencimiento,
      agendada_para: agendadaPara
    };
  });

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
    
    // Buscar tareas en el mismo expediente en estado "esperando_condicion"
    const { data: tareasEsperando } = await sb
      .from("bpm_expediente_tareas")
      .select("*, paso:paso_id(*)")
      .eq("expediente_id", tareaActualizada.expediente_id)
      .eq("estado", "esperando_condicion");

    if (tareasEsperando && tareasEsperando.length > 0) {
      for (const t of tareasEsperando) {
        // Si el paso dependiente tiene como condición de activación la conclusión de esta tarea
        if (t.paso?.condicion_activacion === pasoTrigger || t.paso?.condicion_activacion === `completar_${tareaActualizada.paso.id}`) {
          await sb
            .from("bpm_expediente_tareas")
            .update({ estado: "pendiente" })
            .eq("id", t.id);

          await registrarActividad(sb, {
            expedienteId: tareaActualizada.expediente_id,
            tipo: "sistema",
            titulo: `⚡ Tarea activada: "${t.titulo}"`,
            detalle: `Desbloqueada tras completarse la tarea "${tareaActualizada.titulo}".`
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
    .eq("estado", "esperando_condicion");

  if (!tareasEsperando || tareasEsperando.length === 0) return;

  for (const t of tareasEsperando) {
    if (t.paso?.condicion_activacion === nombreEvento) {
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
