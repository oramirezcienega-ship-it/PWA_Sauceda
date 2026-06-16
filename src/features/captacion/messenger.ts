import { supabaseServidor } from "@/lib/supabase/server";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { iaAgenteActivo, responderConIA } from "@/lib/ia/agente";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";
import { 
  hoyISO, 
  siguienteId, 
  siguienteIdProspecto, 
  guardarMensajeEntrante 
} from "@/features/captacion/whatsapp";

/**
 * MÓDULO: CAPTACIÓN · Facebook Messenger (Meta Graph API)
 *
 * Recibe mensajes entrantes de Facebook Messenger (vía Webhook) y crea/actualiza
 * prospectos y expedientes en etapa "nuevo-lead".
 */

export interface MensajeMessenger {
  senderId: string;   // PSID del remitente en Messenger
  recipientId: string; // ID de la página de Facebook receptora
  mensaje?: string;    // Contenido del mensaje de texto
  messageId?: string;  // ID único del mensaje en Meta
  nombre?: string;     // Nombre de perfil del cliente (si viene en el payload)
}

/** Busca o crea el prospecto para un lead de Facebook Messenger. */
async function obtenerOCrearProspectoMessenger(
  sb: ReturnType<typeof supabaseServidor>,
  lead: MensajeMessenger,
  telefonoKey: string,
): Promise<string> {
  const { data: existentes } = await sb
    .from("prospectos")
    .select("id")
    .eq("telefono", telefonoKey)
    .limit(1);

  if (existentes && existentes.length > 0) {
    return existentes[0].id as string;
  }

  const id = await siguienteIdProspecto(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead Messenger ${lead.senderId}`,
    telefono: telefonoKey, // Guardamos la llave "messenger:PSID"
    origen: "facebook",
  });
  // Automatizaciones: prospecto nuevo captado por Facebook
  await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  return id;
}

/**
 * Registra un lead entrante de Facebook Messenger.
 * Reutiliza las tablas del CRM (expedientes y prospectos) mapeando el teléfono
 * con la llave especial "messenger:PSID" para evitar duplicar registros.
 */
export async function registrarLeadMessenger(
  lead: MensajeMessenger,
): Promise<void> {
  const sb = supabaseServidor();

  // Llave única del canal Messenger en la base de datos
  const telefonoKey = `messenger:${lead.senderId}`;

  // Buscar o crear el prospecto
  const prospectoId = await obtenerOCrearProspectoMessenger(sb, lead, telefonoKey);

  // Buscar si ya existe un expediente asociado
  const { data: existentes } = await sb
    .from("expedientes")
    .select("id, notas")
    .eq("telefono", telefonoKey)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string };
    const nota = `${exp.notas ?? ""}\n[Messenger ${hoyISO()}] ${
      lead.mensaje ?? ""
    }`.trim();
    
    await sb
      .from("expedientes")
      .update({ notas: nota, ultimo_movimiento: hoyISO() })
      .eq("id", exp.id);

    const nuevo = await guardarMensajeEntrante(sb, {
      telefono: telefonoKey,
      texto: lead.mensaje ?? "",
      expedienteId: exp.id,
      prospectoId,
      waMessageId: lead.messageId, // reutilizamos la columna
    });

    // Respuesta automática del agente de IA (si está activo y no hay humano)
    if (nuevo) {
      await responderConIA(sb, { telefono: telefonoKey, expedienteId: exp.id });
    }
    return;
  }

  // Si es un expediente completamente nuevo
  const id = await siguienteId(sb);
  await sb.from("expedientes").insert({
    id,
    cliente: lead.nombre?.trim() || `Lead Messenger ${lead.senderId}`,
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje
      ? `Primer mensaje por Messenger: ${lead.mensaje}`.slice(0, 300)
      : "Contacto entrante por Facebook Messenger.",
    telefono: telefonoKey,
    valor_estimado: 0,
    saldo_deuda: 0,
    notas: "Lead entrante automáticamente por Facebook Messenger.",
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
  });

  // Guardar mensaje en el hilo
  const nuevoMensaje = await guardarMensajeEntrante(sb, {
    telefono: telefonoKey,
    texto: lead.mensaje ?? "",
    expedienteId: id,
    prospectoId,
    waMessageId: lead.messageId,
  });

  const iaOn = iaAgenteActivo();
  
  // Automatizaciones: expediente nuevo captado por Facebook
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: id,
    prospectoId,
  });
  
  // Notificar al equipo
  void notificarNuevoLead(id);

  // Respuesta automática del agente de IA
  if (iaOn && nuevoMensaje) {
    await responderConIA(sb, { telefono: telefonoKey, expedienteId: id });
  }
}
