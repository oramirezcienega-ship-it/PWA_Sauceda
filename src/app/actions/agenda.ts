"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, requireAdministrador } from "@/lib/supabase/cliente-sesion";

export interface Cita {
  id: string;
  perfil_id: string;
  prospecto_id?: string | null;
  expediente_id?: string | null;
  fraccionamiento?: string | null;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email?: string;
  tipo_cita: "venta" | "asesoria" | "inspeccion" | "instalacion";
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  notas?: string;
  estado: "pendiente" | "confirmada" | "cancelada";
  created_at: string;
}

export interface Bloqueo {
  id: string;
  perfil_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  descripcion: string;
  created_at: string;
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

/**
 * Obtiene la información pública de un asesor para la página de reservas.
 */
export async function obtenerInformacionAsesor(perfilId: string) {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, activo, telefono, horarios_agenda, duracion_cita")
    .eq("id", perfilId)
    .eq("activo", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Obtiene la agenda completa de un usuario (horarios, bloqueos y citas futuras).
 * Requiere rol de administrador.
 */
export async function obtenerAgendaUsuario(perfilId: string) {
  await requireAdmin();
  const sb = supabaseServidor();

  // 1. Obtener perfil
  const { data: perfil, error: errPerfil } = await sb
    .from("perfiles")
    .select("horarios_agenda, duracion_cita")
    .eq("id", perfilId)
    .maybeSingle();

  if (errPerfil) throw new Error(errPerfil.message);

  // 2. Obtener bloqueos (futuros o recientes)
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: bloqueos, error: errBloqueos } = await sb
    .from("agenda_bloqueos")
    .select("*")
    .eq("perfil_id", perfilId)
    .gte("fecha", hoy)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (errBloqueos) throw new Error(errBloqueos.message);

  // 3. Obtener citas (futuras o recientes)
  const { data: citas, error: errCitas } = await sb
    .from("agenda_citas")
    .select("*")
    .eq("perfil_id", perfilId)
    .gte("fecha", hoy)
    .neq("estado", "cancelada")
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (errCitas) throw new Error(errCitas.message);

  return {
    horarios_agenda: perfil?.horarios_agenda || {},
    duracion_cita: perfil?.duracion_cita || 60,
    bloqueos: (bloqueos || []) as Bloqueo[],
    citas: (citas || []) as Cita[],
  };
}

/**
 * Guarda la configuración semanal de disponibilidad para citas y la duración por slot.
 * Requiere rol de administrador.
 */
export async function actualizarConfiguracionAgenda(
  perfilId: string,
  horarios: any,
  duracion: number
) {
  await requireAdministrador();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("perfiles")
    .update({
      horarios_agenda: horarios,
      duracion_cita: duracion,
    })
    .eq("id", perfilId);

  if (error) throw new Error(error.message);
}

/**
 * Agrega un bloqueo de agenda para un asesor.
 * Requiere rol de administrador.
 */
export async function crearBloqueo(
  perfilId: string,
  fecha: string,
  horaInicio: string,
  horaFin: string,
  descripcion: string
) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data, error } = await sb
    .from("agenda_bloqueos")
    .insert({
      perfil_id: perfilId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      descripcion: descripcion.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Bloqueo;
}

/**
 * Elimina un bloqueo de agenda.
 * Requiere rol de administrador.
 */
export async function eliminarBloqueo(bloqueoId: string) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("agenda_bloqueos")
    .delete()
    .eq("id", bloqueoId);

  if (error) throw new Error(error.message);
}

/**
 * Crea una nueva cita (agendada por cliente o manualmente por administrador).
 * Si tiene prospecto_id, se puede registrar como actividad (se implementará opcionalmente).
 */
export async function crearCita(datos: {
  perfil_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email?: string;
  tipo_cita: "venta" | "asesoria" | "inspeccion";
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  notas?: string;
  prospecto_id?: string;
  estado?: "pendiente" | "confirmada" | "cancelada";
}) {
  const sb = supabaseServidor();

  // Validar si el slot sigue disponible
  const slots = await obtenerSlotsDisponibles(datos.perfil_id, datos.fecha);
  const estaDisponible = slots.some(
    (s) => s.inicio.slice(0, 5) === datos.hora_inicio.slice(0, 5)
  );

  if (!estaDisponible) {
    throw new Error("El horario seleccionado ya no está disponible.");
  }

  // Insertar la cita
  const { data, error } = await sb
    .from("agenda_citas")
    .insert({
      perfil_id: datos.perfil_id,
      prospecto_id: datos.prospecto_id || null,
      cliente_nombre: datos.cliente_nombre.trim(),
      cliente_telefono: datos.cliente_telefono.trim(),
      cliente_email: datos.cliente_email?.trim() || null,
      tipo_cita: datos.tipo_cita,
      fecha: datos.fecha,
      hora_inicio: datos.hora_inicio,
      hora_fin: datos.hora_fin,
      notas: datos.notas?.trim() || null,
      estado: datos.estado || "pendiente",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Si hay un prospecto_id, registramos una actividad en su bitácora
  if (datos.prospecto_id) {
    try {
      const tipoTxt = datos.tipo_cita === "inspeccion" ? "inspección en sitio" : (datos.tipo_cita === "venta" ? "venta" : "asesoría");
      await sb.from("actividades").insert({
        prospecto_id: datos.prospecto_id,
        tipo: "cita",
        descripcion: `Cita de ${tipoTxt} agendada para el ${datos.fecha} a las ${datos.hora_inicio.slice(0, 5)}hs.`,
      });

      // Notificar al asesor asignado
      const { notificarCitaAgendadaAsesor } = await import("@/lib/notificaciones-sistema");
      void notificarCitaAgendadaAsesor(sb, data);
    } catch (err) {
      console.error("Error al registrar actividad y notificar asesor:", err);
    }
  }

  return data as Cita;
}

/**
 * Cambia el estado de una cita a 'cancelada' (o la elimina).
 * Requiere rol de administrador.
 */
export async function cancelarCita(citaId: string) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("agenda_citas")
    .update({ estado: "cancelada" })
    .eq("id", citaId);

  if (error) throw new Error(error.message);
}

/**
 * Calcula las franjas horarias disponibles para un asesor en una fecha específica.
 */
export async function obtenerSlotsDisponibles(
  perfilId: string,
  fecha: string
): Promise<{ inicio: string; fin: string }[]> {
  const sb = supabaseServidor();

  // 1. Obtener perfil del asesor
  const { data: perfil } = await sb
    .from("perfiles")
    .select("horarios_agenda, duracion_cita, activo")
    .eq("id", perfilId)
    .eq("activo", true)
    .maybeSingle();

  if (!perfil) return [];

  const horariosAgenda = (perfil.horarios_agenda as any) || {};
  const duracionCita = perfil.duracion_cita || 60;

  // 2. Determinar día de la semana
  const [year, month, day] = fecha.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const diaSemana = dias[dateObj.getDay()];

  const franjasDia = horariosAgenda[diaSemana] || [];
  if (franjasDia.length === 0) return [];

  // 3. Obtener citas agendadas activas para esa fecha
  const { data: citas } = await sb
    .from("agenda_citas")
    .select("hora_inicio, hora_fin")
    .eq("perfil_id", perfilId)
    .eq("fecha", fecha)
    .neq("estado", "cancelada");

  // 4. Obtener bloqueos de agenda para esa fecha
  const { data: bloqueos } = await sb
    .from("agenda_bloqueos")
    .select("hora_inicio, hora_fin")
    .eq("perfil_id", perfilId)
    .eq("fecha", fecha);

  const bookings: { inicio: number; fin: number }[] = [];

  if (citas) {
    citas.forEach((c) => {
      bookings.push({
        inicio: horaAMinutos(c.hora_inicio),
        fin: horaAMinutos(c.hora_fin),
      });
    });
  }

  if (bloqueos) {
    bloqueos.forEach((b) => {
      bookings.push({
        inicio: horaAMinutos(b.hora_inicio),
        fin: horaAMinutos(b.hora_fin),
      });
    });
  }

  // 5. Generar slots
  const slots: { inicio: string; fin: string }[] = [];

  // Calcular la hora actual en México para filtrar slots pasados si es hoy
  const ahora = new Date();
  const opciones = {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  } as const;
  const formateador = new Intl.DateTimeFormat("es-MX", opciones);
  const partes = formateador.formatToParts(ahora);
  const getVal = (type: string) => partes.find((p) => p.type === type)?.value || "";
  const hoyStr = `${getVal("year")}-${getVal("month")}-${getVal("day")}`;
  const horaActualStr = `${getVal("hour")}:${getVal("minute")}:00`;
  const horaActualMins = horaAMinutos(horaActualStr);

  franjasDia.forEach((f: { inicio: string; fin: string }) => {
    const inicioMins = horaAMinutos(f.inicio);
    const finMins = horaAMinutos(f.fin);

    let current = inicioMins;
    while (current + duracionCita <= finMins) {
      const slotInicio = current;
      const slotFin = current + duracionCita;

      // Si es hoy, excluir slots que ya pasaron (con un margen de 10 minutos para que alcancen a agendar)
      if (fecha === hoyStr && slotInicio <= horaActualMins + 10) {
        current += duracionCita;
        continue;
      }

      // Validar traslape con citas/bloqueos
      const traslapado = bookings.some(
        (b) => slotInicio < b.fin && slotFin > b.inicio
      );

      if (!traslapado) {
        slots.push({
          inicio: minutosAHora(slotInicio),
          fin: minutosAHora(slotFin),
        });
      }

      current += duracionCita;
    }
  });

  return slots;
}

/**
 * Obtiene información básica de un prospecto para pre-llenar el formulario de reserva (público).
 * No requiere autenticación.
 */
export async function obtenerProspectoPublico(prospectoId: string) {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("prospectos")
    .select("nombre, primer_apellido, segundo_apellido, telefono, correo")
    .eq("id", prospectoId)
    .maybeSingle();

  if (error || !data) return null;

  const nombreCompleto = `${data.nombre || ""} ${data.primer_apellido || ""} ${data.segundo_apellido || ""}`.trim();

  return {
    nombre: nombreCompleto,
    telefono: data.telefono || "",
    correo: data.correo || "",
  };
}

/**
 * Confirma una cita agendada, cambiando su estado a 'confirmada'.
 * Requiere rol de administrador/asesor.
 */
export async function confirmarCita(citaId: string) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { error } = await sb
    .from("agenda_citas")
    .update({ estado: "confirmada" })
    .eq("id", citaId);

  if (error) throw new Error(error.message);
}

/**
 * Obtiene las citas y bloqueos de un asesor en un rango de fechas.
 * Requiere rol de administrador/asesor.
 */
export async function obtenerAgendaRango(
  perfilId: string,
  inicio: string,
  fin: string
) {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: citas, error: errCitas } = await sb
    .from("agenda_citas")
    .select("*")
    .eq("perfil_id", perfilId)
    .gte("fecha", inicio)
    .lte("fecha", fin)
    .neq("estado", "cancelada")
    .order("hora_inicio", { ascending: true });

