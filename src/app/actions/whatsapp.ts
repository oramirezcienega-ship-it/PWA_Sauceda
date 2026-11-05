"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  listarPlantillasAprobadas,
  type PlantillaWhatsApp,
} from "@/lib/whatsapp";
import { deduplicarPlantillas } from "@/lib/plantillas-whatsapp";

/**
 * Server actions del módulo WHATSAPP.
 * Las plantillas viven y se aprueban en Meta; aquí solo se consultan
 * (sincronización de solo lectura) para poder elegirlas en el panel.
 */
export async function listarPlantillasWhatsApp(): Promise<{
  ok: boolean;
  error?: string;
  plantillas: PlantillaWhatsApp[];
}> {
  await requireAdmin();
  const res = await listarPlantillasAprobadas();
  if (res.ok && res.plantillas) {
    return {
      ...res,
      plantillas: deduplicarPlantillas(res.plantillas),
    };
  }
  return res;
}

/**
 * Consulta en tiempo real a Meta Graph API el estado de aprobación
 * de las plantillas de entrega y órdenes de trabajo (APPROVED, PENDING, REJECTED).
 */
export async function consultarEstadoPlantillasEntrega(): Promise<{
  ok: boolean;
  error?: string;
  plantillas: Array<{
    name: string;
    status: string;
    category: string;
    language: string;
    id?: string;
  }>;
}> {
  try {
    await requireAdmin();
    const { obtenerCredencialesWhatsApp } = await import("@/lib/whatsapp");
    const { token, wabaId } = await obtenerCredencialesWhatsApp();
    if (!token || !wabaId) {
      return { ok: false, error: "Faltan credenciales de WhatsApp en el sistema.", plantillas: [] };
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,language,id&limit=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Error Meta (${res.status}): ${errText}`, plantillas: [] };
    }

    const json = await res.json();
    const todas = (json.data || []) as Array<{
      name: string;
      status: string;
      category: string;
      language: string;
      id?: string;
    }>;

    // Filtrar plantillas relevantes para entrega y cobro
    const relevantes = todas.filter(
      (p) =>
        p.name.includes("sauceda") ||
        p.name.includes("entrega") ||
        p.name.includes("recibo") ||
        p.name.includes("garantia")
    );

    return { ok: true, plantillas: relevantes };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al conectar con Meta", plantillas: [] };
  }
}


/**
 * Consulta en tiempo real si la ventana de 24 horas de Meta estÃ¡ activa
 * para un telÃ©fono especÃ­fico (basado en el Ãºltimo mensaje entrante del cliente).
 */
export async function consultarVentanaWhatsApp(telefono: string): Promise<{
  ok: boolean;
  ventanaAbierta: boolean;
  horasRestantes?: number;
  minutosRestantes?: number;
  ultimoMensajeCliente?: string;
  fechaUltimoMensaje?: string;
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const cleanPhone = (telefono || "").replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      return { ok: true, ventanaAbierta: false };
    }
    const digits10 = cleanPhone.slice(-10);

    const { data, error } = await sb
      .from("mensajes_whatsapp")
      .select("texto, created_at")
      .eq("direccion", "in")
      .like("telefono", `%${digits10}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { ok: false, ventanaAbierta: false, error: error.message };
    }

    if (!data || !data.created_at) {
      return { ok: true, ventanaAbierta: false };
    }

    const lastTime = new Date(data.created_at).getTime();
    const diffMs = Date.now() - lastTime;
    const ventanaAbierta = diffMs < 24 * 60 * 60 * 1000;
    const msRemaining = Math.max(0, 24 * 60 * 60 * 1000 - diffMs);
    const horasRestantes = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutosRestantes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    return {
      ok: true,
      ventanaAbierta,
      horasRestantes,
      minutosRestantes,
      ultimoMensajeCliente: data.texto,
      fechaUltimoMensaje: data.created_at,
    };
  } catch (err: any) {
    return { ok: false, ventanaAbierta: false, error: err?.message || "Error al verificar ventana de 24h" };
  }
}
