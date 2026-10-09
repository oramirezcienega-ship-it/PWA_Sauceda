import type { SupabaseClient } from "@supabase/supabase-js";
import { iaAgenteActivo, responderConIA } from "@/lib/ia/agente";
import { esConversacionPausada } from "@/lib/ia/control-pausa";
import { normalizarTelefono } from "@/lib/telefono";

/**
 * Red de seguridad de Sofía: busca conversaciones cuyo último mensaje es del
 * cliente y que quedaron sin respuesta (p. ej. Netlify cortó la función a la
 * mitad) y vuelve a intentar UNA sola vez por mensaje.
 */

/** Antigüedad mínima: deja terminar el flujo normal antes de intervenir. */
const EDAD_MINIMA_MS = 2 * 60 * 1000;
/** Ventana de 24 h de WhatsApp (con margen) para poder enviar texto libre. */
const EDAD_MAXIMA_MS = 23 * 60 * 60 * 1000;

interface FilaMsg {
  id: string;
  telefono: string;
  direccion: string;
  expediente_id: string | null;
  created_at: string;
  finalizado: boolean | null;
}

export async function rescatarConversacionesSinRespuesta(
  sb: SupabaseClient,
  opciones: { maximo?: number } = {},
): Promise<{ revisadas: number; rescatadas: string[] }> {
  const rescatadas: string[] = [];
  if (!iaAgenteActivo()) return { revisadas: 0, rescatadas };

  const desde = new Date(Date.now() - EDAD_MAXIMA_MS).toISOString();
  const { data, error } = await sb
    .from("mensajes_whatsapp")
    .select("id, telefono, direccion, expediente_id, created_at, finalizado")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[IA Rescate] No se pudieron leer los mensajes:", error);
    return { revisadas: 0, rescatadas };
  }

  // Último mensaje por hilo (los datos vienen del más reciente al más antiguo).
  const ultimos = new Map<string, FilaMsg>();
  for (const m of (data as FilaMsg[]) ?? []) {
    const clave = normalizarTelefono(m.telefono) || m.telefono;
    if (!ultimos.has(clave)) ultimos.set(clave, m);
  }

  const ahora = Date.now();
  const pendientes = Array.from(ultimos.values()).filter(
    (m) =>
      m.direccion === "in" &&
      !m.finalizado &&
      ahora - new Date(m.created_at).getTime() >= EDAD_MINIMA_MS,
  );

  for (const m of pendientes) {
    if (rescatadas.length >= (opciones.maximo ?? 2)) break;
    if (await esConversacionPausada(sb, m.telefono, m.expediente_id)) continue;

    // Reclamo atómico (PK de configuracion_agente): un solo intento por mensaje.
    const { error: errReclamo } = await sb
      .from("configuracion_agente")
      .insert({ clave: `ia_rescate:${m.id}`, valor: new Date().toISOString() });
    if (errReclamo) continue;

    console.log(`[IA Rescate] Respondiendo mensaje sin atender de ${m.telefono} (${m.expediente_id ?? "sin expediente"}).`);
    await responderConIA(sb, { telefono: m.telefono, expedienteId: m.expediente_id });
    rescatadas.push(m.telefono);
  }

  return { revisadas: pendientes.length, rescatadas };
}
