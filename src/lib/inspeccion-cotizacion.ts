import type { SupabaseClient } from "@supabase/supabase-js";

export interface SincronizarInspeccionInput {
  citaId?: string | null;
  cotizacionId?: string | null;
  prospectoId?: string | null;
  expedienteId?: string | null;
  perfilId?: string | null;
  fecha?: string | null; // "YYYY-MM-DD" o ISO
  horaInicio?: string | null; // "HH:mm"
  notas?: string | null;
  tecnicoNombre?: string | null;
  soloProgramar?: boolean;
}

/**
 * Vincula una inspección técnica (agendada, confirmada o completada) con las cotizaciones
 * correspondientes del cliente.
 * 
 * Si la inspección está completada/realizada:
 * - Garantiza que exista el registro en `visitas_reportes` (evitando que quede vacío).
 * - Sincroniza fecha, técnico y observaciones.
 * - Desbloquea la cotización si estaba en estatus `esperando_visita` pasándola a `calculando_costo`.
 * - Elimina las advertencias de "falta inspección técnica" tanto en el portal del cliente, PDF y CRM.
 */
export async function sincronizarInspeccionConCotizaciones(
  sb: SupabaseClient,
  datos: SincronizarInspeccionInput
): Promise<{ ok: boolean; actualizadas: number; error?: string }> {
  try {
    let cita: any = null;

    // 1. Si viene citaId, consultar los datos de la cita
    if (datos.citaId) {
      const { data: c } = await sb
        .from("agenda_citas")
        .select("id, perfil_id, prospecto_id, expediente_id, cliente_nombre, fecha, hora_inicio, notas, estado, perfiles:perfil_id(nombre)")
        .eq("id", datos.citaId)
        .maybeSingle();
      if (c) cita = c;
    }

    const resolvedProspectoId = datos.prospectoId || cita?.prospecto_id || null;
    const resolvedExpedienteId = datos.expedienteId || cita?.expediente_id || null;
    const resolvedPerfilId = datos.perfilId || cita?.perfil_id || null;
    const resolvedFechaStr = datos.fecha || cita?.fecha || null;
    const resolvedHoraStr = datos.horaInicio || cita?.hora_inicio || "10:00:00";
    const resolvedNotas = (datos.notas !== undefined ? datos.notas : cita?.notas) || "";
    const esCompletada = !datos.soloProgramar && (cita ? cita.estado === "completada" : true);

    // Obtener nombre del técnico si no viene
    let inspectorNombre = datos.tecnicoNombre || (cita as any)?.perfiles?.nombre || "";
    if (!inspectorNombre && resolvedPerfilId) {
      const { data: perf } = await sb
        .from("perfiles")
        .select("nombre")
        .eq("id", resolvedPerfilId)
        .maybeSingle();
      if (perf?.nombre) inspectorNombre = perf.nombre;
    }

    // Construir fecha ISO segura
    let fechaISO = new Date().toISOString();
    if (resolvedFechaStr) {
      if (resolvedFechaStr.includes("T")) {
        fechaISO = new Date(resolvedFechaStr).toISOString();
      } else {
        const timePart = String(resolvedHoraStr).slice(0, 5) || "10:00";
        fechaISO = new Date(`${resolvedFechaStr}T${timePart}:00`).toISOString();
      }
    }

    // 2. Buscar cotizaciones involucradas
    let cots: any[] = [];
    if (datos.cotizacionId) {
      const { data: cotDirecta } = await sb
        .from("cotizaciones")
        .select("id, prospecto_id, expediente_id, estatus, requiere_visita, fecha_visita, inspector_id, token")
        .eq("id", datos.cotizacionId)
        .maybeSingle();
      if (cotDirecta) cots = [cotDirecta];
    } else {
      let q = sb
        .from("cotizaciones")
        .select("id, prospecto_id, expediente_id, estatus, requiere_visita, fecha_visita, inspector_id, token");

      if (resolvedExpedienteId && resolvedProspectoId) {
        q = q.or(`expediente_id.eq.${resolvedExpedienteId},prospecto_id.eq.${resolvedProspectoId}`);
      } else if (resolvedExpedienteId) {
        q = q.eq("expediente_id", resolvedExpedienteId);
      } else if (resolvedProspectoId) {
        q = q.eq("prospecto_id", resolvedProspectoId);
      } else {
        // Sin identificador de cotización ni prospecto
        return { ok: true, actualizadas: 0 };
      }

      const { data: cotsEncontradas } = await q;
      cots = cotsEncontradas || [];
    }

    if (cots.length === 0) {
      return { ok: true, actualizadas: 0 };
    }

    let actualizadas = 0;

    for (const cot of cots) {
      // Si solo estamos programando la cita tentativa/definitiva
      if (datos.soloProgramar) {
        const payloadUpd: any = {
          fecha_visita: fechaISO,
          requiere_visita: true,
          updated_at: new Date().toISOString(),
        };
        if (resolvedPerfilId) payloadUpd.inspector_id = resolvedPerfilId;

        await sb.from("cotizaciones").update(payloadUpd).eq("id", cot.id);
        actualizadas++;
        continue;
      }

      // Si la inspección está confirmada o completada, asegurar su reporte técnico
      if (esCompletada) {
        const { data: repExistente } = await sb
          .from("visitas_reportes")
          .select("id, inspector_id, fecha_inspeccion, observaciones_tecnicas, condiciones_sitio, medidas, fotos")
          .eq("cotizacion_id", cot.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const medidasActuales = (repExistente?.medidas as any) || {};

        if (!repExistente) {
          // Crear el reporte base con la confirmación de la inspección
          await sb.from("visitas_reportes").insert({
            cotizacion_id: cot.id,
            inspector_id: resolvedPerfilId || cot.inspector_id,
            fecha_inspeccion: fechaISO,
            observaciones_tecnicas: resolvedNotas || "Inspección técnica confirmada y realizada en sitio.",
            condiciones_sitio: "Inspección física realizada según agenda.",
            medidas: {
              largo: 0,
              ancho: 0,
              areaCalculada: 0,
              inspeccionRealizada: true,
              citaId: cita?.id || datos.citaId || null,
              fechaVisita: resolvedFechaStr ? String(resolvedFechaStr).slice(0, 10) : fechaISO.slice(0, 10),
              horaVisita: String(resolvedHoraStr).slice(0, 5) || "10:00",
              tecnicoNombre: inspectorNombre || "",
            },
            fotos: [],
            created_at: new Date().toISOString(),
          });
        } else {
          // Actualizar metadatos del reporte existente para asegurar que refleje la visita realizada
          await sb
            .from("visitas_reportes")
            .update({
              inspector_id: repExistente.inspector_id || resolvedPerfilId || cot.inspector_id,
              fecha_inspeccion: repExistente.fecha_inspeccion || fechaISO,
              observaciones_tecnicas: repExistente.observaciones_tecnicas || resolvedNotas || "Inspección técnica física confirmada y realizada.",
              medidas: {
                ...medidasActuales,
                inspeccionRealizada: true,
                citaId: medidasActuales.citaId || cita?.id || datos.citaId || null,
                fechaVisita: medidasActuales.fechaVisita || (resolvedFechaStr ? String(resolvedFechaStr).slice(0, 10) : fechaISO.slice(0, 10)),
                horaVisita: medidasActuales.horaVisita || String(resolvedHoraStr).slice(0, 5) || "10:00",
                tecnicoNombre: medidasActuales.tecnicoNombre || inspectorNombre || "",
              },
            })
            .eq("id", repExistente.id);
        }

        // Actualizar cotización
        const cotUpd: any = {
          fecha_visita: fechaISO,
          updated_at: new Date().toISOString(),
        };
        if (resolvedPerfilId) cotUpd.inspector_id = resolvedPerfilId;
        if (cot.estatus === "esperando_visita") {
          cotUpd.estatus = "calculando_costo";
        }

        await sb.from("cotizaciones").update(cotUpd).eq("id", cot.id);
        actualizadas++;
      }
    }

    return { ok: true, actualizadas };
  } catch (err: any) {
    console.error("[sincronizarInspeccionConCotizaciones] Error:", err);
    return { ok: false, actualizadas: 0, error: err.message || "Error al sincronizar inspección." };
  }
}

/**
 * Verifica si para una cotización específica ya existe una inspección técnica completada
 * en agenda_citas (o en coordinaciones), y en caso afirmativo asegura que exista
 * el registro en `visitas_reportes` para evitar que aparezca desvinculada o con warning.
 */
export async function asegurarReporteVisitaParaCotizacion(
  sb: SupabaseClient,
  cot: {
    id: string;
    prospectoId?: string | null;
    expedienteId?: string | null;
    fechaVisita?: string | null;
    inspectorId?: string | null;
    inspectorNombre?: string | null;
    estatus?: string | null;
  }
): Promise<any | null> {
  try {
    // 1. Revisar si ya existe fila de reporte
    const { data: repExistente } = await sb
      .from("visitas_reportes")
      .select("id, cotizacion_id, fecha_inspeccion, observaciones_tecnicas, condiciones_sitio, medidas, fotos, created_at, perfiles:inspector_id(nombre)")
      .eq("cotizacion_id", cot.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (repExistente) {
      return repExistente;
    }

    // 2. Si no existe reporte, buscar si hay una cita de inspección completada o confirmada
    let q = sb
      .from("agenda_citas")
      .select("id, perfil_id, fecha, hora_inicio, notas, estado, perfiles:perfil_id(nombre)")
      .eq("tipo_cita", "inspeccion");

    if (cot.expedienteId && cot.prospectoId) {
      q = q.or(`expediente_id.eq.${cot.expedienteId},prospecto_id.eq.${cot.prospectoId}`);
    } else if (cot.expedienteId) {
      q = q.eq("expediente_id", cot.expedienteId);
    } else if (cot.prospectoId) {
      q = q.eq("prospecto_id", cot.prospectoId);
    } else {
      return null;
    }

    const { data: citas } = await q.order("fecha", { ascending: false }).limit(5);

    // Buscar si alguna cita está completada, o si la cotización ya avanzó (ej. enviada/aprobada)
    const citaCompletada = (citas || []).find((c) => c.estado === "completada" || c.estado === "realizada");
    const citaActiva = citaCompletada || (citas || []).find((c) => c.estado === "confirmada");

    // Si hay cita completada, O si la cotización ya está en etapa avanzada (ej. enviada, aprobada, calculando_costo)
    // y tiene fecha/inspector definidos, se vincula el reporte
    const esAvanzada = cot.estatus && cot.estatus !== "esperando_visita";

    if (citaCompletada || (citaActiva && esAvanzada) || (esAvanzada && cot.fechaVisita && cot.inspectorId)) {
      const perfilIdFinal = citaActiva?.perfil_id || cot.inspectorId || null;
      const nombreInspectorFinal = (citaActiva as any)?.perfiles?.nombre || cot.inspectorNombre || "Personal Técnico Sauceda";
      const fechaVisitaFinal = citaActiva?.fecha
        ? `${citaActiva.fecha}T${citaActiva.hora_inicio || "10:00:00"}`
        : cot.fechaVisita || new Date().toISOString();

      const { data: nuevoRep, error: errInsert } = await sb
        .from("visitas_reportes")
        .insert({
          cotizacion_id: cot.id,
          inspector_id: perfilIdFinal,
          fecha_inspeccion: fechaVisitaFinal,
          observaciones_tecnicas: citaActiva?.notas || "Inspección técnica confirmada y realizada en sitio.",
          condiciones_sitio: "Inspección física realizada según agenda.",
          medidas: {
            largo: 0,
            ancho: 0,
            areaCalculada: 0,
            inspeccionRealizada: true,
            citaId: citaActiva?.id || null,
            fechaVisita: fechaVisitaFinal.slice(0, 10),
            horaVisita: fechaVisitaFinal.slice(11, 16) || "10:00",
            tecnicoNombre: nombreInspectorFinal,
          },
          fotos: [],
          created_at: new Date().toISOString(),
        })
        .select("id, cotizacion_id, fecha_inspeccion, observaciones_tecnicas, condiciones_sitio, medidas, fotos, created_at, perfiles:inspector_id(nombre)")
        .single();

      if (!errInsert && nuevoRep) {
        return nuevoRep;
      }
    }

    return null;
  } catch (err) {
    console.warn("[asegurarReporteVisitaParaCotizacion] Aviso al resolver reporte automático:", err);
    return null;
  }
}
