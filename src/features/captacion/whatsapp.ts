import { supabaseServidor } from "@/lib/supabase/server";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { iaAgenteActivo } from "@/lib/ia/agente";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";
import { transcribirAudioMeta } from "@/lib/ia/audio";
import { procesarRetroAsesorWhatsApp } from "@/lib/retro-whatsapp";
import { detectarTipoNegocio } from "@/lib/types";
import { obtenerIdAsesorGerardo } from "@/lib/asesores";
import { interpretarErrorMeta } from "@/lib/whatsapp";
import { insertarExpedienteSeguro } from "@/lib/expedientes-insert";

// Semáforo en memoria para consolidar mensajes consecutivos en ráfaga
const debounceMap = new Map<string, number>();

/** Dispara el procesamiento de respuesta de la IA con debounce y protección contra duplicados */
export async function triggerResponderBackground(
  telefono: string,
  expedienteId?: string | null,
): Promise<void> {
  const telNormalizado = normalizarTelefono(telefono);
  const timestampLlegada = Date.now();
  debounceMap.set(telNormalizado, timestampLlegada);

  // Breve espera de 3s para permitir que mensajes en ráfaga del cliente se consoliden
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Si llegó un mensaje más reciente para el mismo número durante la espera, ceder el paso
  if (debounceMap.get(telNormalizado) !== timestampLlegada) {
    console.log(`[IA Debounce] Cediendo turno al mensaje más reciente para ${telefono}`);
    return;
  }

  try {
    console.log(`[IA Trigger Direct] Ejecutando respuesta automática de IA para ${telefono}...`);
    const { responderConIA } = await import("@/lib/ia/agente");
    const sb = supabaseServidor();
    await responderConIA(sb, { telefono, expedienteId });
    console.log(`[IA Trigger Direct] Respuesta de IA completada para ${telefono}`);
  } catch (err) {
    console.error(`[IA Trigger Direct] Error al ejecutar responderConIA para ${telefono}:`, err);
  } finally {
    if (debounceMap.get(telNormalizado) === timestampLlegada) {
      debounceMap.delete(telNormalizado);
    }
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
          image?: { id?: string; caption?: string };
          sticker?: { id?: string };
          video?: { id?: string; caption?: string };
          document?: { id?: string; filename?: string; caption?: string; mime_type?: string };
          reaction?: { message_id?: string; emoji?: string };
          contacts?: Array<{
            name?: { formatted_name?: string; first_name?: string; last_name?: string };
            phones?: Array<{ phone?: string; type?: string; wa_id?: string }>;
            emails?: Array<{ email?: string; type?: string }>;
          }>;
          location?: {
            latitude?: number;
            longitude?: number;
            name?: string;
            address?: string;
          };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string; description?: string };
          };
          button?: { text?: string };
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
        
        let texto = m.text?.body;
        if (!texto && m.type) {
          if (m.type === "image" && m.image?.id) {
            texto = `[image:${m.image.id}]${m.image.caption ? ' ' + m.image.caption : ''}`;
          } else if (m.type === "sticker" && m.sticker?.id) {
            texto = `[sticker:${m.sticker.id}]`;
          } else if (m.type === "reaction" && m.reaction) {
            const emoji = m.reaction.emoji;
            texto = emoji ? `[reacción: ${emoji}]` : `[reacción: quitada]`;
          } else if (m.type === "video" && m.video?.id) {
            texto = `[video:${m.video.id}]${m.video.caption ? ' ' + m.video.caption : ''}`;
          } else if (m.type === "document" && m.document?.id && m.document.mime_type?.startsWith("audio/")) {
            // Archivo de audio enviado como documento (mp3, m4a...): se trata igual que una nota de voz.
            texto = `[audio:${m.document.id}] (mensaje de tipo audio)`;
          } else if (m.type === "document" && m.document?.id) {
            texto = `[document:${m.document.id}]${m.document.filename ? ' ' + (m.document.filename || m.document.caption || '') : ''}`;
          } else if (m.type === "audio" && m.audio?.id) {
            texto = `[audio:${m.audio.id}] (mensaje de tipo audio)`;
          } else if (m.type === "contacts" && m.contacts?.length) {
            const c = m.contacts[0];
            const name = c.name?.formatted_name || [c.name?.first_name, c.name?.last_name].filter(Boolean).join(" ") || "Contacto";
            const phone = c.phones?.[0]?.phone || "";
            const email = c.emails?.[0]?.email || "";
            texto = `[contact:${name}|${phone}|${email}]`;
          } else if (m.type === "location" && m.location) {
            const { latitude, longitude, name, address } = m.location;
            texto = `[location:${latitude},${longitude}|${name || ''}|${address || ''}]`;
          } else if (m.type === "interactive" && m.interactive) {
            const btn = m.interactive.button_reply?.title || m.interactive.list_reply?.title;
            texto = btn ? `[opción: ${btn}]` : `(mensaje interactivo)`;
          } else if (m.type === "button" && m.button?.text) {
            texto = `[botón: ${m.button.text}]`;
          } else {
            texto = `(mensaje de tipo ${m.type})`;
          }
        }

        mensajes.push({
          telefono: m.from,
          nombre: nombrePorWaId[m.from],
          mensaje: texto,
          waMessageId: m.id,
          audioId: m.type === "audio"
            ? m.audio?.id
            : m.type === "document" && m.document?.mime_type?.startsWith("audio/") ? m.document.id : undefined,
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
    const esFallbackEstimado = ad_name === "Atribución Estimada (Pauta Activa)";

    // Si viene de fallback estimado, solo rellenar si el prospecto no tenía ya campaña previa
    if (campaign_name && campaign_name !== pr.campaign_name) {
      if (!esFallbackEstimado || !pr.campaign_name) {
        updateAttrs.campaign_name = campaign_name;
      }
    }
    if (adset_name && adset_name !== pr.adset_name) {
      if (!esFallbackEstimado || !pr.adset_name) {
        updateAttrs.adset_name = adset_name;
      }
    }
    if (ad_name && ad_name !== pr.ad_name) {
      if (!esFallbackEstimado || !pr.ad_name) {
        updateAttrs.ad_name = ad_name;
      }
    }

    if (Object.keys(updateAttrs).length > 0) {
      await sb.from("prospectos").update(updateAttrs).eq("id", pr.id);
    }
    return pr.id as string;
  }

  const id = await siguienteIdProspecto(sb);
  const asesorId = await obtenerIdAsesorGerardo(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    telefono: normalizarTelefono(lead.telefono),
    origen: "whatsapp",
    campaign_name,
    adset_name,
    ad_name,
    asesor_id: asesorId,
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

/** Etiqueta oficial asignada a atribuciones estimadas cuando Meta descarta el payload */
export const ATRIBUCION_ESTIMADA_LABEL = "Atribución Estimada (Pauta Activa)";

/** Reglas de palabras clave de servicio para asignación de fallback de campañas activas */
export interface ReglaServicioFallback {
  id: string;
  nombre: string;
  patron: RegExp;
  terminosBusqueda: string[];
  campanaDefault: string;
  adsetDefault: string;
}

export const REGLAS_FALLBACK_SERVICIOS: ReglaServicioFallback[] = [
  // Va primero: "cámara en la azotea" no debe caer en Impermeabilización.
  {
    id: "seguridad",
    nombre: "Seguridad",
    patron: /(?:c[aá]maras?\b|cctv|videovigilancia|videoportero|interf[oó]n|alarmas?\b|cerco\s*el[eé]ctrico|cerca\s*el[eé]ctrica|seguridad(?!\s*social))/i,
    terminosBusqueda: ["seguridad", "camara", "cámara", "cctv", "alarma"],
    campanaDefault: "SAUCEDA Seguridad - Oct 2026",
    adsetDefault: "Seguridad",
  },
  {
    id: "impermeabilizacion",
    nombre: "Impermeabilización",
    patron: /(?:impermeabili|gotera|filtraci|humedad|azotea|rollo\s*prefabricado|acrilic|malla|techo\s*filtr|fuga\s*en\s*techo)/i,
    terminosBusqueda: ["impermeabili", "imper"],
    campanaDefault: "SAUCEDA Construye Impermeabilizacion - Jul 2026",
    adsetDefault: "Impermeabilizacion",
  },
  {
    id: "remodelacion",
    nombre: "Remodelación",
    patron: /(?:remodela|acabado|azulejo|cocina|bañ|recamar|amplia|albanil|muro|tablaroca|yeso|piso\s*ceram)/i,
    terminosBusqueda: ["remodela", "construye"],
    campanaDefault: "SAUCEDA Construye Remodelacion - Jul 2026",
    adsetDefault: "Remodelacion",
  },
  {
    id: "herreria",
    nombre: "Herrería",
    patron: /(?:herreri|porton|protecci|barandal|reja|techumbr|saguan|zaguan|estructura\s*metal)/i,
    terminosBusqueda: ["herreri", "porton"],
    campanaDefault: "SAUCEDA Construye Herreria - Jul 2026",
    adsetDefault: "Herreria",
  },
  {
    id: "cisternas_tinacos",
    nombre: "Cisternas y Tinacos",
    patron: /(?:tinaco|rotoplas|cisterna|aljibe|lavado\s*de\s*tinaco|lavado\s*de\s*cisterna)/i,
    terminosBusqueda: ["cisterna", "tinaco", "aljibe"],
    campanaDefault: "SAUCEDA Cisternas y Tinacos - Jul 2026",
    adsetDefault: "Cisternas y Tinacos",
  },
  {
    id: "piso_estampado",
    nombre: "Piso Estampado",
    patron: /(?:estampado|concreto\s*estampado|piso\s*estampado)/i,
    terminosBusqueda: ["estampado", "piso estampado"],
    campanaDefault: "SAUCEDA Construye Piso Estampado - Jul 2026",
    adsetDefault: "Piso Estampado",
  },
  {
    id: "tramite_infonavit",
    nombre: "Trámite y Acompañamiento Infonavit",
    patron: /(?:tramite|trámite|acompañamiento|acompanamiento|asesoria|asesoría|precalificaci|puntos\s*infonavit|credito\s*infonavit|crédito\s*infonavit)/i,
    terminosBusqueda: ["tramite", "trámite", "asesoria", "infonavit"],
    campanaDefault: "SAUCEDA Compra Tramite - Sep 2026",
    adsetDefault: "Tramite y Asesoria",
  },
  {
    id: "inmobiliaria_traspasos",
    nombre: "Traspasos e Inmobiliaria",
    patron: /(?:traspaso|compramos\s*tu\s*casa|vender\s*casa|deuda\s*de\s*casa)/i,
    terminosBusqueda: ["leads", "traspaso", "compramos"],
    campanaDefault: "Sauceda Campaña leads 05.2026",
    adsetDefault: "Sauceda Leads",
  },
];

/**
 * Resuelve el edge case de Meta Ads (Click-to-WhatsApp donde el usuario edita o borra el texto predeterminado):
 * 1. Comprueba si el mensaje del cliente contiene palabras clave de algún servicio activo.
 * 2. Si coincide, busca en `meta_ads_gastos` si hay una campaña activa en la fecha.
 * 3. Si existe, usa esa campaña; si no, recurre a la campaña activa correspondiente en el catálogo.
 * 4. Asigna la etiqueta `ad_name: "Atribución Estimada (Pauta Activa)"`.
 */
export async function inferirAtribucionFallbackMeta(
  sb: ReturnType<typeof supabaseServidor>,
  primerMensaje: string,
  fechaReferencia?: string,
): Promise<{ campaign_name: string; adset_name: string; ad_name: string } | null> {
  const msg = (primerMensaje || "").trim();
  if (!msg) return null;

  // 1. Identificar si el mensaje coincide con alguna regla de servicio por palabras clave
  const reglaCoincidente = REGLAS_FALLBACK_SERVICIOS.find((r) => r.patron.test(msg));
  if (!reglaCoincidente) {
    return null;
  }

  const fechaHoy = fechaReferencia || hoyISO();

  try {
    // 2. Revisar si ese día hay una campaña activa en `meta_ads_gastos`
    const { data: gastosActivos, error: errGastos } = await sb
      .from("meta_ads_gastos")
      .select("campaign_name, centro_costos, producto_servicio, fecha_inicio, fecha_fin")
      .lte("fecha_inicio", fechaHoy)
      .or(`fecha_fin.is.null,fecha_fin.gte.${fechaHoy}`)
      .neq("estatus_contable", "RECHAZADO")
      .order("fecha_inicio", { ascending: false });

    if (errGastos) {
      console.warn("[Atribución Fallback] Advertencia al consultar meta_ads_gastos activos:", errGastos.message);
    }

    let campanaEncontrada: { campaign_name: string; adset_name?: string } | null = null;

    const coincideConServicio = (item: any, terminos: string[]) => {
      const textoItem = [item.campaign_name, item.centro_costos, item.producto_servicio]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terminos.some((t) => textoItem.includes(t.toLowerCase()));
    };

    if (gastosActivos && gastosActivos.length > 0) {
      const gastoMatch = gastosActivos.find((g) => coincideConServicio(g, reglaCoincidente.terminosBusqueda));
      if (gastoMatch && gastoMatch.campaign_name) {
        campanaEncontrada = {
          campaign_name: gastoMatch.campaign_name,
          adset_name: gastoMatch.producto_servicio || reglaCoincidente.adsetDefault,
        };
      }
    }

    // 3. Si no hubo registro activo para hoy, revisar campañas recientes en meta_ads_gastos (últimos 60 días)
    if (!campanaEncontrada) {
      const { data: gastosRecientes } = await sb
        .from("meta_ads_gastos")
        .select("campaign_name, centro_costos, producto_servicio, fecha_inicio, fecha_fin")
        .neq("estatus_contable", "RECHAZADO")
        .order("fecha_inicio", { ascending: false })
        .limit(50);

      if (gastosRecientes && gastosRecientes.length > 0) {
        const matchReciente = gastosRecientes.find((g) => coincideConServicio(g, reglaCoincidente.terminosBusqueda));
        if (matchReciente && matchReciente.campaign_name) {
          campanaEncontrada = {
            campaign_name: matchReciente.campaign_name,
            adset_name: matchReciente.producto_servicio || reglaCoincidente.adsetDefault,
          };
        }
      }
    }

    const campaign_name = campanaEncontrada?.campaign_name || reglaCoincidente.campanaDefault;
    const adset_name = campanaEncontrada?.adset_name || reglaCoincidente.adsetDefault;

    return {
      campaign_name,
      adset_name,
      ad_name: ATRIBUCION_ESTIMADA_LABEL,
    };
  } catch (err) {
    console.error("[Atribución Fallback] Error en consulta de fallback:", err);
    return {
      campaign_name: reglaCoincidente.campanaDefault,
      adset_name: reglaCoincidente.adsetDefault,
      ad_name: ATRIBUCION_ESTIMADA_LABEL,
    };
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

  // Si es un audio, transcribirlo antes de continuar. Si se logra, Sofía contesta
  // con normalidad; si no, se pausa y se avisa al equipo (manejarFlujoAudio).
  let audioSinTranscribir = false;
  if (lead.audioId) {
    audioSinTranscribir = true;
    try {
      console.log(`[WhatsApp Inbound Voice] Se detectó audio con id ${lead.audioId} para ${lead.telefono}. Transcribiendo...`);
      const textoTranscrito = await transcribirAudioMeta(lead.audioId);
      if (textoTranscrito && textoTranscrito !== "(audio sin voz entendible)") {
        lead.mensaje = `[audio:${lead.audioId}] ${textoTranscrito}`;
        audioSinTranscribir = false;
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

  // Asesor dando retroalimentación de sus clientes (escribió "RETRO"): no es un lead.
  try {
    const consumido = await procesarRetroAsesorWhatsApp(sb, {
      telefono: lead.telefono,
      texto: lead.mensaje ?? "",
      waMessageId: lead.waMessageId,
    });
    if (consumido) return;
  } catch (err) {
    console.error("[Retro WhatsApp] Error procesando retro del asesor:", err);
  }

  // Teléfono normalizado (canónico) y sus variantes para deduplicar.
  const telefono = normalizarTelefono(lead.telefono);
  const variantesTel = variantesTelefono(lead.telefono);

  // Atribución de campaña
  let campaign_name = lead.campaign_name || "";
  let adset_name = lead.adset_name || "";
  let ad_name = lead.ad_name || "";

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

  // Fallback de Atribución (Edge Case de Meta: cuando el cliente borra o edita el texto del anuncio en Click-to-WhatsApp)
  if (!campaign_name) {
    const fallback = await inferirAtribucionFallbackMeta(sb, lead.mensaje ?? "");
    if (fallback) {
      campaign_name = fallback.campaign_name;
      adset_name = fallback.adset_name;
      ad_name = fallback.ad_name;
      console.log(`[Atribución Fallback] Asignada campaña estimada para lead ${lead.telefono}: ${campaign_name} / ${adset_name} / ${ad_name}`);
    }
  }

  // Prospecto (persona): se busca o se crea por teléfono.
  const prospectoId = await obtenerOCrearProspecto(sb, lead, campaign_name, adset_name, ad_name);

  // 1. Detección de token universal (Handshake Enlace Puente wa.me)
  // Formato universal esperado: [EXP-XXX], [COT-XXX], [PRO-XXX], EXP-XXX, COT-XXX o PRO-XXX
  const tokenMatch = (lead.mensaje ?? "").match(/(?:EXP|COT|PRO)-[A-Za-z0-9-_]+/i);
  let expEncontrado: {
    id: string;
    notas: string;
    campaign_name?: string;
    adset_name?: string;
    ad_name?: string;
    tipo_negocio?: string;
    cliente?: string;
    telefono?: string;
    prospecto_id?: string;
    fraccionamiento?: string;
  } | null = null;
  let handshakePorToken = false;

  if (tokenMatch) {
    const tokenId = tokenMatch[0].toUpperCase();

    if (tokenId.startsWith("PRO-")) {
      // Buscar el expediente asociado a este folio de prospecto
      const { data: exps } = await sb
        .from("expedientes")
        .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio, cliente, telefono, prospecto_id, fraccionamiento")
        .eq("prospecto_id", tokenId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (exps && exps.length > 0) {
        expEncontrado = exps[0] as any;
        handshakePorToken = true;
        console.log(`[WhatsApp Puente Universal] Handshake exitoso: token prospecto [${tokenId}] vinculado a expediente ${expEncontrado?.id}`);
      }
    } else if (tokenId.startsWith("COT-")) {
      // Buscar expediente directamente por id o a través de la tabla cotizaciones
      const { data: eCot } = await sb
        .from("expedientes")
        .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio, cliente, telefono, prospecto_id, fraccionamiento")
        .eq("id", tokenId)
        .maybeSingle();

      if (eCot) {
        expEncontrado = eCot as any;
        handshakePorToken = true;
      } else {
        const { data: cot } = await sb
          .from("cotizaciones")
          .select("expediente_id")
          .eq("id", tokenId)
          .maybeSingle();

        if (cot?.expediente_id) {
          const { data: expDeCot } = await sb
            .from("expedientes")
            .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio, cliente, telefono, prospecto_id, fraccionamiento")
            .eq("id", cot.expediente_id)
            .maybeSingle();
          if (expDeCot) {
            expEncontrado = expDeCot as any;
            handshakePorToken = true;
          }
        }
      }
      if (handshakePorToken) {
        console.log(`[WhatsApp Puente Universal] Handshake exitoso: cotización [${tokenId}] vinculada a expediente ${expEncontrado?.id}`);
      }
    } else {
      // Folio EXP-XXX
      const { data: eToken } = await sb
        .from("expedientes")
        .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio, cliente, telefono, prospecto_id, fraccionamiento")
        .eq("id", tokenId)
        .maybeSingle();

      if (eToken) {
        expEncontrado = eToken as any;
        handshakePorToken = true;
        console.log(`[WhatsApp Puente Universal] Handshake exitoso: token expediente [${tokenId}] vinculado a ${eToken.id}`);
      }
    }
  }

  // Dedupe del expediente por teléfono si no se resolvió por token
  if (!expEncontrado) {
    const { data: existentes } = await sb
      .from("expedientes")
      .select("id, notas, campaign_name, adset_name, ad_name, tipo_negocio, cliente, telefono, prospecto_id")
      .in("telefono", variantesTel)
      .limit(1);

    if (existentes && existentes.length > 0) {
      expEncontrado = existentes[0] as any;
    }
  }

  if (expEncontrado) {
    const exp = expEncontrado;
    const prefijoNota = handshakePorToken ? `[WhatsApp Puente Token ${hoyISO()}]` : `[WhatsApp ${hoyISO()}]`;
    const nota = `${exp.notas ?? ""}\n${prefijoNota} ${
      lead.mensaje ?? ""
    }`.trim();

    const esFallbackEstimado = ad_name === ATRIBUCION_ESTIMADA_LABEL;
    const updateData: any = { notas: nota, ultimo_movimiento: hoyISO() };
    if (campaign_name && campaign_name !== exp.campaign_name) {
      if (!esFallbackEstimado || !exp.campaign_name) {
        updateData.campaign_name = campaign_name;
      }
    }
    if (adset_name && adset_name !== exp.adset_name) {
      if (!esFallbackEstimado || !exp.adset_name) {
        updateData.adset_name = adset_name;
      }
    }
    if (ad_name && ad_name !== exp.ad_name) {
      if (!esFallbackEstimado || !exp.ad_name) {
        updateData.ad_name = ad_name;
      }
    }

    // Si el expediente no tenía teléfono o cambió de línea (puente), sincronizar el teléfono actual
    if (!exp.telefono) {
      updateData.telefono = telefono;
    }

    // Si el tipo de negocio era traspaso_compra (default), cayó en "otro" o no tenía, y ahora se detecta algo específico, lo actualizamos.
    if (exp.tipo_negocio === "traspaso_compra" || !exp.tipo_negocio || exp.tipo_negocio === "otro") {
      const effectiveCampaign = campaign_name || exp.campaign_name || "";
      const effectiveAdset = adset_name || exp.adset_name || "";
      const effectiveAd = ad_name || exp.ad_name || "";
      const metaContext = [effectiveCampaign, effectiveAdset, effectiveAd].filter(Boolean).join(" ");
      const detectado = detectarTipoNegocio(
        lead.mensaje ?? "",
        metaContext
      );
      if (detectado !== "traspaso_compra" && detectado !== "otro") {
        updateData.tipo_negocio = detectado;
      }
    }

    await sb
      .from("expedientes")
      .update(updateData)
      .eq("id", exp.id);

    const efectivoProspectoId = exp.prospecto_id || prospectoId;

    const nuevo = await guardarMensajeEntrante(sb, {
      telefono,
      texto: lead.mensaje ?? "",
      expedienteId: exp.id,
      prospectoId: efectivoProspectoId,
      waMessageId: lead.waMessageId,
    });

    // Audio que no se pudo transcribir: pausa y aviso al equipo.
    if (audioSinTranscribir) {
      await manejarFlujoAudio(sb, {
        telefono,
        expedienteId: exp.id,
        prospectoId: efectivoProspectoId,
        clienteNombre: exp.cliente || "",
        tipoNegocio: exp.tipo_negocio || "Por definir"
      });
      return;
    }

    // Respuesta automática del agente de IA (si está activo y no hay humano).
    if (nuevo) await triggerResponderBackground(telefono, exp.id);
    return;
  }

  const id = await siguienteId(sb);
  const asesorId = await obtenerIdAsesorGerardo(sb);
  const tipoNegocio = detectarTipoNegocio(
    lead.mensaje ?? "",
    [campaign_name, adset_name, ad_name].filter(Boolean).join(" ")
  );
  await insertarExpedienteSeguro(sb, {
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
    asesor_id: asesorId,
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

  // Audio que no se pudo transcribir: pausa y aviso al equipo.
  if (audioSinTranscribir) {
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
  // Best-effort: un fallo aquí no debe impedir que Sofía conteste.
  try {
    await enviarBienvenida(sb, id, {
      ventanaWhatsAppAbierta: true,
      omitirWhatsApp: iaOn,
    });
    // Automatizaciones: expediente nuevo captado por WhatsApp.
    await dispararEvento(sb, "nuevo-expediente", {
      expedienteId: id,
      prospectoId,
    });
  } catch (err) {
    console.error(`[WhatsApp] Bienvenida/automatizaciones fallaron para ${id}:`, err);
  }
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
El cliente ha enviado un audio que no se pudo transcribir. El bot de la IA se ha pausado para esta conversación y no responderá de forma automática. Por favor, atienda a la brevedad en el CRM.`;

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
        let errorTxt = "";
        let errorCode: number | null = null;
        if (estadoMeta === "failed") {
          if (status.errors && status.errors.length > 0) {
            const errObj = status.errors[0];
            errorCode = errObj.code || null;
            errorTxt = interpretarErrorMeta(errorCode ?? undefined, errObj.message || errObj.title);
          }
          nuevoEstado = errorTxt ? `error:${errorTxt}` : "error";
        }

        // 1. Actualizar en mensajes_whatsapp con trazabilidad de lectura y entrega
        const updatePayload: Record<string, any> = { estado: nuevoEstado };
        if (estadoMeta === "read") {
          if (status.timestamp) {
            const unixSec = parseInt(status.timestamp, 10);
            updatePayload.leido_at = !isNaN(unixSec)
              ? new Date(unixSec * 1000).toISOString()
              : new Date().toISOString();
          } else {
            updatePayload.leido_at = new Date().toISOString();
          }
        } else if (estadoMeta === "delivered") {
          if (status.timestamp) {
            const unixSec = parseInt(status.timestamp, 10);
            updatePayload.entregado_at = !isNaN(unixSec)
              ? new Date(unixSec * 1000).toISOString()
              : new Date().toISOString();
          } else {
            updatePayload.entregado_at = new Date().toISOString();
          }
        }
        if (estadoMeta === "failed") {
          if (errorTxt) updatePayload.error_detalle = errorTxt;
          if (errorCode) updatePayload.error_codigo = errorCode;
        }

        let { data: msgActualizado } = await sb
          .from("mensajes_whatsapp")
          .update(updatePayload)
          .eq("wa_message_id", waMessageId)
          .select("telefono, expediente_id, prospecto_id, campana_origen, leido_at, entregado_at")
          .maybeSingle();

        // 1.0 Fallback de resiliencia: si el mensaje no existía previamente en mensajes_whatsapp
        // (por ejemplo, enviado por Mautic / despachador externo sin registrar en Supabase antes de ser entregado o leído):
        if (!msgActualizado && waMessageId && destinatario) {
          try {
            const variantes = variantesTelefono(destinatario);
            let prospectoId: string | null = null;
            let expedienteId: string | null = null;

            const { data: prospecto } = await sb
              .from("prospectos")
              .select("id, expediente_id")
              .in("telefono", variantes)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (prospecto) {
              prospectoId = prospecto.id;
              expedienteId = prospecto.expediente_id || null;
            } else {
              const { data: exp } = await sb
                .from("expedientes")
                .select("id, prospecto_id")
                .in("telefono", variantes)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (exp) {
                expedienteId = exp.id;
                prospectoId = exp.prospecto_id || null;
              }
            }

            const insertPayload: Record<string, any> = {
              telefono: destinatario,
              direccion: "out",
              // No sabemos quién lo envió (Mautic, otra herramienta o un envío del CRM que no
              // se guardó): no se atribuye a ninguna campaña para no confundir al asesor.
              texto: "[Mensaje de WhatsApp enviado sin registro en el CRM (plantilla o automatización externa)]",
              wa_message_id: waMessageId,
              estado: nuevoEstado,
              agente: "Envío sin registro",
              canal_id: "whatsapp",
              created_at: status.timestamp && !isNaN(parseInt(status.timestamp, 10))
                ? new Date(parseInt(status.timestamp, 10) * 1000).toISOString()
                : new Date().toISOString(),
              ...updatePayload,
            };
            if (prospectoId) insertPayload.prospecto_id = prospectoId;
            if (expedienteId) insertPayload.expediente_id = expedienteId;
            if (estadoMeta === "read" && !insertPayload.entregado_at) {
              insertPayload.entregado_at = insertPayload.leido_at;
            }

            const { data: nuevoMsg, error: errInsert } = await sb
              .from("mensajes_whatsapp")
              .insert(insertPayload)
              .select("telefono, expediente_id, prospecto_id, campana_origen, leido_at, entregado_at")
              .maybeSingle();

            if (!errInsert && nuevoMsg) {
              msgActualizado = nuevoMsg;
              console.log(`[WhatsApp Webhook] Auto-registrado mensaje huérfano de campaña: wamid=${waMessageId}, tel=${destinatario}, estado=${nuevoEstado}`);
            } else if (errInsert) {
              // Si falla por campana_origen o columnas no migradas, reintentar con inserción básica
              console.warn("[WhatsApp Webhook] Reintentando inserción básica sin campos extendidos:", errInsert.message);
              const insertBasico: Record<string, any> = {
                telefono: destinatario,
                direccion: "out",
                texto: "[Mensaje de WhatsApp enviado sin registro en el CRM (plantilla o automatización externa)]",
                wa_message_id: waMessageId,
                estado: nuevoEstado,
                canal_id: "whatsapp",
              };
              if (prospectoId) insertBasico.prospecto_id = prospectoId;
              if (expedienteId) insertBasico.expediente_id = expedienteId;
              const { data: msgBasico } = await sb
                .from("mensajes_whatsapp")
                .insert(insertBasico)
                .select("telefono, expediente_id, prospecto_id, campana_origen, leido_at, entregado_at")
                .maybeSingle();
              if (msgBasico) {
                msgActualizado = msgBasico;
              }
            }
          } catch (eAuto) {
            console.warn("[WhatsApp Webhook] Fallo en auto-registro de mensaje huérfano:", eAuto);
          }
        }

        // 1.1 Si la cita está vinculada por wa_message_id, actualizar su estado directamente
        try {
          await sb
            .from("agenda_citas")
            .update({ mensaje_whatsapp_estado: nuevoEstado })
            .eq("wa_message_id", waMessageId);
        } catch {
          // Ignorar si la columna aún no está migrada
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

