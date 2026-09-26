import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { registrarVotosAsesorCoordinacion } from "@/lib/coordinacion-inspecciones";

export interface ConfiguracionTelegram {
  botToken: string;
  chatIdGrupo: string;
}

/**
 * Obtiene las credenciales del Bot de Telegram (desde configuracion_agente o env)
 */
export async function obtenerConfiguracionTelegram(
  sb?: SupabaseClient
): Promise<ConfiguracionTelegram> {
  let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  let chatIdGrupo = process.env.TELEGRAM_CHAT_ID_GRUPO || "";

  if (sb) {
    try {
      const { data: configs } = await sb
        .from("configuracion_agente")
        .select("clave, valor")
        .in("clave", ["telegram_bot_token", "telegram_chat_id_grupo"]);

      if (configs) {
        for (const c of configs) {
          if (c.clave === "telegram_bot_token" && c.valor) botToken = c.valor;
          if (c.clave === "telegram_chat_id_grupo" && c.valor) chatIdGrupo = c.valor;
        }
      }
    } catch (e) {
      console.warn("[Telegram] Error al consultar configuracion_agente:", e);
    }
  }

  return { botToken, chatIdGrupo };
}

/**
 * Guarda el token y chat ID de grupo en configuracion_agente
 */
export async function guardarConfiguracionTelegram(
  sb: SupabaseClient,
  botToken: string,
  chatIdGrupo: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const upserts = [
      { clave: "telegram_bot_token", valor: botToken },
      { clave: "telegram_chat_id_grupo", valor: chatIdGrupo },
    ];
    for (const item of upserts) {
      await sb
        .from("configuracion_agente")
        .upsert(item, { onConflict: "clave" });
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Envía un mensaje con formato y teclado interactivo a Telegram
 */
export async function enviarMensajeTelegram(params: {
  botToken?: string;
  chatId: string;
  texto: string;
  parseMode?: "Markdown" | "HTML";
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const token = params.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN no está configurado." };
  }
  if (!params.chatId) {
    return { ok: false, error: "Chat ID de Telegram requerido." };
  }

  try {
    const payload: any = {
      chat_id: params.chatId,
      text: params.texto,
      parse_mode: params.parseMode || "Markdown",
    };

    if (params.inlineKeyboard && params.inlineKeyboard.length > 0) {
      payload.reply_markup = {
        inline_keyboard: params.inlineKeyboard,
      };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error("[Telegram] Error al enviar mensaje:", data);
      return { ok: false, error: data.description || "Error al enviar a Telegram." };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    console.error("[Telegram] Excepción al enviar mensaje:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Responde a un callback_query de Telegram (cuando un asesor pulsa un botón)
 */
export async function responderCallbackQueryTelegram(
  botToken: string,
  callbackQueryId: string,
  texto: string,
  showAlert: boolean = false
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: texto,
        show_alert: showAlert,
      }),
    });
  } catch (err) {
    console.warn("[Telegram] Error en answerCallbackQuery:", err);
  }
}

/**
 * Despacha la propuesta de inspección a Telegram (al grupo técnico o a cada asesor)
 */
export async function despacharPropuestaInspeccionTelegram(
  sb: SupabaseClient,
  ctx: {
    coordinacionId: string;
    servicioNombre: string;
    ubicacion: string;
    clienteNombre: string;
    clienteTelefono: string;
    detallesTecnicos?: string;
    asesoresIds: string[];
    opciones: Array<{ id: string; label: string }>;
    slaMinutos: number;
  }
): Promise<{ ok: boolean; despachados: number; error?: string }> {
  const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) {
    return { ok: false, despachados: 0, error: "Bot token de Telegram no configurado." };
  }

  // Obtener perfiles de los asesores
  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, nombre, telegram_chat_id")
    .in("id", ctx.asesoresIds);

  const nombresAsesores = (perfiles || []).map((p) => p.nombre).join(" y ");

  const listaOpcionesTexto = ctx.opciones
    .map((o) => `👉 *Opción ${o.id}:* ${o.label}`)
    .join("\n");

  const textoMensaje = `🚨 *PROPUESTA DE INSPECCIÓN TÉCNICA*\n\nSe solicita validación de disponibilidad para acudir en equipo (*${nombresAsesores}*):\n\n🛠️ *Servicio / Negocio:* ${ctx.servicioNombre}\n📍 *Ubicación:* ${ctx.ubicacion}\n👤 *Cliente:* ${ctx.clienteNombre} (${ctx.clienteTelefono})\n📝 *Detalle:* ${ctx.detallesTecnicos || "Revisión técnica en sitio"}\n\n📅 *Opciones tentativas propuestas:*\n${listaOpcionesTexto}\n\n⏱️ *SLA:* Tienen *${ctx.slaMinutos} minutos* para responder pulsando los botones de abajo:`;

  // Construir teclado interactivo con botones
  // Fila 1: botones individuales por opción
  const fila1 = ctx.opciones.map((opc) => ({
    text: `🟢 Puedo ${opc.id}`,
    callback_data: `v:${ctx.coordinacionId}:${opc.id}:1`,
  }));

  // Fila 2: botones de respuesta global
  const fila2 = [
    {
      text: "🟢 Puedo Todas",
      callback_data: `v:${ctx.coordinacionId}:ALL:1`,
    },
    {
      text: "🔴 No Puedo Ninguna",
      callback_data: `v:${ctx.coordinacionId}:ALL:0`,
    },
  ];

  const inlineKeyboard = [fila1, fila2];

  let despachados = 0;

  // 1. Enviar al grupo técnico si está configurado
  if (chatIdGrupo) {
    const resGrupo = await enviarMensajeTelegram({
      botToken,
      chatId: chatIdGrupo,
      texto: textoMensaje,
      inlineKeyboard,
    });
    if (resGrupo.ok) despachados++;
  }

  // 2. Enviar a cada asesor a su chat personal de Telegram si tiene telegram_chat_id
  for (const asesor of perfiles || []) {
    if (asesor.telegram_chat_id && asesor.telegram_chat_id !== chatIdGrupo) {
      const resPersonal = await enviarMensajeTelegram({
        botToken,
        chatId: asesor.telegram_chat_id,
        texto: textoMensaje,
        inlineKeyboard,
      });
      if (resPersonal.ok) despachados++;
    }
  }

  return { ok: despachados > 0, despachados };
}

