import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import {
  despacharPropuestaInspeccionTelegram,
  notificarConfirmacionFinalTelegram,
  enviarMensajeTelegram,
  obtenerConfiguracionTelegram,
} from "@/lib/telegram";

/**
 * MOTOR UNIVERSAL DE COORDINACIÓN DE INSPECCIONES TÉCNICAS Y CONTROL DE SLA
 *
 * Principios:
 * 1. Agnóstico al modelo: Aplica a Cisternas, Impermeabilización, Pintura,
 *    Remodelación, etc. Cualquier servicio que requiera inspección presencial.
 * 2. Disponibilidad cruzada: Calcula la intersección de horarios libres de múltiples
 *    asesores (los dos que deben asistir juntos).
 * 3. SLA estricto (15 min por defecto, 30 min para Remodelación): Monitoreo de tiempo en caliente para no perder leads.
 * 4. Despacho modular: Inicia con Meta WhatsApp y queda 100% listo para Telegram Bot.
 */

export interface SlotVespertinoRemodelacion {
  id: string;          // "1", "2", "3", "4"
  codigo: string;      // "A", "B", "C", "D"
  fecha: string;       // "YYYY-MM-DD"
  horaInicio: string;  // "17:30:00"
  horaFin: string;     // "18:30:00"
  label: string;       // "Mañana Martes a las 5:30 PM"
  textoCompleto: string; // "Mañana Martes 13 de Octubre a las 5:30 PM"
}

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

/**
 * Calcula 3 a 4 opciones vespertinas (a partir de las 5:00 PM / 17:30 hrs)
 * para los próximos días hábiles (saltando domingos) para Sauceda Construye Remodelación.
 */
export function calcularSlotsVespertinosRemodelacion(fechaReferencia: Date = new Date()): SlotVespertinoRemodelacion[] {
  const tz = "America/Mexico_City";
  const diaSemanaFormatter = new Intl.DateTimeFormat("es-MX", { timeZone: tz, weekday: "long" });
  const fechaCompletaFormatter = new Intl.DateTimeFormat("es-MX", { timeZone: tz, day: "numeric", month: "long" });

  const dias: Date[] = [];
  const d = new Date(fechaReferencia);

  // Buscar los próximos 2 días hábiles (saltando domingos) a partir de mañana
  while (dias.length < 2) {
    d.setDate(d.getDate() + 1);
    const diaNum = new Date(d.toLocaleString("en-US", { timeZone: tz })).getDay();
    if (diaNum !== 0) {
      dias.push(new Date(d));
    }
  }

  const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const slots: SlotVespertinoRemodelacion[] = [];

  const manana = new Date(fechaReferencia);
  manana.setDate(manana.getDate() + 1);
  const esManana = (date: Date) => date.getDate() === manana.getDate();

  // Día 1
  const dia1 = dias[0];
  const dia1Nombre = capitalizar(diaSemanaFormatter.format(dia1));
  const dia1Prefijo = esManana(dia1) ? `Mañana ${dia1Nombre}` : dia1Nombre;
  const dia1FechaISO = dia1.toISOString().slice(0, 10);
  const dia1FechaCompleta = fechaCompletaFormatter.format(dia1);

  slots.push({
    id: "1",
    codigo: "A",
    fecha: dia1FechaISO,
    horaInicio: "17:30:00",
    horaFin: "18:30:00",
    label: `${dia1Prefijo} a las 5:30 PM`,
    textoCompleto: `${dia1Prefijo} ${dia1FechaCompleta} a las 5:30 PM`,
  });

  slots.push({
    id: "2",
    codigo: "B",
    fecha: dia1FechaISO,
    horaInicio: "18:30:00",
    horaFin: "19:30:00",
    label: `${dia1Prefijo} a las 6:30 PM`,
    textoCompleto: `${dia1Prefijo} ${dia1FechaCompleta} a las 6:30 PM`,
  });

  // Día 2
  const dia2 = dias[1];
  const dia2Nombre = capitalizar(diaSemanaFormatter.format(dia2));
  const dia2FechaISO = dia2.toISOString().slice(0, 10);
  const dia2FechaCompleta = fechaCompletaFormatter.format(dia2);

  slots.push({
    id: "3",
    codigo: "C",
    fecha: dia2FechaISO,
    horaInicio: "17:30:00",
    horaFin: "18:30:00",
    label: `${dia2Nombre} a las 5:30 PM`,
    textoCompleto: `${dia2Nombre} ${dia2FechaCompleta} a las 5:30 PM`,
  });

  slots.push({
    id: "4",
    codigo: "D",
    fecha: dia2FechaISO,
    horaInicio: "18:30:00",
    horaFin: "19:30:00",
    label: `${dia2Nombre} a las 6:30 PM`,
    textoCompleto: `${dia2Nombre} ${dia2FechaCompleta} a las 6:30 PM`,
  });

  return slots;
}

export type SlotHorarioVertical = SlotVespertinoRemodelacion;

/**
 * MATRIZ UNIVERSAL DE HORARIOS POR VERTICAL DE NEGOCIO
 * Calcula 4 opciones de horario según la línea de servicio:
 * - Remodelación: Vespertinas prioritarias (17:30 y 18:30 hrs)
 * - Impermeabilización: Matutinas y Vespertinas (10:30 y 16:30 hrs)
 * - Herrería: Matutinas y Vespertinas (11:00 y 17:00 hrs)
 * - Piso Estampado: Matutinas y Vespertinas (10:00 y 16:00 hrs)
 * - Cisternas / Tinacos: Matutinas prioritarias (10:00 y 12:30 hrs)
 * - Bienes Raíces / Traspasos: Horario de oficina (11:00 y 16:30 hrs)
 */
