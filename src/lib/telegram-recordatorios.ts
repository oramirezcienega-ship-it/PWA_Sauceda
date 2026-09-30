import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";

/**
 * Recordatorio por Telegram (chat personal) a los asesores que aún no responden
 * una propuesta de inspección; incluye los mismos botones de respuesta.
 */
export async function recordarPropuestaInspeccionTelegram(
  sb: SupabaseClient,
  ctx: {
    coordinacionId: string;
    clienteNombre: string;
    servicioNombre: string;
    ubicacion: string;
    opciones: Array<{ id: string; label: string }>;
    asesoresIds: string[];
  }
): Promise<{ enviados: number }> {
  const { botToken } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return { enviados: 0 };

  const { data: perfiles = [] } = await sb
    .from("perfiles")
    .select("id, telegram_chat_id")
    .in("id", ctx.asesoresIds);

  const lista = ctx.opciones.map((o) => `👉 *Opción ${o.id}:* ${o.label}`).join("\n");
  const texto = `⏰ *RECORDATORIO · Inspección técnica pendiente de tu respuesta*\n\n👤 *Cliente:* ${ctx.clienteNombre}\n🛠️ *Servicio:* ${ctx.servicioNombre}\n📍 *Ubicación:* ${ctx.ubicacion}\n\n📅 *Opciones:*\n${lista}\n\nPor favor responde hoy con los botones de abajo:`;

  const inlineKeyboard = [
    ctx.opciones.map((o) => ({ text: `🟢 Puedo ${o.id}`, callback_data: `v:${ctx.coordinacionId}:${o.id}:1` })),
    [
      { text: "🟢 Puedo Todas", callback_data: `v:${ctx.coordinacionId}:ALL:1` },
      { text: "🔴 No Puedo Ninguna", callback_data: `v:${ctx.coordinacionId}:ALL:0` },
    ],
    [{ text: "👀 Enterado (ya lo leí)", callback_data: `e:${ctx.coordinacionId}` }],
    [{ text: "📅 Ninguna me acomoda · proponer otro día", callback_data: `n:${ctx.coordinacionId}` }],
  ];

  let enviados = 0;
  for (const p of perfiles || []) {
    if (!p.telegram_chat_id) continue;
    const r = await enviarMensajeTelegram({ botToken, chatId: p.telegram_chat_id, texto, inlineKeyboard });
    if (r.ok) enviados++;
  }
  return { enviados };
}