  if (errCitas) throw new Error(errCitas.message);

  const { data: bloqueos, error: errBloqueos } = await sb
    .from("agenda_bloqueos")
    .select("*")
    .eq("perfil_id", perfilId)
    .gte("fecha", inicio)
    .lte("fecha", fin)
    .order("hora_inicio", { ascending: true });

  if (errBloqueos) throw new Error(errBloqueos.message);

  return {
    citas: (citas || []) as Cita[],
    bloqueos: (bloqueos || []) as Bloqueo[],
  };
}

/**
 * Valida si un operador tiene disponibilidad semanal y slots libres en los próximos dias.
 */
export async function validarAgendaOperador(
  perfilId: string,
  diasLimite = 14
): Promise<boolean> {
  const sb = supabaseServidor();

  // 1. Obtener perfil del operador
  const { data: perfil, error } = await sb
    .from("perfiles")
    .select("horarios_agenda, activo")
    .eq("id", perfilId)
    .maybeSingle();

  if (error || !perfil || !perfil.activo) return false;

  const horarios = (perfil.horarios_agenda as any) || {};
  const tieneHorarioConfigurado = Object.values(horarios).some(
    (dia: any) => Array.isArray(dia) && dia.length > 0
  );

  // Si no tiene ningún horario configurado en la semana, no es válido.
  if (!tieneHorarioConfigurado) return false;

  // 2. Verificar si tiene al menos un slot disponible en los próximos diasLimite
  const hoy = new Date();
  for (let i = 0; i < diasLimite; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + i);
    const fechaStr = fecha.toISOString().slice(0, 10);

    const slots = await obtenerSlotsDisponibles(perfilId, fechaStr);
    if (slots.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Programa la fecha de instalación para un expediente, la añade a la agenda del técnico
 * y opcionalmente notifica al cliente por WhatsApp.
 */
export async function programarInstalacionExpediente(data: {
  expedienteId: string;
  perfilId?: string | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  notas?: string;
  notificarCliente?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!data.expedienteId || !data.fecha || !data.horaInicio || !data.horaFin) {
    return { ok: false, error: "Datos incompletos para agendar la instalación." };
  }

  const sb = supabaseServidor();

  // 1. Obtener datos del expediente
  const { data: exp, error: errExp } = await sb
    .from("expedientes")
    .select("id, cliente, primer_apellido, segundo_apellido, telefono, fraccionamiento, prospecto_id, asesor_id, operador_id")
    .eq("id", data.expedienteId)
    .maybeSingle();

  if (errExp || !exp) {
    return { ok: false, error: "Expediente no encontrado." };
  }

  const perfilId = data.perfilId || exp.operador_id || exp.asesor_id;
  if (!perfilId) {
    return { ok: false, error: "Debes seleccionar a un técnico/operador para asignar la agenda." };
  }

  const nombreCliente = [exp.cliente, exp.primer_apellido, exp.segundo_apellido].filter(Boolean).join(" ");
  const fechaISO = `${data.fecha}T${data.horaInicio}:00`;

  try {
    // 2. Actualizar fecha_instalacion en el expediente y operador_id
    await sb
      .from("expedientes")
      .update({
        fecha_instalacion: fechaISO,
        operador_id: perfilId,
        etapa: "instalacion",
      })
      .eq("id", data.expedienteId);

    // 3. Crear registro en agenda_citas
    const { error: errCita } = await sb.from("agenda_citas").insert({
      perfil_id: perfilId,
      prospecto_id: exp.prospecto_id ?? null,
      expediente_id: exp.id,
      fraccionamiento: exp.fraccionamiento ?? null,
      cliente_nombre: nombreCliente,
      cliente_telefono: exp.telefono,
      tipo_cita: "instalacion",
      fecha: data.fecha,
      hora_inicio: data.horaInicio,
      hora_fin: data.horaFin,
      notas: data.notas || "Instalación profesional programada.",
      estado: "confirmada",
    });

    if (errCita) {
      console.error("Error al crear cita de instalación:", errCita);
    }

    // 4. Registrar actividad en la bitácora
    const { registrarActividad } = await import("@/lib/actividades");
    await registrarActividad(sb, {
      expedienteId: data.expedienteId,
      tipo: "construccion",
      titulo: "🛠️ Fecha de Instalación Programada",
      detalle: `Programada para el ${data.fecha} de ${data.horaInicio} a ${data.horaFin}. ${data.notas ? `Notas: ${data.notas}` : ""}`,
    });

    // 5. Notificación por WhatsApp si se solicitó
    if (data.notificarCliente && exp.telefono) {
      const { enviarWhatsAppTexto } = await import("@/lib/whatsapp");
      const msg = `¡Hola ${exp.cliente}! 🛠️ Te confirmamos que tu instalación profesional de impermeabilización con SAUCEDA ha quedado programada para el día *${data.fecha}* a las *${data.horaInicio} hrs*.\n\nPor favor asegúrate de tener libre el acceso a la azotea. ¡Cualquier duda quedamos a tus órdenes! 💚`;
      await enviarWhatsAppTexto(exp.telefono, msg);
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Error al programar instalación:", err);
    return { ok: false, error: err.message || "Error al guardar la fecha de instalación." };
  }
}

/**
 * Obtiene todas las citas/visitas futuras organizadas para el dashboard inicial.
 */
export async function obtenerProximasCitasEInstalaciones(perfilId?: string | null): Promise<Cita[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const hoy = new Date().toISOString().slice(0, 10);

  let query = sb
    .from("agenda_citas")
    .select("*")
    .gte("fecha", hoy)
    .neq("estado", "cancelada")
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true })
    .limit(20);

  if (perfilId) {
    query = query.eq("perfil_id", perfilId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error al obtener próximas visitas e instalaciones:", error);
    return [];
  }
  return (data || []) as Cita[];
}