export function calcularSlotsPorVertical(
  tipoNegocio?: string,
  fechaReferencia: Date = new Date()
): SlotHorarioVertical[] {
  const tipo = (tipoNegocio || "").toLowerCase();

  // Si es remodelación, aplicar vespertinas de obra
  if (tipo === "construccion-remodelacion" || !tipo) {
    return calcularSlotsVespertinosRemodelacion(fechaReferencia);
  }

  const tz = "America/Mexico_City";
  const diaSemanaFormatter = new Intl.DateTimeFormat("es-MX", { timeZone: tz, weekday: "long" });
  const fechaCompletaFormatter = new Intl.DateTimeFormat("es-MX", { timeZone: tz, day: "numeric", month: "long" });

  const dias: Date[] = [];
  const d = new Date(fechaReferencia);

  // Buscar los próximos 2 días hábiles (saltando domingos) a partir de mañana
  while (dias.length < 2) {
    d.setDate(d.getDate() + 1);
    const diaNum = new Date(d.toLocaleString("en-US", { timeZone: tz })).getDay();
    if (diaNum !== 0) {
      dias.push(new Date(d));
    }
  }

  const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const slots: SlotHorarioVertical[] = [];

  const manana = new Date(fechaReferencia);
  manana.setDate(manana.getDate() + 1);
  const esManana = (date: Date) => date.getDate() === manana.getDate();

  // Configuración de franjas por vertical
  let h1Inicio = "10:30:00";
  let h1Fin = "11:30:00";
  let h1LabelHora = "10:30 AM";

  let h2Inicio = "16:30:00";
  let h2Fin = "17:30:00";
  let h2LabelHora = "4:30 PM";

  if (tipo === "construccion-mantenimiento-cisternas" || tipo === "construccion-mantenimiento-tinacos" || tipo === "construccion-mantenimiento-calentadores") {
    // Matutinas prioritarias
    h1Inicio = "10:00:00";
    h1Fin = "11:30:00";
    h1LabelHora = "10:00 AM";

    h2Inicio = "12:30:00";
    h2Fin = "14:00:00";
    h2LabelHora = "12:30 PM";
  } else if (tipo === "construccion-herreria") {
    h1Inicio = "11:00:00";
    h1Fin = "12:00:00";
    h1LabelHora = "11:00 AM";

    h2Inicio = "17:00:00";
    h2Fin = "18:00:00";
    h2LabelHora = "5:00 PM";
  } else if (tipo === "construccion-piso-estampado") {
    h1Inicio = "10:00:00";
    h1Fin = "11:00:00";
    h1LabelHora = "10:00 AM";

    h2Inicio = "16:00:00";
    h2Fin = "17:00:00";
    h2LabelHora = "4:00 PM";
  } else if (tipo === "traspaso_compra" || tipo === "solo_tramite" || tipo === "bienes_raices") {
    h1Inicio = "11:00:00";
    h1Fin = "12:00:00";
    h1LabelHora = "11:00 AM";

    h2Inicio = "16:30:00";
    h2Fin = "17:30:00";
    h2LabelHora = "4:30 PM";
  }

  // Día 1
  const dia1 = dias[0];
  const dia1Nombre = capitalizar(diaSemanaFormatter.format(dia1));
  const dia1Prefijo = esManana(dia1) ? `Mañana ${dia1Nombre}` : dia1Nombre;
  const dia1FechaISO = dia1.toISOString().slice(0, 10);
  const dia1FechaCompleta = fechaCompletaFormatter.format(dia1);

  slots.push({
    id: "1",
    codigo: "A",
    fecha: dia1FechaISO,
    horaInicio: h1Inicio,
    horaFin: h1Fin,
    label: `${dia1Prefijo} a las ${h1LabelHora}`,
    textoCompleto: `${dia1Prefijo} ${dia1FechaCompleta} a las ${h1LabelHora}`,
  });

  slots.push({
    id: "2",
    codigo: "B",
    fecha: dia1FechaISO,
    horaInicio: h2Inicio,
    horaFin: h2Fin,
    label: `${dia1Prefijo} a las ${h2LabelHora}`,
    textoCompleto: `${dia1Prefijo} ${dia1FechaCompleta} a las ${h2LabelHora}`,
  });

  // Día 2
  const dia2 = dias[1];
  const dia2Nombre = capitalizar(diaSemanaFormatter.format(dia2));
  const dia2FechaISO = dia2.toISOString().slice(0, 10);
  const dia2FechaCompleta = fechaCompletaFormatter.format(dia2);

  slots.push({
    id: "3",
    codigo: "C",
    fecha: dia2FechaISO,
    horaInicio: h1Inicio,
    horaFin: h1Fin,
    label: `${dia2Nombre} a las ${h1LabelHora}`,
    textoCompleto: `${dia2Nombre} ${dia2FechaCompleta} a las ${h1LabelHora}`,
  });

  slots.push({
    id: "4",
    codigo: "D",
    fecha: dia2FechaISO,
    horaInicio: h2Inicio,
    horaFin: h2Fin,
    label: `${dia2Nombre} a las ${h2LabelHora}`,
    textoCompleto: `${dia2Nombre} ${dia2FechaCompleta} a las ${h2LabelHora}`,
  });

  return slots;
}

/**
 * Resuelve el rol y título oficial del especialista requerido según la vertical
 */
