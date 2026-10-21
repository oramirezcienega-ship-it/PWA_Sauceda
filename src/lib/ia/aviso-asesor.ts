import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";

/**
 * Un aviso por conversación dentro de esta ventana, aunque Sofía redacte el
 * motivo distinto en cada turno (antes se comparaba el texto exacto y pasaban todos).
 */
const VENTANA_DEDUPE_MS = 4 * 60 * 60 * 1000;
/** Los urgentes sí pueden repetirse, pero no más de uno por hora por conversación. */
const VENTANA_DEDUPE_URGENTE_MS = 60 * 60 * 1000;

const PREFIJO_TITULO = "🙋 Sofía pide apoyo";

/** Cliente molesto, cita/visita o pago: siempre amerita interrumpir al asesor. */
const RE_URGENTE = /molest|inconform|queja|reclam|no lleg|no asisti|cancel|liga de (mercado )?pago|anticipo|visita t[eé]cnica|urgente/i;

/** Avisos que ameritan Telegram; el resto se queda como notificación in-app. */
function clasificarAviso(motivo: string): { urgente: boolean; telegram: boolean } {
  const urgente = RE_URGENTE.test(motivo);
  return { urgente, telegram: urgente };
}

/** Últimos 10 dígitos: el mismo chat llega a veces con y sin el 52. */
function claveTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : telefono;
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Aviso de Sofía a un asesor humano ("transfiere a un asesor") sin pausar la IA:
 * notificación in-app (asesor del expediente + administradores), mensaje de
 * Telegram solo si es urgente (chat personal del asesor o, si
 * no tiene, el grupo) y actividad en
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
    const titulo = `${PREFIJO_TITULO}: ${datos.nombreCliente || datos.telefono}`;
    const { telegram } = clasificarAviso(motivo);

    // Evita repetir el aviso si Sofía lo vuelve a marcar en los siguientes turnos.
    const desde = new Date(Date.now() - (telegram ? VENTANA_DEDUPE_URGENTE_MS : VENTANA_DEDUPE_MS)).toISOString();
    const { data: previos } = await sb
      .from("notificaciones")
      .select("id")
      .like("titulo", `${PREFIJO_TITULO}%`)
      .like("enlace", `%${claveTelefono(datos.telefono)}`)
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
    if (telegram && botToken && chatId) {
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
