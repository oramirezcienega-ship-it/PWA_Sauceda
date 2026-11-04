import { supabaseServidor } from "@/lib/supabase/server";
import { enviarWhatsAppPlantilla, enviarWhatsAppTexto } from "@/lib/whatsapp";
import { normalizarTelefono } from "@/lib/telefono";
import {
  resolverDatosProveedorCita,
  formatearHorarioLegible,
  inferirServicioNombre,
} from "./recordatorios-dia-servicio";
import { enviarWhatsAppProveedor } from "./whatsapp-proveedores";

export interface OpcionesCronAgenda {
  forzar?: "matutino" | "nocturno" | "alertas_previas" | "recordatorios_dia" | "todo";
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
    alertas2hProveedoresEnviadas?: number;
    alertas2hAdminEnviadas?: number;
    errores: number;
    citasEvaluadas: number;
  };
  recordatoriosDia?: {
    ejecutado: boolean;
    totalCitas: number;
    clientesEnviados: number;
    clientesOmitidos: number;
    clientesErrores: number;
    proveedoresEnviados: number;
    proveedoresOmitidos: number;
    proveedoresErrores: number;
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
 * Envía la copia espejo a Oscar (4778110444) intentando primero por Meta y con
 * fallback garantizado a Evolution API (sin restricción de ventana de 24h).
 */
async function enviarAlertaOscarConRespaldo(
  sb: any,
  textoAlerta: string,
  servicioNombre: string,
  clienteNombre: string,
  clienteTelefono: string,
  horaStr: string,
  ubicacion: string,
  notas: string,
  citaId?: string
): Promise<{ ok: boolean; via?: string; error?: string }> {
  const telAdmin = "524778110444";

  // 1. Intentar con Meta (plantilla de utilidad o texto directo)
  const resMeta = await enviarNotificacionConRespaldo(
    sb,
    telAdmin,
    PLANTILLA_ALERTA,
    [
      "Oscar",
      "2 horas",
      servicioNombre,
      clienteNombre,
      clienteTelefono,
      horaStr,
      ubicacion,
      notas,
    ],
    textoAlerta,
    citaId
  );

  if (resMeta.ok) {
    return { ok: true, via: "meta" };
  }

  // 2. Fallback a Evolution API (línea móvil secundaria de rescate sin restricción de 24h)
  try {
    const { enviarMensajeTextoEvolution } = await import("@/lib/evolution-api");
    const resEvo = await enviarMensajeTextoEvolution(telAdmin, textoAlerta);
    if (resEvo.ok) {
      await registrarBitacora(sb, telAdmin, textoAlerta, { ok: true, messageId: resEvo.messageId }, citaId);
      return { ok: true, via: "evolution" };
    }
  } catch (errEvo) {
    console.warn("[Notificaciones Agenda] Error en fallback Evolution para Oscar:", errEvo);
  }

  return { ok: false, error: resMeta.error || "error_envio_oscar" };
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
    .select("id, nombre, email, telefono, telefono_whatsapp, rol, activo, notificar_whatsapp_resumen_matutino, notificar_whatsapp_resumen_nocturno, notificar_whatsapp_alertas_previas")
    .eq("activo", true);

  const perfilesMap = new Map((perfiles || []).map((p) => [p.id, p]));
  const administradores = (perfiles || []).filter((p: any) => p.rol === "admin" && (p.telefono_whatsapp?.trim() || p.telefono?.trim()));

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

      // Agrupar citas por asesor (considerando asignación múltiple)
      const citasPorAsesor = new Map<string, typeof citasHoy>();
      for (const c of citasHoy || []) {
        const asignados: string[] = (c.asignados_ids && c.asignados_ids.length > 0)
          ? c.asignados_ids
          : (c.perfil_id ? [c.perfil_id] : []);

        for (const pId of asignados) {
          if (!citasPorAsesor.has(pId)) {
            citasPorAsesor.set(pId, []);
          }
          citasPorAsesor.get(pId)!.push(c);
        }
      }

      // Enviar a cada asesor sus citas de hoy
      for (const [perfilId, listaCitas] of Array.from(citasPorAsesor.entries())) {
        const asesor = perfilesMap.get(perfilId) as any;
        const telWa = asesor?.telefono_whatsapp?.trim() || asesor?.telefono?.trim();
        if (!asesor || !telWa) continue;
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
          telWa,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoDetalle],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      // Enviar a administradores el consolidado global
      for (const admin of administradores as any[]) {
        if (admin.notificar_whatsapp_resumen_matutino === false) continue;
        const telAdminWa = admin.telefono_whatsapp?.trim() || admin.telefono?.trim();
        if (!telAdminWa) continue;

        const primerNombre = admin.nombre?.split(" ")[0] || "Administrador";
        const cuerpoConsolidado = (citasHoy || [])
          .map((c: any) => {
            const asignados: string[] = (c.asignados_ids && c.asignados_ids.length > 0)
              ? c.asignados_ids
              : (c.perfil_id ? [c.perfil_id] : []);
            const nombres = asignados
              .map((pId) => perfilesMap.get(pId)?.nombre?.split(" ")[0])
              .filter(Boolean);
            const equipoTexto = nombres.length > 0 ? nombres.join(", ") : "Sin asignar";
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const tipo = formatearTipoCita(c.tipo_cita);
            return `• *${hora}* | ${tipo} | ${c.cliente_nombre} ➡️ Atienden: *${equipoTexto}*`;
          })
          .join("\n");

        const encabezado = `resumen general de las ${totalCitasHoy} citas del equipo para hoy`;
        const textoCompleto = `📅 *Agenda SAUCEDA (Admin)*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoConsolidado}\n\nCRM: https://crm.saucedamx.com/agenda`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          telAdminWa,
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

      // Agrupar por asesor (considerando asignación múltiple)
      const citasPorAsesorManana = new Map<string, typeof citasManana>();
      for (const c of citasManana || []) {
        const asignados: string[] = (c.asignados_ids && c.asignados_ids.length > 0)
          ? c.asignados_ids
          : (c.perfil_id ? [c.perfil_id] : []);

        for (const pId of asignados) {
          if (!citasPorAsesorManana.has(pId)) {
            citasPorAsesorManana.set(pId, []);
          }
          citasPorAsesorManana.get(pId)!.push(c);
        }
      }

      // Enviar a cada asesor su resumen de mañana
      for (const [perfilId, listaCitas] of Array.from(citasPorAsesorManana.entries())) {
        const asesor = perfilesMap.get(perfilId) as any;
        const telWa = asesor?.telefono_whatsapp?.trim() || asesor?.telefono?.trim();
        if (!asesor || !telWa) continue;
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
          telWa,
          PLANTILLA_RESUMEN,
          [primerNombre, encabezado, cuerpoDetalle],
          textoCompleto
        );

        if (res.ok) enviados++;
        else errores++;
      }

      // Enviar al administrador el resumen general de mañana
      for (const admin of administradores as any[]) {
        if (admin.notificar_whatsapp_resumen_nocturno === false) continue;
        const telAdminWa = admin.telefono_whatsapp?.trim() || admin.telefono?.trim();
        if (!telAdminWa) continue;

        const primerNombre = admin.nombre?.split(" ")[0] || "Administrador";
        const cuerpoConsolidado = (citasManana || [])
          .map((c: any) => {
            const asignados: string[] = (c.asignados_ids && c.asignados_ids.length > 0)
              ? c.asignados_ids
              : (c.perfil_id ? [c.perfil_id] : []);
            const nombres = asignados
              .map((pId) => perfilesMap.get(pId)?.nombre?.split(" ")[0])
              .filter(Boolean);
            const equipoTexto = nombres.length > 0 ? nombres.join(", ") : "Sin asignar";
            const hora = c.hora_inicio?.slice(0, 5) || "Pendiente";
            const tipo = formatearTipoCita(c.tipo_cita);
            return `• *${hora}* | ${tipo} | ${c.cliente_nombre} ➡️ Atienden: *${equipoTexto}*`;
          })
          .join("\n");

        const encabezado = `resumen general de las ${totalCitasManana} actividades para mañana`;
        const textoCompleto = `🌙 *Agenda SAUCEDA (Víspera Admin)*\n\nHola ${primerNombre}, ${encabezado}:\n\n${cuerpoConsolidado}\n\nCRM: https://crm.saucedamx.com/agenda`;

        const res = await enviarNotificacionConRespaldo(
          sb,
          telAdminWa,
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
    let alertas2hProveedores = 0;
    let alertas2hAdmin = 0;
    let erroresAlertas = 0;

    for (const cita of citasHoyAlertas || []) {
      const horaCitaMin = horaAMinutos(cita.hora_inicio);
      const minutosFaltantes = horaCitaMin - tiempo.minutosDesdeMedianoche;

      const asignadosIds: string[] = (cita.asignados_ids && cita.asignados_ids.length > 0)
        ? cita.asignados_ids
        : (cita.perfil_id ? [cita.perfil_id] : []);

      const asesoresAsignados = asignadosIds
        .map((pId) => perfilesMap.get(pId) as any)
        .filter((a): a is NonNullable<typeof a> => Boolean(a && (a.telefono_whatsapp?.trim() || a.telefono?.trim()) && a.notificar_whatsapp_alertas_previas !== false));

      const tipoServicio = formatearTipoCita(cita.tipo_cita);
      const horaStr = cita.hora_inicio?.slice(0, 5) || "00:00";
      const ubicacion = [cita.fraccionamiento, cita.direccion].filter(Boolean).join(", ") || "Dirección en expediente";
      const notas = cita.notas?.trim() || "Sin notas adicionales";
      const conf = (cita.confirmaciones_equipo && typeof cita.confirmaciones_equipo === "object")
        ? cita.confirmaciones_equipo
        : {};

      // -----------------------------------------------------------------------
      // 1. ALERTA DE 2 HORAS ANTES (Ventana de 70 a 145 minutos)
      // -----------------------------------------------------------------------
      const enVentana2h = minutosFaltantes >= 70 && minutosFaltantes <= 145;

      if (enVentana2h) {
        // A) Enviar alerta a asesores asignados (si los hay y no se ha enviado)
        const debeEnviar2hAsesores = !cita.alerta_2h_enviada_at && asesoresAsignados.length > 0;
        if (debeEnviar2hAsesores) {
          let exitoAlguno = false;
          for (const asesor of asesoresAsignados) {
            const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
            const telAsesor = asesor.telefono_whatsapp?.trim() || asesor.telefono?.trim();
            const textoAlerta = `⏰ *Alerta de Cita Próxima*\n\nHola ${primerNombre}, tienes un evento programado en *2 horas*:\n\n• Tipo: ${tipoServicio}\n• Cliente: ${cita.cliente_nombre} (${cita.cliente_telefono})\n• Hora: ${horaStr} hrs\n• Ubicación: ${ubicacion}\n• Notas: ${notas}\n\nRecuerda comunicarte con el cliente con anticipación para confirmar tu traslado.`;

            const res = await enviarNotificacionConRespaldo(
              sb,
              telAsesor,
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
              exitoAlguno = true;
            } else {
              erroresAlertas++;
            }
          }

          if (exitoAlguno) {
            try {
              await sb
                .from("agenda_citas")
                .update({ alerta_2h_enviada_at: new Date().toISOString() })
                .eq("id", cita.id);
            } catch (e) {
              console.warn("[Notificaciones Agenda] Error al actualizar alerta_2h_enviada_at:", e);
            }
          }
        }

        // B) Enviar alerta al Proveedor asignado (ej. Clemente, etc.) y espejo a Oscar (4778110444)
        const yaEnviadoProv2h = Boolean(
          (cita as any).alerta_2h_proveedor_enviada_at || conf.alerta_2h_proveedor_enviada_at
        );
        const yaEnviadoAdmin2h = Boolean(conf.alerta_2h_admin_enviada_at);

        if (!yaEnviadoProv2h || !yaEnviadoAdmin2h) {
          const { proveedor, ordenTrabajo } = await resolverDatosProveedorCita(sb, cita);

          if (proveedor && proveedor.telefono) {
            const provNombre = proveedor.contactoNombre?.split(/\s+/)[0] || proveedor.contactoNombre || "Proveedor";
            const provNombreCompleto = proveedor.contactoNombre || proveedor.nombre;
            const clienteNombre = cita.cliente_nombre || "Cliente";
            const horarioStr = formatearHorarioLegible(cita.hora_inicio, cita.hora_fin) || `${horaStr} hrs`;
            const folioOT = ordenTrabajo?.folio || cita.expediente_id || "Servicio Programado";
            const servicioNombre = inferirServicioNombre(cita);
            const telClienteLimpio = normalizarTelefono(cita.cliente_telefono || "");
            const queryMaps = encodeURIComponent(ubicacion);
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${queryMaps}`;

            // B.1 Mensaje para el proveedor
            const textoAlertaProveedor = [
              `⏰ *RECORDATORIO: SERVICIO EN 2 HORAS · SAUCEDA*`,
              ``,
              `Hola ${provNombre}, te recordamos que tienes un servicio programado en *2 horas*:`,
              `📄 Folio: *${folioOT}*`,
              `🛠️ Servicio: ${servicioNombre}`,
              `⏰ Horario: *${horarioStr}*`,
              `👤 Cliente: *${clienteNombre}*`,
              telClienteLimpio ? `📱 WhatsApp Cliente: https://wa.me/52${telClienteLimpio.slice(-10)}` : null,
              `📍 Ubicación: ${ubicacion}`,
              `🗺️ Ver en Google Maps: ${mapsUrl}`,
              ordenTrabajo?.costoProveedor ? `💵 Pago acordado mano de obra: $${Number(ordenTrabajo.costoProveedor).toLocaleString("es-MX")}` : null,
              cita.notas ? `📝 Notas: ${cita.notas}` : null,
              ``,
              `Por favor confirma de recibido respondiendo a este mensaje cuando salgas en camino. ¡Éxito en el servicio! 🤝`,
            ].filter(Boolean).join("\n");

            const resumenMetaProv = `recordatorio: tienes servicio en 2 horas (${horarioStr}) con ${clienteNombre} en ${ubicacion} [${folioOT}].`;

            let provEnviadoOk = false;
            if (!yaEnviadoProv2h) {
              try {
                const resProv = await enviarWhatsAppProveedor(sb, {
                  proveedorId: proveedor.id,
                  texto: textoAlertaProveedor,
                  resumen: resumenMetaProv,
                  agente: "alerta_2h_proveedor",
                });
                if (resProv.ok) {
                  provEnviadoOk = true;
                  alertas2hProveedores++;
                } else {
                  erroresAlertas++;
                  console.warn("[Notificaciones Agenda] Falla alerta 2h proveedor:", resProv.error);
                }
              } catch (errProv) {
                console.error("[Notificaciones Agenda] Error enviando alerta 2h a proveedor:", errProv);
                erroresAlertas++;
              }
            }

            // B.2 Mensaje espejo a Oscar (4778110444)
            let adminEnviadoOk = false;
            if (!yaEnviadoAdmin2h) {
              const textoAlertaAdmin = [
                `⏰ *RECORDATORIO DE SERVICIO EN 2 HORAS (COPIA DIRECCIÓN)*`,
                ``,
                `👷‍♂️ Proveedor Asignado: *${provNombreCompleto}* (${proveedor.telefono})`,
                `📄 Folio: *${folioOT}*`,
                `🛠️ Servicio: ${servicioNombre}`,
                `⏰ Horario: *${horarioStr}*`,
                `👤 Cliente: *${clienteNombre}* (${cita.cliente_telefono || "Sin tel"})`,
                telClienteLimpio ? `📱 WhatsApp Cliente: https://wa.me/52${telClienteLimpio.slice(-10)}` : null,
                `📍 Ubicación: ${ubicacion}`,
                `🗺️ Ver en Google Maps: ${mapsUrl}`,
                ordenTrabajo?.costoProveedor ? `💵 Pago acordado mano de obra: $${Number(ordenTrabajo.costoProveedor).toLocaleString("es-MX")}` : null,
                cita.notas ? `📝 Notas: ${cita.notas}` : null,
              ].filter(Boolean).join("\n");

              try {
                const resAdmin = await enviarAlertaOscarConRespaldo(
                  sb,
                  textoAlertaAdmin,
                  servicioNombre,
                  clienteNombre,
                  cita.cliente_telefono || "",
                  horaStr,
                  ubicacion,
                  notas,
                  cita.id
                );

                if (resAdmin.ok) {
                  adminEnviadoOk = true;
                  alertas2hAdmin++;
                } else {
                  erroresAlertas++;
                  console.warn("[Notificaciones Agenda] Falla alerta 2h a Oscar:", resAdmin.error);
                }
              } catch (errAdm) {
                console.error("[Notificaciones Agenda] Error enviando alerta 2h a Oscar:", errAdm);
                erroresAlertas++;
              }
            }

            // Actualizar banderas en confirmaciones_equipo y agenda_citas
            if (provEnviadoOk || adminEnviadoOk) {
              const ahoraIso = new Date().toISOString();
              const nuevoConf = {
                ...conf,
                alerta_2h_proveedor_enviada_at: provEnviadoOk ? ahoraIso : conf.alerta_2h_proveedor_enviada_at,
                alerta_2h_proveedor_id: provEnviadoOk ? proveedor.id : conf.alerta_2h_proveedor_id,
                alerta_2h_admin_enviada_at: adminEnviadoOk ? ahoraIso : conf.alerta_2h_admin_enviada_at,
              };

              const updatePayload: Record<string, any> = {
                confirmaciones_equipo: nuevoConf,
              };

              try {
                await sb
                  .from("agenda_citas")
                  .update({
                    ...updatePayload,
                    alerta_2h_enviada_at: cita.alerta_2h_enviada_at || ahoraIso,
                  })
                  .eq("id", cita.id);
              } catch (eUpd) {
                console.warn("[Notificaciones Agenda] Error actualizando confirmaciones_equipo 2h:", eUpd);
              }
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // 2. ALERTA DE 1 HORA ANTES (Ventana de 35 a 80 minutos) - Para asesores
      // -----------------------------------------------------------------------
      const debeEnviar1h =
        minutosFaltantes >= 35 &&
        minutosFaltantes <= 80 &&
        !cita.alerta_1h_enviada_at &&
        asesoresAsignados.length > 0;

      if (debeEnviar1h) {
        let exitoAlguno = false;
        for (const asesor of asesoresAsignados) {
          const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
          const telAsesor = asesor.telefono_whatsapp?.trim() || asesor.telefono?.trim();
          const textoAlerta = `⏰ *Alerta de Cita Próxima*\n\nHola ${primerNombre}, tienes un evento programado en *1 hora*:\n\n• Tipo: ${tipoServicio}\n• Cliente: ${cita.cliente_nombre} (${cita.cliente_telefono})\n• Hora: ${horaStr} hrs\n• Ubicación: ${ubicacion}\n• Notas: ${notas}\n\nRecuerda comunicarte con el cliente con anticipación para confirmar tu traslado.`;

          const res = await enviarNotificacionConRespaldo(
            sb,
            telAsesor,
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
            exitoAlguno = true;
          } else {
            erroresAlertas++;
          }
        }

        if (exitoAlguno) {
          try {
            await sb
              .from("agenda_citas")
              .update({ alerta_1h_enviada_at: new Date().toISOString() })
              .eq("id", cita.id);
          } catch (e) {
            console.warn("[Notificaciones Agenda] Error al actualizar alerta_1h_enviada_at:", e);
          }
        }
      }
    }

    resultado.alertasPrevias = {
      alertas2hEnviadas: alertas2h,
      alertas1hEnviadas: alertas1h,
      alertas2hProveedoresEnviadas: alertas2hProveedores,
      alertas2hAdminEnviadas: alertas2hAdmin,
      errores: erroresAlertas,
      citasEvaluadas: citasHoyAlertas?.length || 0,
    };
  }

  // =========================================================================
  // D. RECORDATORIOS DEL DÍA A CLIENTES Y PROVEEDORES (PLANTILLAS META UTILITY)
  // =========================================================================
  // Solo se ejecutan a partir de las 8:00 AM y hasta las 8:00 PM (hora de México)
  const esHorarioComercialRecordatorios = tiempo.horaActual >= 8 && tiempo.horaActual < 20;

  const ejecutarRecordatorios =
    opciones.forzar === "recordatorios_dia" ||
    opciones.forzar === "matutino" ||
    opciones.forzar === "todo" ||
    (!opciones.forzar && esHorarioComercialRecordatorios); // En cada corrida diurna evalúa si hay citas de hoy pendientes de recordatorio

  if (ejecutarRecordatorios) {
    try {
      const { procesarRecordatoriosDiaServicio } = await import("./recordatorios-dia-servicio");
      const resRec = await procesarRecordatoriosDiaServicio(sb, tiempo.fechaHoy);
      resultado.recordatoriosDia = {
        ejecutado: true,
        totalCitas: resRec.totalCitas,
        clientesEnviados: resRec.clientesEnviados,
        clientesOmitidos: resRec.clientesOmitidos,
        clientesErrores: resRec.clientesErrores,
        proveedoresEnviados: resRec.proveedoresEnviados,
        proveedoresOmitidos: resRec.proveedoresOmitidos,
        proveedoresErrores: resRec.proveedoresErrores,
      };
    } catch (errRec) {
      console.error("[Notificaciones Agenda] Error al procesar recordatorios del día:", errRec);
    }
  }

  return resultado;
}
