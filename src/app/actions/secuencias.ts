"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { orquestador, salirDeSecuencia } from "@/lib/automatizaciones/orquestador";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

/**
 * Acciones del Servidor para el Módulo de Marketing Automation (Secuencias).
 */

export interface DatosPaso {
  id?: string;
  orden: number;
  canal: "whatsapp" | "email" | "llamada" | "messenger" | "sms";
  delay_horas: number;
  mensaje?: string;
  asunto_email?: string;
  asignar_a?: string; // UUID de perfiles
  condicion_salida: "respondio" | "califico" | "manual";
}

export interface DatosSecuencia {
  nombre: string;
  descripcion?: string;
  status: "activa" | "pausada" | "archivada";
  segmento: "sin_contactar" | "sin_respuesta" | "rojo" | "todos";
  steps: DatosPaso[];
}

/** Obtiene todas las secuencias de automatización */
export async function listarSecuencias() {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("automation_sequences")
    .select(`
      *,
      steps:sequence_steps(id, orden, canal, delay_horas, mensaje, asunto_email, asignar_a, condicion_salida),
      enrollments_count:sequence_enrollments(count)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  
  // Normalizar recuento de enrollments agrupados
  return (data || []).map((sec: any) => ({
    ...sec,
    leads_activos: Array.isArray(sec.enrollments_count) ? sec.enrollments_count[0]?.count || 0 : 0
  }));
}

/** Obtiene una secuencia específica con sus pasos y enrolamientos */
export async function obtenerSecuencia(id: string) {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: sec, error } = await sb
    .from("automation_sequences")
    .select(`
      *,
      steps:sequence_steps(*)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!sec) return null;

  // Ordenar los pasos por el campo orden
  if (sec.steps) {
    sec.steps.sort((a: any, b: any) => a.orden - b.orden);
  }

  return sec;
}

/** Crea una nueva secuencia con sus pasos */
export async function crearSecuencia(datos: DatosSecuencia) {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Insertar secuencia
  const { data: sec, error: errSec } = await sb
    .from("automation_sequences")
    .insert({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      status: datos.status,
      segmento: datos.segmento,
    })
    .select("*")
    .single();

  if (errSec) throw new Error(errSec.message);

  // 2. Insertar pasos si los hay
  if (datos.steps && datos.steps.length > 0) {
    const filasPasos = datos.steps.map((step) => ({
      sequence_id: sec.id,
      orden: step.orden,
      canal: step.canal,
      delay_horas: step.delay_horas,
      mensaje: step.mensaje?.trim() || null,
      asunto_email: step.asunto_email?.trim() || null,
      asignar_a: step.asignar_a || null,
      condicion_salida: step.condicion_salida || "respondio",
    }));

    const { error: errSteps } = await sb.from("sequence_steps").insert(filasPasos);
    if (errSteps) {
      // Intentar rollback borrando secuencia
      await sb.from("automation_sequences").delete().eq("id", sec.id);
      throw new Error(`Error insertando pasos: ${errSteps.message}`);
    }
  }

  revalidatePath("/secuencias");
  return sec;
}

