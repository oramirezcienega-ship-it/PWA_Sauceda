import { supabaseServidor } from "@/lib/supabase/server";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { iaAgenteActivo } from "@/lib/ia/agente";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";
import { transcribirAudioMeta } from "@/lib/ia/audio";
import { detectarTipoNegocio } from "@/lib/types";

/** Dispara asíncronamente el procesamiento de respuesta de la IA en segundo plano */
export async function triggerResponderBackground(
  telefono: string,
  expedienteId?: string | null,
): Promise<void> {
  try {
    const baseUrl = process.env.SITE_URL || "http://localhost:3000";
    const secret = process.env.CRON_SECRET || "";
    
    // Desactivar temporalmente la validación de certificados auto-firmados en entornos de staging o locales
    if (baseUrl.includes("crm-staging.saucedamx.com") || baseUrl.includes("192.168.100") || baseUrl.includes("localhost")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    
    // Usamos directamente la API Route de Next.js para asegurar la resolución de aliases y contexto
    const endpoint = `${baseUrl}/api/ia/responder-background`;

    console.log(`[IA Trigger] Enviando petición a: ${endpoint}`);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ telefono, expedienteId }),
    });

    if (!res.ok) {
      console.error(`[IA Trigger] Error al encolar respuesta en segundo plano: ${res.status} ${await res.text()}`);
    } else {
      console.log(`[IA Trigger] Encolado con éxito para ${telefono} (status: ${res.status})`);
    }
  } catch (err) {
    console.error("[IA Trigger] Error de red disparando la respuesta en segundo plano:", err);
  }
}

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
  audioId?: string;
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
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
          audio?: { id?: string };
          referral?: {
            source_url?: string;
            source_id?: string;
            source_type?: string;
            headline?: string;
            body?: string;
            ctwa_clid?: string;
          };
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
          audioId: m.type === "audio" ? m.audio?.id : undefined,
          referral: m.referral,
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
  campaign_name = "",
  adset_name = "",
  ad_name = "",
): Promise<string> {
  const { data: existentes } = await sb
    .from("prospectos")
    .select("id, campaign_name, adset_name, ad_name")
    .in("telefono", variantesTelefono(lead.telefono))
    .limit(1);

  if (existentes && existentes.length > 0) {
    const pr = existentes[0];
    const updateAttrs: any = {};
    if (campaign_name && campaign_name !== pr.campaign_name) updateAttrs.campaign_name = campaign_name;
    if (adset_name && adset_name !== pr.adset_name) updateAttrs.adset_name = adset_name;
    if (ad_name && ad_name !== pr.ad_name) updateAttrs.ad_name = ad_name;

    if (Object.keys(updateAttrs).length > 0) {
      await sb.from("prospectos").update(updateAttrs).eq("id", pr.id);
    }
    return pr.id as string;
  }

  const id = await siguienteIdProspecto(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    telefono: normalizarTelefono(lead.telefono),
    origen: "whatsapp",
    campaign_name,
    adset_name,
    ad_name,
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
    nombre?: string;
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
      await comprobarYSalirDeSecuenciaPorMensaje(sb, datos.telefono);
      // Notificación in-app para todos los asesores activos
      try {
        let nombre = datos.nombre || datos.telefono;
        if (!datos.nombre) {
          if (datos.expedienteId) {
            const { data: exp } = await sb
              .from("expedientes")
              .select("cliente, primer_apellido")
              .eq("id", datos.expedienteId)
              .maybeSingle();
            if (exp) nombre = [exp.cliente, (exp as any).primer_apellido].filter(Boolean).join(" ") || nombre;
          } else if (datos.prospectoId) {
            const { data: pro } = await sb
              .from("prospectos")
              .select("nombre, primer_apellido")
              .eq("id", datos.prospectoId)
              .maybeSingle();
            if (pro) nombre = [pro.nombre, (pro as any).primer_apellido].filter(Boolean).join(" ") || nombre;
          }
        }
        const { notificarMensajeEntrante } = await import("@/lib/notificaciones-sistema");
        void notificarMensajeEntrante({
          telefono: datos.telefono,
          texto: datos.texto,
          nombre,
          expedienteId: datos.expedienteId,
          prospectoId: datos.prospectoId,
        });
      } catch (notifErr) {
        console.error("Error al enviar notificación de mensaje entrante:", notifErr);
      }
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

  // Si es un audio, transcribirlo usando Whisper antes de continuar
  if (lead.audioId) {
    try {
      console.log(`[WhatsApp Inbound Voice] Se detectó audio con id ${lead.audioId} para ${lead.telefono}. Transcribiendo...`);
      const textoTranscrito = await transcribirAudioMeta(lead.audioId);
      if (textoTranscrito) {
        lead.mensaje = `[audio:${lead.audioId}] ${textoTranscrito}`;
        console.log(`[WhatsApp Inbound Voice] Transcripción exitosa: "${textoTranscrito}"`);
      } else {
        lead.mensaje = `[audio:${lead.audioId}] (mensaje de tipo audio)`;
        console.warn("[WhatsApp Inbound Voice] No se pudo obtener la transcripción del audio.");
      }
    } catch (err) {
      lead.mensaje = `[audio:${lead.audioId}] (mensaje de tipo audio)`;
      console.error("[WhatsApp Inbound Voice] Error al transcribir audio:", err);
    }
  }

  // Teléfono normalizado (canónico) y sus variantes para deduplicar.
  const telefono = normalizarTelefono(lead.telefono);
  const variantesTel = variantesTelefono(lead.telefono);

  // Atribución de campaña
  let campaign_name = "";
  let adset_name = "";
  let ad_name = "";

  if (lead.referral) {
    if (lead.referral.headline) {
      ad_name = lead.referral.headline;
    }

    const adId = lead.referral.source_id;
    const token = process.env.META_ADS_TOKEN || process.env.WHATSAPP_TOKEN || process.env.MESSENGER_PAGE_TOKEN;
    if (adId && token) {
      try {
        const adUrl = `https://graph.facebook.com/v21.0/${adId}?fields=name,campaign{name},adset{name}&access_token=${token}`;
        const adRes = await fetch(adUrl);
        if (adRes.ok) {
          const adData = await adRes.json();
          if (adData.name) ad_name = adData.name;
          if (adData.campaign?.name) campaign_name = adData.campaign.name;
          if (adData.adset?.name) adset_name = adData.adset.name;
        } else {
          const errBody = await adRes.text();
          console.warn(`[Meta API - WhatsApp Referral] No se pudo consultar ad_id ${adId} (status ${adRes.status}):`, errBody);
        }
      } catch (adErr) {
        console.error("Error al consultar detalles de ad_id en Graph API desde WhatsApp:", adErr);
      }
    }
  }

  // Prospecto (persona): se busca o se crea por teléfono.
  const prospectoId = await obtenerOCrearProspecto(sb, lead, campaign_name, adset_name, ad_name);

  // Dedupe del expediente por teléfono (cualquier formato equivalente).
  const { data: existentes } = await sb
    .from("expedientes")
    .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio")
    .in("telefono", variantesTel)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string; campaign_name?: string; adset_name?: string; ad_name?: string; tipo_negocio?: string };
    const nota = `${exp.notas ?? ""}\n[WhatsApp ${hoyISO()}] ${
      lead.mensaje ?? ""
    }`.trim();

    const updateData: any = { notas: nota, ultimo_movimiento: hoyISO() };
    if (campaign_name && campaign_name !== exp.campaign_name) updateData.campaign_name = campaign_name;
    if (adset_name && adset_name !== exp.adset_name) updateData.adset_name = adset_name;
    if (ad_name && ad_name !== exp.ad_name) updateData.ad_name = ad_name;

    // Si el tipo de negocio era traspaso_compra (default) y ahora se detecta algo distinto, lo actualizamos.
    if (exp.tipo_negocio === "traspaso_compra" || !exp.tipo_negocio) {
      const detectado = detectarTipoNegocio(lead.mensaje ?? "", campaign_name);
      if (detectado !== "traspaso_compra") {
        updateData.tipo_negocio = detectado;
      }
    }

    await sb
      .from("expedientes")
      .update(updateData)
      .eq("id", exp.id);
    const nuevo = await guardarMensajeEntrante(sb, {
      telefono,
      texto: lead.mensaje ?? "",
      expedienteId: exp.id,
      prospectoId,
      waMessageId: lead.waMessageId,
    });

    // Interceptar mensajes de audio
    if (lead.audioId) {
      await manejarFlujoAudio(sb, {
        telefono,
        expedienteId: exp.id,
        prospectoId,
        clienteNombre: exp.cliente,
        tipoNegocio: exp.tipo_negocio || "Por definir"
      });
      return;
    }

    // Respuesta automática del agente de IA (si está activo y no hay humano).
    if (nuevo) await triggerResponderBackground(telefono, exp.id);
    return;
  }

  const id = await siguienteId(sb);
  const tipoNegocio = detectarTipoNegocio(lead.mensaje ?? "", campaign_name);
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
    campaign_name,
    adset_name,
    ad_name,
    tipo_negocio: tipoNegocio,
  });

  const { sincronizarEstatusProspecto } = await import("@/lib/prospectos-status");
  await sincronizarEstatusProspecto(sb, prospectoId);

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

  // Interceptar mensajes de audio
  if (lead.audioId) {
    await manejarFlujoAudio(sb, {
      telefono,
      expedienteId: id,
      prospectoId,
      clienteNombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
      tipoNegocio: tipoNegocio || "Por definir"
    });
    
    // También enviamos la bienvenida de sistema normal (pero omitiendo la respuesta de la IA)
    await enviarBienvenida(sb, id, {
      ventanaWhatsAppAbierta: true,
      omitirWhatsApp: true, // Ya respondimos con el handler de audio
    });

    // Notificar al equipo sobre el nuevo lead
    void notificarNuevoLead(id);
    return;
  }

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
  if (iaOn && nuevoMensaje) await triggerResponderBackground(telefono, id);
}

