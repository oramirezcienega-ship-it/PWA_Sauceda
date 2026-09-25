import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";

/**
 * MOTOR UNIVERSAL DE COORDINACIÓN DE INSPECCIONES TÉCNICAS Y CONTROL DE SLA
 *
 * Principios:
 * 1. Agnóstico al modelo: Aplica a Cisternas, Impermeabilización, Pintura,
 *    Remodelación, etc. Cualquier servicio que requiera inspección presencial.
 * 2. Disponibilidad cruzada: Calcula la intersección de horarios libres de múltiples
 *    asesores (los dos que deben asistir juntos).
 * 3. SLA estricto (15 min por defecto): Monitoreo de tiempo en caliente para no perder leads.
 * 4. Despacho modular: Inicia con Meta WhatsApp y queda 100% listo para Telegram Bot.
 */

export interface SlotHorarioDisponible {
  fecha: string;        // "YYYY-MM-DD"
  fechaLegible: string; // "Viernes 26 de Septiembre"
  horaInicio: string;   // "11:00:00"
  horaFin: string;      // "12:00:00"
  horaLabel: string;    // "11:00 AM a 12:00 PM"
  asesoresIds: string[];
  asesoresNombres: string[];
}

export interface SolicitudInspeccionInput {
  prospectoId: string;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string | null;
  ubicacion: string;
  fraccionamiento?: string | null;
  servicioTipo: string;    // ej. "mantenimiento_cisternas", "impermeabilizacion", etc.
  servicioNombre?: string; // ej. "Mantenimiento de Cisternas y Aljibes"
  fecha: string;           // "YYYY-MM-DD"
  horaInicio: string;      // "11:00:00"
  horaFin?: string;        // "12:00:00"
  notas?: string;
  asesoresIds: string[];   // Los 2 asesores que deben asistir juntos obligatoriamente
  slaMinutos?: number;     // Tiempo máximo de respuesta (default: 15)
  canalNotificacion?: "whatsapp" | "telegram";
  autoConfirmarAlVencerSla?: boolean; // Default true (para no perder al cliente)
}

export interface EstadoInspeccionSLA {
  citaId: string;
  prospectoId: string | null;
  expedienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  servicioNombre: string;
  servicioTipo: string;
  ubicacion: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estadoCita: "pendiente" | "confirmada" | "cancelada" | "reprogramacion_requerida";
  slaEstado: "en_tiempo" | "en_riesgo" | "vencido" | "cumplido" | "auto_confirmado";
  slaLimiteAt: string;
  minutosRestantes: number;
  segundosRestantes: number;
  estaVencido: boolean;
  estaEnRiesgo: boolean;
  asignados: {
    id: string;
    nombre: string;
    telefono?: string;
    confirmado: boolean;
    respondidoAt?: string | null;
    motivo?: string | null;
  }[];
}

function horaAMinutos(h: string): number {
  if (!h) return 0;
  const partes = h.split(":");
  const hrs = parseInt(partes[0], 10) || 0;
  const mins = parseInt(partes[1], 10) || 0;
  return hrs * 60 + mins;
}

function minutosAHora(m: number): string {
  const hrs = Math.floor(m / 60);
  const mins = m % 60;
  const hrsStr = hrs.toString().padStart(2, "0");
  const minsStr = mins.toString().padStart(2, "0");
  return `${hrsStr}:${minsStr}:00`;
}

function formatearFechaLegible(fechaISO: string): string {
  try {
    const [y, m, d] = fechaISO.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return `${dias[date.getDay()]} ${d} de ${meses[date.getMonth()]}`;
  } catch {
    return fechaISO;
  }
}

function formatearHoraAmPm(horaStr: string): string {
  if (!horaStr) return "";
  const [hrs, mins] = horaStr.split(":").map(Number);
  const ampm = hrs >= 12 ? "PM" : "AM";
  const h12 = hrs % 12 || 12;
  return `${h12}:${mins.toString().padStart(2, "0")} ${ampm}`;
}

