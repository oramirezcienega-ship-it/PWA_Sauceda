import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerConfiguracionTelegram, enviarMensajeTelegram } from "@/lib/telegram";
import { calcularSlotsDisponiblesConjuntos, type OpcionHorarioPropuesta } from "@/lib/coordinacion-inspecciones";
import { registrarActividad } from "@/lib/actividades";

/**
 * Negociación por etapas de una coordinación de inspección cuando las
 * opciones propuestas no acomodan a los asesores:
 *   1) DÍA     cada asesor marca los días que puede; se cruzan.
 *   2) FRANJA  sobre los días en común, cada uno marca mañana / tarde; se cruzan.
 *   3) HORA    con día y franja acordados se ofrecen horarios exactos libres
 *              en ambas agendas; se vota como en la propuesta normal.
 * Cada respuesta se evalúa y el sistema avanza solo a la siguiente etapa.
 */

export type EtapaNegociacion = "opciones" | "dias" | "franjas" | "horas" | "sin_coincidencia";

export interface Negociacion {
  etapa?: EtapaNegociacion;
  ronda?: number;
  diasOfrecidos?: string[];
  dias?: Record<string, { fechas: string[]; listo: boolean }>;
  paresOfrecidos?: string[]; // "YYYY-MM-DD|M" o "|T"
  franjas?: Record<string, { claves: string[]; listo: boolean }>;
  motivo?: string;
  actualizadoAt?: string;
}

export const FRANJAS = {
  M: { label: "Mañana", icono: "☀️", ini: 9 * 60, fin: 13 * 60 },
  T: { label: "Tarde", icono: "🌤️", ini: 14 * 60, fin: 18 * 60 },
} as const;

type Teclado = Array<Array<{ text: string; callback_data: string }>>;

// ------------------------------------------------------------
// Utilidades de fechas y etiquetas
// ------------------------------------------------------------

function hoyMX(): Date {
  // Fecha "de hoy" en México como Date local a medianoche
  const [y, m, d] = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const aISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Días hábiles (sin domingos) a partir de mañana, saltando los primeros `saltar`. */
export function diasHabilesDesdeManana(saltar: number, cantidad: number): string[] {
  const resultado: string[] = [];
  const d = hoyMX();
  let vistos = 0;
  while (resultado.length < cantidad) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) continue;
    if (vistos < saltar) {
      vistos++;
      continue;
    }
    resultado.push(aISO(d));
  }
  return resultado;
}

export function etiquetaDia(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1).replace(".", "");
}

const compacta = (f: string) => f.replace(/-/g, "");
const descompacta = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;

function hora12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

const aMin = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

// ------------------------------------------------------------
// Teclados de Telegram
// ------------------------------------------------------------

function tecladoDias(coordId: string, dias: string[], seleccion: string[]): Teclado {
  const filas: Teclado = [];
  for (let i = 0; i < dias.length; i += 2) {
    filas.push(
      dias.slice(i, i + 2).map((f) => ({
        text: `${seleccion.includes(f) ? "✅ " : ""}${etiquetaDia(f)}`,
        callback_data: `d:${coordId}:${compacta(f)}`,
      }))
    );
  }
  filas.push([
    { text: "✅ Listo", callback_data: `dl:${coordId}` },
    { text: "🚫 Ningún día me acomoda", callback_data: `dn:${coordId}` },
  ]);
  return filas;
}

function tecladoFranjas(coordId: string, pares: string[], seleccion: string[]): Teclado {
  const porDia = new Map<string, string[]>();
  for (const p of pares) {
    const [f] = p.split("|");
    porDia.set(f, [...(porDia.get(f) || []), p]);
  }
  const filas: Teclado = [];
  for (const [f, lista] of Array.from(porDia.entries())) {
    filas.push(
      lista.map((p) => {
        const franja = p.split("|")[1] as "M" | "T";
        return {
          text: `${seleccion.includes(p) ? "✅ " : ""}${etiquetaDia(f)} ${FRANJAS[franja].icono} ${FRANJAS[franja].label}`,
          callback_data: `f:${coordId}:${compacta(f)}${franja}`,
        };
      })
    );
  }
  filas.push([
    { text: "✅ Listo", callback_data: `fl:${coordId}` },
    { text: "🚫 Ninguna me acomoda", callback_data: `fn:${coordId}` },
  ]);
  return filas;
}

