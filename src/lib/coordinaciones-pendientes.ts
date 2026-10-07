import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";

/** Estados de una coordinación que aún no termina (ni confirmada ni cancelada). */
export const ESTADOS_COORDINACION_PENDIENTE = ["propuesta_enviada", "evaluando", "enviado_cliente"] as const;

export interface AsesorCoordinacionPendiente {
  id: string;
  nombre: string;
  respondio: boolean;
  enterado: boolean;
}

export interface CoordinacionPendiente {
  id: string;
  prospectoId: string | null;
  expedienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  servicioNombre: string;
  ubicacion: string;
  estado: string;
  estadoLabel: string;
  createdAt: string;
  /** Días completos desde que se creó. */
  diasAntiguedad: number;
  /** Horas desde que se creó (para las de menos de un día). */
  horasAntiguedad: number;
  slaVencido: boolean;
  opciones: string[];
  opcionesValidadas: string[];
  asesores: AsesorCoordinacionPendiente[];
}

export function etiquetaEstadoCoordinacion(estado: string): string {
  if (estado === "enviado_cliente") return "Esperando respuesta del cliente";
  if (estado === "evaluando" || estado === "propuesta_enviada") return "Esperando respuesta de asesores";
  return estado;
}

export function textoAntiguedad(c: Pick<CoordinacionPendiente, "diasAntiguedad" | "horasAntiguedad">): string {
  if (c.diasAntiguedad >= 1) return `${c.diasAntiguedad} día${c.diasAntiguedad === 1 ? "" : "s"}`;
  if (c.horasAntiguedad >= 1) return `${c.horasAntiguedad} h`;
  return "menos de 1 h";
}

/**
 * Lista las coordinaciones de inspección pendientes, de la más antigua a la más reciente.
 * Si se pasa `perfilId`, solo las que tienen a ese asesor asignado.
 */
export async function listarCoordinacionesPendientes(
  sb: SupabaseClient,
  perfilId?: string | null,
): Promise<CoordinacionPendiente[]> {
  let q = sb
    .from("coordinaciones_inspeccion")
    .select(
      "id, prospecto_id, expediente_id, cliente_nombre, cliente_telefono, servicio_nombre, ubicacion, estado, created_at, sla_limite_at, asesores_ids, opciones_horarios, opciones_validadas, respuestas_asesores",
    )
    .in("estado", ESTADOS_COORDINACION_PENDIENTE as unknown as string[])
    .order("created_at", { ascending: true });
  if (perfilId) q = q.contains("asesores_ids", [perfilId]);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const filas = data || [];
  const idsAsesores = Array.from(new Set(filas.flatMap((f: any) => (f.asesores_ids || []) as string[])));
  const nombres = new Map<string, string>();
  if (idsAsesores.length > 0) {
    const { data: perfiles } = await sb.from("perfiles").select("id, nombre").in("id", idsAsesores);
    for (const p of perfiles || []) nombres.set(p.id, p.nombre);
  }

  const ahora = Date.now();
  return filas.map((f: any) => {
    const creadoMs = f.created_at ? new Date(f.created_at).getTime() : ahora;
    const difMs = Math.max(0, ahora - creadoMs);
    const respuestas = (f.respuestas_asesores || {}) as Record<string, any>;
    const limiteMs = f.sla_limite_at ? new Date(f.sla_limite_at).getTime() : null;
    return {
      id: f.id,
      prospectoId: f.prospecto_id ?? null,
      expedienteId: f.expediente_id ?? null,
      clienteNombre: f.cliente_nombre || "Cliente",
      clienteTelefono: f.cliente_telefono || "",
      servicioNombre: f.servicio_nombre || "Inspección",
      ubicacion: f.ubicacion || "",
      estado: f.estado,
      estadoLabel: etiquetaEstadoCoordinacion(f.estado),
      createdAt: f.created_at,
      diasAntiguedad: Math.floor(difMs / 86_400_000),
      horasAntiguedad: Math.floor(difMs / 3_600_000),
      slaVencido: f.estado === "evaluando" && limiteMs !== null && limiteMs < ahora,
      opciones: ((f.opciones_horarios || []) as Array<{ id: string; label: string }>).map((o) => `${o.id}: ${o.label}`),
      opcionesValidadas: (f.opciones_validadas || []) as string[],
      asesores: ((f.asesores_ids || []) as string[]).map((aId) => {
        const r = respuestas[aId] || {};
        return {
          id: aId,
          nombre: nombres.get(aId) || r.nombre || "Asesor",
          respondio: Boolean(r.respondidoAt),
          enterado: Boolean(r.enteradoAt || r.respondidoAt),
        };
      }),
    };
  });
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Arma el reporte en HTML de Telegram, partido en mensajes que respetan el límite de 4096 caracteres. */
export function formatearReporteCoordinacionesTelegram(
  lista: CoordinacionPendiente[],
  opts: { titulo: string; siteUrl: string; destinatarioId?: string },
): string[] {
  const fecha = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });
  const encabezado = `📋 <b>${esc(opts.titulo)}</b>\n${esc(fecha)} · <b>${lista.length}</b> pendiente${lista.length === 1 ? "" : "s"} (de la más antigua a la más reciente)\n`;

  if (lista.length === 0) return [`${encabezado}\n✅ No hay coordinaciones de inspección pendientes.`];

  const bloques = lista.map((c, i) => {
    const alerta = c.diasAntiguedad >= 3 ? "🔴" : c.diasAntiguedad >= 1 ? "🟠" : "🟢";
    const asesores = c.asesores
      .map((a) => {
        const marca = a.respondio ? "✅" : a.enterado ? "👀" : "⏳";
        const yo = opts.destinatarioId && a.id === opts.destinatarioId ? " (tú)" : "";
        return `${marca} ${esc(a.nombre)}${yo}`;
      })
      .join(", ");
    const link = c.prospectoId
      ? `\n🔗 <a href="${opts.siteUrl}/prospectos/${encodeURIComponent(c.prospectoId)}">Abrir en CRM</a>`
      : "";
    return [
      `${alerta} <b>${i + 1}. ${esc(c.clienteNombre)}</b> · hace ${textoAntiguedad(c)}`,
      `🛠️ ${esc(c.servicioNombre)}`,
      c.ubicacion ? `📍 ${esc(c.ubicacion)}` : "",
      c.clienteTelefono ? `📞 ${esc(c.clienteTelefono)}` : "",
      `📌 ${esc(c.estadoLabel)}${c.slaVencido ? " · <b>SLA vencido</b>" : ""}`,
      asesores ? `👥 ${asesores}` : "",
    ]
      .filter(Boolean)
      .join("\n") + link;
  });

  const pie = `\n<i>✅ respondió · 👀 enterado · ⏳ sin respuesta</i>`;
  const mensajes: string[] = [];
  let actual = encabezado;
  for (const b of bloques) {
    if ((actual + "\n" + b).length > 3800) {
      mensajes.push(actual);
      actual = "";
    }
    actual += "\n" + b + "\n";
  }
  mensajes.push(actual + pie);
  return mensajes;
}