const DIAS_CLAVE = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/**
 * 1. CALCULA LA INTERSECCIÓN DE HORARIOS LIBRES ENTRE MÚLTIPLES ASESORES
 * Solo devuelve slots donde TODOS los asesores solicitados coinciden libres.
 */
export async function calcularSlotsDisponiblesConjuntos(
  sb: SupabaseClient,
  asesoresIds: string[],
  diasAdelante: number = 3,
  duracionMinutos: number = 60
): Promise<SlotHorarioDisponible[]> {
  if (!asesoresIds || asesoresIds.length === 0) return [];

  // 1. Obtener perfiles de los asesores con sus calendarios
  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, nombre, horarios_agenda, activo")
    .in("id", asesoresIds)
    .eq("activo", true);

  if (!perfiles || perfiles.length < asesoresIds.length) {
    console.warn("[Coordinación] No todos los asesores requeridos están activos en perfiles.");
  }

  const nombresMap = new Map((perfiles || []).map((p) => [p.id, p.nombre]));
  const asesoresNombres = asesoresIds.map((id) => nombresMap.get(id) || "Asesor");

  // Rango de fechas a evaluar (excluyendo domingos)
  const ahora = new Date();
  const fechaHoyStr = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

  const fechasAEvaluar: string[] = [];
  let d = new Date();
  while (fechasAEvaluar.length < diasAdelante) {
    d.setDate(d.getDate() + 1);
    const fStr = d.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const diaSemana = d.getDay();
    // Excluir domingos (0)
    if (diaSemana !== 0) {
      fechasAEvaluar.push(fStr);
    }
  }

  if (fechasAEvaluar.length === 0) return [];

  const fechaInicio = fechasAEvaluar[0];
  const fechaFin = fechasAEvaluar[fechasAEvaluar.length - 1];

  // 2. Obtener bloqueos de todos los asesores
  const { data: bloqueos = [] } = await sb
    .from("agenda_bloqueos")
    .select("perfil_id, fecha, hora_inicio, hora_fin")
    .in("perfil_id", asesoresIds)
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin);

  // 3. Obtener citas activas de todos los asesores
  const { data: citas = [] } = await sb
    .from("agenda_citas")
    .select("id, perfil_id, asignados_ids, fecha, hora_inicio, hora_fin, estado")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .neq("estado", "cancelada");

  const slotsDisponibles: SlotHorarioDisponible[] = [];

  for (const fechaStr of fechasAEvaluar) {
    const [y, m, dayNum] = fechaStr.split("-").map(Number);
    const fechaObj = new Date(y, m - 1, dayNum);
    const diaSemanaStr = DIAS_CLAVE[fechaObj.getDay()];

    // Obtener rangos de trabajo de cada asesor para este día
    const rangosPorAsesor: { inicio: number; fin: number }[][] = [];

    for (const asesor of perfiles || []) {
      const agendaSemanal = asesor.horarios_agenda || {};
      const franjasDia = agendaSemanal[diaSemanaStr] || [];
      const rangos = franjasDia.map((f: any) => ({
        inicio: horaAMinutos(f.inicio),
        fin: horaAMinutos(f.fin),
      }));
      rangosPorAsesor.push(rangos);
    }

    if (rangosPorAsesor.length === 0) continue;

    // Calcular intersección de horas laborales comunes (ej. de 09:00 a 18:00)
    let rangosComunes = rangosPorAsesor[0];
    for (let i = 1; i < rangosPorAsesor.length; i++) {
      const nuevoComun: { inicio: number; fin: number }[] = [];
      for (const r1 of rangosComunes) {
        for (const r2 of rangosPorAsesor[i]) {
          const maxInicio = Math.max(r1.inicio, r2.inicio);
          const minFin = Math.min(r1.fin, r2.fin);
          if (minFin - maxInicio >= duracionMinutos) {
            nuevoComun.push({ inicio: maxInicio, fin: minFin });
          }
        }
      }
      rangosComunes = nuevoComun;
    }

    if (rangosComunes.length === 0) continue;

    // Obtener intervalos ocupados para cualquiera de los asesores en esta fecha
    const ocupados: { inicio: number; fin: number }[] = [];

    // Bloqueos
    for (const b of bloqueos || []) {
      if (b.fecha === fechaStr && asesoresIds.includes(b.perfil_id)) {
        ocupados.push({ inicio: horaAMinutos(b.hora_inicio), fin: horaAMinutos(b.hora_fin) });
      }
    }

    // Citas existentes
    for (const c of citas || []) {
      if (c.fecha === fechaStr) {
        const afecta =
          asesoresIds.includes(c.perfil_id) ||
          (c.asignados_ids && c.asignados_ids.some((id: string) => asesoresIds.includes(id)));
        if (afecta) {
          ocupados.push({ inicio: horaAMinutos(c.hora_inicio), fin: horaAMinutos(c.hora_fin) });
        }
      }
    }

    // Generar slots de cada bloque común
    for (const comun of rangosComunes) {
      let t = comun.inicio;
      while (t + duracionMinutos <= comun.fin) {
        const slotFin = t + duracionMinutos;

        // Verificar si choca con algún intervalo ocupado
        const choca = ocupados.some((oc) => Math.max(t, oc.inicio) < Math.min(slotFin, oc.fin));

        if (!choca) {
          const hInicio = minutosAHora(t);
          const hFin = minutosAHora(slotFin);
          slotsDisponibles.push({
            fecha: fechaStr,
            fechaLegible: formatearFechaLegible(fechaStr),
            horaInicio: hInicio,
            horaFin: hFin,
            horaLabel: `${formatearHoraAmPm(hInicio)} a ${formatearHoraAmPm(hFin)}`,
            asesoresIds,
            asesoresNombres,
          });
        }

        // Avanzar en intervalos de 60 minutos
        t += duracionMinutos;
      }
    }
  }

  return slotsDisponibles;
}

