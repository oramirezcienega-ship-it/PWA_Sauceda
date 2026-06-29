import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";
import crypto from "node:crypto";

/**
 * MÓDULO: CAPTACIÓN · TikTok Lead Ads
 * Crea (o reutiliza) el prospecto con origen "otro" (debido a restricciones de base de datos)
 * y le asocia un expediente en "nuevo-lead". Gatilla la bienvenida por WhatsApp para abrir la ventana
 * de 24 horas y permitir que el agente Sofía responda.
 */

export interface LeadTikTok {
  nombre: string;
  telefono: string;
  correo?: string;
  mensaje?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function siguienteId(
  sb: ReturnType<typeof supabaseServidor>,
  tabla: string,
  prefijo: string,
): Promise<string> {
  const { data } = await sb.from(tabla).select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

export async function registrarLeadTikTok(lead: LeadTikTok): Promise<string> {
  const sb = supabaseServidor();
  const nombre = lead.nombre?.trim() || "Lead de TikTok";
  const telefonoRaw = (lead.telefono ?? "").trim();
  const telefono = telefonoRaw ? normalizarTelefono(telefonoRaw) : "";
  const variantesTel = telefonoRaw ? variantesTelefono(telefonoRaw) : [];
  const correo = (lead.correo ?? "").trim();

  // Buscar prospecto existente por teléfono o correo (evita duplicados).
  let prospectoId: string | null = null;
  if (variantesTel.length) {
    const { data } = await sb
      .from("prospectos")
      .select("id")
      .in("telefono", variantesTel)
      .limit(1);
    if (data && data.length) prospectoId = data[0].id as string;
  }
  if (!prospectoId && correo) {
    const { data } = await sb
      .from("prospectos")
      .select("id")
      .eq("correo", correo)
      .limit(1);
    if (data && data.length) prospectoId = data[0].id as string;
  }

  if (!prospectoId) {
    const id = await siguienteId(sb, "prospectos", "PRO");
    await sb.from("prospectos").insert({
      id,
      nombre,
      telefono,
      correo,
      origen: "otro", // 'tiktok' no está en el check constraint de origen, usamos 'otro'
      campaign_name: lead.campaign_name || "TikTok Ads",
      adset_name: lead.adset_name || "",
      ad_name: lead.ad_name || "",
      notas: "Captado desde TikTok Lead Ads.",
    });
    prospectoId = id;
    await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  } else {
    // Actualizar datos de campaña si el prospecto ya existe
    const updateAttrs: any = {};
    if (lead.campaign_name) updateAttrs.campaign_name = lead.campaign_name;
    if (lead.adset_name) updateAttrs.adset_name = lead.adset_name;
    if (lead.ad_name) updateAttrs.ad_name = lead.ad_name;
    if (Object.keys(updateAttrs).length > 0) {
      await sb.from("prospectos").update(updateAttrs).eq("id", prospectoId);
    }
  }

  // Si ya existe un expediente con ese teléfono, no duplicamos: solo anotamos.
  if (variantesTel.length) {
    const { data: ex } = await sb
      .from("expedientes")
      .select("id, token")
      .in("telefono", variantesTel)
      .limit(1);
    if (ex && ex.length) {
      const updateData: any = { ultimo_movimiento: hoyISO() };
      if (lead.campaign_name) updateData.campaign_name = lead.campaign_name;
      if (lead.adset_name) updateData.adset_name = lead.adset_name;
      if (lead.ad_name) updateData.ad_name = lead.ad_name;

      await sb
        .from("expedientes")
        .update(updateData)
        .eq("id", ex[0].id);

      await registrarActividad(sb, {
        expedienteId: ex[0].id as string,
        tipo: "sistema",
        titulo: "Nueva solicitud (TikTok Ads)",
        detalle: lead.mensaje || `Campaña: ${lead.campaign_name || "N/A"}`,
      });

      // Enviamos plantilla de bienvenida de nuevo si es necesario (best-effort)
      await enviarBienvenida(sb, ex[0].id);
      return ex[0].token as string;
    }
  }

  // Token único para el portal
  const token = crypto.randomUUID();
  const expId = await siguienteId(sb, "expedientes", "EXP");
  await sb.from("expedientes").insert({
    id: expId,
    token,
    cliente: nombre,
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje || `Lead entrante de campaña TikTok: ${lead.campaign_name || "TikTok Ads"}.`,
    telefono,
    valor_estimado: 0,
    saldo_deuda: 0,
    notas: "Lead entrante automáticamente desde TikTok Lead Ads.",
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
    campaign_name: lead.campaign_name || "TikTok Ads",
    adset_name: lead.adset_name || "",
    ad_name: lead.ad_name || "",
  });

  // Enrolar automáticamente en secuencias activas
  try {
    const { enrolarLeadEnSecuenciasActivas } = await import("@/lib/automatizaciones/orquestador");
    await enrolarLeadEnSecuenciasActivas(sb, {
      nombre,
      phone: telefono,
      email: lead.correo || undefined,
      prospectoId,
      expedienteId: expId,
    });
  } catch (err) {
    console.error("Error al enrolar lead de TikTok en secuencias activas:", err);
  }

  await registrarActividad(sb, {
    expedienteId: expId,
    prospectoId,
    tipo: "creacion",
    titulo: "Lead de TikTok Ads",
    detalle: `Campaña: ${lead.campaign_name || "N/A"}. Adset: ${lead.adset_name || "N/A"}. Ad: ${lead.ad_name || "N/A"}.`,
  });

  // Bienvenida automática (correo + WhatsApp + portal).
  // Como ventanaWhatsAppAbierta no se pasa o es false, enviará la plantilla configurada en Meta.
  await enviarBienvenida(sb, expId);

  // Automatizaciones: expediente nuevo captado
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: expId,
    prospectoId,
  });

  // Notificar al equipo sobre el nuevo lead
  void notificarNuevoLead(expId);

  return token;
}
