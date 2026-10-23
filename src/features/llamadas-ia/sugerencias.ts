import { supabaseServidor } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { modeloClaude, opcionesClaude, textoDeRespuesta } from "@/lib/ia/claude";
import { partesMX, type LlamadaIA } from "@/features/llamadas-ia/service";
import type { SegmentoLlamada } from "@/features/llamadas-ia/segmentos";

/**
 * Bandeja de llamadas sugeridas. Para cada fila en 'pendiente', la IA lee la
 * cotización y la conversación de WhatsApp y propone prioridad, hora de
 * llamada y el gancho con que Sofía abre. La hora sale de cuándo escribe el
 * cliente, siempre dentro del horario de llamadas (lunes a sábado, 10 a 19 h).
 * Nada se marca: el humano aprueba, edita o descarta.
 */

export type PrioridadLlamada = "alta" | "media" | "baja";

export interface SugerenciaLlamada {
  /** Por qué conviene (o no) llamarle, en una línea. */
  razon: string;
  /** Con qué abrir el paso DESCUBRIR: algo concreto que dijo o preguntó. */
  gancho: string;
  objecion?: string;
  /** Por qué esa hora. */
  hora_razon: string;
  /** Resumen de dónde se quedó la conversación. */
  punto?: string;
  /** Precio o cotización que ya se le dio en la conversación (vacío si no). */
  precio_dado?: string;
  /** Datos que faltan para cotizarle (segmentos sin_respuesta / sin_cotizar). */
  faltan?: string;
  /** La conversación dice que no conviene llamar (ya contrató, pidió no contacto…). */
  descartar?: boolean;
  /** El humano cambió hora o gancho. */
  editada?: boolean;
}

const OFFSET_MX = "-06:00";
const HORA_MIN = 10;
const HORA_MAX = 18; // la última llamada empieza antes de las 19
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

interface Mensaje {
  direccion: string;
  texto: string | null;
  created_at: string;
}

/** Cuándo escribe el cliente: horas y días con más mensajes entrantes (hora de México). */
function habitosDeRespuesta(mensajes: Mensaje[]): string {
  const entrantes = mensajes.filter((m) => m.direccion === "in");
  if (!entrantes.length) return "El cliente no ha escrito mensajes (solo hay mensajes nuestros).";
  const porHora = new Map<number, number>();
  const porDia = new Map<number, number>();
  for (const m of entrantes) {
    const { hora, diaSemana } = partesMX(new Date(m.created_at));
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
    porDia.set(diaSemana, (porDia.get(diaSemana) ?? 0) + 1);
  }
  const horas = Array.from(porHora.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const dias = Array.from(porDia.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `${entrantes.length} mensajes del cliente. Horas en que más escribe: ${horas
    .map(([h, n]) => `${h}:00–${h + 1}:00 (${n})`)
    .join(", ")}. Días: ${dias.map(([d, n]) => `${DIAS[d]} (${n})`).join(", ")}.`;
}

/**
 * Las cotizaciones llegan al chat como imagen: se describen para que el modelo
 * sepa que el cliente ya tiene precio (mismo criterio que describirImagen en agente.ts).
 * El precio de la cotización express solo está en la actividad que se registra al enviarla.
 */
function legible(m: Mensaje, express: { titulo: string; created_at: string }[]): string {
  const texto = m.texto!.replace(/\s+/g, " ");
  if (m.direccion !== "out") return texto;
  const pie = texto.match(/^\[image:[^\]]*\]\s*(.*)$/)?.[1] ?? "";
  if (/^Cotización express:/i.test(pie)) {
    const t = Date.parse(m.created_at);
    const reg = express
      .map((e) => ({ e, dt: Math.abs(Date.parse(e.created_at) - t) }))
      .filter((x) => x.dt < 30 * 60 * 1000)
      .sort((a, b) => a.dt - b.dt)[0]?.e;
    const detalle = reg ? reg.titulo.replace(/^Cotización Express\s*·\s*/i, "") : pie.replace(/^Cotización express:\s*/i, "");
    return `(COTIZACIÓN EXPRESS PERSONAL enviada en imagen: ${detalle})`;
  }
  const imper = pie.match(/^(?:Comparativa|Propuesta) de impermeabilización para ([\d.,]+)\s*m²/i);
  if (imper) return `(COTIZACIÓN PERSONAL de impermeabilización enviada en imagen para ${imper[1]} m²; cifras solo en la imagen)`;
  if (/\[plantilla:\s*[^\]]*(comparativa|cotizacion|precio)[^\]]*\]/i.test(texto)) {
    return `(plantilla de campaña con precios de REFERENCIA generales; no es su cotización personal) ${texto}`;
  }
  return texto;
}

