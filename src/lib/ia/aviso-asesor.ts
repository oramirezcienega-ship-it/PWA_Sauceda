import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";

/** No se repite el mismo aviso para el mismo chat dentro de esta ventana. */
const VENTANA_DEDUPE_MS = 6 * 60 * 60 * 1000;

function escaparHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Aviso de Sofía a un asesor humano ("transfiere a un asesor") sin pausar la IA:
 * notificación in-app (asesor del expediente + administradores), mensaje de
 * Telegram (chat personal del asesor o, si no tiene, el grupo) y actividad en
 * la bitácora. Nunca lanza: un fallo aquí no debe frenar la respuesta al cliente.
 */
export async function avisarAsesorDesdeIA(
  sb: SupabaseClient,
  datos: {
    telefono: string;
    motivo: string;
    expedienteId: string | null;
    prospectoId: string | null;
    asesorId: string | null;
    nombreCliente: string;
  },
): Promise<void> {
  try {
    const motivo = datos.motivo.trim().slice(0, 300);
    if (!motivo) return;
    const enlace = `/conversaciones?tel=${encodeURIComponent(datos.telefono)}`;
    const titulo = `🙋 Sofía pide apoyo: ${datos.nombreCliente || datos.telefono}`;

    // Evita repetir el aviso si Sofía lo vuelve a marcar en los siguientes turnos.
    const desde = new Date(Date.now() - VENTANA_DEDUPE_MS).toISOString();
    const { data: previos } = await sb
      .from("notificaciones")
      .select("id")
      .eq("enlace", enlace)
      .eq("cuerpo", motivo)
      .gte("created_at", desde)
      .limit(1);
    if (previos && previos.length > 0) return;

    const { data: perfiles } = await sb
      .from("perfiles")
      .select("id, rol, activo, telegram_chat_id")
      .eq("activo", true);
    const lista = (perfiles as { id: string; rol: string; telegram_chat_id: string | null }[] | null) ?? [];
    const destinatarios = lista.filter((p) => p.rol === "admin" || p.id === datos.asesorId);
    if (destinatarios.length > 0) {
      await sb.from("notificaciones").insert(
        destinatarios.map((p) => ({
          perfil_id: p.id,
          titulo,
          cuerpo: motivo,
          enlace,
          leido: false,
        })),
      );
    }

    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    const asesor = lista.find((p) => p.id === datos.asesorId);
    const chatId = asesor?.telegram_chat_id || chatIdGrupo;
    if (botToken && chatId) {
      const siteUrl = process.env.SITE_URL || "https://crm.saucedamx.com";
      await enviarMensajeTelegram({
        botToken,
        chatId,
        parseMode: "HTML",
        texto:
          `🙋 <b>Sofía pide apoyo de un asesor</b>\n` +
          `👤 ${escaparHtml(datos.nombreCliente || "Cliente")} · ${escaparHtml(datos.telefono)}\n` +
          `📝 ${escaparHtml(motivo)}\n` +
          `💬 ${siteUrl}${enlace}`,
      });
    }

    await registrarActividad(sb, {
      expedienteId: datos.expedienteId,
      prospectoId: datos.prospectoId,
      tipo: "sistema",
      titulo: "🙋 Sofía pidió apoyo de un asesor",
      detalle: motivo,
    });
  } catch (err) {
    console.error("[IA Aviso asesor] Error al avisar al asesor:", err);
  }
}
