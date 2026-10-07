"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
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

