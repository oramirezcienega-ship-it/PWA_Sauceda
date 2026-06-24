import { supabaseServidor } from "@/lib/supabase/server";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { iaAgenteActivo, responderConIA } from "@/lib/ia/agente";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";

/**
 * MÓDULO: CAPTACIÓN · WhatsApp (Meta Cloud API)
 *
 * Recibe mensajes entrantes de WhatsApp y crea un expediente en etapa
 * "nuevo-lead". NO requiere sesión de admin (lo invoca Meta vía webhook),
 * por eso usa directamente el cliente con service role.
 */

/** Mensaje de WhatsApp ya normalizado. */
export interface MensajeWhatsApp {
  telefono: string;
  nombre?: string;
  mensaje?: string;
  /** Id del mensaje en Meta (para no duplicarlo si reintenta el webhook). */
  waMessageId?: string;
}

/** Forma mínima del payload del webhook de Meta que nos interesa. */
interface PayloadWhatsApp {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/** Extrae los mensajes entrantes del payload de Meta (ignora estados de entrega). */
export function extraerMensajes(payload: PayloadWhatsApp): MensajeWhatsApp[] {
  const mensajes: MensajeWhatsApp[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      // Nombre de perfil por número (wa_id).
      const nombrePorWaId: Record<string, string> = {};
      for (const contacto of value.contacts ?? []) {
        if (contacto.wa_id && contacto.profile?.name) {
          nombrePorWaId[contacto.wa_id] = contacto.profile.name;
        }
      }

      for (const m of value.messages ?? []) {
        if (!m.from) continue;
        const texto =
          m.text?.body ?? (m.type ? `(mensaje de tipo ${m.type})` : undefined);
        mensajes.push({
          telefono: m.from,
          nombre: nombrePorWaId[m.from],
          mensaje: texto,
          waMessageId: m.id,
        });
      }
    }
  }

  return mensajes;
}

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Genera el siguiente folio correlativo (EXP-00N). */
export async function siguienteId(
  sb: ReturnType<typeof supabaseServidor>,
): Promise<string> {
  const { data } = await sb.from("expedientes").select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

/** Genera el siguiente folio de prospecto (PRO-00N). */
export async function siguienteIdProspecto(
  sb: ReturnType<typeof supabaseServidor>,
): Promise<string> {
  const { data } = await sb.from("prospectos").select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `PRO-${String(max + 1).padStart(3, "0")}`;
}

/** Busca o crea el prospecto (por teléfono) para un lead de WhatsApp. */
async function obtenerOCrearProspecto(
  sb: ReturnType<typeof supabaseServidor>,
  lead: MensajeWhatsApp,
): Promise<string> {
  const { data: existentes } = await sb
    .from("prospectos")
    .select("id")
    .in("telefono", variantesTelefono(lead.telefono))
    .limit(1);

  if (existentes && existentes.length > 0) {
    return existentes[0].id as string;
  }

  const id = await siguienteIdProspecto(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    telefono: normalizarTelefono(lead.telefono),
    origen: "whatsapp",
  });
  // Automatizaciones: prospecto nuevo captado por WhatsApp.
  await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  return id;
}

/**
 * Guarda un mensaje ENTRANTE en el hilo de conversación (best-effort).
 * El índice único por wa_message_id evita duplicados si Meta reintenta.
 * Devuelve true solo si fue un mensaje NUEVO (no duplicado), para que la IA
 * no responda dos veces ante reintentos del webhook.
 */
export async function guardarMensajeEntrante(
  sb: ReturnType<typeof supabaseServidor>,
  datos: {
    telefono: string;
    texto: string;
    expedienteId: string | null;
    prospectoId: string | null;
    waMessageId?: string;
  },
): Promise<boolean> {
  try {
    const { error } = await sb.from("mensajes_whatsapp").insert({
      telefono: datos.telefono,
      texto: datos.texto,
      direccion: "in",
      expediente_id: datos.expedienteId,
      prospecto_id: datos.prospectoId,
      wa_message_id: datos.waMessageId ?? null,
    });
    // error (p. ej. choque del índice único) => ya existía, no es nuevo.
    const esNuevo = !error;
    if (esNuevo) {
      // Sacar de secuencias de automatización si estaba activo
      await comprobarYSalirDeSecuenciaPorMensaje(sb, datos.telefono);
    }
    return esNuevo;
  } catch (err) {
    console.error("No se pudo guardar el mensaje entrante:", err);
    return false;
  }
}