export function obtenerRolEspecialistaPorVertical(tipoNegocio?: string): {
  rol: string;
  tituloEspecialista: string;
} {
  switch ((tipoNegocio || "").toLowerCase()) {
    case "construccion-remodelacion":
      return { rol: "operaciones", tituloEspecialista: "Contratista / Arquitecto de Obra" };
    case "construccion-impermeabilizacion":
      return { rol: "operaciones", tituloEspecialista: "Técnico de Azoteas / Cuadrilla" };
    case "construccion-herreria":
      return { rol: "operaciones", tituloEspecialista: "Maestro Herrero / Estructuras" };
    case "construccion-piso-estampado":
      return { rol: "operaciones", tituloEspecialista: "Técnico de Pavimentos" };
    case "construccion-mantenimiento-cisternas":
    case "construccion-mantenimiento-tinacos":
      return { rol: "operaciones", tituloEspecialista: "Técnico de Fontanería / Lavado" };
    case "construccion-mantenimiento-calentadores":
      return { rol: "operaciones", tituloEspecialista: "Técnico en Calentadores Solares" };
    case "traspaso_compra":
    case "solo_tramite":
    case "bienes_raices":
      return { rol: "asesor", tituloEspecialista: "Asesor Inmobiliario / Notarial" };
    default:
      return { rol: "operaciones", tituloEspecialista: "Especialista Técnico en Obra" };
  }
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

  // 1. Monitoreo de citas en agenda_citas
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
      // VENCIDO (Superó el tiempo de espera)
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
        detalle: `Se amarró la cita con el cliente para proteger el lead tras cumplirse el límite de SLA. Asignados: ${asignados.length} asesores.`,
      });

      // Alerta prioritaria a Oscar (Gerencia)
      const msgGerencia = `🚨 *ALERTA SLA VENCIDO · AUTO-CONFIRMADA*\n\nLa inspección para *${cita.cliente_nombre}* (${cita.cliente_telefono}) superó el límite de espera. Se auto-confirmó para no perder el lead.\n\n🗓️ Fecha: ${cita.fecha} ${cita.hora_inicio}\n📍 Ubicación: ${cita.fraccionamiento}\n👥 Asesores asignados: ${asignados.join(", ")}`;
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

  // 2. Monitoreo de propuestas en coordinaciones_inspeccion (Remodelación SLA 30 min y General 15 min)
  const { data: coordsPendientes = [] } = await sb
    .from("coordinaciones_inspeccion")
    .select("*")
    .in("estado", ["propuesta_enviada", "evaluando"])
    .not("sla_limite_at", "is", null);

  for (const coord of coordsPendientes || []) {
    const limiteMs = new Date(coord.sla_limite_at).getTime();
    const difMs = limiteMs - ahora.getTime();

    if (difMs <= 0) {
      vencidasCount++;
      const respuestas = (coord.respuestas_asesores as Record<string, any>) || {};

      // Si no se ha alertado a Oscar aún sobre este vencimiento
      if (!respuestas._alerta_sla_oscar_at) {
        respuestas._alerta_sla_oscar_at = ahoraISO;
        await sb
          .from("coordinaciones_inspeccion")
          .update({
            estado: "sla_vencido",
            sla_estado: "vencido",
            respuestas_asesores: respuestas,
            updated_at: ahoraISO,
          })
          .eq("id", coord.id);

        const opciones = (coord.opciones_horarios as any[]) || [];
        const opcAText = opciones[0]?.label || "Opción 1";
        const opcBText = opciones[1]?.label || "Opción 2";

        const msgOscar = `⚠️ *SLA VENCIDO (30 MIN): COORDINACIÓN SIN RESPUESTA*\n\n` +
          `*Servicio:* ${coord.servicio_nombre || "Coordinación Técnica"}\n` +
          `*Cliente:* ${coord.cliente_nombre} (\`${coord.cliente_telefono}\`)\n` +
          `*Zona:* ${coord.ubicacion || coord.fraccionamiento || "León"}\n` +
          `*Opciones:*\n` +
          `🅰️ ${opcAText}\n` +
          `🅱️ ${opcBText}\n\n` +
          `👉 *Por favor confirma con el técnico asignado o directamente en el CRM.*`;

        // Alerta WhatsApp a Oscar
        await enviarWhatsAppTexto("4778110444", msgOscar).catch(() => {});

        // Alerta Telegram
        try {
          const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
          if (botToken && chatIdGrupo) {
            await enviarMensajeTelegram({
              botToken,
              chatId: chatIdGrupo,
              texto: msgOscar,
            });
          }
        } catch (errTg) {
          console.warn("[SLA] Error al enviar alerta de Telegram a Oscar:", errTg);
        }

        await registrarActividad(sb, {
          prospectoId: coord.prospecto_id,
          expedienteId: coord.expediente_id,
          tipo: "sla_vencido",
          titulo: `⚠️ SLA Vencido en Coordinación de ${coord.servicio_nombre}`,
          detalle: `El técnico no confirmó en ${coord.sla_minutos || 30} min. Alerta enviada a Oscar (Gerencia).`,
        });
      }
    }
  }

  return {
    evaluadas: (citasPendientes || []).length + (coordsPendientes || []).length,
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

/**
 * ============================================================================
 * CABINA DE COORDINACIÓN MULTI-OPCIÓN (VALIDACIÓN ASESORES -> CLIENTE -> CIERRE)
 * ============================================================================
 */

export interface OpcionHorarioPropuesta {
  id: string; // "A", "B", "C"
  fecha: string; // "YYYY-MM-DD"
  horaInicio: string; // "11:00"
  horaFin: string; // "12:00"
  label: string; // "Viernes 26 Sep · 11:00 AM"
}

export interface IniciarPropuestaInput {
  prospectoId: string;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  servicioTipo: string;
  servicioNombre: string;
  ubicacion: string;
  fraccionamiento?: string | null;
  detallesTecnicos?: string;
  asesoresIds: string[];
  opcionesHorarios: OpcionHorarioPropuesta[];
  slaMinutos?: number;
  canalNotificacion?: "whatsapp" | "telegram";
}

/** Resultado del envío de la propuesta a un asesor por un canal. */
export interface EntregaCanalPropuesta {
  ok: boolean;
  enviadoAt: string;
  /** Id del mensaje en el canal (Telegram message_id / WhatsApp wamid). */
  messageId?: string | number;
  error?: string;
}

export interface EntregaPropuestaAsesor {
  whatsapp?: EntregaCanalPropuesta;
  telegram?: EntregaCanalPropuesta;
}

export interface CoordinacionInspeccionDetalle {
  id: string;
  prospectoId: string;
  expedienteId: string | null;
  citaId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  servicioTipo: string;
  servicioNombre: string;
  ubicacion: string;
  fraccionamiento: string | null;
  detallesTecnicos: string | null;
  asesoresIds: string[];
  opcionesHorarios: OpcionHorarioPropuesta[];
  respuestasAsesores: Record<
    string,
    {
      nombre: string;
      telefono?: string;
      votos: Record<string, boolean>;
      respondidoAt: string | null;
      notas?: string;
      /** Envío de la propuesta por canal (para saber si le llegó). */
      entrega?: EntregaPropuestaAsesor;
      /** Cuándo confirmó que leyó la propuesta (botón "Enterado", voto o marca manual). */
      enteradoAt?: string | null;
      enteradoVia?: "telegram" | "voto" | "manual" | null;
    }
  >;
  opcionesValidadas: string[];
  opcionSeleccionadaId: string | null;
  /** Negociación por etapas (día → franja → hora) cuando las opciones no acomodan. */
  negociacion: {
    etapa?: "opciones" | "dias" | "franjas" | "horas" | "sin_coincidencia";
    ronda?: number;
    diasOfrecidos?: string[];
    dias?: Record<string, { fechas: string[]; listo: boolean }>;
    paresOfrecidos?: string[];
    franjas?: Record<string, { claves: string[]; listo: boolean }>;
    motivo?: string;
  };
  estado: "propuesta_enviada" | "evaluando" | "enviado_cliente" | "confirmada" | "cancelada";
  slaMinutos: number;
  slaLimiteAt: string;
  slaEstado: string;
  createdAt: string;
  minutosRestantes: number;
  segundosRestantes: number;
  estaVencido: boolean;
}

/**
 * 1. Inicia una nueva propuesta de coordinación con opciones tentativas y alerta a los asesores
 */
export async function iniciarPropuestaCoordinacion(
  sb: SupabaseClient,
  input: IniciarPropuestaInput
): Promise<{ ok: boolean; coordinacionId?: string; error?: string; sinEntrega?: string[] }> {
  try {
    const slaMinutos = input.slaMinutos || 15;
    const slaLimiteAt = new Date(Date.now() + slaMinutos * 60 * 1000).toISOString();

    const { data: perfiles = [], error: errPerfiles } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp")
      .in("id", input.asesoresIds);

    // Sin los datos de los asesores no se puede avisar a nadie: no se crea la coordinación en falso
    if (errPerfiles) {
      console.error("[Coordinación] No se pudieron leer los asesores:", errPerfiles);
      return { ok: false, error: `No se pudieron leer los datos de los asesores: ${errPerfiles.message}` };
    }

    const perfilesMap = new Map((perfiles || []).map((p) => [p.id, p]));

    const respuestasIniciales: Record<string, any> = {};
    for (const aId of input.asesoresIds) {
      const p = perfilesMap.get(aId);
      respuestasIniciales[aId] = {
        nombre: p?.nombre || "Asesor",
        telefono: p?.telefono_whatsapp || p?.telefono,
        votos: {},
        respondidoAt: null,
      };
    }

    const { data: nuevaCoord, error: errInsert } = await sb
      .from("coordinaciones_inspeccion")
      .insert({
        prospecto_id: input.prospectoId,
        expediente_id: input.expedienteId || null,
        cliente_nombre: input.clienteNombre,
        cliente_telefono: normalizarTelefono(input.clienteTelefono),
        servicio_tipo: input.servicioTipo,
        servicio_nombre: input.servicioNombre,
        ubicacion: input.ubicacion,
        fraccionamiento: input.fraccionamiento || input.ubicacion,
        detalles_tecnicos: input.detallesTecnicos || null,
        asesores_ids: input.asesoresIds,
        opciones_horarios: input.opcionesHorarios,
        respuestas_asesores: respuestasIniciales,
        opciones_validadas: [],
        estado: "evaluando",
        sla_minutos: slaMinutos,
        sla_limite_at: slaLimiteAt,
        sla_estado: "en_tiempo",
        canal_notificacion: input.canalNotificacion || "whatsapp",
      })
      .select("id")
      .single();

    if (errInsert || !nuevaCoord) {
      console.error("[Coordinación] Error al insertar coordinación:", errInsert);
      return { ok: false, error: errInsert?.message || "No se pudo registrar la coordinación." };
    }

    const coordinacionId = nuevaCoord.id;

    // Registrar en bitácora
    await registrarActividad(sb, {
      prospectoId: input.prospectoId,
      expedienteId: input.expedienteId,
      tipo: "coordinacion_propuesta_iniciada",
      titulo: `⚡ Propuesta de inspección enviada a ${input.asesoresIds.length} asesores`,
      detalle: `Servicio: ${input.servicioNombre} en ${input.ubicacion}. Opciones propuestas: ${input.opcionesHorarios.map((o) => o.label).join(", ")}. SLA: ${slaMinutos} min.`,
    });

    // Despachar alertas a los asesores
    const nombresEquipo = (perfiles || []).map((p) => p.nombre).join(" y ");
    // Registro de a quién le llegó la propuesta y por qué canal
    const entregas: Record<string, EntregaPropuestaAsesor> = {};
    // Con canal "telegram" NO se manda WhatsApp (los mensajes de negocio de WhatsApp tienen costo)
    const asesoresPorWhatsApp = input.canalNotificacion === "telegram" ? [] : perfiles || [];
    for (const asesor of asesoresPorWhatsApp) {
      const telDestino = normalizarTelefono(asesor.telefono_whatsapp || asesor.telefono || "");
      if (!telDestino) {
        entregas[asesor.id] = {
          ...(entregas[asesor.id] || {}),
          whatsapp: { ok: false, enviadoAt: new Date().toISOString(), error: "Sin teléfono registrado" },
        };
        continue;
      }

      const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
      const listaOpcionesTexto = input.opcionesHorarios
        .map((opc) => `👉 *Opción ${opc.id}:* ${opc.label}`)
        .join("\n");

      const msgAsesor = `🚨 *PROPUESTA DE INSPECCIÓN TÉCNICA*\n\nHola ${primerNombre}, necesitamos validar tu disponibilidad para una inspección presencial junto con *${nombresEquipo}*:\n\n🛠️ *Servicio / Negocio:* ${input.servicioNombre}\n📍 *Ubicación:* ${input.ubicacion}\n👤 *Cliente:* ${input.clienteNombre}\n📝 *Detalle:* ${input.detallesTecnicos || "Revisión técnica en sitio"}\n\n📅 *Opciones tentativas propuestas:*\n${listaOpcionesTexto}\n\n⏱️ *SLA:* Tienen *${slaMinutos} minutos* para responder.\nFavor de responder indicando las opciones que tienes libres (ej. "puedo A y C" o "todas").`;

      try {
        const rWsp = await enviarWhatsAppTexto(telDestino, msgAsesor);
        entregas[asesor.id] = {
          ...(entregas[asesor.id] || {}),
          whatsapp: {
            ok: Boolean(rWsp?.ok),
            enviadoAt: new Date().toISOString(),
            messageId: rWsp?.messageId,
            error: rWsp?.ok ? undefined : rWsp?.error || "No se pudo enviar",
          },
        };
      } catch (errWsp) {
        console.warn(`[Coordinación] Error enviando WhatsApp al asesor ${asesor.nombre}:`, errWsp);
        entregas[asesor.id] = {
          ...(entregas[asesor.id] || {}),
          whatsapp: { ok: false, enviadoAt: new Date().toISOString(), error: "Error al enviar" },
        };
      }
    }

    // Despacho a Telegram (Bot y Grupo Operativo con botones interactivos)
    try {
      const resTg = await despacharPropuestaInspeccionTelegram(sb, {
        coordinacionId,
        servicioNombre: input.servicioNombre,
        ubicacion: input.ubicacion,
        clienteNombre: input.clienteNombre,
        clienteTelefono: input.clienteTelefono,
        detallesTecnicos: input.detallesTecnicos,
        asesoresIds: input.asesoresIds,
        opciones: input.opcionesHorarios,
        slaMinutos,
      });
      for (const [aId, r] of Object.entries(resTg.porAsesor || {})) {
        entregas[aId] = { ...(entregas[aId] || {}), telegram: r };
      }
    } catch (errTg) {
      console.warn("[Coordinación] Error despachando a Telegram:", errTg);
    }

    // Guardar el detalle de entrega por asesor para mostrarlo en la cabina
    try {
      const conEntrega: Record<string, any> = { ...respuestasIniciales };
      for (const aId of input.asesoresIds) {
        conEntrega[aId] = { ...conEntrega[aId], entrega: entregas[aId] || {}, enteradoAt: null, enteradoVia: null };
      }
      await sb
        .from("coordinaciones_inspeccion")
        .update({ respuestas_asesores: conEntrega })
        .eq("id", coordinacionId);
    } catch (errEnt) {
      console.warn("[Coordinación] No se pudo guardar el detalle de entrega:", errEnt);
    }

    // Asesores a quienes no les llegó por ningún canal
    const sinEntrega = input.asesoresIds
      .filter((aId) => !(entregas[aId]?.whatsapp?.ok || entregas[aId]?.telegram?.ok))
      .map((aId) => perfilesMap.get(aId)?.nombre || "Asesor");

    return { ok: true, coordinacionId, sinEntrega };
  } catch (err: any) {
    console.error("[Coordinación] Error inesperado en iniciarPropuestaCoordinacion:", err);
    return { ok: false, error: err.message || "Error al iniciar propuesta de coordinación." };
  }
}

/**
 * 2. Registra los votos (Sí/No) de un asesor para cada opción y recalcula opciones validadas
 */
export async function registrarVotosAsesorCoordinacion(
  sb: SupabaseClient,
  coordinacionId: string,
  asesorId: string,
  votos: Record<string, boolean>,
  notas?: string
): Promise<{ ok: boolean; opcionesValidadas: string[]; error?: string }> {
  try {
    const { data: coord, error: errCoord } = await sb
      .from("coordinaciones_inspeccion")
      .select("*")
      .eq("id", coordinacionId)
      .single();

    if (errCoord || !coord) {
      return { ok: false, opcionesValidadas: [], error: "Coordinación no encontrada." };
    }

    const respuestas = (coord.respuestas_asesores as Record<string, any>) || {};
    const asesorData = respuestas[asesorId] || {};
    asesorData.votos = { ...(asesorData.votos || {}), ...votos };
    asesorData.respondidoAt = new Date().toISOString();
    // Responder implica que leyó la propuesta
    if (!asesorData.enteradoAt) {
      asesorData.enteradoAt = asesorData.respondidoAt;
      asesorData.enteradoVia = "voto";
    }
    if (notas) asesorData.notas = notas;
    respuestas[asesorId] = asesorData;

    // Calcular opciones donde TODOS los asesores votaron true
    const asesoresIds: string[] = coord.asesores_ids || [];
    const opciones: OpcionHorarioPropuesta[] = (coord.opciones_horarios as any[]) || [];
    const opcionesValidadas: string[] = [];

    for (const opc of opciones) {
      const todosAceptaron = asesoresIds.every((aId) => respuestas[aId]?.votos?.[opc.id] === true);
      if (todosAceptaron) {
        opcionesValidadas.push(opc.id);
      }
    }

    await sb
      .from("coordinaciones_inspeccion")
      .update({
        respuestas_asesores: respuestas,
        opciones_validadas: opcionesValidadas,
        updated_at: new Date().toISOString(),
      })
      .eq("id", coordinacionId);

    return { ok: true, opcionesValidadas };
  } catch (err: any) {
    console.error("[Coordinación] Error en registrarVotosAsesorCoordinacion:", err);
    return { ok: false, opcionesValidadas: [], error: err.message };
  }
}

/**
 * Marca que un asesor leyó la propuesta (botón "Enterado" de Telegram o marca
 * manual del administrador cuando se enteró por llamada / voz).
 */
export async function marcarAsesorEnteradoCoordinacion(
  sb: SupabaseClient,
  coordinacionId: string,
  asesorId: string,
  via: "telegram" | "manual"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: coord } = await sb
      .from("coordinaciones_inspeccion")
      .select("respuestas_asesores, asesores_ids")
      .eq("id", coordinacionId)
      .single();
    if (!coord) return { ok: false, error: "Coordinación no encontrada." };
    if (!(coord.asesores_ids || []).includes(asesorId)) {
      return { ok: false, error: "El asesor no pertenece a esta coordinación." };
    }

    const respuestas = (coord.respuestas_asesores as Record<string, any>) || {};
    const asesorData = respuestas[asesorId] || {};
    if (!asesorData.enteradoAt) {
      asesorData.enteradoAt = new Date().toISOString();
      asesorData.enteradoVia = via;
    }
    respuestas[asesorId] = asesorData;

    await sb
      .from("coordinaciones_inspeccion")
      .update({ respuestas_asesores: respuestas, updated_at: new Date().toISOString() })
      .eq("id", coordinacionId);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al marcar como enterado." };
  }
}