function transcripcion(mensajes: Mensaje[], express: { titulo: string; created_at: string }[] = []): string {
  const lineas = mensajes
    .filter((m) => m.texto?.trim())
    .map((m) => {
      const { fecha, hora } = partesMX(new Date(m.created_at));
      const quien = m.direccion === "in" ? "CLIENTE" : "SAUCEDA";
      return `[${fecha} ${hora}h] ${quien}: ${legible(m, express).slice(0, 280)}`;
    });
  // Se conservan los más recientes si la conversación es muy larga.
  let total = 0;
  const salida: string[] = [];
  for (let i = lineas.length - 1; i >= 0; i--) {
    total += lineas[i].length;
    if (total > 9000) break;
    salida.unshift(lineas[i]);
  }
  return salida.join("\n") || "(sin mensajes)";
}

/**
 * Próxima fecha a esa hora en uno de los días preferidos (lunes a sábado), al
 * menos 30 min en el futuro.
 */
export function proximaHora(hora: number, minuto: number, dias: number[], desde = new Date()): string {
  const h = Math.min(HORA_MAX, Math.max(HORA_MIN, Math.round(hora) || HORA_MIN));
  const m = [0, 15, 30, 45].includes(minuto) ? minuto : 0;
  const permitidos = dias.filter((d) => d >= 1 && d <= 6);
  const minimo = desde.getTime() + 30 * 60 * 1000;
  for (let i = 0; i < 14; i++) {
    const { fecha, diaSemana } = partesMX(new Date(desde.getTime() + i * 24 * 3600 * 1000));
    if (diaSemana === 0 || (permitidos.length && !permitidos.includes(diaSemana))) continue;
    const iso = `${fecha}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00${OFFSET_MX}`;
    if (new Date(iso).getTime() >= minimo) return new Date(iso).toISOString();
  }
  // Sin coincidencia con los días preferidos: el siguiente día hábil.
  return permitidos.length ? proximaHora(h, m, [], desde) : new Date(minimo).toISOString();
}

function promptSugerencia(ll: LlamadaIA, datos: string, habitos: string, chat: string): string {
  const ahora = new Date();
  const { fecha, hora, diaSemana } = partesMX(ahora);
  return `Eres el planeador de llamadas de seguimiento de Sauceda (impermeabilización, pisos y obra en León, Guanajuato). Sofía, una asistente de voz, llamará a este cliente para darle seguimiento. El objetivo de la llamada depende de su segmento: reconectar si dejó de contestar, completar datos si no tiene precio, o resolver dudas y coordinar una visita sin costo si ya tiene precio.

Hoy es ${DIAS[diaSemana]} ${fecha}, ${hora}:00 h (hora de México). Se puede llamar de lunes a sábado de 10 a 19 h.

DATOS DEL CLIENTE:
${datos}

CUÁNDO ESCRIBE EL CLIENTE:
${habitos}

CONVERSACIÓN DE WHATSAPP (más reciente al final):
${chat}

Decide:
1. prioridad y puntaje (0–100): qué tan probable es que esta llamada lo acerque a contratar. Sube: dio medidas o fotos, preguntó precio, tiempos, formas de pago o fechas, respondió rápido, cotización reciente o de monto alto. Baja: dejó de responder hace mucho, solo pidió precio y desapareció, dijo que lo va a pensar sin más. Pon descartar=true y puntaje 0 si ya contrató a otro, dijo que no le interesa, pidió no ser contactado o el número no es del cliente.
2. hora: el día y hora en que es más probable que conteste, según cuándo escribe. Si escribe en la noche o fuera de horario, elige la hora permitida más cercana a su costumbre (por ejemplo 18:00 o 18:30). Si escribe en fin de semana, prefiere sábado. Si no hay datos, media mañana (11:00) entre semana.
3. gancho: 1–2 frases, tratando al cliente de USTED, que Sofía puede usar para retomar, basadas en algo CONCRETO que el cliente dijo o preguntó (su área, su duda, su problema; ej. "Nos comentó que se le filtra el agua en la recámara; ¿pudo revisar la cotización?"). No saludes ni te presentes: Sofía ya lo hace. El gancho solo retoma un dato: NO propone visita, cita ni siguiente paso (eso lo decide el guion según el segmento). No inventes precios, descuentos ni promociones. Si la conversación no tiene nada concreto, escribe solo: "Sin dato concreto: retomar la conversación."
4. objecion: la objeción o freno más probable, si se nota.
5. precio_dado: si SAUCEDA ya le dio un precio o cotización PERSONAL (por m², total, paquete, enlace de cotización, COTIZACIÓN EXPRESS o COTIZACIÓN PERSONAL en imagen), escríbelo con las cifras EXACTAS que se le dieron y a qué se refieren (ej. "$X por m², unos $Y por sus N m² de cochera"); si las cifras solo están en la imagen, escribe qué recibió sin cifras (ej. "cotización de impermeabilización en imagen para 80 m²"). Las plantillas de campaña con precios de REFERENCIA generales NO cuentan. No inventes cifras; si no se le dio precio personal, "".
6. segmento:
   - "cotizado": ya tiene precio (cotización formal en el sistema o precio_dado en el chat).
   - "sin_cotizar": no tiene precio, pero sí dio datos o mostró interés concreto (área, medidas, fotos, preguntó precio) y la conversación se quedó sin presupuesto.
   - "sin_respuesta": no tiene precio y casi no dio datos: escribió y dejó de contestar, o solo saludó o preguntó algo general.
   - "no_interesado": ya contrató a otro, dijo que no le interesa o pidió no ser contactado (igual que descartar=true).
7. faltan: si no es "cotizado", los datos que faltan para poder cotizarle (ej. "metros aproximados y tipo de suelo"); si no, "".

Responde SOLO con este JSON:
{"prioridad":"alta|media|baja","puntaje":0,"razon":"máximo 20 palabras","punto":"dónde se quedó la conversación, máximo 20 palabras","dias":[1,2,3,4,5,6],"hora":11,"minuto":0,"hora_razon":"máximo 15 palabras","gancho":"...","objecion":"","precio_dado":"","segmento":"sin_respuesta|sin_cotizar|cotizado|no_interesado","faltan":"","descartar":false}
"dias" usa 1=lunes … 6=sábado; vacío si da igual.`;
}

