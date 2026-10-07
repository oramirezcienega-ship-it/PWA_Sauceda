import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  obtenerConfiguracionTelegram,
  enviarMensajeTelegram,
  responderCallbackQueryTelegram,
} from "@/lib/telegram";
import {
  registrarVotosAsesorCoordinacion,
  marcarAsesorEnteradoCoordinacion,
} from "@/lib/coordinacion-inspecciones";
import { registrarRespuestaAutorizacion } from "@/lib/cotizacion-telegram";
import { registrarActividad } from "@/lib/actividades";
import { marcarCitaEnteradaTelegram } from "@/lib/inspeccion-telegram";
import { registrarRespuestaLead, urlPortalParaTelegram } from "@/lib/lead-telegram";
import {
  iniciarNegociacionDias,
  alternarDiaAsesor,
  marcarDiasListo,
  alternarFranjaAsesor,
  marcarFranjasListo,
  armarTecladoDias,
  armarTecladoFranjas,
  actualizarTecladoTelegram,
} from "@/lib/coordinacion-negociacion";

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

      // Vinculación por enlace personal: https://t.me/<bot>?start=<id del usuario>
      const payload = text.startsWith("/start") ? text.split(/\s+/)[1] || "" : "";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload)) {
        const { data: perfil } = await sb
          .from("perfiles")
          .select("id, nombre")
          .eq("id", payload)
          .maybeSingle();

        if (perfil) {
          await sb
            .from("perfiles")
            .update({ telegram_chat_id: chatId, telegram_username: from?.username || null })
            .eq("id", perfil.id);

          await enviarMensajeTelegram({
            botToken,
            chatId,
            texto: `✅ *¡Listo, ${perfil.nombre}!* Tu Telegram quedó vinculado con SAUCEDA.\n\nAquí recibirás las propuestas de inspección con botones para responder (Puedo / No puedo / Enterado).`,
          });
        } else {
          await enviarMensajeTelegram({
            botToken,
            chatId,
            texto: "No pude vincular este enlace: el usuario no existe. Pide a tu administrador un enlace nuevo.",
          });
        }
        return NextResponse.json({ ok: true });
      }

      // Vinculación de un proveedor: https://t.me/<bot>?start=prov_<id del proveedor>
      const mProv = payload.match(/^prov_([0-9a-f-]{36})$/i);
      if (mProv) {
        const { data: prov } = await sb.from("proveedores").select("id, nombre").eq("id", mProv[1]).maybeSingle();
        if (prov) {
          await sb
            .from("proveedores")
            .update({ telegram_chat_id: chatId, telegram_username: from?.username || null })
            .eq("id", prov.id);
          await enviarMensajeTelegram({
            botToken,
            chatId,
            texto: `✅ *¡Listo, ${prov.nombre}!* Tu Telegram quedó vinculado con SAUCEDA.\n\nAquí recibirás las cotizaciones para autorizar costos, con botones para responder.`,
          });
        } else {
          await enviarMensajeTelegram({ botToken, chatId, texto: "No pude vincular este enlace: el proveedor no existe. Pide un enlace nuevo." });
        }
        return NextResponse.json({ ok: true });
      }

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

      // Negociación por etapas cuando las opciones no acomodan: día → franja → hora
      //   n:{coord} (ninguna me acomoda)  d:{coord}:{YYYYMMDD}  dl|dn:{coord}
      //   f:{coord}:{YYYYMMDD}{M|T}  fl|fn:{coord}
      const mNeg = data.match(/^(n|d|dl|dn|f|fl|fn):([0-9a-f-]{36})(?::(\d{8}[MT]?))?$/i);
      if (mNeg) {
        const [, tipo, coordId, extra] = mNeg;
        const { data: coordN } = await sb
          .from("coordinaciones_inspeccion")
          .select("asesores_ids, estado")
          .eq("id", coordId)
          .maybeSingle();

        if (!coordN || ["confirmada", "cancelada"].includes(coordN.estado)) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Esta propuesta ya no está activa.");
          return NextResponse.json({ ok: true });
        }

        const { data: perfilesN = [] } = await sb
          .from("perfiles")
          .select("id, nombre, telegram_chat_id, telegram_username")
          .in("id", coordN.asesores_ids || []);
        const asesor = (perfilesN || []).find(
          (p) =>
            p.telegram_chat_id === fromId ||
            (username && p.telegram_username?.toLowerCase() === username.toLowerCase())
        );
        if (!asesor) {
          await responderCallbackQueryTelegram(
            botToken,
            cb.id,
            "No pude identificarte como uno de los asesores de esta inspección.",
            true
          );
          return NextResponse.json({ ok: true });
        }

        const chatMsg = cb.message?.chat?.id;
        const msgId = cb.message?.message_id;

        if (tipo === "n") {
          await responderCallbackQueryTelegram(botToken, cb.id, "Entendido: busquemos otro día. Te llega la lista en un momento.");
          await iniciarNegociacionDias(sb, coordId, 1);
        } else if (tipo === "d") {
          const r = await alternarDiaAsesor(sb, coordId, asesor.id, extra);
          if (r.ok && chatMsg && msgId) {
            await actualizarTecladoTelegram(botToken, chatMsg, msgId, armarTecladoDias(coordId, r.ofrecidos, r.seleccion));
          }
          await responderCallbackQueryTelegram(botToken, cb.id, r.ok ? "Marcado" : "Esta consulta ya no está activa.");
        } else if (tipo === "dl" || tipo === "dn") {
          const r = await marcarDiasListo(sb, coordId, asesor.id, tipo === "dn");
          if (r.ok && chatMsg && msgId) await actualizarTecladoTelegram(botToken, chatMsg, msgId, []);
          await responderCallbackQueryTelegram(botToken, cb.id, r.mensaje);
        } else if (tipo === "f") {
          const r = await alternarFranjaAsesor(sb, coordId, asesor.id, extra);
          if (r.ok && chatMsg && msgId) {
            await actualizarTecladoTelegram(botToken, chatMsg, msgId, armarTecladoFranjas(coordId, r.pares, r.seleccion));
          }
          await responderCallbackQueryTelegram(botToken, cb.id, r.ok ? "Marcado" : "Esta consulta ya no está activa.");
        } else if (tipo === "fl" || tipo === "fn") {
          const r = await marcarFranjasListo(sb, coordId, asesor.id, tipo === "fn");
          if (r.ok && chatMsg && msgId) await actualizarTecladoTelegram(botToken, chatMsg, msgId, []);
          await responderCallbackQueryTelegram(botToken, cb.id, r.mensaje);
        }
        return NextResponse.json({ ok: true });
      }

      // Autorización de costo de una cotización: k:{cotizacionId}:{1|0}
      const mCosto = data.match(/^k:([^:]+):([01])$/);
      if (mCosto) {
        const [, cotId, val] = mCosto;
        const respuesta = val === "1" ? "autorizado" : "rechazado";
        const { data: cot } = await sb
          .from("cotizaciones")
          .select("autorizacion_costos, prospecto_id, expediente_id")
          .eq("id", cotId)
          .maybeSingle();
        const registros: Record<string, any> = (cot?.autorizacion_costos as Record<string, any>) || {};
        const claves = Object.keys(registros);
        if (!cot || claves.length === 0) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Esta cotización ya no está disponible.");
          return NextResponse.json({ ok: true });
        }

        const idsProv = claves.filter((k) => k.startsWith("prov:")).map((k) => k.slice(5));
        const idsPerf = claves.filter((k) => k.startsWith("perf:")).map((k) => k.slice(5));
        const [{ data: provs = [] }, { data: perfs = [] }] = await Promise.all([
          idsProv.length ? sb.from("proveedores").select("id, telegram_chat_id, telegram_username").in("id", idsProv) : Promise.resolve({ data: [] as any[] }),
          idsPerf.length ? sb.from("perfiles").select("id, telegram_chat_id, telegram_username").in("id", idsPerf) : Promise.resolve({ data: [] as any[] }),
        ]);
        const coincide = (p: any) =>
          p.telegram_chat_id === fromId ||
          (username && p.telegram_username?.toLowerCase() === username.toLowerCase());
        const claveMatch =
          (provs || []).filter(coincide).map((p: any) => `prov:${p.id}`)[0] ||
          (perfs || []).filter(coincide).map((p: any) => `perf:${p.id}`)[0];

        if (!claveMatch) {
          await responderCallbackQueryTelegram(botToken, cb.id, "No pude identificarte como destinatario de esta cotización.", true);
          return NextResponse.json({ ok: true });
        }

        const r = await registrarRespuestaAutorizacion(sb, cotId, claveMatch, respuesta);
        if (r.ok && r.registro) {
          const chatMsg = cb.message?.chat?.id;
          const msgId = cb.message?.message_id;
          if (chatMsg && msgId) await actualizarTecladoTelegram(botToken, chatMsg, msgId, []);
          await responderCallbackQueryTelegram(
            botToken,
            cb.id,
            respuesta === "autorizado" ? "✅ Costo autorizado. ¡Gracias!" : "❌ Costo rechazado. Quedó registrado."
          );
          await registrarActividad(sb, {
            prospectoId: cot.prospecto_id,
            expedienteId: cot.expediente_id || undefined,
            tipo: "construccion",
            titulo: `Costo ${respuesta} por ${r.registro.nombre} (${cotId})`,
            detalle: `Respuesta recibida por Telegram.`,
          });
        }
        return NextResponse.json({ ok: true });
      }

      // Lead pasado a un asesor desde Conversaciones: L:{envioId}:{1 recibido | 0 no puedo}
      const mLead = data.match(/^L:([0-9a-f-]{36}):([01])$/i);
      if (mLead) {
        const [, envioId, val] = mLead;
        const { data: envio } = await sb
          .from("leads_envios_telegram")
          .select("asesor_id, estado")
          .eq("id", envioId)
          .maybeSingle();
        if (!envio) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Este lead ya no está disponible.");
          return NextResponse.json({ ok: true });
        }

        const { data: asesorL } = await sb
          .from("perfiles")
          .select("telegram_chat_id, telegram_username")
          .eq("id", envio.asesor_id)
          .maybeSingle();
        const esElAsesor =
          asesorL &&
          (asesorL.telegram_chat_id === fromId ||
            (username && asesorL.telegram_username?.toLowerCase() === username.toLowerCase()));
        if (!esElAsesor) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Este lead fue asignado a otro asesor.", true);
          return NextResponse.json({ ok: true });
        }

        const r = await registrarRespuestaLead(sb, envioId, val === "1" ? "revisado" : "rechazado", "telegram");
        const chatMsg = cb.message?.chat?.id;
        const msgId = cb.message?.message_id;
        if (chatMsg && msgId) {
          // Se quitan los botones de confirmación pero queda el acceso al portal para dar seguimiento
          const urlPortal = await urlPortalParaTelegram(sb, envio.asesor_id);
          await actualizarTecladoTelegram(
            botToken,
            chatMsg,
            msgId,
            urlPortal ? [[{ text: "📋 Dar seguimiento en mi portal", url: urlPortal }]] : []
          );
        }
        await responderCallbackQueryTelegram(
          botToken,
          cb.id,
          r.yaRespondido
            ? "Ya habías respondido este lead."
            : val === "1"
            ? "✅ Registrado: el lead es tuyo. ¡Éxito!"
            : "Registrado. Avisamos para reasignarlo."
        );
        return NextResponse.json({ ok: true });
      }

      // Acuse de lectura de una inspección compartida: c:{citaId}  (botón "Enterado")
      if (data.startsWith("c:")) {
        const [, citaId] = data.split(":");
        const { data: cita } = await sb
          .from("agenda_citas")
          .select("telegram_compartido")
          .eq("id", citaId)
          .maybeSingle();

        const compartido: Record<string, any> = (cita?.telegram_compartido as Record<string, any>) || {};
        const ids = Object.keys(compartido);
        if (!cita || ids.length === 0) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Esta inspección ya no está disponible.");
          return NextResponse.json({ ok: true });
        }

        const { data: perfilesC = [] } = await sb
          .from("perfiles")
          .select("id, nombre, telegram_chat_id, telegram_username")
          .in("id", ids);
        const match = (perfilesC || []).find(
          (p) =>
            p.telegram_chat_id === fromId ||
            (username && p.telegram_username?.toLowerCase() === username.toLowerCase())
        );

        if (!match) {
          await responderCallbackQueryTelegram(
            botToken,
            cb.id,
            "No pude identificarte como el asesor de esta inspección.",
            true
          );
          return NextResponse.json({ ok: true });
        }

        await marcarCitaEnteradaTelegram(sb, citaId, match.id, "telegram");
        await responderCallbackQueryTelegram(botToken, cb.id, "👀 Registrado: quedaste enterado de la inspección.");
        return NextResponse.json({ ok: true });
      }

      // Acuse de lectura: e:{coordinacionId}  (botón "Enterado")
      if (data.startsWith("e:")) {
        const [, coordId] = data.split(":");
        const { data: coord } = await sb
          .from("coordinaciones_inspeccion")
          .select("asesores_ids, cliente_nombre")
          .eq("id", coordId)
          .single();

        if (!coord) {
          await responderCallbackQueryTelegram(botToken, cb.id, "Esta propuesta ya no está activa.");
          return NextResponse.json({ ok: true });
        }

        const { data: perfilesE = [] } = await sb
          .from("perfiles")
          .select("id, nombre, telegram_chat_id, telegram_username")
          .in("id", coord.asesores_ids || []);

        // Solo se registra si se puede identificar al asesor (sin asignar por suposición)
        const match = (perfilesE || []).find(
          (p) =>
            p.telegram_chat_id === fromId ||
            (username && p.telegram_username?.toLowerCase() === username.toLowerCase())
        );

        if (!match) {
          await responderCallbackQueryTelegram(
            botToken,
            cb.id,
            "No pude identificarte como uno de los asesores de esta inspección. Pide que vinculen tu Telegram en tu perfil.",
            true
          );
          return NextResponse.json({ ok: true });
        }

        await marcarAsesorEnteradoCoordinacion(sb, coordId, match.id, "telegram");
        await responderCallbackQueryTelegram(botToken, cb.id, "👀 Registrado: quedaste enterado de la propuesta.");
        return NextResponse.json({ ok: true });
      }

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