/** Opciones validadas por todos los asesores y el mensaje sugerido para el cliente. */
async function mensajeOpcionesCliente(
  sb: SupabaseClient,
  coordinacionId: string
): Promise<{ ok: true; coord: any; opciones: OpcionHorarioPropuesta[]; texto: string } | { ok: false; error: string }> {
  const { data: coord, error: errCoord } = await sb
    .from("coordinaciones_inspeccion")
    .select("*")
    .eq("id", coordinacionId)
    .single();
  if (errCoord || !coord) return { ok: false, error: "Coordinación no encontrada." };

  const opciones: OpcionHorarioPropuesta[] = coord.opciones_horarios || [];
  const validadas: string[] = coord.opciones_validadas || [];
  const opcionesParaCliente = opciones.filter((o) => validadas.includes(o.id));
  if (opcionesParaCliente.length === 0) {
    return { ok: false, error: "Aún no hay opciones coincidentes aprobadas por ambos asesores." };
  }

  const primerNombre = coord.cliente_nombre.split(" ")[0] || coord.cliente_nombre;
  const listaOpcionesCliente = opcionesParaCliente.map((opc, idx) => `${idx + 1}️⃣ ${opc.label}`).join("\n");
  const servicio = [coord.servicio_nombre, coord.detalles_tecnicos].filter(Boolean).join(" — ");
  const texto = `¡Hola ${primerNombre}! 🏡 Con gusto te apoyamos con tu proyecto de ${servicio} en ${coord.ubicacion}.\n\nNuestros técnicos tienen disponibles las siguientes opciones para la visita:\n\n${listaOpcionesCliente}\n\n¿Cuál de estas opciones te queda mejor para confirmarla?`;
  return { ok: true, coord, opciones: opcionesParaCliente, texto };
}

