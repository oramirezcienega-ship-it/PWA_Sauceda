import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  obtenerConfiguracionTelegram,
  enviarMensajeTelegram,
  responderCallbackQueryTelegram,
} from "@/lib/telegram";
import { registrarVotosAsesorCoordinacion } from "@/lib/coordinacion-inspecciones";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseServidor();
    const update = await req.json();

    const { botToken } = await obtenerConfiguracionTelegram(sb);

    // 1. Mensaje de texto entrante (ej. /start o /id)
    if (update.message) {
      const msg = update.message;
      const chatId = String(msg.chat.id);
      const text = msg.text || "";
      const from = msg.from;

      if (text.startsWith("/start") || text.startsWith("/id")) {
        const respuesta = `👋 *¡Hola ${from?.first_name || ""}!*\n\nSoy el asistente operativo de *SAUCEDA*.\n\n📱 *Tu Telegram Chat ID es:* \`${chatId}\`\n👤 *Usuario:* @${from?.username || "sin_usuario"}\n\nCopia y proporciona este Chat ID a tu administrador para vincular tus alertas de inspecciones técnicas en sitio.`;

        await enviarMensajeTelegram({
          botToken,
          chatId,
          texto: respuesta,
        });

        // Intentar autovincular si coincide el username en perfiles
        if (from?.username) {
          await sb
            .from("perfiles")
            .update({ telegram_chat_id: chatId, telegram_username: from.username })
            .ilike("telegram_username", from.username);
        }

        return NextResponse.json({ ok: true });
      }
    }

    // 2. Pulsación de Botón Interactivo (callback_query)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data || "";
      const from = cb.from;
      const fromId = String(from.id);
      const username = from.username || "";

      // Formato esperado: v:{coordinacionId}:{opcId}:{valor}
      if (data.startsWith("v:")) {
        const [, coordId, opcId, valStr] = data.split(":");
        const puede = valStr === "1";

        // Obtener la coordinación
        const { data: coord } = await sb
          .from("coordinaciones_inspeccion")
          .select("*")
          .eq("id", coordId)
          .single();

        if (coord) {
          // Identificar al asesor correspondiente
          // 1. Por telegram_chat_id o telegram_username
          let asesorId: string | null = null;
          let asesorNombre: string = from.first_name || "Asesor";

          const { data: perfiles = [] } = await sb
            .from("perfiles")
            .select("id, nombre, telegram_chat_id, telegram_username")
            .in("id", coord.asesores_ids);

          const matchingPerfil = (perfiles || []).find(
            (p) =>
              p.telegram_chat_id === fromId ||
              (username && p.telegram_username?.toLowerCase() === username.toLowerCase())
          );

          const listaPerfiles = perfiles || [];
          if (matchingPerfil) {
            asesorId = matchingPerfil.id;
            asesorNombre = matchingPerfil.nombre;
          } else if (listaPerfiles.length > 0) {
            // Si aún no tenían vinculado el chat_id, asignar al primer asesor asignado
            asesorId = listaPerfiles[0].id;
            asesorNombre = listaPerfiles[0].nombre;
            // Guardar su telegram_chat_id para futuras pulsaciones
            await sb
              .from("perfiles")
              .update({ telegram_chat_id: fromId, telegram_username: username })
              .eq("id", asesorId);
          }

          if (asesorId) {
            const opciones = coord.opciones_horarios || [];
            let votosUpdate: Record<string, boolean> = {};

            if (opcId === "ALL") {
              // Puede todas o no puede ninguna
              for (const o of opciones) {
                votosUpdate[o.id] = puede;
              }
            } else {
              votosUpdate[opcId] = puede;
            }

            // Registrar en base de datos
            await registrarVotosAsesorCoordinacion(
              sb,
              coordId,
              asesorId,
              votosUpdate,
              `Respondido vía Telegram Bot (@${username || fromId})`
            );

            // Responder a la pulsación en Telegram
            const labelVoto = opcId === "ALL"
              ? (puede ? "todas las opciones" : "ninguna opción")
              : `Opción ${opcId}`;

            await responderCallbackQueryTelegram(
              botToken,
              cb.id,
              `¡Registrado! Marcaste ${puede ? "🟢 PUEDO" : "🔴 NO PUEDO"} para ${labelVoto}.`
            );

            // Enviar mensaje confirmando en el chat
            const msgConfirm = `✓ *${asesorNombre}* indicó ${
              puede ? "🟢 *PUEDO*" : "🔴 *NO PUEDO*"
            } para *${labelVoto}* (Cliente: ${coord.cliente_nombre})`;

            await enviarMensajeTelegram({
              botToken,
              chatId: String(cb.message?.chat?.id || fromId),
              texto: msgConfirm,
            });

            return NextResponse.json({ ok: true });
          }
        }

        // Si no se encontró coordinación
        await responderCallbackQueryTelegram(
          botToken,
          cb.id,
          "Esta propuesta ya no está activa o ya fue confirmada."
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Telegram Webhook] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}