/**
 * Lógica dedicada para gestionar la llegada de mensajes de audio:
 * - Envía respuesta de texto de sistema.
 * - Registra la respuesta en la base de datos de Supabase.
 * - Envía notificaciones de alerta de WhatsApp a Oscar y Paulina de forma inmediata.
 */
async function manejarFlujoAudio(
  sb: ReturnType<typeof supabaseServidor>,
  ctx: {
    telefono: string;
    expedienteId: string;
    prospectoId: string;
    clienteNombre: string;
    tipoNegocio: string;
  }
): Promise<void> {
  const { enviarWhatsAppTexto } = await import("@/lib/whatsapp");
  
  const mensajeRespuesta = "¡Recibí tu audio! 👍 Para atenderte mejor, uno de nuestros asesores te marca en los próximos 15 minutos.";
  
  console.log(`[Audio Handler] Enviando respuesta automática de audio a ${ctx.telefono}...`);
  
  // 1. Enviar respuesta por WhatsApp
  const resSend = await enviarWhatsAppTexto(ctx.telefono, mensajeRespuesta);
  
  // 2. Registrar en la base de datos como mensaje saliente
  await sb.from("mensajes_whatsapp").insert({
    telefono: ctx.telefono,
    texto: mensajeRespuesta,
    direccion: "out",
    expediente_id: ctx.expedienteId,
    prospecto_id: ctx.prospectoId,
    agente: "Sistema",
    estado: resSend.ok ? "enviado" : "error",
    wa_message_id: resSend.messageId || null
  });

  // 3. Notificar a Oscar y Paulina
  const notifMsg = `🔊 *¡Alerta de Audio!*
*Cliente:* ${ctx.clienteNombre}
*Teléfono:* ${ctx.telefono}
*Negocio:* ${ctx.tipoNegocio}
El cliente ha enviado un audio. El bot de la IA se ha pausado para esta conversación y no responderá de forma automática. Por favor, atienda a la brevedad en el CRM.`;

  console.log("[Audio Handler] Enviando notificaciones a Oscar y Paulina...");
  
  // Oscar (524778110444)
  await enviarWhatsAppTexto("524778110444", notifMsg).catch(err => 
    console.error("Error al notificar a Oscar por audio:", err)
  );
  
  // Paulina (524772166180)
  await enviarWhatsAppTexto("524772166180", notifMsg).catch(err => 
    console.error("Error al notificar a Paulina por audio:", err)
  );
}

