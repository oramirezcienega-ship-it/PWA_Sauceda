import { supabaseServidor } from "@/lib/supabase/server";
import { enviarWhatsAppPlantilla, enviarWhatsAppTexto } from "@/lib/whatsapp";

export interface OpcionesCronAgenda {
  forzar?: "matutino" | "nocturno" | "alertas_previas" | "todo";
  ahoraOverride?: Date;
}

export interface ResultadoCronAgenda {
  fechaLocal: string;
  horaLocal: string;
  resumenMatutino?: {
    ejecutado: boolean;
    silencioso: boolean;
    totalCitas: number;
    mensajesEnviados: number;
    errores: number;
    detalle?: string;
  };
  resumenNocturno?: {
    ejecutado: boolean;
    silencioso: boolean;
    totalCitasManana: number;
    mensajesEnviados: number;
    errores: number;
    detalle?: string;
  };
  alertasPrevias?: {
    alertas2hEnviadas: number;
    alertas1hEnviadas: number;
    errores: number;
    citasEvaluadas: number;
  };
}

const PLANTILLA_RESUMEN = process.env.WHATSAPP_TEMPLATE_RESUMEN_AGENDA || "resumen_agenda_diaria";
const PLANTILLA_ALERTA = process.env.WHATSAPP_TEMPLATE_ALERTA_CITA || "recordatorio_cita_asesor";
const IDIOMA_DEFAULT = "es_MX";

function horaAMinutos(horaStr: string): number {
  if (!horaStr) return 0;
  const partes = horaStr.split(":");
  const hrs = parseInt(partes[0], 10) || 0;
  const mins = parseInt(partes[1], 10) || 0;
  return hrs * 60 + mins;
}

function obtenerTiempoLocalMexico(fechaBase?: Date): {
  fechaHoy: string;
  fechaManana: string;
  horaActual: number;
  minutoActual: number;
  minutosDesdeMedianoche: number;
  horaString: string;
} {
  const d = fechaBase || new Date();

  // Obtener fecha en formato YYYY-MM-DD para México
  const fechaHoy = d.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

  // Calcular fecha de mañana
  const dManana = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const fechaManana = dManana.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

  // Obtener hora y minutos actuales en México
  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const horaActual = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minutoActual = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const minutosDesdeMedianoche = horaActual * 60 + minutoActual;
  const horaString = `${horaActual.toString().padStart(2, "0")}:${minutoActual.toString().padStart(2, "0")}`;

  return { fechaHoy, fechaManana, horaActual, minutoActual, minutosDesdeMedianoche, horaString };
}

function formatearTipoCita(tipo: string): string {
  switch (tipo) {
    case "inspeccion":
      return "🛠️ Inspección Técnica";
    case "instalacion":
      return "🏗️ Instalación";
    case "venta":
      return "💼 Cita de Venta";
    case "asesoria":
      return "📋 Asesoría Comercial";
    case "llamada":
      return "📞 Llamada Programada";
    default:
      return `📅 ${tipo || "Cita"}`;
  }
}

async function registrarBitacora(sb: any, telefono: string, texto: string, resWa: any, citaId?: string) {
  try {
    const normalizar = (tel: string) => {
      const num = (tel || "").replace(/\D/g, "");
      if (num.length === 10) return "52" + num;
      return num;
    };

    await sb.from("mensajes_whatsapp").insert({
      telefono: normalizar(telefono),
      texto,
      direccion: "out",
      estado: resWa.ok ? "enviado" : "error",
      agente: "agenda_notificaciones",
      wa_message_id: resWa.messageId ?? null,
      error_detalle: resWa.error ?? null,
    });
  } catch (err) {
    console.warn("[Notificaciones Agenda] No se pudo registrar en mensajes_whatsapp:", err);
  }
}

/**
 * Envía un mensaje intentando primero con plantilla de Meta (para saltar la regla de 24h),
 * y si falla por plantilla no existente, utiliza texto libre si es posible.
 */
async function enviarNotificacionConRespaldo(
  sb: any,
  telefono: string,
  plantilla: string,
  parametrosPlantilla: string[],
  textoLibreRespaldo: string,
  citaId?: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Intentar con Plantilla de Meta (Utility)
  const resPl = await enviarWhatsAppPlantilla(
    telefono,
    plantilla,
    IDIOMA_DEFAULT,
    parametrosPlantilla
  );

  if (resPl.ok) {
    await registrarBitacora(sb, telefono, textoLibreRespaldo, resPl, citaId);
    return { ok: true };
  }

  console.warn(`[Notificaciones Agenda] Envío con plantilla '${plantilla}' falló: ${resPl.error}. Intentando texto libre...`);

  // 2. Respaldo: intentar enviar como texto enriquecido normal
  const resTxt = await enviarWhatsAppTexto(telefono, textoLibreRespaldo);
  await registrarBitacora(sb, telefono, textoLibreRespaldo, resTxt, citaId);

  return resTxt;
}

