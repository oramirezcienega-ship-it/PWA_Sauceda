import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { enviarWhatsAppPlantillaCompleta } from "@/lib/whatsapp";
import { siguienteId, siguienteIdProspecto, hoyISO } from "@/features/captacion/whatsapp";
import { obtenerIdAsesorGerardo } from "@/lib/asesores";
import { detectarTipoNegocio } from "@/lib/types";
import { insertarExpedienteSeguro } from "@/lib/expedientes-insert";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/send-template
 * Endpoint seguro para despacho y registro de campañas de plantillas de WhatsApp (Mautic, scripts externos).
 * 
 * Protegido mediante CAMPAIGN_API_KEY o CRON_SECRET en variables de entorno.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verificación de autenticación
    const authHeader = request.headers.get("authorization");
    const apiKeyHeader = request.headers.get("x-api-key");
    const secretParam = request.nextUrl.searchParams.get("secret");

    const validSecret = process.env.CAMPAIGN_API_KEY || process.env.CRON_SECRET;
    if (validSecret) {
      const bearerMatch = authHeader === `Bearer ${validSecret}`;
      const apiKeyMatch = apiKeyHeader === validSecret;
      const secretParamMatch = secretParam === validSecret;

      if (!bearerMatch && !apiKeyMatch && !secretParamMatch) {
        return NextResponse.json(
          { error: "No autorizado. Token incorrecto o faltante." },
          { status: 401 }
        );
      }
    }

    // 2. Parseo y validación del body
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido o no es JSON." },
        { status: 400 }
      );
    }

    const {
      phone,
      template_name,
      template_language = "es_MX",
      components = [],
      metadata = {},
    } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "El campo 'phone' es obligatorio." },
        { status: 400 }
      );
    }

    if (!template_name) {
      return NextResponse.json(
        { error: "El campo 'template_name' es obligatorio." },
        { status: 400 }
      );
    }

    const tel = normalizarTelefono(String(phone));
    if (!tel || tel.length < 10) {
      return NextResponse.json(
        { error: `Teléfono inválido (${phone}). Debe tener al menos 10 dígitos numéricos.` },
        { status: 400 }
      );
    }

    const sb = supabaseServidor();
    const variantes = variantesTelefono(tel);
    const campaignName = metadata?.campaign_name || "";
    const source = metadata?.source || "campaña_externa";

    // Extraer posible nombre del lead del cuerpo de componentes (si hay parámetro de texto)
    let nombreLead = "";
    const bodyComp = Array.isArray(components)
      ? components.find((c: any) => c?.type === "body")
      : undefined;
    if (bodyComp && Array.isArray(bodyComp.parameters)) {
      const firstTextParam = bodyComp.parameters.find(
        (p: any) => p?.type === "text" && p?.text
      );
      if (firstTextParam) {
        nombreLead = String(firstTextParam.text).trim();
      }
    }

    // Extraer recurso multimedia de cabecera si existe (id de Meta o URL directa)
    let headerMedia = "";
    const headerComp = Array.isArray(components)
      ? components.find((c: any) => c?.type === "header")
      : undefined;
    if (headerComp && Array.isArray(headerComp.parameters)) {
      const imgParam = headerComp.parameters.find(
        (p: any) => (p?.type === "image" && p?.image) || (p?.type === "video" && p?.video) || (p?.type === "document" && p?.document)
      );
      if (imgParam) {
        const mediaObj = imgParam.image || imgParam.video || imgParam.document;
        headerMedia = mediaObj.id || mediaObj.link || "";
      }
    }

    // Extraer parámetros de texto del cuerpo para el resumen en chat
    const bodyParams: string[] = [];
    if (bodyComp && Array.isArray(bodyComp.parameters)) {
      for (const p of bodyComp.parameters) {
        if (p?.type === "text" && p?.text !== undefined) {
          bodyParams.push(String(p.text).trim());
        }
      }
    }

    // 3. Vincular o crear prospecto
    let prospectoId: string | null = null;
    const { data: existentesPros } = await sb
      .from("prospectos")
      .select("id, campaign_name, adset_name, ad_name")
      .in("telefono", variantes)
      .limit(1);

    if (existentesPros && existentesPros.length > 0) {
      prospectoId = existentesPros[0].id;
      const updatesPros: Record<string, any> = {};
      if (campaignName && existentesPros[0].campaign_name !== campaignName) {
        updatesPros.campaign_name = campaignName;
      }
      if (source && existentesPros[0].adset_name !== source) {
        updatesPros.adset_name = source;
      }
      if (Object.keys(updatesPros).length > 0) {
        await sb.from("prospectos").update(updatesPros).eq("id", prospectoId);
      }
    } else {
      prospectoId = await siguienteIdProspecto(sb);
      const asesorId = await obtenerIdAsesorGerardo(sb);
      await sb.from("prospectos").insert({
        id: prospectoId,
        nombre: nombreLead || (campaignName ? `Lead ${campaignName} ${tel}` : `Lead Campaña ${tel}`),
        telefono: tel,
        origen: "whatsapp",
        campaign_name: campaignName,
        adset_name: source,
        ad_name: template_name,
        asesor_id: asesorId,
        primer_apellido: "",
      });
    }

    // 4. Vincular o crear expediente
    let expedienteId: string | null = null;
    const { data: existentesExp } = await sb
      .from("expedientes")
      .select("id, campaign_name, adset_name, ad_name, notas")
      .in("telefono", variantes)
      .limit(1);

    const tipoNegocioDetectado = detectarTipoNegocio(
      template_name,
      [campaignName, source].filter(Boolean).join(" ")
    );

    if (existentesExp && existentesExp.length > 0) {
      expedienteId = existentesExp[0].id;
      const updatesExp: Record<string, any> = {
        ultimo_movimiento: hoyISO(),
      };
      if (campaignName && existentesExp[0].campaign_name !== campaignName) {
        updatesExp.campaign_name = campaignName;
      }
      if (source && existentesExp[0].adset_name !== source) {
        updatesExp.adset_name = source;
      }
      await sb.from("expedientes").update(updatesExp).eq("id", expedienteId);
    } else {
      expedienteId = await siguienteId(sb);
      const asesorId = await obtenerIdAsesorGerardo(sb);
      await insertarExpedienteSeguro(sb, {
        id: expedienteId,
        cliente: nombreLead || `Lead Campaña ${tel}`,
        fraccionamiento: "Por definir",
        etapa: "nuevo-lead",
        situacion: campaignName
          ? `Campaña enviada: ${campaignName} (${template_name})`
          : `Campaña enviada por WhatsApp (${template_name})`,
        telefono: tel,
        valor_estimado: 0,
        saldo_deuda: 0,
        notas: `[Campaña ${hoyISO()}] Plantilla ${template_name}${campaignName ? ` · ${campaignName}` : ""}`,
        ultimo_movimiento: hoyISO(),
        prospecto_id: prospectoId,
        campaign_name: campaignName,
        adset_name: source,
        ad_name: template_name,
        tipo_negocio: tipoNegocioDetectado,
        asesor_id: asesorId,
      });
    }

    // 5. Despacho a Meta Cloud API
    const resMeta = await enviarWhatsAppPlantillaCompleta(
      tel,
      template_name,
      template_language,
      components
    );

    // 6. Construir texto legible para el historial de conversaciones
    let textoResumen = "";
    if (headerMedia) {
      textoResumen += `[image:${headerMedia}]\n`;
    }
    textoResumen += `[plantilla: ${template_name}]`;
    if (bodyParams.length > 0) {
      textoResumen += ` ${bodyParams.join(" | ")}`;
    }
    if (campaignName) {
      textoResumen += `\n[Campaña: ${campaignName}]`;
    }

    const estadoFinal = resMeta.ok
      ? "enviado"
      : resMeta.errorDetail
      ? `error:${resMeta.errorDetail}`
      : resMeta.error
      ? `error:${resMeta.error}`
      : "error";

    // 7. Insertar en mensajes_whatsapp con wa_message_id para enlazar webhooks futuros
    const { error: insertErr } = await sb.from("mensajes_whatsapp").insert({
      telefono: tel,
      texto: textoResumen.trim(),
      direccion: "out",
      expediente_id: expedienteId,
      prospecto_id: prospectoId,
      estado: estadoFinal,
      agente: "Sistema",
      wa_message_id: resMeta.messageId || null,
    });


    if (insertErr) {
      console.error("[send-template] Error al guardar mensaje en mensajes_whatsapp:", insertErr);
    }

    // 8. Responder con el resultado
    if (!resMeta.ok) {
      return NextResponse.json(
        {
          success: false,
          error: resMeta.error,
          error_detail: resMeta.errorDetail,
          error_code: resMeta.errorCode,
          prospecto_id: prospectoId,
          expediente_id: expedienteId,
          status: estadoFinal,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: resMeta.messageId,
      prospecto_id: prospectoId,
      expediente_id: expedienteId,
      status: estadoFinal,
    });
  } catch (err: any) {
    console.error("[send-template] Error inesperado:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno del servidor al procesar la plantilla." },
      { status: 500 }
    );
  }
}