/**
 * Notifica la confirmación definitiva a Telegram
 */
export async function notificarConfirmacionFinalTelegram(
  sb: SupabaseClient,
  ctx: {
    coordinacionId: string;
    servicioNombre: string;
    ubicacion: string;
    clienteNombre: string;
    clienteTelefono: string;
    detallesTecnicos?: string;
    asesoresNombres: string;
    horarioConfirmado: string;
    asesoresIds: string[];
  }
): Promise<void> {
  const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return;

  const textoConfirmado = `✅ *INSPECCIÓN TÉCNICA CONFIRMADA*\n\nEl cliente *${ctx.clienteNombre}* ha confirmado su horario:\n\n🗓️ *Horario:* ${ctx.horarioConfirmado}\n🛠️ *Servicio / Negocio:* ${ctx.servicioNombre}\n📍 *Ubicación:* ${ctx.ubicacion}\n👤 *Cliente:* ${ctx.clienteNombre} (${ctx.clienteTelefono})\n👷 *Técnicos asignados:* ${ctx.asesoresNombres}\n📝 *Detalles:* ${ctx.detallesTecnicos || "Levantamiento técnico"}\n\nLa cita ya quedó agendada en la agenda del CRM. Favor de presentarse puntuales con equipo y herramientas.`;

  // Enviar al grupo técnico
  if (chatIdGrupo) {
    await enviarMensajeTelegram({
      botToken,
      chatId: chatIdGrupo,
      texto: textoConfirmado,
    });
  }

  // Enviar a los chats individuales
  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("telegram_chat_id")
    .in("id", ctx.asesoresIds);

  for (const p of perfiles || []) {
    if (p.telegram_chat_id && p.telegram_chat_id !== chatIdGrupo) {
      await enviarMensajeTelegram({
        botToken,
        chatId: p.telegram_chat_id,
        texto: textoConfirmado,
      });
    }
  }
}
