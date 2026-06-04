"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import {
  listarPlantillasAprobadas,
  type PlantillaWhatsApp,
} from "@/lib/whatsapp";

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
  return listarPlantillasAprobadas();
}
