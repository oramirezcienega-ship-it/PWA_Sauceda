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
        condicion_activacion: p.condicionActivacion || "inmediato"
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

  // 1.5. Obtener los datos del expediente para ver quién es el asesor_id y el operador_id
  const { data: exp } = await sb
    .from("expedientes")
    .select("asesor_id, operador_id")
    .eq("id", expedienteId)
    .maybeSingle();

  // 2. Obtener la plantilla de flujo
  const datosFlujo = await obtenerFlujoPorProducto(tipoNegocio);
  if (!datosFlujo || datosFlujo.pasos.length === 0) return;

  // 3. Crear tareas
  const ahora = new Date();
  const tareasInsert = datosFlujo.pasos.map((p: any) => {
    const agendadaPara = new Date(ahora.getTime() + p.dias_vencimiento * 24 * 60 * 60 * 1000).toISOString();
    
    // Si tiene condición especial (como esperar reporte técnico), inicia en "esperando_condicion"
    const estadoInicial = p.condicion_activacion === "inmediato" ? "pendiente" : "esperando_condicion";

    // Asignación automática de responsable basado en rol
    let responsableId = null;
    if (p.rol_responsable === "asesor") {
      responsableId = exp?.asesor_id || null;
    } else if (p.rol_responsable === "operaciones") {
      responsableId = exp?.operador_id || null;
    }

    return {
      expediente_id: expedienteId,
      paso_id: p.id,
      titulo: p.titulo_tarea,
      descripcion: p.descripcion,
      estado: estadoInicial,
      dias_vencimiento: p.dias_vencimiento,
      agendada_para: agendadaPara,
      responsable_id: responsableId
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
    } else if (rol === "operaciones") {
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
        condicionActivacion: p.condicion_activacion
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