/**
 * 2. SOLICITA Y COORDINA UNA NUEVA INSPECCIÓN TÉCNICA (UNIVERSAL & CON SLA)
 * Dispara el cronómetro de 15 minutos y las alertas simultáneas al equipo.
 */
export async function solicitarCoordinacionInspeccion(
  sb: SupabaseClient,
  datos: SolicitudInspeccionInput
): Promise<{ ok: boolean; citaId?: string; error?: string; slaLimiteAt?: string }> {
  try {
    const slaMinutos = datos.slaMinutos || 15;
    const slaLimiteAt = new Date(Date.now() + slaMinutos * 60 * 1000).toISOString();

    const horaFin = datos.horaFin || minutosAHora(horaAMinutos(datos.horaInicio) + 60);
    const primerAsesorId = datos.asesoresIds[0] || null;

    // Inicializar matriz de confirmaciones para cada asesor
    const confirmacionesIniciales: Record<string, { confirmado: boolean; respondido_at: string | null; motivo?: string }> = {};
    for (const aId of datos.asesoresIds) {
      confirmacionesIniciales[aId] = {
        confirmado: false,
        respondido_at: null,
      };
    }

    const servicioNombre = datos.servicioNombre || "Inspección Técnica en Sitio";

    // 1. Insertar la cita en agenda_citas con estatus pendiente
    const payloadCita: any = {
      perfil_id: primerAsesorId,
      asignados_ids: datos.asesoresIds,
      prospecto_id: datos.prospectoId || null,
      expediente_id: datos.expedienteId || null,
      cliente_nombre: datos.clienteNombre,
      cliente_telefono: normalizarTelefono(datos.clienteTelefono),
      cliente_email: datos.clienteEmail || null,
      tipo_cita: "inspeccion",
      fecha: datos.fecha,
      hora_inicio: datos.horaInicio,
      hora_fin: horaFin,
      notas: datos.notas || `Inspección técnica de ${servicioNombre}`,
      estado: "pendiente",
      fraccionamiento: datos.fraccionamiento || datos.ubicacion,
      sla_limite_at: slaLimiteAt,
      sla_estado: "en_tiempo",
      confirmaciones_equipo: confirmacionesIniciales,
      servicio_tipo: datos.servicioTipo,
      canal_notificacion: datos.canalNotificacion || "whatsapp",
    };

    const { data: nuevaCita, error: errCita } = await sb
      .from("agenda_citas")
      .insert(payloadCita)
      .select("id")
      .single();

    if (errCita || !nuevaCita) {
      console.error("[Coordinación] Error al insertar cita:", errCita);
      return { ok: false, error: errCita?.message || "No se pudo registrar la cita de inspección." };
    }

    const citaId = nuevaCita.id;

    // 2. Registrar actividad en la bitácora
    await registrarActividad(sb, {
      prospectoId: datos.prospectoId,
      expedienteId: datos.expedienteId,
      tipo: "inspeccion_solicitada",
      titulo: `⏱️ Inspección técnica por coordinar (${servicioNombre})`,
      detalle: `Se inició solicitud con SLA de ${slaMinutos} min para el ${formatearFechaLegible(datos.fecha)} a las ${formatearHoraAmPm(datos.horaInicio)}. Asesores requeridos: ${datos.asesoresIds.length}.`,
    });

    // 3. Disparar alertas simultáneas a los asesores
    await despacharAlertasEquipoInspeccion(sb, {
      citaId,
      datos,
      slaMinutos,
      slaLimiteAt,
    });

    return {
      ok: true,
      citaId,
      slaLimiteAt,
    };
  } catch (err: any) {
    console.error("[Coordinación] Error inesperado en solicitarCoordinacionInspeccion:", err);
    return { ok: false, error: err.message || "Error al coordinar inspección." };
  }
}