/** Vista previa del mensaje que se enviará al cliente con las opciones validadas. */
export async function previsualizarOpcionesClienteCoordinacion(
  sb: SupabaseClient,
  coordinacionId: string
): Promise<{ ok: boolean; texto?: string; telefono?: string; error?: string }> {
  const r = await mensajeOpcionesCliente(sb, coordinacionId);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, texto: r.texto, telefono: r.coord.cliente_telefono };
}

/**
 * 3. Envía las opciones aprobadas al cliente por WhatsApp (1 clic del Administrador).
 * `textoEditado` permite mandar el mensaje tal como lo ajustó el asesor en la vista previa.
 * El mensaje queda en el historial de la conversación (con su estado de entrega/lectura).
 */
export async function enviarOpcionesAClienteCoordinacion(
  sb: SupabaseClient,
  coordinacionId: string,
  textoEditado?: string,
  agente?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const prep = await mensajeOpcionesCliente(sb, coordinacionId);
    if (!prep.ok) return { ok: false, error: prep.error };
    const { coord, opciones: opcionesParaCliente } = prep;
    const primerNombre = coord.cliente_nombre.split(" ")[0] || coord.cliente_nombre;
    const msgCliente = textoEditado?.trim() || prep.texto;

    const resWsp = await enviarWhatsAppTexto(coord.cliente_telefono, msgCliente);
    if (!resWsp.ok) {
      console.warn("[Coordinación] No se pudo enviar WhatsApp texto al cliente:", resWsp.error);
      return {
        ok: false,
        error: `No se pudo enviar el WhatsApp al cliente: ${resWsp.error || "error desconocido"}. Si pasaron más de 24 h desde su último mensaje, hay que usar una plantilla aprobada.`,
      };
    }

    // Registrar en el historial de la conversación; el webhook actualiza entregado/leído por wa_message_id
    const { error: errMsg } = await sb.from("mensajes_whatsapp").insert({
      telefono: normalizarTelefono(coord.cliente_telefono),
      texto: msgCliente,
      direccion: "out",
      estado: "enviado",
      agente: agente || "Coordinación de inspección",
      wa_message_id: resWsp.messageId ?? null,
      expediente_id: coord.expediente_id || null,
      prospecto_id: coord.prospecto_id || null,
    });
    if (errMsg) console.warn("[Coordinación] No se pudo registrar el mensaje en el historial:", errMsg);

    await sb
      .from("coordinaciones_inspeccion")
      .update({
        estado: "enviado_cliente",
        updated_at: new Date().toISOString(),
      })
      .eq("id", coordinacionId);

    await registrarActividad(sb, {
      prospectoId: coord.prospecto_id,
      expedienteId: coord.expediente_id,
      tipo: "coordinacion_opciones_enviadas_cliente",
      titulo: `💬 Opciones validadas enviadas a ${primerNombre} por WhatsApp`,
      detalle: `Opciones ofrecidas:\n${opcionesParaCliente.map((o: OpcionHorarioPropuesta) => o.label).join(", ")}`,
    });

    return { ok: true };
  } catch (err: any) {
    console.error("[Coordinación] Error en enviarOpcionesAClienteCoordinacion:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * 4. El cliente eligió una opción: Confirma la cita definitiva y notifica de vuelta a los asesores
 */
export async function confirmarCitaFinalCoordinacion(
  sb: SupabaseClient,
  coordinacionId: string,
  opcionId: string
): Promise<{ ok: boolean; citaId?: string; error?: string }> {
  try {
    const { data: coord, error: errCoord } = await sb
      .from("coordinaciones_inspeccion")
      .select("*")
      .eq("id", coordinacionId)
      .single();

    if (errCoord || !coord) {
      return { ok: false, error: "Coordinación no encontrada." };
    }

    const opciones: OpcionHorarioPropuesta[] = coord.opciones_horarios || [];
    const opcionSeleccionada = opciones.find((o) => o.id === opcionId);
    if (!opcionSeleccionada) {
      return { ok: false, error: `Opción ${opcionId} no encontrada en la propuesta.` };
    }

    // 1. Insertar en agenda_citas
    const primerAsesorId = coord.asesores_ids[0] || null;
    const { data: nuevaCita, error: errCita } = await sb
      .from("agenda_citas")
      .insert({
        perfil_id: primerAsesorId,
        asignados_ids: coord.asesores_ids,
        prospecto_id: coord.prospecto_id,
        expediente_id: coord.expediente_id,
        cliente_nombre: coord.cliente_nombre,
        cliente_telefono: coord.cliente_telefono,
        tipo_cita: "inspeccion",
        fecha: opcionSeleccionada.fecha,
        hora_inicio: opcionSeleccionada.horaInicio,
        hora_fin: opcionSeleccionada.horaFin,
        notas: `Inspección de ${coord.servicio_nombre}. ${coord.detalles_tecnicos || ""}`,
        estado: "confirmada",
        fraccionamiento: coord.fraccionamiento || coord.ubicacion,
        servicio_tipo: coord.servicio_tipo,
        sla_estado: "cumplido",
      })
      .select("id")
      .single();

    if (errCita || !nuevaCita) {
      console.error("[Coordinación] Error al crear cita final:", errCita);
      return { ok: false, error: errCita?.message || "No se pudo agendar la cita definitiva." };
    }

    const citaId = nuevaCita.id;

    // 2. Obtener nombres de los asesores
    const { data: perfiles = [] } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp")
      .in("id", coord.asesores_ids);

    const nombresEquipo = (perfiles || []).map((p) => p.nombre).join(" y ");
    const primerNombreCliente = coord.cliente_nombre.split(" ")[0] || coord.cliente_nombre;

    // 3. WhatsApp de confirmación al cliente
    const msgCliente = `¡Excelente ${primerNombreCliente}! 📅 Tu inspección técnica ha quedado programada:\n\n🗓️ *Fecha:* ${opcionSeleccionada.label}\n📍 *Ubicación:* ${coord.ubicacion}\n🛠️ *Servicio:* ${coord.servicio_nombre}\n👷 *Técnicos asignados:* ${nombresEquipo}\n\nEstaremos muy puntuales en tu domicilio. ¡Gracias por confiar en SAUCEDA! 🏡`;
    try {
      await enviarWhatsAppTexto(coord.cliente_telefono, msgCliente);
    } catch (errWsp) {
      console.warn("[Coordinación] Error al enviar confirmación WhatsApp al cliente:", errWsp);
    }

    // 4. WhatsApp de retorno a AMBOS asesores
    for (const asesor of perfiles || []) {
      const telDestino = normalizarTelefono(asesor.telefono_whatsapp || asesor.telefono || "");
      if (!telDestino) continue;

      const primerNombre = asesor.nombre?.split(" ")[0] || "Asesor";
      const msgRetorno = `✅ *INSPECCIÓN TÉCNICA CONFIRMADA*\n\nHola ${primerNombre}, el cliente *${coord.cliente_nombre}* eligió el siguiente horario:\n\n🗓️ *Horario:* ${opcionSeleccionada.label}\n🛠️ *Servicio / Negocio:* ${coord.servicio_nombre}\n📍 *Ubicación:* ${coord.ubicacion}\n👤 *Cliente:* ${coord.cliente_nombre} (${coord.cliente_telefono})\n👷 *Equipo asignado:* ${nombresEquipo}\n📝 *Detalles:* ${coord.detalles_tecnicos || "Levantamiento técnico"}\n\nLa cita ya quedó agendada en el sistema. Favor de presentarse puntuales con su equipo y herramientas.`;

      try {
        await enviarWhatsAppTexto(telDestino, msgRetorno);
      } catch (errAsesorWsp) {
        console.warn(`[Coordinación] Error al notificar cita confirmada a ${asesor.nombre}:`, errAsesorWsp);
      }
    }

    // Notificación de retorno a Telegram (Grupo Operativo y Asesores)
    try {
      await notificarConfirmacionFinalTelegram(sb, {
        coordinacionId,
        servicioNombre: coord.servicio_nombre,
        ubicacion: coord.ubicacion,
        clienteNombre: coord.cliente_nombre,
        clienteTelefono: coord.cliente_telefono,
        detallesTecnicos: coord.detalles_tecnicos,
        asesoresNombres: nombresEquipo,
        horarioConfirmado: opcionSeleccionada.label,
        asesoresIds: coord.asesores_ids,
      });
    } catch (errTg) {
      console.warn("[Coordinación] Error notificando retorno a Telegram:", errTg);
    }

    // 5. Actualizar coordinaciones_inspeccion
    await sb
      .from("coordinaciones_inspeccion")
      .update({
        estado: "confirmada",
        cita_id: citaId,
        opcion_seleccionada_id: opcionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", coordinacionId);

    // 6. Registrar en bitácora
    await registrarActividad(sb, {
      prospectoId: coord.prospecto_id,
      expedienteId: coord.expediente_id,
      tipo: "coordinacion_inspeccion_confirmada",
      titulo: `✅ Inspección confirmada para ${opcionSeleccionada.label}`,
      detalle: `Horario: ${opcionSeleccionada.label}. Asesores: ${nombresEquipo}. Cliente notificado y equipo confirmado.`,
    });

    return { ok: true, citaId };
  } catch (err: any) {
    console.error("[Coordinación] Error en confirmarCitaFinalCoordinacion:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * 5. Obtiene la coordinación activa de un prospecto
 */
export async function obtenerCoordinacionActivaProspecto(
  sb: SupabaseClient,
  prospectoId: string
): Promise<CoordinacionInspeccionDetalle | null> {
  const { data: coord, error } = await sb
    .from("coordinaciones_inspeccion")
    .select("*")
    .eq("prospecto_id", prospectoId)
    .neq("estado", "cancelada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !coord) return null;

  const ahora = Date.now();
  const limiteMs = coord.sla_limite_at ? new Date(coord.sla_limite_at).getTime() : ahora;
  const difMs = Math.max(0, limiteMs - ahora);
  const segundosTotal = Math.floor(difMs / 1000);
  const minutosRestantes = Math.floor(segundosTotal / 60);
  const segundosRestantes = segundosTotal % 60;
  const estaVencido = coord.estado === "evaluando" && limiteMs < ahora;

  return {
    id: coord.id,
    prospectoId: coord.prospecto_id,
    expedienteId: coord.expediente_id,
    citaId: coord.cita_id,
    clienteNombre: coord.cliente_nombre,
    clienteTelefono: coord.cliente_telefono,
    servicioTipo: coord.servicio_tipo,
    servicioNombre: coord.servicio_nombre,
    ubicacion: coord.ubicacion,
    fraccionamiento: coord.fraccionamiento,
    detallesTecnicos: coord.detalles_tecnicos,
    asesoresIds: coord.asesores_ids || [],
    opcionesHorarios: coord.opciones_horarios || [],
    respuestasAsesores: coord.respuestas_asesores || {},
    opcionesValidadas: coord.opciones_validadas || [],
    opcionSeleccionadaId: coord.opcion_seleccionada_id,
    negociacion: coord.negociacion || {},
    estado: coord.estado,
    slaMinutos: coord.sla_minutos || 15,
    slaLimiteAt: coord.sla_limite_at || "",
    slaEstado: coord.sla_estado || "en_tiempo",
    createdAt: coord.created_at,
    minutosRestantes,
    segundosRestantes,
    estaVencido,
  };
}

/**
 * 6. Cancela una propuesta de coordinación activa
 */
export async function cancelarCoordinacionAction(
  sb: SupabaseClient,
  coordinacionId: string
): Promise<{ ok: boolean }> {
  await sb
    .from("coordinaciones_inspeccion")
    .update({ estado: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", coordinacionId);
  return { ok: true };
}

export interface PropuestaRemodelacionIAInput {
  prospectoId?: string | null;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  colonia?: string | null;
  ubicacion?: string | null;
  detallesProyecto?: string | null;
  opcionesSeleccionadas: Array<{
    id: string;
    fecha: string;
    horaInicio: string;
    horaFin?: string;
    label: string;
  }>;
  tecnicoId?: string | null;
}

/**
 * 7. REGISTRO Y DISPARO AUTOMÁTICO DE COORDINACIÓN DESDE SOFÍA (REMODELACIÓN)
 * Dispara la alerta al proveedor técnico asignado con las 2 opciones vespertinas
 * seleccionadas por el cliente, iniciando el temporizador de SLA de 30 minutos.
 */
export async function registrarPropuestaRemodelacionDesdeIA(
  sb: SupabaseClient,
  input: PropuestaRemodelacionIAInput
): Promise<{ ok: boolean; coordinacionId?: string; error?: string }> {
  try {
    const telNormalizado = normalizarTelefono(input.clienteTelefono);
    const ubicacionFinal = input.ubicacion || input.colonia || "León, Gto.";

    // 1. Evitar duplicar coordinación si ya existe una activa para este prospecto/expediente
    if (input.prospectoId) {
      const { data: coordExistente } = await sb
        .from("coordinaciones_inspeccion")
        .select("id, estado")
        .eq("prospecto_id", input.prospectoId)
        .in("estado", ["propuesta_enviada", "evaluando"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (coordExistente) {
        return { ok: true, coordinacionId: coordExistente.id };
      }
    }

    // 2. Determinar técnico asignado (si no viene, buscar operaciones Alejandro u Oscar)
    let tecnicoId = input.tecnicoId;
    if (!tecnicoId) {
      const { data: perfAlex } = await sb
        .from("perfiles")
        .select("id")
        .or("nombre.ilike.%Alejandro%,nombre.ilike.%Alex%")
        .eq("activo", true)
        .maybeSingle();
      if (perfAlex) {
        tecnicoId = perfAlex.id;
      } else {
        const { data: perfAdmin } = await sb
          .from("perfiles")
          .select("id")
          .eq("rol", "admin")
          .eq("activo", true)
          .limit(1)
          .maybeSingle();
        tecnicoId = perfAdmin?.id || null;
      }
    }

    const asesoresIds = tecnicoId ? [tecnicoId] : [];

    // 3. Obtener perfil del técnico
    const { data: perfiles = [] } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp, telegram_chat_id")
      .in("id", asesoresIds);

    const tecnicoPerfil = (perfiles || [])[0];
    const tecnicoNombre = tecnicoPerfil?.nombre || "Especialista Técnico en Obra";
    const tecnicoTel = tecnicoPerfil?.telefono_whatsapp || tecnicoPerfil?.telefono || "";

    const respuestasIniciales: Record<string, any> = {};
    if (tecnicoId) {
      respuestasIniciales[tecnicoId] = {
        nombre: tecnicoNombre,
        telefono: tecnicoTel,
        votos: {},
        respondidoAt: null,
      };
    }

    const slaMinutos = 30;
    const slaLimiteAt = new Date(Date.now() + slaMinutos * 60 * 1000).toISOString();

    // 4. Insertar coordinación en base de datos
    const { data: nuevaCoord, error: errInsert } = await sb
      .from("coordinaciones_inspeccion")
      .insert({
        prospecto_id: input.prospectoId || null,
        expediente_id: input.expedienteId || null,
        cliente_nombre: input.clienteNombre,
        cliente_telefono: telNormalizado,
        servicio_tipo: "construccion-remodelacion",
        servicio_nombre: "Sauceda Construye Remodelación",
        ubicacion: ubicacionFinal,
        fraccionamiento: input.colonia || ubicacionFinal,
        detalles_tecnicos: input.detallesProyecto || "Remodelación en sitio",
        asesores_ids: asesoresIds,
        opciones_horarios: input.opcionesSeleccionadas,
        respuestas_asesores: respuestasIniciales,
        opciones_validadas: [],
        estado: "propuesta_enviada",
        sla_minutos: slaMinutos,
        sla_limite_at: slaLimiteAt,
        sla_estado: "en_tiempo",
        canal_notificacion: "telegram",
      })
      .select("id")
      .single();

    if (errInsert || !nuevaCoord) {
      console.error("[Coordinación Remodelación] Error al insertar:", errInsert);
      return { ok: false, error: errInsert?.message || "Error al crear coordinación." };
    }

    const coordinacionId = nuevaCoord.id;

    // 5. Registrar en bitácora de actividades
    await registrarActividad(sb, {
      prospectoId: input.prospectoId || undefined,
      expedienteId: input.expedienteId || undefined,
      tipo: "coordinacion_propuesta_iniciada",
      titulo: `⚡ Solicitud de Inspección Vespertina iniciada por Sofía IA`,
      detalle: `Remodelación en ${ubicacionFinal}. Opciones: ${input.opcionesSeleccionadas.map((o) => o.label).join(" | ")}. SLA: 30 min.`,
    });

    // 6. Despacho a Telegram con botones directos Aceptar A / Aceptar B / No puedo
    try {
      const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
      if (botToken) {
        const opcA = input.opcionesSeleccionadas[0];
        const opcB = input.opcionesSeleccionadas[1] || input.opcionesSeleccionadas[0];

        const textoTg = `🛠️ *SOLICITUD DE INSPECCIÓN: REMODELACIÓN*\n\n` +
          `👤 *Cliente:* ${input.clienteNombre} (${telNormalizado})\n` +
          `📍 *Zona:* ${input.colonia || ubicacionFinal}\n` +
          `🔨 *Proyecto:* ${input.detallesProyecto || "Remodelación en sitio"}\n\n` +
          `*Opciones seleccionadas por el cliente:*\n` +
          `🅰️ ${opcA?.label || "Opción A"}\n` +
          `🅱️ ${opcB?.label || "Opción B"}\n\n` +
          `⏱️ *SLA:* Tienes *30 minutos* para confirmar tu disponibilidad:\n` +
          `*Responde o presiona:*`;

        const inlineKeyboard = [
          [
            { text: `✅ Aceptar Opción A`, callback_data: `conf_prov:${coordinacionId}:${opcA?.id || "A"}` },
            { text: `✅ Aceptar Opción B`, callback_data: `conf_prov:${coordinacionId}:${opcB?.id || "B"}` },
          ],
          [
            { text: `❌ No puedo en estas opciones`, callback_data: `rej_prov:${coordinacionId}` },
          ],
          [
            { text: `👀 Enterado (ya lo leí)`, callback_data: `e:${coordinacionId}` },
          ],
        ];

        // Enviar al grupo operativo
        if (chatIdGrupo) {
          await enviarMensajeTelegram({
            botToken,
            chatId: chatIdGrupo,
            texto: textoTg,
            inlineKeyboard,
          });
        }

        // Enviar al chat personal del técnico si tiene telegram_chat_id
        if (tecnicoPerfil?.telegram_chat_id && tecnicoPerfil.telegram_chat_id !== chatIdGrupo) {
          await enviarMensajeTelegram({
            botToken,
            chatId: tecnicoPerfil.telegram_chat_id,
            texto: textoTg,
            inlineKeyboard,
          });
        }
      }
    } catch (errTg) {
      console.warn("[Coordinación Remodelación] Error al enviar Telegram:", errTg);
    }

    // 7. Notificación WhatsApp al técnico si tiene teléfono
    if (tecnicoTel) {
      const opcA = input.opcionesSeleccionadas[0];
      const opcB = input.opcionesSeleccionadas[1] || input.opcionesSeleccionadas[0];
      const msgWspTecnico = `🛠️ *SOLICITUD DE INSPECCIÓN: REMODELACIÓN*\n\n` +
        `Hola ${tecnicoNombre.split(" ")[0]}, el cliente *${input.clienteNombre}* solicita visita técnica para remodelación en *${input.colonia || ubicacionFinal}*.\n\n` +
        `Opciones seleccionadas por el cliente:\n` +
        `🅰️ ${opcA?.label}\n` +
        `🅱️ ${opcB?.label}\n\n` +
        `⏱️ SLA: 30 minutos. Por favor confirma en Telegram o en el CRM cuál opción cubres.`;

      await enviarWhatsAppTexto(normalizarTelefono(tecnicoTel), msgWspTecnico).catch(() => {});
    }

    return { ok: true, coordinacionId };
  } catch (err: any) {
    console.error("[Coordinación Remodelación] Error en registrarPropuestaRemodelacionDesdeIA:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * 8. CONFIRMAR OPCIÓN SELECCIONADA POR PROVEEDOR O ADMIN (REMODELACIÓN)
 * Crea la cita en agenda_citas, actualiza el expediente a etapa 'visita' y
 * situación 'inspeccion_programada', y envía la confirmación automática definitiva
 * al cliente por WhatsApp con el nombre del técnico.
 */
export async function confirmarOpcionProveedor(
  sb: SupabaseClient,
  coordinacionId: string,
  slotSeleccionadoId: string,
  proveedorId?: string
): Promise<{ ok: boolean; citaId?: string; error?: string }> {
  try {
    const { data: coord, error: errCoord } = await sb
      .from("coordinaciones_inspeccion")
      .select("*")
      .eq("id", coordinacionId)
      .single();

    if (errCoord || !coord) {
      return { ok: false, error: "Coordinación no encontrada." };
    }

    if (coord.estado === "confirmada" && coord.cita_id) {
      return { ok: true, citaId: coord.cita_id };
    }

    const opciones: OpcionHorarioPropuesta[] = (coord.opciones_horarios as any[]) || [];
    const opcionSeleccionada = opciones.find((o) => o.id === slotSeleccionadoId) || opciones[0];
    if (!opcionSeleccionada) {
      return { ok: false, error: `Opción ${slotSeleccionadoId} no encontrada en la propuesta.` };
    }

    // 1. Identificar al técnico o proveedor asignado
    let tecnicoId = proveedorId || coord.asesores_ids?.[0] || null;
    let tecnicoNombre = "Especialista Técnico en Obra";
    let tecnicoTelefono = "";

    if (tecnicoId) {
      const { data: perfil } = await sb
        .from("perfiles")
        .select("id, nombre, telefono, telefono_whatsapp")
        .eq("id", tecnicoId)
        .maybeSingle();
      if (perfil) {
        tecnicoNombre = perfil.nombre;
        tecnicoTelefono = perfil.telefono_whatsapp || perfil.telefono || "";
      }
    }

    // 2. Crear la cita en agenda_citas
    const { data: nuevaCita, error: errCita } = await sb
      .from("agenda_citas")
      .insert({
        perfil_id: tecnicoId,
        asignados_ids: tecnicoId ? [tecnicoId] : coord.asesores_ids,
        prospecto_id: coord.prospecto_id,
        expediente_id: coord.expediente_id,
        cliente_nombre: coord.cliente_nombre,
        cliente_telefono: coord.cliente_telefono,
        tipo_cita: "inspeccion",
        fecha: opcionSeleccionada.fecha,
        hora_inicio: opcionSeleccionada.horaInicio,
        hora_fin: opcionSeleccionada.horaFin || minutosAHora(horaAMinutos(opcionSeleccionada.horaInicio) + 60),
        notas: `Inspección de Remodelación. ${coord.detalles_tecnicos || ""}. Asignado a ${tecnicoNombre}`,
        estado: "confirmada",
        fraccionamiento: coord.fraccionamiento || coord.ubicacion,
        servicio_tipo: coord.servicio_tipo || "construccion-remodelacion",
        sla_estado: "cumplido",
      })
      .select("id")
      .single();

    if (errCita || !nuevaCita) {
      console.error("[Coordinación] Error al crear cita final:", errCita);
      return { ok: false, error: errCita?.message || "No se pudo agendar la cita definitiva." };
    }

    const citaId = nuevaCita.id;

    // 3. Actualizar coordinaciones_inspeccion
    await sb
      .from("coordinaciones_inspeccion")
      .update({
        estado: "confirmada",
        cita_id: citaId,
        opcion_seleccionada_id: slotSeleccionadoId,
        sla_estado: "cumplido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", coordinacionId);

    // 4. Actualizar expediente: etapa 'visita' y situación 'inspeccion_programada'
    if (coord.expediente_id) {
      await sb
        .from("expedientes")
        .update({
          etapa: "visita",
          situacion: "inspeccion_programada",
          ...(tecnicoId ? { asesor_id: tecnicoId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", coord.expediente_id);
    }

    // 5. Mensaje de WhatsApp saliente al cliente (según especificación)
    const primerNombre = coord.cliente_nombre.split(" ")[0] || coord.cliente_nombre;
    const detalleProyecto = coord.detalles_tecnicos ? `tu ${coord.detalles_tecnicos}` : "tu remodelación";
    const msgCliente = `¡Confirmado, ${primerNombre}! Tu visita técnica para la remodelación de ${detalleProyecto} quedó agendada para el *${opcionSeleccionada.label}*.\n\nTe visitará nuestro especialista técnico *${tecnicoNombre}* debidamente identificado por SAUCEDA Construye.\n\nCualquier duda o cambio de horario, puedes escribirnos por este mismo chat. ¡Nos vemos en tu domicilio! 🏡`;

    try {
      await enviarWhatsAppTexto(coord.cliente_telefono, msgCliente);
      // Registrar mensaje en mensajes_whatsapp para el historial del chat
      await sb.from("mensajes_whatsapp").insert({
        telefono: normalizarTelefono(coord.cliente_telefono),
        texto: msgCliente,
        direccion: "out",
        estado: "enviado",
        agente: "Coordinación Remodelación",
        expediente_id: coord.expediente_id || null,
        prospecto_id: coord.prospecto_id || null,
      });
    } catch (errWsp) {
      console.warn("[Coordinación] Error enviando WhatsApp al cliente:", errWsp);
    }

    // 6. Notificar al técnico por WhatsApp si tiene teléfono
    if (tecnicoTelefono) {
      const msgTecnico = `✅ *INSPECCIÓN DE REMODELACIÓN CONFIRMADA*\n\nHola ${tecnicoNombre.split(" ")[0]}, quedó confirmada la visita con el cliente *${coord.cliente_nombre}*:\n\n🗓️ *Horario:* ${opcionSeleccionada.label}\n📍 *Ubicación:* ${coord.ubicacion}\n👤 *Cliente:* ${coord.cliente_nombre} (${coord.cliente_telefono})\n📝 *Proyecto:* ${coord.detalles_tecnicos || "Remodelación"}\n\nFavor de presentarte puntual con cinta métrica y equipo de levantamiento.`;
      try {
        await enviarWhatsAppTexto(normalizarTelefono(tecnicoTelefono), msgTecnico);
      } catch (e) {
        console.warn("[Coordinación] Error notificando WhatsApp al técnico:", e);
      }
    }

    // 7. Notificar a Telegram (Grupo Operativo y Asesores)
    try {
      await notificarConfirmacionFinalTelegram(sb, {
        coordinacionId,
        servicioNombre: coord.servicio_nombre,
        ubicacion: coord.ubicacion,
        clienteNombre: coord.cliente_nombre,
        clienteTelefono: coord.cliente_telefono,
        detallesTecnicos: coord.detalles_tecnicos,
        asesoresNombres: tecnicoNombre,
        horarioConfirmado: opcionSeleccionada.label,
        asesoresIds: tecnicoId ? [tecnicoId] : coord.asesores_ids,
      });
    } catch (e) {
      console.warn("[Coordinación] Error notificando retorno a Telegram:", e);
    }

    // 8. Bitácora de actividades
    await registrarActividad(sb, {
      prospectoId: coord.prospecto_id,
      expedienteId: coord.expediente_id,
      tipo: "coordinacion_inspeccion_confirmada",
      titulo: `✅ Inspección de Remodelación confirmada (${opcionSeleccionada.label})`,
      detalle: `Técnico: ${tecnicoNombre}. Cliente: ${coord.cliente_nombre} notificado por WhatsApp.`,
    });

    return { ok: true, citaId };
  } catch (err: any) {
    console.error("[Coordinación] Error en confirmarOpcionProveedor:", err);
    return { ok: false, error: err.message };
  }
}

