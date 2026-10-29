import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import {
  proveedorPorTelefono,
  registrarMensajeEntranteProveedor,
} from "@/lib/whatsapp-proveedores";

export const dynamic = "force-dynamic";

/**
 * Webhook para eventos de Evolution API v2 (Línea Móvil Secundaria / Proveedores).
 * Recibe eventos de mensajes entrantes (MESSAGES_UPSERT) y actualizaciones de estado.
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    servicio: "Webhook Evolution API - SAUCEDA CRM",
    timestamp: new Date().toISOString(),
  });
}

function normalizarTexto(msg: any): string {
  if (!msg) return "";
  if (typeof msg.conversation === "string" && msg.conversation.trim()) {
    return msg.conversation.trim();
  }
  if (typeof msg.extendedTextMessage?.text === "string" && msg.extendedTextMessage.text.trim()) {
    return msg.extendedTextMessage.text.trim();
  }
  if (typeof msg.imageMessage?.caption === "string" && msg.imageMessage.caption.trim()) {
    return `📷 ${msg.imageMessage.caption.trim()}`;
  }
  if (msg.imageMessage) {
    return "📷 [Foto adjunta]";
  }
  if (msg.audioMessage) {
    return "🎤 [Nota de voz recibida]";
  }
  if (msg.documentMessage) {
    return `📄 [Documento: ${msg.documentMessage.fileName || "adjunto"}]`;
  }
  return "";
}

function esAprobacion(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    t.includes("adelante") ||
    t.includes("me la aviento") ||
    t.includes("sí, acepto") ||
    t.includes("si acepto") ||
    t.includes("de acuerdo") ||
    t.includes("hecho") ||
    t.includes("confirmado") ||
    t.includes("cuenta con eso") ||
    t.includes("si me interesa") ||
    t.includes("sí me interesa") ||
    t === "si" ||
    t === "sí" ||
    t === "va" ||
    t === "arre" ||
    t === "listo" ||
    t === "sale"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = (body?.event || "").toUpperCase();
    const data = body?.data;

    // Solo procesamos mensajes nuevos
    if (!event.includes("MESSAGES_UPSERT") && event !== "MESSAGES.UPSERT") {
      return NextResponse.json({ ok: true, ignorado: true, event });
    }

    if (!data) {
      return NextResponse.json({ ok: true, motivo: "sin data" });
    }

    const key = data.key || {};
    const fromMe = Boolean(key.fromMe);
    const remoteJid = String(key.remoteJid || "");
    const messageId = String(key.id || "");

    // Si fue enviado por nosotros, ignorar en este webhook
    if (fromMe) {
      return NextResponse.json({ ok: true, ignorado: true, motivo: "fromMe" });
    }

    // Extraer número de teléfono (remueve sufijo @s.whatsapp.net o @g.us)
    const rawNumber = remoteJid.replace(/@.*$/, "");
    const telNormalizado = normalizarTelefono(rawNumber);

    if (!telNormalizado) {
      return NextResponse.json({ ok: true, motivo: "telefono invalido" });
    }

    const texto = normalizarTexto(data.message);
    if (!texto) {
      return NextResponse.json({ ok: true, motivo: "mensaje vacio o no soportado" });
    }

    const sb = supabaseServidor();

    // 1. Verificar si el remitente es un Proveedor registrado
    const prov = await proveedorPorTelefono(sb, telNormalizado);
    if (prov) {
      // Registrar en el hilo del proveedor
      await registrarMensajeEntranteProveedor(sb, prov, {
        telefono: telNormalizado,
        texto,
        waMessageId: messageId,
      });

      // 2. Si es una confirmación/aprobación de trabajo, registrar evidencia legal y operativa
      if (esAprobacion(texto)) {
        // Buscar el último mensaje de trabajo enviado a este proveedor para asociar expediente
        const { data: ultimosEnvios } = await sb
          .from("mensajes_whatsapp")
          .select("expediente_id")
          .eq("proveedor_id", prov.id)
          .eq("direccion", "out")
          .not("expediente_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        const expAsociado = ultimosEnvios?.[0]?.expediente_id || null;

        await sb.from("actividades").insert({
          expediente_id: expAsociado,
          tipo: "acuerdo_proveedor",
          titulo: `✅ Acuerdo Aceptado por Proveedor: ${prov.nombre}`,
          detalle: `El proveedor respondió por WhatsApp: "${texto}" el ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}. Evidencia guardada en CRM. (ID: ${messageId})`,
        });
      }

      return NextResponse.json({
        ok: true,
        tipo: "proveedor",
        proveedor: prov.nombre,
        texto,
      });
    }

    const diez = telNormalizado.slice(-10);

    // 2. Verificar si el remitente es un Asesor registrado (Gerardo, Paulina, etc.)
    const { data: asesor } = await sb
      .from("perfiles")
      .select("id, nombre, rol, telefono, telefono_whatsapp")
      .or(`telefono.ilike.%${diez},telefono_whatsapp.ilike.%${diez}`)
      .limit(1)
      .maybeSingle();

    if (asesor) {
      await sb.from("mensajes_whatsapp").insert({
        telefono: telNormalizado,
        direccion: "in",
        texto,
        wa_message_id: messageId,
        agente: asesor.nombre,
        estado: "recibido",
      });

      // Si el asesor responde, marcar el último lead enviado como revisado en leads_envios_telegram
      const { data: ultimosEnvios } = await sb
        .from("leads_envios_telegram")
        .select("id, estado, expediente_id, prospecto_id")
        .eq("asesor_id", asesor.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (ultimosEnvios && ultimosEnvios.length > 0 && ultimosEnvios[0].estado === "enviado") {
        await sb
          .from("leads_envios_telegram")
          .update({
            estado: "revisado",
            respondido_at: new Date().toISOString(),
            respondido_via: "whatsapp",
          })
          .eq("id", ultimosEnvios[0].id);

        if (ultimosEnvios[0].expediente_id || ultimosEnvios[0].prospecto_id) {
          await sb.from("actividades").insert({
            expediente_id: ultimosEnvios[0].expediente_id,
            prospecto_id: ultimosEnvios[0].prospecto_id,
            tipo: "nota",
            titulo: `✅ Asesor ${asesor.nombre} atendió/respondió por WhatsApp`,
            detalle: `Respuesta recibida por Evolution API: "${texto}"`,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        tipo: "asesor",
        asesor: asesor.nombre,
        texto,
      });
    }

    // 3. Si no es proveedor ni asesor, registrar como mensaje regular si coincide con un expediente/prospecto
    const { data: exp } = await sb
      .from("expedientes")
      .select("id, prospecto_id")
      .or(`telefono.ilike.%${diez}`)
      .limit(1)
      .maybeSingle();

    await sb.from("mensajes_whatsapp").insert({
      telefono: telNormalizado,
      direccion: "in",
      texto,
      expediente_id: exp?.id || null,
      prospecto_id: exp?.prospecto_id || null,
      wa_message_id: messageId,
      agente: "Cliente",
      estado: "recibido",
    });

    return NextResponse.json({
      ok: true,
      tipo: "cliente",
      telefono: telNormalizado,
      expediente_id: exp?.id || null,
    });
  } catch (error: any) {
    console.error("[Webhook Evolution API] Error procesando evento:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Error interno" },
      { status: 500 }
    );
  }
}