/**
 * 3. DESPACHO DE ALERTAS AL EQUIPO DE ASESORES (WHATSAPP O TELEGRAM)
 */
export async function despacharAlertasEquipoInspeccion(
  sb: SupabaseClient,
  ctx: {
    citaId: string;
    datos: SolicitudInspeccionInput;
    slaMinutos: number;
    slaLimiteAt: string;
  }
): Promise<void> {
  const { citaId, datos, slaMinutos } = ctx;

  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, nombre, telefono, telefono_whatsapp")
    .in("id", datos.asesoresIds);

  const nombresAsesores = (perfiles || []).map((p) => p.nombre).join(" y ");
  const servicio = datos.servicioNombre || "Inspección Técnica en Sitio";
  const fechaLegible = formatearFechaLegible(datos.fecha);
  const horaLegible = formatearHoraAmPm(datos.horaInicio);

  for (const asesor of perfiles || []) {
    const telDestino = normalizarTelefono(asesor.telefono_whatsapp || asesor.telefono || "");
    if (!telDestino) continue;

    const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";

    if (datos.canalNotificacion === "telegram") {
      // Soporte listo para Telegram Bot cuando se active
      console.log(`[Coordinación] (Telegram) Despachando alerta a ${asesor.nombre}`);
      // await enviarTelegramAlerta(...)
    } else {
      // Canal por defecto: WhatsApp oficial
      const msgTexto = `🚨 *NUEVA INSPECCIÓN POR COORDINAR*\n\nHola ${primerNombre}, se solicita tu confirmación para asistir junto con ${nombresAsesores}:\n\n🛠️ *Servicio:* ${servicio}\n👤 *Cliente:* ${datos.clienteNombre} (${datos.clienteTelefono})\n📍 *Ubicación:* ${datos.ubicacion}\n🗓️ *Fecha:* ${fechaLegible}\n⏰ *Hora:* ${horaLegible} hrs\n⏱️ *SLA:* Tienen *${slaMinutos} minutos* para confirmar antes de escalar.\n\n👉 Para confirmar o reportar inconveniente, responde con:\n1️⃣ *ACEPTO*\n2️⃣ *NO PUEDO*`;

      try {
        const resEnvio = await enviarWhatsAppTexto(telDestino, msgTexto);
        // Si la ventana de 24h del asesor estuviera cerrada, usar plantilla aprobada recordatorio_cita_asesor
        if (!resEnvio.ok) {
          await enviarWhatsAppPlantilla(
            telDestino,
            "recordatorio_cita_asesor",
            "es_MX",
            [
              primerNombre,
              `${slaMinutos} min`,
              servicio,
              datos.clienteNombre,
              datos.clienteTelefono,
              horaLegible,
              datos.ubicacion,
              `Requiere asistencia en pareja con ${nombresAsesores}. Responde 1 para confirmar.`,
            ]
          );
        }
      } catch (errWsp) {
        console.warn(`[Coordinación] Error al notificar WhatsApp al asesor ${asesor.nombre}:`, errWsp);
      }
    }
  }
}

