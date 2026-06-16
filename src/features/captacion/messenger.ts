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
 * MÓDULO: CAPTACIÓN · Facebook Messenger e Instagram DMs (Meta Graph API)
 *
 * Recibe mensajes entrantes de Facebook Messenger e Instagram y crea/actualiza
 * prospectos y expedientes en etapa "nuevo-lead".
 */

export interface MensajeMessenger {
  senderId: string;   // PSID del remitente en Messenger o IGSID en Instagram
  recipientId: string; // ID de la página receptora o ID de la cuenta de Instagram
  mensaje?: string;    // Contenido del mensaje de texto
  messageId?: string;  // ID único del mensaje en Meta
  nombre?: string;     // Nombre de perfil del cliente (si viene en el payload)
}

/** Busca o crea el prospecto para un lead de Redes Sociales. */
async function obtenerOCrearProspectoSocial(
  sb: ReturnType<typeof supabaseServidor>,
  lead: MensajeMessenger,
  telefonoKey: string,
  origen: "facebook" | "instagram",
  canalLabel: string,
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
    nombre: lead.nombre?.trim() || `Lead ${canalLabel} ${lead.senderId}`,
    telefono: telefonoKey,
    origen,
  });
  
  await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  return id;
}

/**
 * Registra un lead entrante de Facebook Messenger o Instagram.
 */
async function registrarLeadSocial(
  lead: MensajeMessenger,
  canal: "messenger" | "instagram",
  origen: "facebook" | "instagram",
  canalLabel: string,
): Promise<void> {
  const sb = supabaseServidor();
  const telefonoKey = `${canal}:${lead.senderId}`;

  // Buscar o crear el prospecto
  const prospectoId = await obtenerOCrearProspectoSocial(sb, lead, telefonoKey, origen, canalLabel);

  // Buscar si ya existe un expediente asociado
  const { data: existentes } = await sb
    .from("expedientes")
    .select("id, notas")
    .eq("telefono", telefonoKey)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string };
    const nota = `${exp.notas ?? ""}\n[${canalLabel} ${hoyISO()}] ${
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
      waMessageId: lead.messageId,
    });

    if (nuevo) {
      await responderConIA(sb, { telefono: telefonoKey, expedienteId: exp.id });
    }
    return;
  }

  // Si es un expediente completamente nuevo
  const id = await siguienteId(sb);
  await sb.from("expedientes").insert({
    id,
    cliente: lead.nombre?.trim() || `Lead ${canalLabel} ${lead.senderId}`,
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje
      ? `Primer mensaje por ${canalLabel}: ${lead.mensaje}`.slice(0, 300)
      : `Contacto entrante por ${canalLabel}.`,
    telefono: telefonoKey,
    valor_estimado: 0,
    saldo_deuda: 0,
    notas: `Lead entrante automáticamente por ${canalLabel}.`,
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
  });

  const nuevoMensaje = await guardarMensajeEntrante(sb, {
    telefono: telefonoKey,
    texto: lead.mensaje ?? "",
    expedienteId: id,
    prospectoId,
    waMessageId: lead.messageId,
  });

  const iaOn = iaAgenteActivo();
  
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: id,
    prospectoId,
  });
  
  void notificarNuevoLead(id);

  if (iaOn && nuevoMensaje) {
    await responderConIA(sb, { telefono: telefonoKey, expedienteId: id });
  }
}

/** Registra un lead de Facebook Messenger */
export async function registrarLeadMessenger(lead: MensajeMessenger): Promise<void> {
  return registrarLeadSocial(lead, "messenger", "facebook", "Messenger");
}

/** Registra un lead de Instagram DMs */
export async function registrarLeadInstagram(lead: MensajeMessenger): Promise<void> {
  return registrarLeadSocial(lead, "instagram", "instagram", "Instagram");
}
