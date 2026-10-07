"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { registrarVotosAsesorCoordinacion } from "@/lib/coordinacion-inspecciones";
import { registrarRespuestaLead } from "@/lib/lead-telegram";
import {
  asesorPorToken,
  guardarRetroalimentacion,
  listarCoordinacionesConRetro,
  listarLeadsConRetro,
  type AsesorPortal,
  type CoordinacionPortal,
  type LeadCompartidoPortal,
} from "@/lib/portal-asesor";

/**
 * Acciones PÚBLICAS del portal del asesor: no hay sesión, la identidad sale del
 * token del link. Cada acción valida que el registro pertenezca a ese asesor.
 */

export interface DatosPortalAsesor {
  asesor: AsesorPortal;
  coordinaciones: CoordinacionPortal[];
  leads: LeadCompartidoPortal[];
}

async function exigirAsesor(token: string): Promise<AsesorPortal> {
  const asesor = await asesorPorToken(supabaseServidor(), token);
  if (!asesor) throw new Error("Este link ya no es válido. Pide uno nuevo.");
  return asesor;
}

export async function obtenerPortalAsesor(token: string): Promise<DatosPortalAsesor | null> {
  const sb = supabaseServidor();
  const asesor = await asesorPorToken(sb, token);
  if (!asesor) return null;
  const [coordinaciones, leads] = await Promise.all([
    listarCoordinacionesConRetro(sb, { asesorId: asesor.id }),
    listarLeadsConRetro(sb, { asesorId: asesor.id }),
  ]);
  return { asesor, coordinaciones, leads };
}

/** Votos de horarios: mismo registro que los botones de Telegram. */
export async function votarHorariosPortal(
  token: string,
  coordinacionId: string,
  votos: Record<string, boolean>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const asesor = await exigirAsesor(token);
    const sb = supabaseServidor();
    const { data: coord } = await sb
      .from("coordinaciones_inspeccion")
      .select("asesores_ids, estado")
      .eq("id", coordinacionId)
      .maybeSingle();
    if (!coord || !(coord.asesores_ids || []).includes(asesor.id)) {
      return { ok: false, error: "Esta coordinación no está asignada a ti." };
    }
    if (!["propuesta_enviada", "evaluando"].includes(coord.estado)) {
      return { ok: false, error: "Esta coordinación ya no está recibiendo horarios." };
    }
    const r = await registrarVotosAsesorCoordinacion(sb, coordinacionId, asesor.id, votos, "Respondido desde el portal del asesor");
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (err: any) {
    return { ok: false, error: err.message || "No se pudo guardar." };
  }
}

export async function retroCoordinacionPortal(
  token: string,
  coordinacionId: string,
  datos: { estado: string; clientePresente: boolean | null; comentario: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const asesor = await exigirAsesor(token);
    const sb = supabaseServidor();
    const { data: coord } = await sb
      .from("coordinaciones_inspeccion")
      .select("asesores_ids")
      .eq("id", coordinacionId)
      .maybeSingle();
    if (!coord || !(coord.asesores_ids || []).includes(asesor.id)) {
      return { ok: false, error: "Esta coordinación no está asignada a ti." };
    }
    await guardarRetroalimentacion(sb, {
      asesorId: asesor.id,
      tipo: "coordinacion",
      referenciaId: coordinacionId,
      estado: datos.estado,
      clientePresente: datos.clientePresente,
      comentario: datos.comentario,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "No se pudo guardar." };
  }
}

export async function retroLeadPortal(
  token: string,
  envioId: string,
  datos: { estado: string; siguientePaso: string; siguientePasoFecha: string | null; comentario: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const asesor = await exigirAsesor(token);
    const sb = supabaseServidor();
    const { data: envio } = await sb
      .from("leads_envios_telegram")
      .select("asesor_id")
      .eq("id", envioId)
      .maybeSingle();
    if (!envio || envio.asesor_id !== asesor.id) {
      return { ok: false, error: "Este cliente no está asignado a ti." };
    }
    await guardarRetroalimentacion(sb, {
      asesorId: asesor.id,
      tipo: "lead",
      referenciaId: envioId,
      estado: datos.estado,
      siguientePaso: datos.siguientePaso,
      siguientePasoFecha: datos.siguientePasoFecha,
      comentario: datos.comentario,
    });
    // Responder también cuenta como "Recibido" (o rechazo) del envío por Telegram
    await registrarRespuestaLead(sb, envioId, datos.estado === "no_puedo_atender" ? "rechazado" : "revisado", "manual");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "No se pudo guardar." };
  }
}