/**
 * 4. RESPUESTA DE CONFIRMACIÓN DE UN ASESOR (1-TAP O WHATSAPP)
 */
export async function responderConfirmacionAsesor(
  sb: SupabaseClient,
  citaId: string,
  asesorId: string,
  aceptada: boolean,
  motivo?: string
): Promise<{ ok: boolean; estadoFinal: string; faltanConfirmar?: string[] }> {
  const { data: cita, error: errCita } = await sb
    .from("agenda_citas")
    .select("*")
    .eq("id", citaId)
    .single();

  if (errCita || !cita) {
    return { ok: false, estadoFinal: "no_encontrada" };
  }

  const confirmaciones = (cita.confirmaciones_equipo as Record<string, any>) || {};
  confirmaciones[asesorId] = {
    confirmado: aceptada,
    respondido_at: new Date().toISOString(),
    motivo: motivo || null,
  };

  const asignados: string[] = cita.asignados_ids || [cita.perfil_id];

  // Si algún asesor RECHAZA la inspección
  if (!aceptada) {
    await sb
      .from("agenda_citas")
      .update({
        confirmaciones_equipo: confirmaciones,
        estado: "reprogramacion_requerida",
        sla_estado: "rechazado",
      })
      .eq("id", citaId);

    await registrarActividad(sb, {
      prospectoId: cita.prospecto_id,
      expedienteId: cita.expediente_id,
      tipo: "inspeccion_rechazada_asesor",
      titulo: `⚠️ Asesor reportó inconveniente en inspección`,
      detalle: `El asesor ${asesorId} no puede asistir para la fecha ${cita.fecha} ${cita.hora_inicio}. Motivo: ${motivo || "Sin especificar"}. Se requiere reprogramar.`,
    });

    return { ok: true, estadoFinal: "reprogramacion_requerida" };
  }

  // Verificar si TODOS los asignados ya confirmaron
  const faltantes = asignados.filter((id) => !confirmaciones[id]?.confirmado);

  if (faltantes.length === 0) {
    // ¡TODOS CONFIRMARON DENTRO DE SLA! -> Cita confirmada
    await sb
      .from("agenda_citas")
      .update({
        confirmaciones_equipo: confirmaciones,
        estado: "confirmada",
        sla_estado: "cumplido",
      })
      .eq("id", citaId);

    await registrarActividad(sb, {
      prospectoId: cita.prospecto_id,
      expedienteId: cita.expediente_id,
      tipo: "inspeccion_confirmada_equipo",
      titulo: `✅ Inspección confirmada por ambos asesores (SLA Cumplido)`,
      detalle: `Todos los asesores asignados confirmaron su asistencia para el ${formatearFechaLegible(cita.fecha)} a las ${formatearHoraAmPm(cita.hora_inicio)}.`,
    });

    // Notificar al cliente que su cita está 100% amarrada
    const { data: perfs = [] } = await sb.from("perfiles").select("nombre").in("id", asignados);
    const nombresEquipo = (perfs || []).map((p) => p.nombre).join(" y ");

    const msgCliente = `¡Hola ${cita.cliente_nombre}! 🗓️ Te confirmamos que tu inspección técnica para el servicio de *${cita.servicio_tipo || "Construcción"}* ha quedado formalmente programada:\n\n🗓️ *Fecha:* ${formatearFechaLegible(cita.fecha)}\n⏰ *Horario:* ${formatearHoraAmPm(cita.hora_inicio)} hrs\n👷 *Especialistas que te visitarán:* ${nombresEquipo}\n📍 *Ubicación:* ${cita.fraccionamiento || "Tu domicilio"}\n\nTe mandaremos un recordatorio previo el día de tu cita. ¡Muchas gracias por tu confianza! 💚`;

    await enviarWhatsAppTexto(cita.cliente_telefono, msgCliente).catch((err) =>
      console.warn("[Coordinación] No se pudo notificar al cliente WhatsApp:", err)
    );

    return { ok: true, estadoFinal: "confirmada" };
  }

  // Aún falta alguno por confirmar
  await sb
    .from("agenda_citas")
    .update({ confirmaciones_equipo: confirmaciones })
    .eq("id", citaId);

  return { ok: true, estadoFinal: "pendiente", faltanConfirmar: faltantes };
}