export interface ResultadoEnvioReporte {
  ok: boolean;
  enviados: number;
  /** Asesores con pendientes a quienes no se les pudo mandar (sin Telegram vinculado o error). */
  sinEntrega: string[];
  error?: string;
}

/**
 * Comparte el reporte de coordinaciones pendientes por Telegram.
 * - "grupo": el reporte completo al grupo operativo configurado.
 * - "asesores": a cada asesor, a su chat personal, solo sus pendientes.
 */
export async function enviarReporteCoordinacionesTelegram(
  sb: SupabaseClient,
  destino: "grupo" | "asesores",
  siteUrl: string,
): Promise<ResultadoEnvioReporte> {
  const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
  if (!botToken) return { ok: false, enviados: 0, sinEntrega: [], error: "El bot de Telegram no está configurado." };

  const lista = await listarCoordinacionesPendientes(sb);

  if (destino === "grupo") {
    if (!chatIdGrupo) return { ok: false, enviados: 0, sinEntrega: [], error: "No hay chat de grupo de Telegram configurado." };
    const mensajes = formatearReporteCoordinacionesTelegram(lista, { titulo: "Coordinaciones de inspección pendientes", siteUrl });
    let enviados = 0;
    for (const texto of mensajes) {
      const r = await enviarMensajeTelegram({ botToken, chatId: chatIdGrupo, texto, parseMode: "HTML" });
      if (!r.ok) return { ok: false, enviados, sinEntrega: [], error: r.error };
      enviados++;
    }
    return { ok: true, enviados, sinEntrega: [] };
  }

  // Por asesor: cada quien recibe solo las suyas
  const porAsesor = new Map<string, CoordinacionPendiente[]>();
  for (const c of lista) {
    for (const a of c.asesores) {
      if (!porAsesor.has(a.id)) porAsesor.set(a.id, []);
      porAsesor.get(a.id)!.push(c);
    }
  }
  if (porAsesor.size === 0) return { ok: true, enviados: 0, sinEntrega: [] };

  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id, nombre, telegram_chat_id")
    .in("id", Array.from(porAsesor.keys()));

  let enviados = 0;
  const sinEntrega: string[] = [];
  for (const p of perfiles || []) {
    if (!p.telegram_chat_id) {
      sinEntrega.push(p.nombre || "Asesor");
      continue;
    }
    const primerNombre = (p.nombre || "").split(" ")[0] || "Asesor";
    const mensajes = formatearReporteCoordinacionesTelegram(porAsesor.get(p.id) || [], {
      titulo: `Recordatorio ${primerNombre}: tus inspecciones por coordinar`,
      siteUrl,
      destinatarioId: p.id,
    });
    let okTodos = true;
    for (const texto of mensajes) {
      const r = await enviarMensajeTelegram({ botToken, chatId: p.telegram_chat_id, texto, parseMode: "HTML" });
      if (!r.ok) {
        okTodos = false;
        break;
      }
    }
    if (okTodos) enviados++;
    else sinEntrega.push(p.nombre || "Asesor");
  }
  return { ok: enviados > 0 || sinEntrega.length === 0, enviados, sinEntrega };
}