export function tecladoVotosHoras(coordId: string, opciones: OpcionHorarioPropuesta[]): Teclado {
  return [
    opciones.map((o) => ({ text: `🟢 Puedo ${o.id}`, callback_data: `v:${coordId}:${o.id}:1` })),
    [
      { text: "🟢 Puedo Todas", callback_data: `v:${coordId}:ALL:1` },
      { text: "🔴 Ninguna hora me acomoda", callback_data: `n:${coordId}` },
    ],
    [{ text: "👀 Enterado (ya lo leí)", callback_data: `e:${coordId}` }],
  ];
}

// ------------------------------------------------------------
// Acceso a datos
// ------------------------------------------------------------

async function cargar(sb: SupabaseClient, coordId: string) {
  const { data } = await sb.from("coordinaciones_inspeccion").select("*").eq("id", coordId).maybeSingle();
  return data as any | null;
}

async function guardar(
  sb: SupabaseClient,
  coordId: string,
  neg: Negociacion,
  extra: Record<string, any> = {}
): Promise<void> {
  await sb
    .from("coordinaciones_inspeccion")
    .update({
      negociacion: { ...neg, actualizadoAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", coordId);
}

/** Cada paso de la negociación reinicia el reloj de respuesta (30 min). */
const nuevoLimite = () => ({
  sla_limite_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  sla_estado: "en_tiempo",
});

async function chatsAsesores(sb: SupabaseClient, ids: string[]) {
  const { data } = await sb.from("perfiles").select("id, nombre, telegram_chat_id").in("id", ids);
  return (data || []) as { id: string; nombre: string; telegram_chat_id: string | null }[];
}

async function mensajeAAsesores(
  sb: SupabaseClient,
  ids: string[],
  texto: string,
  teclado?: (asesorId: string) => Teclado | undefined
): Promise<{ enviados: string[]; sinTelegram: string[] }> {
  const { botToken } = await obtenerConfiguracionTelegram(sb);
  const enviados: string[] = [];
  const sinTelegram: string[] = [];
  if (!botToken) return { enviados, sinTelegram: (await chatsAsesores(sb, ids)).map((p) => p.nombre) };

  for (const p of await chatsAsesores(sb, ids)) {
    if (!p.telegram_chat_id) {
      sinTelegram.push(p.nombre);
      continue;
    }
    const kb = teclado?.(p.id);
    const r = await enviarMensajeTelegram({
      botToken,
      chatId: p.telegram_chat_id,
      texto,
      inlineKeyboard: kb,
    });
    (r.ok ? enviados : sinTelegram).push(p.nombre);
  }
  return { enviados, sinTelegram };
}

/** Avisa al grupo técnico (y deja constancia en la bitácora) cuando hay que intervenir. */
async function escalarAAdministracion(sb: SupabaseClient, coord: any, motivo: string): Promise<void> {
  try {
    const { botToken, chatIdGrupo } = await obtenerConfiguracionTelegram(sb);
    if (botToken && chatIdGrupo) {
      await enviarMensajeTelegram({
        botToken,
        chatId: chatIdGrupo,
        texto: `⚠️ *Coordinación de inspección sin acuerdo*\n\nCliente: ${coord.cliente_nombre}\n${motivo}\n\nHay que llamar a los asesores para acordar el horario.`,
      });
    }
    await registrarActividad(sb, {
      prospectoId: coord.prospecto_id,
      expedienteId: coord.expediente_id,
      tipo: "coordinacion_sin_acuerdo",
      titulo: "⚠️ Coordinación de inspección sin acuerdo entre asesores",
      detalle: motivo,
    });
  } catch (err) {
    console.warn("[Negociación] No se pudo escalar:", err);
  }
}

async function dejarSinCoincidencia(sb: SupabaseClient, coord: any, neg: Negociacion, motivo: string): Promise<void> {
  await guardar(sb, coord.id, { ...neg, etapa: "sin_coincidencia", motivo });
  await mensajeAAsesores(
    sb,
    coord.asesores_ids || [],
    `⚠️ No se logró un acuerdo automático para la inspección de ${coord.cliente_nombre}.\n${motivo}\n\nAdministración se pondrá en contacto para acordar el horario.`
  );
  await escalarAAdministracion(sb, coord, motivo);
}

// ------------------------------------------------------------
// Etapa 1: DÍA
// ------------------------------------------------------------

/**
 * Inicia (o reinicia) la negociación pidiendo a los asesores los días que
 * pueden. `ronda` 2 ofrece los siguientes 5 días hábiles.
 */
export async function iniciarNegociacionDias(
  sb: SupabaseClient,
  coordId: string,
  ronda: number = 1
): Promise<{ ok: boolean; error?: string; enviados: string[]; sinTelegram: string[] }> {
  const coord = await cargar(sb, coordId);
  if (!coord) return { ok: false, error: "Coordinación no encontrada.", enviados: [], sinTelegram: [] };
  if (["confirmada", "cancelada"].includes(coord.estado)) {
    return { ok: false, error: "La coordinación ya está cerrada.", enviados: [], sinTelegram: [] };
  }

  const neg: Negociacion = (coord.negociacion as Negociacion) || {};

  // Si ya se llegó a horas exactas y ninguna acomoda, no se reinicia: se escala
  if (neg.etapa === "horas" && ronda === 1) {
    await dejarSinCoincidencia(sb, coord, neg, "Coinciden en día y franja pero ninguna hora exacta acomoda a los dos.");
    return { ok: true, enviados: [], sinTelegram: [] };
  }
  // Evita reiniciar si ya está pidiendo días
  if (neg.etapa === "dias" && ronda === 1) {
    return { ok: true, enviados: [], sinTelegram: [] };
  }

  const ids: string[] = coord.asesores_ids || [];
  const diasOfrecidos = diasHabilesDesdeManana(ronda === 1 ? 0 : 5, 5);
  const nuevo: Negociacion = {
    etapa: "dias",
    ronda,
    diasOfrecidos,
    dias: Object.fromEntries(ids.map((id) => [id, { fechas: [], listo: false }])),
  };
  await guardar(sb, coordId, nuevo, nuevoLimite());

  const intro =
    ronda === 1
      ? `📅 *Otro día para la inspección de ${coord.cliente_nombre}*\n\nLos horarios propuestos no acomodaron. Toca *los días en que SÍ puedes* y pulsa ✅ Listo.`
      : `📅 *Siguientes días para la inspección de ${coord.cliente_nombre}*\n\nNo coincidieron en los días anteriores. Estos son los que siguen: toca los que SÍ puedes y pulsa ✅ Listo.`;

  const r = await mensajeAAsesores(sb, ids, intro, () => tecladoDias(coordId, diasOfrecidos, []));
  return { ok: true, ...r };
}

/** Marca o desmarca un día para un asesor y devuelve su selección actual. */
export async function alternarDiaAsesor(
  sb: SupabaseClient,
  coordId: string,
  asesorId: string,
  fechaCompacta: string
): Promise<{ ok: boolean; seleccion: string[]; ofrecidos: string[] }> {
  const coord = await cargar(sb, coordId);
  const neg: Negociacion = coord?.negociacion || {};
  if (!coord || neg.etapa !== "dias") return { ok: false, seleccion: [], ofrecidos: [] };

  const fecha = descompacta(fechaCompacta);
  const ofrecidos = neg.diasOfrecidos || [];
  if (!ofrecidos.includes(fecha)) return { ok: false, seleccion: [], ofrecidos };

  const actual = neg.dias?.[asesorId] || { fechas: [], listo: false };
  const fechas = actual.fechas.includes(fecha) ? actual.fechas.filter((f) => f !== fecha) : [...actual.fechas, fecha];
  neg.dias = { ...(neg.dias || {}), [asesorId]: { fechas, listo: false } };
  await guardar(sb, coordId, neg);
  return { ok: true, seleccion: fechas, ofrecidos };
}

/** El asesor terminó de marcar días (o marcó "ninguno"). Evalúa y avanza si ya respondieron todos. */
export async function marcarDiasListo(
  sb: SupabaseClient,
  coordId: string,
  asesorId: string,
  ninguno: boolean
): Promise<{ ok: boolean; mensaje: string }> {
  const coord = await cargar(sb, coordId);
  const neg: Negociacion = coord?.negociacion || {};
  if (!coord || neg.etapa !== "dias") return { ok: false, mensaje: "Esta consulta ya no está activa." };

  const actual = neg.dias?.[asesorId] || { fechas: [], listo: false };
  neg.dias = { ...(neg.dias || {}), [asesorId]: { fechas: ninguno ? [] : actual.fechas, listo: true } };
  await guardar(sb, coordId, neg);

  await evaluarNegociacion(sb, coordId);
  return { ok: true, mensaje: "Registrado. Cuando ambos respondan te aviso cómo seguimos." };
}

// ------------------------------------------------------------
// Etapa 2: FRANJA
// ------------------------------------------------------------

async function iniciarFranjas(sb: SupabaseClient, coord: any, neg: Negociacion, diasComunes: string[]): Promise<void> {
  const ids: string[] = coord.asesores_ids || [];
  const dias = diasComunes.slice(0, 3);
  const pares = dias.flatMap((f) => [`${f}|M`, `${f}|T`]);

  const nuevo: Negociacion = {
    ...neg,
    etapa: "franjas",
    paresOfrecidos: pares,
    franjas: Object.fromEntries(ids.map((id) => [id, { claves: [], listo: false }])),
  };
  await guardar(sb, coord.id, nuevo, nuevoLimite());

  const texto =
    `✅ *Coinciden en:* ${dias.map(etiquetaDia).join(", ")}\n\n` +
    `Ahora elige *en qué franja* puedes (mañana ${FRANJAS.M.icono} / tarde ${FRANJAS.T.icono}) y pulsa ✅ Listo.`;
  await mensajeAAsesores(sb, ids, texto, () => tecladoFranjas(coord.id, pares, []));
}

export async function alternarFranjaAsesor(
  sb: SupabaseClient,
  coordId: string,
  asesorId: string,
  claveCompacta: string // YYYYMMDD + M|T
): Promise<{ ok: boolean; seleccion: string[]; pares: string[] }> {
  const coord = await cargar(sb, coordId);
  const neg: Negociacion = coord?.negociacion || {};
  if (!coord || neg.etapa !== "franjas") return { ok: false, seleccion: [], pares: [] };

  const franja = claveCompacta.slice(8, 9);
  const clave = `${descompacta(claveCompacta.slice(0, 8))}|${franja}`;
  const pares = neg.paresOfrecidos || [];
  if (!pares.includes(clave)) return { ok: false, seleccion: [], pares };

  const actual = neg.franjas?.[asesorId] || { claves: [], listo: false };
  const claves = actual.claves.includes(clave) ? actual.claves.filter((c) => c !== clave) : [...actual.claves, clave];
  neg.franjas = { ...(neg.franjas || {}), [asesorId]: { claves, listo: false } };
  await guardar(sb, coordId, neg);
  return { ok: true, seleccion: claves, pares };
}

export async function marcarFranjasListo(
  sb: SupabaseClient,
  coordId: string,
  asesorId: string,
  ninguno: boolean
): Promise<{ ok: boolean; mensaje: string }> {
  const coord = await cargar(sb, coordId);
  const neg: Negociacion = coord?.negociacion || {};
  if (!coord || neg.etapa !== "franjas") return { ok: false, mensaje: "Esta consulta ya no está activa." };

  const actual = neg.franjas?.[asesorId] || { claves: [], listo: false };
  neg.franjas = { ...(neg.franjas || {}), [asesorId]: { claves: ninguno ? [] : actual.claves, listo: true } };
  await guardar(sb, coordId, neg);

  await evaluarNegociacion(sb, coordId);
  return { ok: true, mensaje: "Registrado. Cuando ambos respondan te aviso cómo seguimos." };
}

// ------------------------------------------------------------
// Etapa 3: HORA exacta
// ------------------------------------------------------------

async function generarHorariosExactos(sb: SupabaseClient, coord: any, neg: Negociacion, pares: string[]): Promise<void> {
  const ids: string[] = coord.asesores_ids || [];
  const slots = await calcularSlotsDisponiblesConjuntos(sb, ids, 21, 60);

  const opciones: OpcionHorarioPropuesta[] = [];
  const letras = ["A", "B", "C", "D"];

  // Se ordenan los pares por fecha y franja; hasta 2 horarios por par, separados
  const ordenados = [...pares].sort();
  for (const par of ordenados) {
    if (opciones.length >= 4) break;
    const [fecha, franja] = par.split("|") as [string, "M" | "T"];
    const { ini, fin } = FRANJAS[franja];
    const candidatos = slots
      .filter((s) => s.fecha === fecha && aMin(s.horaInicio) >= ini && aMin(s.horaInicio) + 60 <= fin)
      .sort((a, b) => aMin(a.horaInicio) - aMin(b.horaInicio));
    if (candidatos.length === 0) continue;

    // Primer horario y uno a media franja (si hay), para dar variedad
    const elegidos = candidatos.length > 2 ? [candidatos[0], candidatos[Math.floor(candidatos.length / 2)]] : candidatos.slice(0, 2);
    for (const s of elegidos) {
      if (opciones.length >= 4) break;
      const hIni = s.horaInicio.slice(0, 5);
      const hFin = s.horaFin.slice(0, 5);
      opciones.push({
        id: letras[opciones.length],
        fecha,
        horaInicio: hIni,
        horaFin: hFin,
        label: `${etiquetaDia(fecha)} · ${hora12(hIni)}`,
      });
    }
  }

  if (opciones.length === 0) {
    await dejarSinCoincidencia(
      sb,
      coord,
      neg,
      "Coinciden en día y franja, pero no hay horas libres en la agenda de ambos en esa franja."
    );
    return;
  }

  // Se reinician los votos conservando nombre, entrega y lectura
  const respuestas: Record<string, any> = { ...(coord.respuestas_asesores || {}) };
  for (const id of ids) {
    respuestas[id] = { ...(respuestas[id] || {}), votos: {}, respondidoAt: null };
  }

  await guardar(
    sb,
    coord.id,
    { ...neg, etapa: "horas" },
    {
      opciones_horarios: opciones,
      opciones_validadas: [],
      respuestas_asesores: respuestas,
      estado: "evaluando",
      ...nuevoLimite(),
    }
  );

  const lista = opciones.map((o) => `👉 *Opción ${o.id}:* ${o.label}`).join("\n");
  await mensajeAAsesores(
    sb,
    ids,
    `🕐 *Ya coinciden en día y franja* para la inspección de ${coord.cliente_nombre}.\n\nElige la *hora exacta* que puedes:\n${lista}`,
    () => tecladoVotosHoras(coord.id, opciones)
  );
}

// ------------------------------------------------------------
// Evaluación: avanza de etapa cuando todos respondieron
// ------------------------------------------------------------

export async function evaluarNegociacion(sb: SupabaseClient, coordId: string): Promise<void> {
  const coord = await cargar(sb, coordId);
  if (!coord) return;
  const neg: Negociacion = coord.negociacion || {};
  const ids: string[] = coord.asesores_ids || [];

  if (neg.etapa === "dias") {
    if (!ids.every((id) => neg.dias?.[id]?.listo)) return;

    const comunes = (neg.diasOfrecidos || []).filter((f) => ids.every((id) => neg.dias?.[id]?.fechas.includes(f)));
    if (comunes.length > 0) {
      await iniciarFranjas(sb, coord, neg, comunes);
      return;
    }
    if ((neg.ronda || 1) < 2) {
      await mensajeAAsesores(
        sb,
        ids,
        "No coincidieron en ningún día de esta semana. Te muestro los días que siguen."
      );
      await iniciarNegociacionDias(sb, coordId, 2);
      return;
    }
    await dejarSinCoincidencia(sb, coord, neg, "No coincidieron en ningún día (dos rondas de días).");
    return;
  }

  if (neg.etapa === "franjas") {
    if (!ids.every((id) => neg.franjas?.[id]?.listo)) return;

    const comunes = (neg.paresOfrecidos || []).filter((p) => ids.every((id) => neg.franjas?.[id]?.claves.includes(p)));
    if (comunes.length > 0) {
      await generarHorariosExactos(sb, coord, neg, comunes);
      return;
    }
    await dejarSinCoincidencia(
      sb,
      coord,
      neg,
      "Coinciden en el día pero no en la franja (uno prefiere mañana y el otro tarde)."
    );
  }
}

// ------------------------------------------------------------
// Para el teclado que se actualiza al pulsar un botón
// ------------------------------------------------------------

export function armarTecladoDias(coordId: string, dias: string[], seleccion: string[]): Teclado {
  return tecladoDias(coordId, dias, seleccion);
}

export function armarTecladoFranjas(coordId: string, pares: string[], seleccion: string[]): Teclado {
  return tecladoFranjas(coordId, pares, seleccion);
}

/** Cambia el teclado de un mensaje ya enviado (para mostrar ✅ en lo seleccionado). */
export async function actualizarTecladoTelegram(
  botToken: string,
  chatId: string | number,
  messageId: number,
  teclado: Teclado
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: teclado } }),
    });
  } catch (err) {
    console.warn("[Telegram] No se pudo actualizar el teclado:", err);
  }
}