/**
 * 5. MONITOR DE CRON / VERIFICADOR DE SLA EN TIEMPO REAL
 * Se ejecuta periódicamente o al cargar el tablero de agenda.
 * - Si faltan <= 5 min: Alerta de riesgo (amarillo/naranja).
 * - Si expiraron los 15 min: Auto-confirma preventivamente o escala a Oscar.
 */
export async function verificarYActualizarSLAInspecciones(
  sb: SupabaseClient
): Promise<{ evaluadas: number; enRiesgo: number; vencidas: number; autoConfirmadas: number }> {
  const ahora = new Date();
  const ahoraISO = ahora.toISOString();

  // Buscar citas de inspección pendientes con SLA activo
  const { data: citasPendientes = [] } = await sb
    .from("agenda_citas")
    .select("*")
    .eq("tipo_cita", "inspeccion")
    .eq("estado", "pendiente")
    .not("sla_limite_at", "is", null);

  let enRiesgoCount = 0;
  let vencidasCount = 0;
  let autoConfirmadasCount = 0;

  for (const cita of citasPendientes || []) {
    const limite = new Date(cita.sla_limite_at).getTime();
    const difMs = limite - ahora.getTime();
    const minutosRestantes = Math.round(difMs / 60000);

    const asignados: string[] = cita.asignados_ids || [cita.perfil_id];
    const confirmaciones = (cita.confirmaciones_equipo as Record<string, any>) || {};

    if (difMs <= 0) {
      // VENCIDO (Superó los 15 minutos)
      vencidasCount++;

      // ESTRATEGIA: Auto-confirmación preventiva para no perder al cliente
      await sb
        .from("agenda_citas")
        .update({
          estado: "confirmada",
          sla_estado: "auto_confirmado",
        })
        .eq("id", cita.id);

      autoConfirmadasCount++;

      await registrarActividad(sb, {
        prospectoId: cita.prospecto_id,
        expedienteId: cita.expediente_id,
        tipo: "sla_auto_confirmacion",
        titulo: `⚡ Cita auto-confirmada por vencimiento de SLA`,
        detalle: `Se amarró la cita con el cliente para proteger el lead tras cumplirse el límite de 15 min. Asignados: ${asignados.length} asesores.`,
      });

      // Alerta prioritaria a Oscar (Gerencia)
      const msgGerencia = `🚨 *ALERTA SLA VENCIDO · AUTO-CONFIRMADA*\n\nLa inspección para *${cita.cliente_nombre}* (${cita.cliente_telefono}) superó los 15 minutos de espera. Se auto-confirmó para no perder el lead.\n\n🗓️ Fecha: ${cita.fecha} ${cita.hora_inicio}\n📍 Ubicación: ${cita.fraccionamiento}\n👥 Asesores asignados: ${asignados.join(", ")}`;
      await enviarWhatsAppTexto("4778110444", msgGerencia).catch(() => {});
    } else if (minutosRestantes <= 5 && cita.sla_estado !== "en_riesgo") {
      // EN RIESGO (Quedan 5 minutos o menos)
      enRiesgoCount++;
      await sb
        .from("agenda_citas")
        .update({ sla_estado: "en_riesgo" })
        .eq("id", cita.id);

      // Recordatorio de urgencia a los asesores que faltan de confirmar
      const faltantes = asignados.filter((id) => !confirmaciones[id]?.confirmado);
      const { data: perfs = [] } = await sb.from("perfiles").select("telefono, telefono_whatsapp, nombre").in("id", faltantes);

      for (const p of perfs || []) {
        const tel = normalizarTelefono(p.telefono_whatsapp || p.telefono || "");
        if (tel) {
          const msgUrgente = `⚠️ *URGENTE SLA (5 MIN RESTANTES)*\nHola ${p.nombre}, la inspección de *${cita.cliente_nombre}* está por vencer su SLA. Por favor confirma tu asistencia respondiendo *1 (ACEPTO)*.`;
          await enviarWhatsAppTexto(tel, msgUrgente).catch(() => {});
        }
      }
    }
  }

  return {
    evaluadas: (citasPendientes || []).length,
    enRiesgo: enRiesgoCount,
    vencidas: vencidasCount,
    autoConfirmadas: autoConfirmadasCount,
  };
}