/** Actualiza una secuencia existente y recrea sus pasos */
export async function actualizarSecuencia(id: string, datos: DatosSecuencia) {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Actualizar secuencia
  const { error: errSec } = await sb
    .from("automation_sequences")
    .update({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      status: datos.status,
      segmento: datos.segmento,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (errSec) throw new Error(errSec.message);

  // 2. Borrar pasos antiguos y crear nuevos (sincronización simple y robusta)
  const { error: errDel } = await sb.from("sequence_steps").delete().eq("sequence_id", id);
  if (errDel) throw new Error(`Error limpiando pasos previos: ${errDel.message}`);

  if (datos.steps && datos.steps.length > 0) {
    const filasPasos = datos.steps.map((step) => ({
      sequence_id: id,
      orden: step.orden,
      canal: step.canal,
      delay_horas: step.delay_horas,
      mensaje: step.mensaje?.trim() || null,
      asunto_email: step.asunto_email?.trim() || null,
      asignar_a: step.asignar_a || null,
      condicion_salida: step.condicion_salida || "respondio",
    }));

    const { error: errSteps } = await sb.from("sequence_steps").insert(filasPasos);
    if (errSteps) throw new Error(`Error recreando pasos: ${errSteps.message}`);
  }

  revalidatePath("/secuencias");
  return { id };
}

/** Cambia el estado de una secuencia (activa | pausada | archivada) */
export async function cambiarEstadoSecuencia(id: string, status: "activa" | "pausada" | "archivada") {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("automation_sequences")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/secuencias");
}

/** Elimina una secuencia por completo */
export async function eliminarSecuencia(id: string) {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb.from("automation_sequences").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/secuencias");
}

/** Obtiene enrolamientos activos y completados para el panel de control */
export async function listarEnrollments(sequenceId?: string) {
  await requireAdmin();
  const sb = supabaseServidor();
  let query = sb
    .from("sequence_enrollments")
    .select(`
      *,
      sequence:automation_sequences(
        nombre,
        steps:sequence_steps(*)
      ),
      actions:sequence_actions(*)
    `)
    .order("enrolled_at", { ascending: false });

  if (sequenceId) {
    query = query.eq("sequence_id", sequenceId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Enrola un prospecto existente en una secuencia */
export async function enrolarLead(datos: {
  sequenceId: string;
  phone: string;
  nombre: string;
  email?: string;
  prospectoId?: string;
  expedienteId?: string;
}) {
  await requireAdmin();
  const sb = supabaseServidor();

  // Verificar si ya está enrolado y activo en esta secuencia
  const { data: existente } = await sb
    .from("sequence_enrollments")
    .select("id")
    .eq("sequence_id", datos.sequenceId)
    .eq("phone", datos.phone)
    .eq("status", "activo")
    .maybeSingle();

  if (existente) {
    throw new Error("El lead ya está enrolado activamente en esta secuencia.");
  }

  // Obtener canal_id del prospecto o expediente si existe
  let canalId = "";
  if (datos.expedienteId) {
    const { data: exp } = await sb
      .from("expedientes")
      .select("canal_id")
      .eq("id", datos.expedienteId)
      .maybeSingle();
    if (exp?.canal_id) canalId = exp.canal_id;
  }
  if (!canalId && datos.prospectoId) {
    const { data: pr } = await sb
      .from("prospectos")
      .select("canal_id")
      .eq("id", datos.prospectoId)
      .maybeSingle();
    if (pr?.canal_id) canalId = pr.canal_id;
  }

  const { data, error } = await sb
    .from("sequence_enrollments")
    .insert({
      sequence_id: datos.sequenceId,
      phone: datos.phone,
      nombre: datos.nombre,
      email: datos.email || null,
      prospecto_id: datos.prospectoId || null,
      expediente_id: datos.expedienteId || null,
      canal_id: canalId || "",
      status: "activo",
      step_actual: 1,
      enrolled_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/secuencias");
  return data;
}

/** Cambia el estado de un enrolamiento (pausar, reanudar o salir) */
export async function cambiarEstadoEnrollment(enrollmentId: string, status: "activo" | "pausado" | "salido") {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("sequence_enrollments")
    .update({
      status,
      ultimo_contacto_at: new Date().toISOString(),
      ...(status === "salido" ? { salio_en_step: 1, razon_salida: "manual" } : {}),
    })
    .eq("id", enrollmentId);

  if (error) throw new Error(error.message);
  revalidatePath("/secuencias");
}

/** Lista de asesores disponibles en el sistema (perfiles activos) */
export async function listarAsesores() {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/** Obtiene la bandeja de tareas del asesor autenticado actual */
export async function listarTareasAsesor() {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");

  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("asesor_tasks")
    .select(`
      *,
      enrollment:sequence_enrollments(
        id,
        nombre,
        phone,
        email,
        expediente_id,
        prospecto_id
      )
    `)
    .eq("asesor_id", usuario.id)
    .order("agendada_para", { ascending: true });

  if (error) throw new Error(error.message);

  // Obtener contexto extra de expedientes de forma paralela y segura
  const tareasConContexto = [...(data || [])];
  const expIds = tareasConContexto
    .map((t) => t.enrollment?.expediente_id)
    .filter(Boolean) as string[];

  if (expIds.length > 0) {
    const { data: exps } = await sb
      .from("expedientes")
      .select("id, cliente, notas, situacion, fraccionamiento")
      .in("id", expIds);

    const expMap = new Map((exps || []).map((e) => [e.id, e]));

    return tareasConContexto.map((t) => {
      const exp = t.enrollment?.expediente_id ? expMap.get(t.enrollment.expediente_id) : null;
      return {
        ...t,
        contexto: exp
          ? `Fraccionamiento: ${exp.fraccionamiento || "Villas San Juan"}. Situación: ${
              exp.situacion || "Sin respuesta 3 días"
            }. Notas: ${exp.notas || ""}`
          : "Lead sin expediente.",
      };
    });
  }

  return tareasConContexto.map((t) => ({ ...t, contexto: "Lead sin expediente enlazado." }));
}

/** Actualiza la tarea asignada al asesor */
export async function resolverTareaAsesor(
  taskId: string,
  resultado: "respondio" | "no_contesto" | "numero_invalido" | "agendo_cita",
  notas?: string,
  reagendaPara?: string,
) {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");

  const sb = supabaseServidor();

  // 1. Obtener la tarea y el enrollment enlazado
  const { data: tarea, error: errTarea } = await sb
    .from("asesor_tasks")
    .select("*, enrollment:sequence_enrollments(*)")
    .eq("id", taskId)
    .single();

  if (errTarea || !tarea) throw new Error("Tarea no encontrada.");

  const enrollment = tarea.enrollment;

  if (resultado === "no_contesto") {
    // Cuenta los intentos de llamadas registradas en sequence_actions
    const { count } = await sb
      .from("sequence_actions")
      .select("*", { count: "exact", head: true })
      .eq("enrollment_id", enrollment.id)
      .eq("canal", "llamada")
      .eq("status", "fallido");

    const intentosPrevios = count || 0;

    if (intentosPrevios >= 2) {
      // Ya son 3 intentos en total (2 previos + este)
      // Sacar de la secuencia como "no_localizado"
      await sb.from("asesor_tasks").update({
        status: "perdida",
        completada_at: new Date().toISOString(),
        resultado,
        notas: notas || "Se completan 3 intentos de llamada sin respuesta. Lead no localizado.",
      }).eq("id", taskId);

      await salirDeSecuencia(sb, enrollment.id, "no_localizado", enrollment.step_actual);
    } else {
      // Registrar intento fallido
      await sb.from("sequence_actions").insert({
        enrollment_id: enrollment.id,
        step_id: tarea.step_id || null,
        canal: "llamada",
        status: "fallido",
        contenido_enviado: "Intento de llamada: el cliente no contestó.",
        notas_asesor: notas || null,
        enviado_at: new Date().toISOString(),
      });

      // Actualizar tarea
      await sb.from("asesor_tasks").update({
        status: "completada",
        completada_at: new Date().toISOString(),
        resultado,
        notas,
      }).eq("id", taskId);

      // Avanzar al siguiente paso de la secuencia
      await sb
        .from("sequence_enrollments")
        .update({
          step_actual: enrollment.step_actual + 1,
          ultimo_contacto_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);
    }
  } else if (resultado === "respondio" || resultado === "agendo_cita") {
    // El cliente respondió, sacar de secuencia
    await sb.from("asesor_tasks").update({
      status: "completada",
      completada_at: new Date().toISOString(),
      resultado,
      notas,
    }).eq("id", taskId);

    // Registra acción exitosa
    await sb.from("sequence_actions").insert({
      enrollment_id: enrollment.id,
      step_id: tarea.step_id || null,
      canal: "llamada",
      status: "llamada_completada",
      contenido_enviado: `Llamada completada con resultado: ${resultado}.`,
      notas_asesor: notas || null,
      enviado_at: new Date().toISOString(),
      respondido_at: new Date().toISOString(),
    });

    await salirDeSecuencia(sb, enrollment.id, "respondio", enrollment.step_actual);
  } else if (resultado === "numero_invalido") {
    // Número inválido, finalizar secuencia
    await sb.from("asesor_tasks").update({
      status: "perdida",
      completada_at: new Date().toISOString(),
      resultado,
      notas: notas || "Número inválido detectado.",
    }).eq("id", taskId);

    await salirDeSecuencia(sb, enrollment.id, "no_localizado", enrollment.step_actual);
  }

  // Si decide reagendar
  if (reagendaPara) {
    await sb.from("asesor_tasks").update({
      status: "reagendada",
      notas: `Reagendada para: ${reagendaPara}. ${notas || ""}`,
    }).eq("id", taskId);

    // Crear la nueva tarea agendada
    await sb.from("asesor_tasks").insert({
      enrollment_id: enrollment.id,
      asesor_id: usuario.id,
      tipo: "llamada",
      status: "pendiente",
      agendada_para: reagendaPara,
      notas: `Llamada reagendada. Notas previas: ${notas || ""}`,
    });
  }

  revalidatePath("/secuencias");
}

/** Obtiene la trazabilidad o historial de un lead */
export async function obtenerTrazabilidadLead(leadPhoneOrId: string) {
  await requireAdmin();
  const sb = supabaseServidor();

  // Buscar el enrollment más reciente
  const { data: enrollment, error: errEn } = await sb
    .from("sequence_enrollments")
    .select(`
      *,
      sequence:automation_sequences(nombre)
    `)
    .or(`phone.eq.${leadPhoneOrId},prospecto_id.eq.${leadPhoneOrId}`)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errEn) throw new Error(errEn.message);
  if (!enrollment) return null;

  // Obtener acciones de trazabilidad
  const { data: acciones, error: errAc } = await sb
    .from("sequence_actions")
    .select(`
      *,
      step:sequence_steps(orden, mensaje)
    `)
    .eq("enrollment_id", enrollment.id)
    .order("enviado_at", { ascending: true });

  if (errAc) throw new Error(errAc.message);

  return {
    enrollment,
    historial: acciones || [],
  };
}

/** Obtiene métricas agregadas del rendimiento por canal */
export async function obtenerAnalytics() {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Auto-reparación de atribuciones históricas si hay discrepancias
  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] obtenerAnalytics ejecutado.`);
  try {
    const { data: enrollmentsRespondio } = await sb
      .from("sequence_enrollments")
      .select("id, nombre, phone, ultimo_contacto_at, sequence_id, enrolled_at")
      .eq("status", "salido")
      .eq("razon_salida", "respondio");

    logLines.push(`  Leads respondidos en base de datos: ${enrollmentsRespondio?.length || 0}`);

    if (enrollmentsRespondio && enrollmentsRespondio.length > 0) {
      for (const en of enrollmentsRespondio) {
        // Verificar si existe alguna acción marcada como respondida para este enrollment
        const { data: accionesLead, error: errAc } = await sb
          .from("sequence_actions")
          .select("id, status, respondido_at, canal, enviado_at")
          .eq("enrollment_id", en.id);

        if (errAc) {
          logLines.push(`    [Error] Leyendo acciones para ${en.nombre} (${en.phone}): ${errAc.message}`);
          continue;
        }

        logLines.push(`    Lead: ${en.nombre} (${en.phone}) - Acciones en base de datos: ${accionesLead?.length || 0}`);
        for (const ac of accionesLead || []) {
          logLines.push(`      Acción ID: ${ac.id}, Canal: ${ac.canal}, Status: ${ac.status}, RespondidoAt: ${ac.respondido_at}`);
        }

        const yaRespondido = (accionesLead || []).some(
          (ac) => ac.status === "respondido" || ac.respondido_at !== null
        );

        logLines.push(`      yaRespondido: ${yaRespondido}`);

        if (!yaRespondido) {
          logLines.push(`      Buscando última acción para ${en.nombre}...`);
          // Si no está marcada, buscar la última acción enviada y marcarla como respondido
          const { data: ultimaAccion } = await sb
            .from("sequence_actions")
            .select("id, canal, status")
            .eq("enrollment_id", en.id)
            .order("enviado_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (ultimaAccion) {
            logLines.push(`      Encontrada ultimaAccion: ID=${ultimaAccion.id}, Canal=${ultimaAccion.canal}, Status=${ultimaAccion.status}. Actualizando a 'respondido'...`);
            const { error: errUp } = await sb
              .from("sequence_actions")
              .update({
                status: "respondido",
                respondido_at: en.ultimo_contacto_at || new Date().toISOString(),
              })
              .eq("id", ultimaAccion.id);
            
            if (errUp) {
              logLines.push(`        [Error] Falló actualización: ${errUp.message}`);
            } else {
              logLines.push(`        [Exito] Acción marcada como respondida.`);
            }
          } else {
            logLines.push(`        No se encontró ninguna acción previa para ${en.nombre}. Creando acción sintetizada...`);
            
            // Buscar el primer step para la secuencia
            let stepId: string | null = null;
            let canal = "whatsapp"; // fallback por defecto
            
            if (en.sequence_id) {
              const { data: firstStep } = await sb
                .from("sequence_steps")
                .select("id, canal")
                .eq("sequence_id", en.sequence_id)
                .order("orden", { ascending: true })
                .limit(1)
                .maybeSingle();
              
              if (firstStep) {
                stepId = firstStep.id;
                canal = firstStep.canal;
              }
            }
            
            const { error: errIns } = await sb
              .from("sequence_actions")
              .insert({
                enrollment_id: en.id,
                step_id: stepId,
                canal: canal,
                status: "respondido",
                contenido_enviado: "(Auto-reparado: Lead respondió al enrolamiento inicial)",
                enviado_at: en.enrolled_at || new Date().toISOString(),
                respondido_at: en.ultimo_contacto_at || new Date().toISOString(),
                notas_asesor: "Creado por rutina de auto-reparación de analytics (lead sin acciones previas).",
              });
              
            if (errIns) {
              logLines.push(`        [Error] Falló creación de acción sintetizada: ${errIns.message}`);
            } else {
              logLines.push(`        [Exito] Acción sintetizada creada con éxito.`);
            }
          }
        }
      }
    }
  } catch (repairErr: any) {
    logLines.push(`  [Error Crítico en Reparación] ${repairErr.message}`);
    console.error("Error al auto-reparar métricas históricas:", repairErr);
  }

  // Guardar log de diagnóstico a archivo local
  try {
    const logPath = path.join(process.cwd(), "debug_analytics_log.txt");
    fs.appendFileSync(logPath, logLines.join("\n") + "\n\n", "utf8");
    console.log(`[Diagnostics] Logs de secuencias guardados en ${logPath}`);
  } catch (fsErr: any) {
    console.error(`[Diagnostics Error] No se pudo guardar el archivo: ${fsErr.message}`);
  }

  // 2. Obtener todas las acciones
  const { data: acciones, error: errAc } = await sb
    .from("sequence_actions")
    .select("canal, status, enviado_at, respondido_at");

  if (errAc) throw new Error(errAc.message);

  // 3. Obtener recuento de enrollments por estado
  const { data: enrollments, error: errEn } = await sb
    .from("sequence_enrollments")
    .select("status, razon_salida");

  if (errEn) throw new Error(errEn.message);

  // Procesar métricas por canal
  const metodos = ["whatsapp", "email", "sms", "messenger", "llamada"];
  const canalStats: Record<string, { enviados: number; respuestas: number; tasa: number }> = {};

  metodos.forEach((m) => {
    canalStats[m] = { enviados: 0, respuestas: 0, tasa: 0 };
  });

  (acciones || []).forEach((ac) => {
    const canal = ac.canal;
    if (canalStats[canal]) {
      if (
        ac.status === "enviado" ||
        ac.status === "llamada_agendada" ||
        ac.status === "sms_enviado" ||
        ac.status === "respondido"
      ) {
        canalStats[canal].enviados++;
      }
      if (
        ac.status === "respondio" ||
        ac.status === "respondido" ||
        ac.respondido_at ||
        ac.status === "llamada_completada"
      ) {
        canalStats[canal].respuestas++;
      }
    }
  });

  // Calcular tasas
  metodos.forEach((m) => {
    const stat = canalStats[m];
    stat.tasa = stat.enviados > 0 ? Math.round((stat.respuestas / stat.enviados) * 100) : 0;
  });

  // Recuentos globales
  const totalLeads = enrollments?.length || 0;
  const activos = enrollments?.filter((e) => e.status === "activo").length || 0;
  const completados = enrollments?.filter((e) => e.status === "completado").length || 0;
  const salidosRespondio = enrollments?.filter((e) => e.status === "salido" && e.razon_salida === "respondio").length || 0;

  const tasaRespuestaGlobal = totalLeads > 0 ? Math.round((salidosRespondio / totalLeads) * 100) : 0;

  return {
    global: {
      totalLeads,
      activos,
      completados,
      salidosRespondio,
      tasaRespuestaGlobal,
    },
    canales: canalStats,
  };
}

/** Ejecuta el orquestador manualmente y devuelve logs de ejecución */
export async function ejecutarOrquestadorManual() {
  await requireAdmin();
  const res = await orquestador();
  revalidatePath("/secuencias");
  return res;
}