/**
 * Función principal para procesar todas las notificaciones de la agenda:
 * - Resumen matutino (8:00 AM) de hoy
 * - Resumen nocturno (8:00 PM) de mañana
 * - Alertas previas 2 horas y 1 hora antes del evento
 */
export async function procesarAlertasYResumenesAgenda(
  opciones: OpcionesCronAgenda = {}
): Promise<ResultadoCronAgenda> {
  const sb = supabaseServidor();
  const tiempo = obtenerTiempoLocalMexico(opciones.ahoraOverride);

  const resultado: ResultadoCronAgenda = {
    fechaLocal: tiempo.fechaHoy,
    horaLocal: tiempo.horaString,
  };

  // 1. Obtener todos los perfiles de asesores y administradores activos
  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, nombre, email, telefono, rol, activo, notificar_whatsapp_resumen_matutino, notificar_whatsapp_resumen_nocturno, notificar_whatsapp_alertas_previas")
    .eq("activo", true);

  const perfilesMap = new Map((perfiles || []).map((p) => [p.id, p]));
  const administradores = (perfiles || []).filter((p) => p.rol === "admin" && p.telefono?.trim());

  // =========================================================================
  // A. RESUMEN MATUTINO (8:00 AM) — Citas del día de hoy
  // =========================================================================
  const esVentanaMatutina =
    opciones.forzar === "matutino" ||
    opciones.forzar === "todo" ||
    (tiempo.horaActual === 8 && tiempo.minutoActual >= 0 && tiempo.minutoActual <= 29);

  if (esVentanaMatutina) {
    // Buscar todas las citas del día de hoy no canceladas
    const { data: citasHoy = [], error: errHoy } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("fecha", tiempo.fechaHoy)
      .neq("estado", "cancelada")
      .order("hora_inicio", { ascending: true });

    if (errHoy) {
      console.error("[Notificaciones Agenda] Error al consultar citas de hoy:", errHoy);
    }

    const totalCitasHoy = citasHoy?.length || 0;

    // REGLA DE ORO: Si no hay citas programadas para hoy, silencio absoluto
    if (totalCitasHoy === 0) {
      resultado.resumenMatutino = {
        ejecutado: true,
        silencioso: true,
        totalCitas: 0,
        mensajesEnviados: 0,
        errores: 0,
        detalle: "Silencio total: No hay citas ni inspecciones programadas para hoy.",
      };
    } else {
      let enviados = 0;
      let errores = 0;

      // Agrupar citas por asesor
      const citasPorAsesor = new Map<string, typeof citasHoy>();
      for (const c of citasHoy || []) {
        if (!citasPorAsesor.has(c.perfil_id)) {
          citasPorAsesor.set(c.perfil_id, []);
        }
        citasPorAsesor.get(c.perfil_id)!.push(c);
      }

      // Enviar a cada asesor sus citas de hoy
      for (const [perfilId, listaCitas] of Array.from(citasPorAsesor.entries())) {
        const asesor = perfilesMap.get(perfilId);
        if (!asesor || !asesor.telefono?.trim()) continue;
        if (asesor.notificar_whatsapp_resumen_matutino === false) continue;

        const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
        const cuerpoDetalle = (listaCitas || [])
          .map((c: any, i: number) => {
            const tipo = formatearTipoCita(c.tipo_cita);
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const ubicacion = [c.fraccionamiento, c.direccion].filter(Boolean).join(", ") || "Ubicación por confirmar";
            return `${i + 1}️⃣ *${hora} hrs* — ${tipo}\n   • Cliente: ${c.cliente_nombre} (${c.cliente_telefono})\n   • Lugar: ${ubicacion}`;
          })
          .join("\n\n");

        const encabezado = "este es tu resumen de citas e inspecciones para hoy";
        const textoCompleto = `📅 *Agenda SAUCEDA*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoDetalle}\n\nPor favor verifica cualquier cambio o detalle en el sistema CRM.`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          asesor.telefono,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoDetalle],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      // Enviar a administradores el consolidado global
      for (const admin of administradores) {
        if (admin.notificar_whatsapp_resumen_matutino === false) continue;

        const primerNombre = admin.nombre?.split(" ")[0] || "Administrador";
        const cuerpoConsolidado = (citasHoy || [])
          .map((c) => {
            const asesor = perfilesMap.get(c.perfil_id);
            const asesorNombre = asesor?.nombre?.split(" ")[0] || "Sin asignar";
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const tipo = formatearTipoCita(c.tipo_cita);
            return `• *${hora}* | ${tipo} | ${c.cliente_nombre} ➡️ Atiende: *${asesorNombre}*`;
          })
          .join("\n");

        const encabezado = `resumen general de las ${totalCitasHoy} citas del equipo para hoy`;
        const textoCompleto = `📅 *Agenda SAUCEDA (Admin)*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoConsolidado}\n\nCRM: https://crm.saucedamx.com/agenda`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          admin.telefono,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoConsolidado],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      resultado.resumenMatutino = {
        ejecutado: true,
        silencioso: false,
        totalCitas: totalCitasHoy,
        mensajesEnviados: enviados,
        errores,
      };
    }
  }

  // =========================================================================
  // B. RESUMEN NOCTURNO (8:00 PM) — Instalaciones e inspecciones del día siguiente
  // =========================================================================
  const esVentanaNocturna =
    opciones.forzar === "nocturno" ||
    opciones.forzar === "todo" ||
    (tiempo.horaActual === 20 && tiempo.minutoActual >= 0 && tiempo.minutoActual <= 29);

  if (esVentanaNocturna) {
    // Buscar citas para mañana (principalmente instalaciones e inspecciones)
    const { data: citasManana = [], error: errManana } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("fecha", tiempo.fechaManana)
      .neq("estado", "cancelada")
      .order("hora_inicio", { ascending: true });

    if (errManana) {
      console.error("[Notificaciones Agenda] Error al consultar citas de mañana:", errManana);
    }

    const totalCitasManana = citasManana?.length || 0;

    // REGLA DE ORO: Si no hay citas programadas para mañana, silencio absoluto
    if (totalCitasManana === 0) {
      resultado.resumenNocturno = {
        ejecutado: true,
        silencioso: true,
        totalCitasManana: 0,
        mensajesEnviados: 0,
        errores: 0,
        detalle: "Silencio total: No hay instalaciones ni inspecciones para mañana.",
      };
    } else {
      let enviados = 0;
      let errores = 0;

      // Agrupar por asesor
      const citasPorAsesorManana = new Map<string, typeof citasManana>();
      for (const c of citasManana || []) {
        if (!citasPorAsesorManana.has(c.perfil_id)) {
          citasPorAsesorManana.set(c.perfil_id, []);
        }
        citasPorAsesorManana.get(c.perfil_id)!.push(c);
      }

      // Enviar a cada asesor su resumen de mañana
      for (const [perfilId, listaCitas] of Array.from(citasPorAsesorManana.entries())) {
        const asesor = perfilesMap.get(perfilId);
        if (!asesor || !asesor.telefono?.trim()) continue;
        if (asesor.notificar_whatsapp_resumen_nocturno === false) continue;

        const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
        const cuerpoDetalle = (listaCitas || [])
          .map((c: any, i: number) => {
            const tipo = formatearTipoCita(c.tipo_cita);
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const ubicacion = [c.fraccionamiento, c.direccion].filter(Boolean).join(", ") || "Ubicación por confirmar";
            return `${i + 1}️⃣ *${hora} hrs* — ${tipo}\n   • Cliente: ${c.cliente_nombre} (${c.cliente_telefono})\n   • Lugar: ${ubicacion}`;
          })
          .join("\n\n");

        const encabezado = "este es tu resumen de actividades programadas para mañana";
        const textoCompleto = `🌙 *Agenda SAUCEDA (Víspera)*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoDetalle}\n\nPrepara con tiempo tu ruta y herramientas para la jornada de mañana.`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          asesor.telefono,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoDetalle],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      // Enviar al administrador el resumen general de mañana
      for (const admin of administradores) {
        if (admin.notificar_whatsapp_resumen_nocturno === false) continue;

        const primerNombre = admin.nombre?.split(" ")[0] || "Administrador";
        const cuerpoConsolidado = (citasManana || [])
          .map((c) => {
            const asesor = perfilesMap.get(c.perfil_id);
            const asesorNombre = asesor?.nombre?.split(" ")[0] || "Sin asignar";
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const tipo = formatearTipoCita(c.tipo_cita);
            return `• *${hora}* | ${tipo} | ${c.cliente_nombre} ➡️ Atiende: *${asesorNombre}*`;
          })
          .join("\n");

        const encabezado = `resumen general de las ${totalCitasManana} actividades para mañana`;
        const textoCompleto = `🌙 *Agenda SAUCEDA (Víspera Admin)*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoConsolidado}\n\nCRM: https://crm.saucedamx.com/agenda`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          admin.telefono,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoConsolidado],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      resultado.resumenNocturno = {
        ejecutado: true,
        silencioso: false,
        totalCitasManana,
        mensajesEnviados: enviados,
        errores,
      };
    }
  }

  // =========================================================================
  // C. ALERTAS PREVIAS (2 HORAS Y 1 HORA ANTES)
  // =========================================================================
  // Se evalúa en cada ejecución periódica del cron (ej. cada 15-30 minutos)
  const ejecutarAlertas =
    opciones.forzar === "alertas_previas" ||
    opciones.forzar === "todo" ||
    !opciones.forzar; // Por defecto siempre se evalúan las alertas de proximidad

  if (ejecutarAlertas) {
    const { data: citasHoyAlertas = [] } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("fecha", tiempo.fechaHoy)
      .neq("estado", "cancelada");

    let alertas2h = 0;
    let alertas1h = 0;
    let erroresAlertas = 0;

    for (const cita of citasHoyAlertas || []) {
      const horaCitaMin = horaAMinutos(cita.hora_inicio);
      const minutosFaltantes = horaCitaMin - tiempo.minutosDesdeMedianoche;

      const asesor = perfilesMap.get(cita.perfil_id);
      if (!asesor || !asesor.telefono?.trim()) continue;
      if (asesor.notificar_whatsapp_alertas_previas === false) continue;

      const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
      const tipoServicio = formatearTipoCita(cita.tipo_cita);
      const horaStr = cita.hora_inicio?.slice(0, 5) || "00:00";
      const ubicacion = [cita.fraccionamiento, cita.direccion].filter(Boolean).join(", ") || "Dirección en expediente";
      const notas = cita.notas?.trim() || "Sin notas adicionales";

      // 1. Alerta de 2 Horas antes (ventana de 90 a 140 minutos)
      const debeEnviar2h =
        minutosFaltantes >= 90 &&
        minutosFaltantes <= 140 &&
        !cita.alerta_2h_enviada_at;

      if (debeEnviar2h) {
        const textoAlerta = `⏰ *Alerta de Cita Próxima*\n\nHola ${primerNombre}, tienes un evento programado en *2 horas*:\n\n• Tipo: ${tipoServicio}\n• Cliente: ${cita.cliente_nombre} (${cita.cliente_telefono})\n• Hora: ${horaStr} hrs\n• Ubicación: ${ubicacion}\n• Notas: ${notas}\n\nRecuerda comunicarte con el cliente con anticipación para confirmar tu traslado.`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          asesor.telefono,
          PLANTILLA_ALERTA,
          [
            primerNombre,
            "2 horas",
            tipoServicio,
            cita.cliente_nombre,
            cita.cliente_telefono,
            horaStr,
            ubicacion,
            notas,
          ],
          textoAlerta,
          cita.id
        );

        if (res.ok) {
          alertas2h++;
          // Marcar alerta_2h_enviada_at para evitar duplicados
          try {
            await sb
              .from("agenda_citas")
              .update({ alerta_2h_enviada_at: new Date().toISOString() })
              .eq("id", cita.id);
          } catch (e) {
            console.warn("[Notificaciones Agenda] Error al actualizar alerta_2h_enviada_at:", e);
          }
        } else {
          erroresAlertas++;
        }
      }

      // 2. Alerta de 1 Hora antes (ventana de 35 a 80 minutos)
      const debeEnviar1h =
        minutosFaltantes >= 35 &&
        minutosFaltantes <= 80 &&
        !cita.alerta_1h_enviada_at;

      if (debeEnviar1h) {
        const textoAlerta = `⏰ *Alerta de Cita Próxima*\n\nHola ${primerNombre}, tienes un evento programado en *1 hora*:\n\n• Tipo: ${tipoServicio}\n• Cliente: ${cita.cliente_nombre} (${cita.cliente_telefono})\n• Hora: ${horaStr} hrs\n• Ubicación: ${ubicacion}\n• Notas: ${notas}\n\nRecuerda comunicarte con el cliente con anticipación para confirmar tu traslado.`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          asesor.telefono,
          PLANTILLA_ALERTA,
          [
            primerNombre,
            "1 hora",
            tipoServicio,
            cita.cliente_nombre,
            cita.cliente_telefono,
            horaStr,
            ubicacion,
            notas,
          ],
          textoAlerta,
          cita.id
        );

        if (res.ok) {
          alertas1h++;
          // Marcar alerta_1h_enviada_at para evitar duplicados
          try {
            await sb
              .from("agenda_citas")
              .update({ alerta_1h_enviada_at: new Date().toISOString() })
              .eq("id", cita.id);
          } catch (e) {
            console.warn("[Notificaciones Agenda] Error al actualizar alerta_1h_enviada_at:", e);
          }
        } else {
          erroresAlertas++;
        }
      }
    }

    resultado.alertasPrevias = {
      alertas2hEnviadas: alertas2h,
      alertas1hEnviadas: alertas1h,
      errores: erroresAlertas,
      citasEvaluadas: citasHoyAlertas?.length || 0,
    };
  }

  return resultado;
}