/**
 * 6. OBTENER ESTADO COMPLETO DE CITAS CON SLA PARA EL TABLERO CRM
 */
export async function obtenerCitasInspeccionSLA(
  sb: SupabaseClient
): Promise<EstadoInspeccionSLA[]> {
  const ahora = new Date().getTime();

  const { data: citas = [] } = await sb
    .from("agenda_citas")
    .select(`
      *,
      prospectos:prospecto_id(id, nombre, primer_apellido, telefono, direccion)
    `)
    .eq("tipo_cita", "inspeccion")
    .order("fecha", { ascending: false })
    .limit(40);

  const todosAsignadosIds = Array.from(
    new Set((citas || []).flatMap((c: any) => c.asignados_ids || [c.perfil_id]).filter(Boolean))
  );

  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, nombre, telefono")
    .in("id", todosAsignadosIds);

  const perfilesMap = new Map((perfiles || []).map((p: any) => [p.id, p]));

  return (citas || []).map((c: any) => {
    const limiteMs = c.sla_limite_at ? new Date(c.sla_limite_at).getTime() : ahora;
    const difMs = Math.max(0, limiteMs - ahora);
    const segundosTotal = Math.floor(difMs / 1000);
    const minutosRestantes = Math.floor(segundosTotal / 60);
    const segundosRestantes = segundosTotal % 60;
    const estaVencido = c.estado === "pendiente" && limiteMs < ahora;
    const estaEnRiesgo = c.estado === "pendiente" && minutosRestantes <= 5 && !estaVencido;

    const asignadosIds: string[] = c.asignados_ids || (c.perfil_id ? [c.perfil_id] : []);
    const confirmaciones = (c.confirmaciones_equipo as Record<string, any>) || {};

    const asignados = asignadosIds.map((id) => {
      const p = perfilesMap.get(id);
      const conf = confirmaciones[id] || {};
      return {
        id,
        nombre: p?.nombre || "Asesor",
        telefono: p?.telefono,
        confirmado: Boolean(conf.confirmado),
        respondidoAt: conf.respondido_at || null,
        motivo: conf.motivo || null,
      };
    });

    return {
      citaId: c.id,
      prospectoId: c.prospecto_id,
      expedienteId: c.expediente_id,
      clienteNombre: c.cliente_nombre,
      clienteTelefono: c.cliente_telefono,
      servicioNombre: c.notas || c.servicio_tipo || "Inspección Técnica",
      servicioTipo: c.servicio_tipo || "inspeccion",
      ubicacion: c.fraccionamiento || "Sin ubicación",
      fecha: c.fecha,
      horaInicio: c.hora_inicio,
      horaFin: c.hora_fin,
      estadoCita: c.estado,
      slaEstado: c.sla_estado || "en_tiempo",
      slaLimiteAt: c.sla_limite_at || "",
      minutosRestantes,
      segundosRestantes,
      estaVencido,
      estaEnRiesgo,
      asignados,
    };
  });
}
