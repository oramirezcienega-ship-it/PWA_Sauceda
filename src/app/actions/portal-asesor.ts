"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { registrarVotosAsesorCoordinacion } from "@/lib/coordinacion-inspecciones";
import { registrarRespuestaLead } from "@/lib/lead-telegram";
import { variantesTelefono } from "@/lib/telefono";
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

/** Un cliente compartido al asesor, con la ficha del negocio, para la página de retro de ese cliente. */
export async function obtenerClientePortalAsesor(
  token: string,
  envioId: string
): Promise<{ asesor: AsesorPortal; lead: LeadCompartidoPortal } | null> {
  const sb = supabaseServidor();
  const asesor = await asesorPorToken(sb, token);
  if (!asesor) return null;
  const leads = await listarLeadsConRetro(sb, { asesorId: asesor.id, conDetalle: true, dias: 365 });
  const lead = leads.find((l) => l.id === envioId);
  if (!lead) return null;
  // Retro de todos los envíos del mismo cliente (si se compartió varias veces)
  const tel = lead.telefono.replace(/\D/g, "").slice(-10);
  if (tel) {
    const todas = leads.filter((l) => l.telefono.replace(/\D/g, "").slice(-10) === tel).flatMap((l) => l.retro);
    const vistas = new Set<string>();
    lead.retro = todas
      .filter((r) => {
        const clave = `${r.createdAt.slice(0, 16)}|${r.estado}|${r.comentario}`;
        if (vistas.has(clave)) return false;
        vistas.add(clave);
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  // Teléfono del asesor: no hace falta en su propio portal
  if (lead.detalle) lead.detalle.asesorTelefono = "";
  return { asesor, lead };
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
      .select("asesores_ids, cita_id, prospecto_id, expediente_id")
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

    // Si el asesor reporta que la inspección "Se realizó" (realizada), sincronizar cita y cotización
    if (datos.estado === "realizada") {
      try {
        if (coord.cita_id) {
          const { marcarInspeccionEjecutada } = await import("@/app/actions/comisiones");
          await marcarInspeccionEjecutada({
            citaId: coord.cita_id,
            notas: datos.comentario || "Inspección realizada confirmada desde el portal del asesor.",
          });
        } else {
          const { sincronizarInspeccionConCotizaciones } = await import("@/lib/inspeccion-cotizacion");
          await sincronizarInspeccionConCotizaciones(sb, {
            prospectoId: coord.prospecto_id,
            expedienteId: coord.expediente_id,
            perfilId: asesor.id,
            notas: datos.comentario,
            soloProgramar: false,
          });
        }
      } catch (errSync) {
        console.warn("Aviso al sincronizar inspección realizada desde el portal:", errSync);
      }
    }

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
      .select("asesor_id, telefono")
      .eq("id", envioId)
      .maybeSingle();
    if (!envio || envio.asesor_id !== asesor.id) {
      return { ok: false, error: "Este cliente no está asignado a ti." };
    }
    // El mismo cliente pudo compartirse varias veces al asesor: la retro va a todos sus envíos
    const ids = new Set([envioId]);
    if (envio.telefono) {
      const { data: otros } = await sb
        .from("leads_envios_telegram")
        .select("id")
        .eq("asesor_id", asesor.id)
        .in("telefono", variantesTelefono(envio.telefono));
      (otros || []).forEach((o: any) => ids.add(o.id));
    }
    for (const id of Array.from(ids)) {
      await guardarRetroalimentacion(sb, {
        asesorId: asesor.id,
        tipo: "lead",
        referenciaId: id,
        estado: datos.estado,
        siguientePaso: datos.siguientePaso,
        siguientePasoFecha: datos.siguientePasoFecha,
        comentario: datos.comentario,
      });
      // Responder también cuenta como "Recibido" (o rechazo) del envío por Telegram
      await registrarRespuestaLead(sb, id, datos.estado === "no_puedo_atender" ? "rechazado" : "revisado", "manual");
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "No se pudo guardar." };
  }
}