async function datosDeLlamada(
  ll: LlamadaIA,
): Promise<{ datos: string; mensajes: Mensaje[]; express: { titulo: string; created_at: string }[] }> {
  const sb = supabaseServidor();
  // En mensajes_whatsapp el teléfono aparece como 52…, 521… o a 10 dígitos.
  const diez = normalizarTelefono(ll.telefono).slice(-10);
  const filtros = [`telefono.in.(52${diez},521${diez},${diez})`];
  if (ll.prospecto_id) filtros.push(`prospecto_id.eq.${ll.prospecto_id}`);

  const [{ data: cot }, { data: pros }, { data: msgs }, { data: express }] = await Promise.all([
    ll.cotizacion_id
      ? sb.from("cotizaciones").select("created_at, updated_at, precio_final, servicio_tipo").eq("id", ll.cotizacion_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ll.prospecto_id
      ? sb.from("prospectos").select("created_at, origen, ciudad, calificacion").eq("id", ll.prospecto_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, created_at")
      .or(filtros.join(","))
      .order("created_at", { ascending: false })
      .limit(80),
    ll.prospecto_id
      ? sb
          .from("actividades")
          .select("titulo, created_at")
          .eq("tipo", "cotizacion_express")
          .eq("prospecto_id", ll.prospecto_id)
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const mensajes = ((msgs ?? []) as Mensaje[]).reverse();
  const dias = (iso?: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null);
  const ultimoCliente = [...mensajes].reverse().find((m) => m.direccion === "in");
  const c = ll.contexto;
  const datos = [
    `- Cliente: ${ll.nombre || "sin nombre"}${pros?.ciudad ? ` (${pros.ciudad})` : ""}${c.colonia ? `, ${c.colonia}` : ""}.`,
    `- Servicio: ${c.servicio || "sin dato"}${c.metros ? `, ${c.metros} m²` : ""}${c.paquete ? `, opción ${c.paquete}` : ""}.`,
    `- Cotización formal en el sistema: ${ll.cotizacion_id ? "sí" : "no"}.`,
    c.monto ? `- Estimado enviado: $${Math.round(c.monto).toLocaleString("es-MX")}.` : "",
    cot?.created_at ? `- Cotización creada hace ${dias(cot.created_at as string)} días.` : "",
    pros?.created_at ? `- Llegó como lead hace ${dias(pros.created_at as string)} días${pros.origen ? ` por ${pros.origen}` : ""}.` : "",
    ultimoCliente ? `- Último mensaje del cliente hace ${dias(ultimoCliente.created_at)} días.` : "- El cliente nunca respondió por WhatsApp.",
    pros?.calificacion ? `- Calificación del asesor: ${pros.calificacion}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { datos, mensajes, express: (express ?? []) as { titulo: string; created_at: string }[] };
}

/** Analiza una fila pendiente y guarda la sugerencia. */
export async function analizarSugerencia(
  ll: LlamadaIA,
): Promise<{
  ok: boolean;
  error?: string;
  prioridad?: PrioridadLlamada;
  puntaje?: number;
  segmento?: SegmentoLlamada;
  hora?: string;
  sugerencia?: SugerenciaLlamada;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "Falta ANTHROPIC_API_KEY." };

  const { datos, mensajes, express } = await datosDeLlamada(ll);
  const model = modeloClaude();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      ...opcionesClaude(model, { maxTokens: 700, temperature: 0.2 }),
      messages: [{ role: "user", content: promptSugerencia(ll, datos, habitosDeRespuesta(mensajes), transcripcion(mensajes, express)) }],
    }),
  });
  if (!res.ok) return { ok: false, error: `Claude ${res.status}: ${(await res.text()).slice(0, 200)}` };

  const match = textoDeRespuesta(await res.json()).match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "La IA no devolvió JSON." };
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: "JSON de la IA no válido." };
  }

  const descartar = r.descartar === true;
  const prioridad: PrioridadLlamada = descartar
    ? "baja"
    : (["alta", "media", "baja"] as const).includes(r.prioridad as PrioridadLlamada)
      ? (r.prioridad as PrioridadLlamada)
      : "media";
  const puntaje = descartar ? 0 : Math.max(0, Math.min(100, Math.round(Number(r.puntaje) || 0)));
  const dias = Array.isArray(r.dias) ? r.dias.map(Number).filter((d) => Number.isInteger(d)) : [];
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const sugerencia: SugerenciaLlamada = {
    razon: texto(r.razon),
    gancho: texto(r.gancho),
    objecion: texto(r.objecion) || undefined,
    hora_razon: texto(r.hora_razon),
    punto: texto(r.punto) || undefined,
    precio_dado: texto(r.precio_dado) || undefined,
    faltan: texto(r.faltan) || undefined,
    descartar: descartar || undefined,
  };

  // Lo duro manda sobre la IA: con cotización o precio en el chat es "cotizado".
  const segmentoIA = r.segmento as SegmentoLlamada;
  const segmento: SegmentoLlamada = descartar || segmentoIA === "no_interesado"
    ? "no_interesado"
    : ll.cotizacion_id || sugerencia.precio_dado
      ? "cotizado"
      : segmentoIA === "sin_respuesta"
        ? "sin_respuesta"
        : "sin_cotizar";
  if (segmento === "no_interesado") sugerencia.descartar = true;
  if (segmento === "cotizado") delete sugerencia.faltan;

  const hora = proximaHora(Number(r.hora), Number(r.minuto), dias);
  const { error } = await supabaseServidor()
    .from("llamadas_campana")
    .update({
      prioridad,
      puntaje,
      segmento,
      hora_sugerida: hora,
      sugerencia,
      analizada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ll.id)
    .eq("estado", "pendiente");
  return error ? { ok: false, error: error.message } : { ok: true, prioridad, puntaje, segmento, hora, sugerencia };
}

/**
 * Analiza las pendientes sin sugerencia (o las indicadas), de 4 en 4. La usa la
 * función en segundo plano; en local corre directo.
 */
export async function analizarPendientes(
  opciones: { ids?: string[]; limite?: number } = {},
): Promise<{ analizadas: number; errores: string[] }> {
  let q = supabaseServidor().from("llamadas_campana").select("*").eq("estado", "pendiente").eq("es_prueba", false);
  q = opciones.ids?.length ? q.in("id", opciones.ids) : q.is("analizada_at", null);
  const { data } = await q.order("created_at", { ascending: true }).limit(opciones.limite ?? 200);

  const filas = (data ?? []) as LlamadaIA[];
  let analizadas = 0;
  const errores: string[] = [];
  for (let i = 0; i < filas.length; i += 4) {
    const lote = await Promise.all(
      filas.slice(i, i + 4).map((ll) =>
        analizarSugerencia(ll).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) })),
      ),
    );
    lote.forEach((r, j) => {
      if (r.ok) analizadas++;
      else errores.push(`${filas[i + j].id}: ${r.error}`);
    });
  }
  if (errores.length) console.warn("[llamadas-ia] Sugerencias con error:", errores.slice(0, 5));
  return { analizadas, errores };
}