/** Comprueba si el teléfono tiene un enrolamiento activo en secuencias y lo saca */
export async function comprobarYSalirDeSecuenciaPorMensaje(
  sb: ReturnType<typeof supabaseServidor>,
  telefono: string,
): Promise<void> {
  try {
    const { data: enrollments } = await sb
      .from("sequence_enrollments")
      .select("id, step_actual")
      .eq("phone", telefono)
      .eq("status", "activo");

    if (enrollments && enrollments.length > 0) {
      // Cargar dinámicamente para evitar dependencias circulares
      const { salirDeSecuencia } = await import("@/lib/automatizaciones/orquestador");
      for (const en of enrollments) {
        await salirDeSecuencia(sb, en.id, "respondio", en.step_actual);
      }
    }
  } catch (err) {
    console.error("Error al salir de secuencia por mensaje entrante:", err);
  }
}

/**
 * Registra un lead entrante de WhatsApp.
 * Crea (o reutiliza) el prospecto por teléfono con origen "whatsapp", y le
 * cuelga un expediente en "nuevo-lead". Si ya existe un expediente con ese
 * teléfono, NO duplica: anota el nuevo mensaje y actualiza la fecha.
 */
export async function registrarLeadWhatsApp(
  lead: MensajeWhatsApp,
): Promise<void> {
  const sb = supabaseServidor();

  // Teléfono normalizado (canónico) y sus variantes para deduplicar.
  const telefono = normalizarTelefono(lead.telefono);
  const variantesTel = variantesTelefono(lead.telefono);

  // Prospecto (persona): se busca o se crea por teléfono.
  const prospectoId = await obtenerOCrearProspecto(sb, lead);

  // Dedupe del expediente por teléfono (cualquier formato equivalente).
  const { data: existentes } = await sb
    .from("expedientes")
    .select("id, notas")
    .in("telefono", variantesTel)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string };
    const nota = `${exp.notas ?? ""}\n[WhatsApp ${hoyISO()}] ${
      lead.mensaje ?? ""
    }`.trim();
    await sb
      .from("expedientes")
      .update({ notas: nota, ultimo_movimiento: hoyISO() })
      .eq("id", exp.id);
    const nuevo = await guardarMensajeEntrante(sb, {
      telefono,
      texto: lead.mensaje ?? "",
      expedienteId: exp.id,
      prospectoId,
      waMessageId: lead.waMessageId,
    });
    // Respuesta automática del agente de IA (si está activo y no hay humano).
    if (nuevo) await responderConIA(sb, { telefono, expedienteId: exp.id });
    return;
  }

  const id = await siguienteId(sb);
  await sb.from("expedientes").insert({
    id,
    cliente: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje
      ? `Primer mensaje: ${lead.mensaje}`.slice(0, 300)
      : "Contacto entrante por WhatsApp.",
    telefono,
    valor_estimado: 0,
    saldo_deuda: 0,
    notas: "Lead entrante automáticamente por WhatsApp.",
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
  });

  // Enrolar automáticamente en secuencias activas
  try {
    const { enrolarLeadEnSecuenciasActivas } = await import("@/lib/automatizaciones/orquestador");
    await enrolarLeadEnSecuenciasActivas(sb, {
      nombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
      phone: telefono,
      prospectoId,
      expedienteId: id,
    });
  } catch (err) {
    console.error("Error al enrolar lead de WhatsApp en secuencias activas:", err);
  }

  // Guarda el primer mensaje del cliente en el hilo de conversación.
  const nuevoMensaje = await guardarMensajeEntrante(sb, {
    telefono,
    texto: lead.mensaje ?? "",
    expedienteId: id,
    prospectoId,
    waMessageId: lead.waMessageId,
  });
  // Bienvenida automática. El cliente nos escribió: ventana de 24 h abierta,
  // así que el WhatsApp puede ir como texto libre. Si la IA está activa, ella
  // dará la bienvenida por WhatsApp (se omite el mensaje fijo para no duplicar).
  const iaOn = iaAgenteActivo();
  await enviarBienvenida(sb, id, {
    ventanaWhatsAppAbierta: true,
    omitirWhatsApp: iaOn,
  });
  // Automatizaciones: expediente nuevo captado por WhatsApp.
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: id,
    prospectoId,
  });
  // Notificar al equipo sobre el nuevo lead
  void notificarNuevoLead(id);

  // Respuesta automática del agente de IA al primer mensaje (si está activo).
  if (iaOn && nuevoMensaje) await responderConIA(sb, { telefono, expedienteId: id });
}