/**
 * Procesa actualizaciones de estado de mensajes enviados (sent, delivered, read, failed)
 * enviadas por Meta vía webhook.
 */
export async function procesarEstadosWhatsApp(payload: any): Promise<void> {
  const sb = supabaseServidor();
  
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const status of value.statuses ?? []) {
        const waMessageId = status.id; // wamid.HBgLNTI...
        const estadoMeta = status.status; // sent, delivered, read, failed
        const destinatario = status.recipient_id; // teléfono del cliente
        
        let nuevoEstado = "enviado";
        if (estadoMeta === "delivered") nuevoEstado = "delivered";
        if (estadoMeta === "read") nuevoEstado = "read";
        if (estadoMeta === "failed") nuevoEstado = "error";

        // 1. Actualizar en mensajes_whatsapp
        const { data: msgActualizado } = await sb
          .from("mensajes_whatsapp")
          .update({ estado: nuevoEstado })
          .eq("wa_message_id", waMessageId)
          .select("telefono, expediente_id, prospecto_id")
          .maybeSingle();

        // 2. Si falló y hay código de error, extraer el detalle
        let errorTxt = "";
        if (estadoMeta === "failed" && status.errors && status.errors.length > 0) {
          errorTxt = `Meta Error ${status.errors[0].code}: ${status.errors[0].title || status.errors[0].message}`;
        }

        // 3. Buscar enrolamiento activo en secuencias para este teléfono
        const phone = destinatario || msgActualizado?.telefono;
        if (phone) {
          const { data: enrollments } = await sb
            .from("sequence_enrollments")
            .select("id")
            .in("phone", variantesTelefono(phone))
            .eq("status", "activo");

          if (enrollments && enrollments.length > 0) {
            for (const en of enrollments) {
              // Buscar la última acción de whatsapp de esta secuencia
              const { data: ultimaAccion } = await sb
                .from("sequence_actions")
                .select("id")
                .eq("enrollment_id", en.id)
                .eq("canal", "whatsapp")
                .order("enviado_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (ultimaAccion) {
                let statusSecuencia = "enviado";
                if (estadoMeta === "delivered") statusSecuencia = "entregado";
                if (estadoMeta === "read") statusSecuencia = "respondido";
                if (estadoMeta === "failed") statusSecuencia = "fallido";

                await sb
                  .from("sequence_actions")
                  .update({
                    status: statusSecuencia,
                    ...(estadoMeta === "failed" ? { error_detalle: errorTxt || "Bloqueado por Meta (fuera de 24h)" } : {}),
                    ...(estadoMeta === "read" ? { respondido_at: new Date().toISOString() } : {}),
                  })
                  .eq("id", ultimaAccion.id);
              }
            }
          }
        }
      }
    }
  }
}

