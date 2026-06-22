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
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
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
    .select("id, campaign_name, adset_name, ad_name")
    .eq("telefono", telefonoKey)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const pr = existentes[0];
    const updateAttrs: any = {};
    if (lead.campaign_name && lead.campaign_name !== pr.campaign_name) updateAttrs.campaign_name = lead.campaign_name;
    if (lead.adset_name && lead.adset_name !== pr.adset_name) updateAttrs.adset_name = lead.adset_name;
    if (lead.ad_name && lead.ad_name !== pr.ad_name) updateAttrs.ad_name = lead.ad_name;

    if (Object.keys(updateAttrs).length > 0) {
      await sb.from("prospectos").update(updateAttrs).eq("id", pr.id);
    }
    return pr.id as string;
  }

  const id = await siguienteIdProspecto(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead ${canalLabel} ${lead.senderId}`,
    telefono: telefonoKey,
    origen,
    campaign_name: lead.campaign_name || "",
    adset_name: lead.adset_name || "",
    ad_name: lead.ad_name || "",
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
    .select("id, notas, campaign_name, adset_name, ad_name")
    .eq("telefono", telefonoKey)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string; campaign_name?: string; adset_name?: string; ad_name?: string };
    const nota = `${exp.notas ?? ""}\n[${canalLabel} ${hoyISO()}] ${
      lead.mensaje ?? ""
    }`.trim();
    
    const updateData: any = { notas: nota, ultimo_movimiento: hoyISO() };
    if (lead.campaign_name && lead.campaign_name !== exp.campaign_name) updateData.campaign_name = lead.campaign_name;
    if (lead.adset_name && lead.adset_name !== exp.adset_name) updateData.adset_name = lead.adset_name;
    if (lead.ad_name && lead.ad_name !== exp.ad_name) updateData.ad_name = lead.ad_name;

    await sb
      .from("expedientes")
      .update(updateData)
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
    campaign_name: lead.campaign_name || "",
    adset_name: lead.adset_name || "",
    ad_name: lead.ad_name || "",
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
