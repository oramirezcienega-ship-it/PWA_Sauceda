"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono } from "@/lib/telefono";

export interface CoordinacionPendienteAsesor {
  id: string;
  nombre: string;
  recibido: boolean;
  leido: boolean;
  respondio: boolean;
}

export interface CoordinacionPendienteItem {
  id: string;
  prospectoId: string;
  clienteNombre: string;
  servicioNombre: string;
  ubicacion: string;
  estado: string;
  /** Qué falta para cerrar la coordinación. */
  etapa: "esperando_asesores" | "listo_para_cliente" | "sin_coincidencia" | "esperando_cliente";
  etapaLabel: string;
  asesores: CoordinacionPendienteAsesor[];
  creadaAt: string;
  minutosPendiente: number;
  /** true si lleva más de 2 horas sin avanzar o venció el SLA esperando asesores. */
  urgente: boolean;
}

/** Coordinaciones solicitadas que siguen abiertas: hay que darles seguimiento. */
export async function obtenerCoordinacionesPendientes(): Promise<{
  ok: boolean;
  items: CoordinacionPendienteItem[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data, error } = await sb
      .from("coordinaciones_inspeccion")
      .select(
        "id, prospecto_id, cliente_nombre, servicio_nombre, ubicacion, estado, asesores_ids, respuestas_asesores, opciones_validadas, sla_limite_at, created_at"
      )
      .in("estado", ["propuesta_enviada", "evaluando", "enviado_cliente"])
      .order("created_at", { ascending: true });

    if (error) return { ok: false, items: [], error: error.message };

    const ahora = Date.now();
    const items: CoordinacionPendienteItem[] = (data || []).map((c: any) => {
      const respuestas: Record<string, any> = c.respuestas_asesores || {};
      const ids: string[] = c.asesores_ids || [];
      const asesores: CoordinacionPendienteAsesor[] = ids.map((id) => {
        const r = respuestas[id] || {};
        return {
          id,
          nombre: r.nombre || "Asesor",
          recibido: Boolean(r.entrega?.whatsapp?.ok || r.entrega?.telegram?.ok),
          leido: Boolean(r.enteradoAt),
          respondio: Boolean(r.respondidoAt),
        };
      });

      const faltan = asesores.filter((a) => !a.respondio);
      const validadas: string[] = c.opciones_validadas || [];
      let etapa: CoordinacionPendienteItem["etapa"];
      let etapaLabel: string;
      if (c.estado === "enviado_cliente") {
        etapa = "esperando_cliente";
        etapaLabel = "Esperando que el cliente elija horario";
      } else if (faltan.length > 0) {
        etapa = "esperando_asesores";
        etapaLabel = `Falta respuesta de: ${faltan.map((a) => a.nombre.split(" ")[0]).join(", ")}`;
      } else if (validadas.length > 0) {
        etapa = "listo_para_cliente";
        etapaLabel = "Listo: enviar opciones al cliente";
      } else {
        etapa = "sin_coincidencia";
        etapaLabel = "Sin coincidencia: proponer nuevos horarios";
      }

      const minutosPendiente = Math.max(0, Math.round((ahora - new Date(c.created_at).getTime()) / 60000));
      const slaVencido = c.sla_limite_at ? new Date(c.sla_limite_at).getTime() < ahora : false;

      return {
        id: c.id,
        prospectoId: c.prospecto_id,
        clienteNombre: c.cliente_nombre,
        servicioNombre: c.servicio_nombre,
        ubicacion: c.ubicacion,
        estado: c.estado,
        etapa,
        etapaLabel,
        asesores,
        creadaAt: c.created_at,
        minutosPendiente,
        urgente: minutosPendiente > 120 || (slaVencido && etapa === "esperando_asesores"),
      };
    });

    return { ok: true, items };
  } catch (err: any) {
    return { ok: false, items: [], error: err?.message || "Error al consultar coordinaciones pendientes." };
  }
}

/** Recordatorio (WhatsApp y Telegram) a los asesores que aún no responden una coordinación. */
export async function recordarCoordinacionAsesores(
  coordinacionId: string
): Promise<{ ok: boolean; recordados: number; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();

    const { data: c } = await sb
      .from("coordinaciones_inspeccion")
      .select("*")
      .eq("id", coordinacionId)
      .maybeSingle();
    if (!c) return { ok: false, recordados: 0, error: "Coordinación no encontrada." };

    const respuestas: Record<string, any> = c.respuestas_asesores || {};
    const pendientes: string[] = (c.asesores_ids || []).filter((id: string) => !respuestas[id]?.respondidoAt);
    if (pendientes.length === 0) {
      return { ok: false, recordados: 0, error: "Todos los asesores ya respondieron." };
    }

    const { data: perfiles } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, telefono_whatsapp, telegram_chat_id")
      .in("id", pendientes);

    const { enviarWhatsAppTexto } = await import("@/lib/whatsapp");
    const { recordarPropuestaInspeccionTelegram } = await import("@/lib/telegram-recordatorios");
    const opciones: Array<{ id: string; label: string }> = c.opciones_horarios || [];
    const lista = opciones.map((o) => `👉 *Opción ${o.id}:* ${o.label}`).join("\n");

    let recordados = 0;
    for (const p of perfiles || []) {
      const tel = normalizarTelefono(p.telefono_whatsapp || p.telefono || "");
      const primer = (p.nombre || "").split(" ")[0] || "Asesor";
      const texto =
        `⏰ *RECORDATORIO · Inspección técnica pendiente de tu respuesta*\n\n` +
        `Hola ${primer}, aún no confirmas tu disponibilidad para la inspección de *${c.cliente_nombre}* ` +
        `(${c.servicio_nombre} · ${c.ubicacion}).\n\n📅 *Opciones:*\n${lista}\n\n` +
        `Por favor responde hoy mismo qué opciones tienes libres (ej. "puedo A y C" o "todas") para no dejar al cliente esperando.`;
      if (tel) {
        const r = await enviarWhatsAppTexto(tel, texto).catch(() => null);
        if (r?.ok) recordados++;
      }
    }

    const tg = await recordarPropuestaInspeccionTelegram(sb, {
      coordinacionId,
      clienteNombre: c.cliente_nombre,
      servicioNombre: c.servicio_nombre,
      ubicacion: c.ubicacion,
      opciones,
      asesoresIds: pendientes,
    }).catch(() => ({ enviados: 0 }));
    recordados += tg.enviados;

    return recordados > 0
      ? { ok: true, recordados }
      : { ok: false, recordados: 0, error: "No se pudo enviar el recordatorio (sin teléfono ni Telegram vinculado)." };
  } catch (err: any) {
    return { ok: false, recordados: 0, error: err?.message || "Error al enviar recordatorio." };
  }
}
