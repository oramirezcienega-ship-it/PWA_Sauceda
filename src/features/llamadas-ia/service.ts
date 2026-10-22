import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { normalizarTelefono } from "@/lib/telefono";
import { obtenerAgenteDisponible, registrarInicioLlamada } from "@/features/conmutador/service";

/**
 * Llamadas IA salientes (Vapi + Twilio).
 * Fase 1: Sofía llama para reagendar la visita técnica de cotizaciones en
 * 'esperando_visita'. Nada se marca sin aprobación y Vapi es la fuente de
 * verdad del resultado: el webhook solo avisa, aquí se consulta la llamada.
 *
 * Variables de entorno:
 *   VAPI_API_KEY             llave privada de Vapi
 *   VAPI_PHONE_NUMBER_ID     número de Twilio importado en Vapi (usar uno distinto
 *                            al del conmutador: importarlo cambia su webhook de voz)
 *   VAPI_CAMPANA_MODELO      opcional, modelo de OpenAI (default gpt-4o)
 *   VAPI_CAMPANA_VOZ_PROVEEDOR / VAPI_CAMPANA_VOZ_ID   opcional (default azure es-MX-DaliaNeural)
 *   CAMPANA_VISITAS_MAX_DIA  opcional, tope de visitas por día que Sofía puede agendar (default 4)
 */

export type EstadoLlamadaIA = "pendiente" | "aprobada" | "en_curso" | "completada" | "fallida" | "cancelada";
export type ResultadoLlamadaIA =
  | "visita_agendada"
  | "transferido"
  | "duda"
  | "no_interesado"
  | "llamar_despues"
  | "no_contesta"
  | "buzon"
  | "no_llamar"
  | "error";

export interface ContextoLlamadaIA {
  servicio?: string;
  colonia?: string;
  monto?: number;
}

export interface LlamadaIA {
  id: string;
  campana: string;
  telefono: string;
  nombre: string;
  prospecto_id: string | null;
  cotizacion_id: string | null;
  es_prueba: boolean;
  contexto: ContextoLlamadaIA;
  estado: EstadoLlamadaIA;
  intentos: number;
  max_intentos: number;
  proximo_intento: string | null;
  vapi_call_id: string | null;
  resultado: ResultadoLlamadaIA | null;
  fecha_visita: string | null;
  resumen: string | null;
  transcripcion: string | null;
  grabacion_url: string | null;
  duracion_seg: number | null;
  costo_usd: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const VAPI_URL = "https://api.vapi.ai";
const ZONA = "America/Mexico_City";
const OFFSET_MX = "-06:00"; // México centro ya no usa horario de verano
const HORA_INICIO = 10;
const HORA_FIN = 19;
const HORAS_VISITA = [10, 16];

function baseUrl(): string {
  return process.env.SITE_URL || "https://crm.saucedamx.com";
}

function e164(tel: string): string {
  const canon = normalizarTelefono(tel);
  return canon ? `+${canon}` : "";
}

/** Partes de una fecha en hora de México. */
function partesMX(d: Date): { fecha: string; hora: number; diaSemana: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    fecha: `${v("year")}-${v("month")}-${v("day")}`,
    hora: Number(v("hour")) % 24,
    diaSemana: dias.indexOf(v("weekday")),
  };
}

/** Lunes a sábado, de 10 a 19 h (hora de México). */
export function enHorarioDeLlamadas(d = new Date()): boolean {
  const { hora, diaSemana } = partesMX(d);
  return diaSemana >= 1 && diaSemana <= 6 && hora >= HORA_INICIO && hora < HORA_FIN;
}

function textoFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Próximos espacios de visita (lunes a sábado, 10:00 y 16:00) en días que aún no
 * llegan al tope de visitas. Sofía solo puede ofrecer estos.
 */
async function espaciosDeVisita(cuantos = 4): Promise<{ iso: string; texto: string }[]> {
  const sb = supabaseServidor();
  const tope = Number(process.env.CAMPANA_VISITAS_MAX_DIA) || 4;
  const desde = new Date(Date.now() + 24 * 3600 * 1000);
  const hasta = new Date(Date.now() + 10 * 24 * 3600 * 1000);

  const { data } = await sb
    .from("cotizaciones")
    .select("fecha_visita")
    .gte("fecha_visita", desde.toISOString())
    .lte("fecha_visita", hasta.toISOString());
  const ocupadas = (data ?? []).map((r) => new Date(r.fecha_visita as string).getTime());
  const porDia = new Map<string, number>();
  for (const t of ocupadas) {
    const dia = partesMX(new Date(t)).fecha;
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  const espacios: { iso: string; texto: string }[] = [];
  for (let i = 1; i <= 10 && espacios.length < cuantos; i++) {
    const { fecha, diaSemana } = partesMX(new Date(Date.now() + i * 24 * 3600 * 1000));
    if (diaSemana === 0 || (porDia.get(fecha) ?? 0) >= tope) continue;
    for (const h of HORAS_VISITA) {
      const iso = `${fecha}T${String(h).padStart(2, "0")}:00:00${OFFSET_MX}`;
      if (ocupadas.includes(new Date(iso).getTime())) continue;
      espacios.push({ iso, texto: textoFecha(iso) });
      if (espacios.length >= cuantos) break;
    }
  }
  return espacios;
}

function promptReagendarVisita(
  ll: LlamadaIA,
  espacios: { iso: string; texto: string }[],
  hayAsesor: boolean,
): string {
  const servicio = ll.contexto.servicio || "el servicio que nos pidió";
  const lista = espacios.map((e) => `- ${e.texto} (valor para fecha_visita: ${e.iso})`).join("\n");
  return `Eres Sofía, asistente virtual de Sauceda (servicios de impermeabilización, remodelación, pisos y mantenimiento en el hogar). Hablas en español de México, cálida, breve y natural; frases cortas, una pregunta a la vez. Nunca inventes precios, descuentos ni garantías.

Contexto: hace unos días ${ll.nombre || "el cliente"} pidió una cotización de ${servicio}${ll.contexto.colonia ? ` para su domicilio en ${ll.contexto.colonia}` : ""} y quedó pendiente la visita técnica para medir y dar el precio final. La visita no tiene costo.

Tu único objetivo: confirmar que sigue interesado y agendar la visita técnica.

Espacios disponibles (ofrece dos a la vez, solo estos):
${lista || "- No hay espacios disponibles: no agendes; ofrece que un asesor le llame para coordinar."}

Reglas:
1. Ya te presentaste como asistente virtual y avisaste que la llamada se graba. Si preguntan, confírmalo.
2. Si acepta un espacio, repítelo para confirmar ("Entonces le esperamos el ...") y despídete.
3. Si ninguno le queda, pregunta qué día y horario prefiere; si cae dentro de los espacios, agéndalo; si no, dile que un asesor le confirmará y despídete.
4. Si pregunta precios, garantías, formas de pago u otro detalle técnico: explica que el precio final se da en la visita${hayAsesor ? " y ofrece comunicarlo con un asesor; si acepta, usa la herramienta de transferencia" : " y que un asesor le llamará hoy para resolverlo"}.
5. Si ya no le interesa o ya contrató a alguien, agradece, pregunta brevemente el motivo y despídete.
6. Si pide que le llamen en otro momento, pregunta cuándo y despídete.
7. Si pide que no le vuelvan a llamar, discúlpate, confirma que no se le volverá a llamar y termina.
8. Si contesta un buzón de voz o una grabación, termina la llamada sin dejar mensaje.
9. Si la persona se molesta o pide hablar con alguien, ${hayAsesor ? "transfiérela a un asesor" : "dile que un asesor le llamará hoy"}.
10. Al terminar, usa la herramienta para colgar. No alargues la llamada más de 3 minutos.`;
}

const ESQUEMA_RESULTADO = {
  type: "object",
  properties: {
    resultado: {
      type: "string",
      enum: [
        "visita_agendada",
        "transferido",
        "duda",
        "no_interesado",
        "llamar_despues",
        "buzon",
        "no_llamar",
        "no_contesta",
      ],
      description:
        "visita_agendada: aceptó un espacio. transferido: se pasó a un asesor. duda: tiene preguntas y un asesor debe llamarle. no_interesado: ya no quiere el servicio. llamar_despues: pidió otra hora. buzon: contestó un buzón. no_llamar: pidió no ser llamado. no_contesta: nadie habló.",
    },
    fecha_visita: {
      type: "string",
      description: "Si se agendó, el valor exacto 'valor para fecha_visita' del espacio aceptado (ISO 8601).",
    },
    llamar_despues: {
      type: "string",
      description: "Si pidió otra hora, fecha y hora en ISO 8601 con zona -06:00.",
    },
    interes: { type: "integer", minimum: 1, maximum: 5, description: "Nivel de interés del 1 al 5." },
    objecion: { type: "string", description: "Motivo o duda principal del cliente, si la hubo." },
  },
  required: ["resultado"],
};

function asistenteReagendarVisita(
  ll: LlamadaIA,
  espacios: { iso: string; texto: string }[],
  asesorTel: string | null,
) {
  const nombre = (ll.nombre || "").split(" ")[0];
  const servicio = ll.contexto.servicio || "su cotización";
  const tools: Record<string, unknown>[] = [{ type: "endCall" }];
  if (asesorTel) {
    tools.push({
      type: "transferCall",
      destinations: [
        {
          type: "number",
          number: asesorTel,
          message: "Con gusto, le comunico con un asesor. Un momento por favor.",
          description: "Asesor de Sauceda disponible",
        },
      ],
    });
  }

  return {
    name: "Sofia - Reagendar visita",
    firstMessage: `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba. Le llamo por la cotización de ${servicio} que nos pidió: quedó pendiente la visita técnica, sin costo. ¿Le gustaría que la agendemos?`,
    model: {
      provider: "openai",
      model: process.env.VAPI_CAMPANA_MODELO || "gpt-4o",
      temperature: 0.4,
      messages: [{ role: "system", content: promptReagendarVisita(ll, espacios, !!asesorTel) }],
      tools,
    },
    voice: {
      provider: process.env.VAPI_CAMPANA_VOZ_PROVEEDOR || "azure",
      voiceId: process.env.VAPI_CAMPANA_VOZ_ID || "es-MX-DaliaNeural",
    },
    transcriber: { provider: "deepgram", model: "nova-2", language: "es" },
    maxDurationSeconds: 300,
    silenceTimeoutSeconds: 20,
    voicemailMessage: "",
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: { enabled: true, schema: ESQUEMA_RESULTADO },
    },
    server: { url: `${baseUrl()}/api/conmutador/webhook-campana` },
    serverMessages: ["end-of-call-report"],
    metadata: { llamadaCampanaId: ll.id, esPrueba: ll.es_prueba },
  };
}

async function vapi<T>(ruta: string, init?: RequestInit): Promise<T> {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error("Falta VAPI_API_KEY en las variables de entorno.");
  const res = await fetch(`${VAPI_URL}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(cuerpo?.message) ? cuerpo.message.join("; ") : cuerpo?.message;
    throw new Error(`Vapi ${res.status}: ${msg || res.statusText}`);
  }
  return cuerpo as T;
}

async function obtenerLlamada(id: string): Promise<LlamadaIA | null> {
  const { data } = await supabaseServidor().from("llamadas_campana").select("*").eq("id", id).maybeSingle();
  return (data as LlamadaIA | null) ?? null;
}

async function actualizar(id: string, cambios: Partial<LlamadaIA> & Record<string, unknown>) {
  const { error } = await supabaseServidor()
    .from("llamadas_campana")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(`[llamadas-ia] No se pudo actualizar ${id}:`, error);
}

/**
 * Marca la llamada en Vapi. Valida estado, intentos, lista de no llamar y horario
 * (las de prueba pueden marcarse fuera de horario).
 */
export async function despacharLlamada(id: string): Promise<{ ok: boolean; error?: string }> {
  const ll = await obtenerLlamada(id);
  if (!ll) return { ok: false, error: "No existe la llamada." };
  if (ll.estado !== "aprobada") return { ok: false, error: "La llamada debe estar aprobada para marcar." };
  if (ll.intentos >= ll.max_intentos) return { ok: false, error: "Ya se agotaron los intentos." };
  if (!ll.es_prueba && !enHorarioDeLlamadas()) {
    return { ok: false, error: "Fuera de horario (lunes a sábado, 10 a 19 h)." };
  }

  const sb = supabaseServidor();
  const canon = normalizarTelefono(ll.telefono);
  const { data: bloqueado } = await sb.from("telefonos_no_llamar").select("telefono").eq("telefono", canon).maybeSingle();
  if (bloqueado) {
    await actualizar(id, { estado: "cancelada", resultado: "no_llamar", error: "Está en la lista de no llamar." });
    return { ok: false, error: "El teléfono está en la lista de no llamar." };
  }

  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) return { ok: false, error: "Falta VAPI_PHONE_NUMBER_ID en las variables de entorno." };
  const numero = e164(ll.telefono);
  if (!numero) return { ok: false, error: "Teléfono no válido." };

  const [espacios, agente] = await Promise.all([espaciosDeVisita(), obtenerAgenteDisponible()]);
  const asesorTel = agente?.telefono_desvio ? e164(agente.telefono_desvio) || null : null;

  // Se reserva el intento antes de marcar para que el cron no la tome dos veces.
  await actualizar(id, { estado: "en_curso", intentos: ll.intentos + 1, error: null });
  try {
    const call = await vapi<{ id: string }>("/call", {
      method: "POST",
      body: JSON.stringify({
        phoneNumberId,
        customer: { number: numero, ...(ll.nombre ? { name: ll.nombre.slice(0, 40) } : {}) },
        assistant: asistenteReagendarVisita(ll, espacios, asesorTel),
      }),
    });
    await actualizar(id, { vapi_call_id: call.id });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al llamar a Vapi.";
    console.error(`[llamadas-ia] Falló el despacho de ${id}:`, msg);
    await actualizar(id, { estado: "fallida", resultado: "error", error: msg });
    return { ok: false, error: msg };
  }
}

interface LlamadaVapi {
  id: string;
  status?: string;
  endedReason?: string;
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  phoneCallProviderId?: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  analysis?: { summary?: string; structuredData?: Record<string, unknown> };
  artifact?: { transcript?: string; recordingUrl?: string; recording?: { url?: string } };
}

function siguienteIntento(horas: number): string {
  let t = new Date(Date.now() + horas * 3600 * 1000);
  // Si cae fuera de horario, recorrer a la siguiente hora hábil.
  for (let i = 0; i < 72 && !enHorarioDeLlamadas(t); i++) t = new Date(t.getTime() + 3600 * 1000);
  return t.toISOString();
}

/**
 * Consulta la llamada en Vapi y aplica el resultado: estado, reintentos, fecha de
 * visita en la cotización, lista de no llamar, actividad del prospecto e historial
 * del conmutador. Idempotente: si ya se aplicó, no repite efectos.
 */
export async function sincronizarConVapi(vapiCallId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseServidor();
  const { data } = await sb.from("llamadas_campana").select("*").eq("vapi_call_id", vapiCallId).maybeSingle();
  const ll = data as LlamadaIA | null;
  if (!ll) return { ok: false, error: "La llamada no pertenece a una campaña." };
  if (ll.estado !== "en_curso") return { ok: true };

  let call: LlamadaVapi;
  try {
    call = await vapi<LlamadaVapi>(`/call/${encodeURIComponent(vapiCallId)}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo consultar Vapi." };
  }
  if (call.status !== "ended") return { ok: true };

  const datos = call.analysis?.structuredData ?? {};
  const motivo = call.endedReason || "";
  const validos: ResultadoLlamadaIA[] = [
    "visita_agendada", "transferido", "duda", "no_interesado", "llamar_despues", "no_contesta", "buzon", "no_llamar",
  ];
  let resultado: ResultadoLlamadaIA | "" = validos.includes(datos.resultado as ResultadoLlamadaIA)
    ? (datos.resultado as ResultadoLlamadaIA)
    : "";
  if (/voicemail/.test(motivo)) resultado = "buzon";
  else if (/did-not-answer|busy|no-answer/.test(motivo)) resultado = "no_contesta";
  else if (!resultado) resultado = /error|failed/.test(motivo) ? "error" : "no_contesta";

  const fechaVisitaRaw = typeof datos.fecha_visita === "string" ? datos.fecha_visita : "";
  const fechaVisita = fechaVisitaRaw && !Number.isNaN(Date.parse(fechaVisitaRaw)) ? new Date(fechaVisitaRaw).toISOString() : null;
  const llamarDespuesRaw = typeof datos.llamar_despues === "string" ? datos.llamar_despues : "";
  const llamarDespues =
    llamarDespuesRaw && !Number.isNaN(Date.parse(llamarDespuesRaw)) && Date.parse(llamarDespuesRaw) > Date.now()
      ? new Date(llamarDespuesRaw).toISOString()
      : null;

  const transcripcion = call.artifact?.transcript || call.transcript || "";
  const resumen = call.analysis?.summary || call.summary || "";
  const grabacion = call.artifact?.recording?.url || call.artifact?.recordingUrl || call.recordingUrl || "";
  const duracion =
    call.startedAt && call.endedAt
      ? Math.max(0, Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000))
      : null;

  // Reintentos: no contestó / buzón / pidió otra hora, mientras queden intentos.
  const reintentar =
    (resultado === "no_contesta" || resultado === "buzon" || resultado === "llamar_despues") &&
    ll.intentos < ll.max_intentos;
  const estado: EstadoLlamadaIA = resultado === "error" ? "fallida" : reintentar ? "aprobada" : "completada";
  const proximo = reintentar ? llamarDespues || siguienteIntento(resultado === "llamar_despues" ? 48 : 20) : null;

  await actualizar(ll.id, {
    estado,
    resultado,
    proximo_intento: proximo,
    fecha_visita: fechaVisita,
    resumen: resumen || null,
    transcripcion: transcripcion || null,
    grabacion_url: grabacion || null,
    duracion_seg: duracion,
    costo_usd: typeof call.cost === "number" ? call.cost : null,
    datos: { ...datos, endedReason: motivo },
    error: resultado === "error" ? motivo || "Error en la llamada" : null,
  });

  if (resultado === "no_llamar") {
    await sb
      .from("telefonos_no_llamar")
      .upsert({ telefono: normalizarTelefono(ll.telefono), motivo: "Lo pidió en llamada IA" }, { onConflict: "telefono" });
  }

  if (resultado === "visita_agendada" && fechaVisita && ll.cotizacion_id && !ll.es_prueba) {
    const { error } = await sb
      .from("cotizaciones")
      .update({ fecha_visita: fechaVisita })
      .eq("id", ll.cotizacion_id)
      .eq("estatus", "esperando_visita");
    if (error) console.error("[llamadas-ia] No se pudo guardar la fecha de visita:", error);
  }

  // Historial del conmutador
  const sid = call.phoneCallProviderId || call.id;
  await registrarInicioLlamada({ twilioCallSid: sid, clienteTelefono: ll.telefono, tipo: "saliente", estado: "completed" });
  await sb
    .from("llamadas_conmutador")
    .update({
      duracion: duracion,
      grabacion_url: grabacion || null,
      transcripcion: transcripcion || null,
      resumen_ia: resumen || null,
      datos_perfilados: { campana: ll.campana, llamadaCampanaId: ll.id, ...datos },
    })
    .eq("twilio_call_sid", sid);

  if (ll.prospecto_id && !ll.es_prueba) {
    const etiquetas: Record<ResultadoLlamadaIA, string> = {
      visita_agendada: `Visita agendada${fechaVisita ? ` para ${textoFecha(fechaVisita)}` : ""}`,
      transferido: "Transferido a un asesor",
      duda: "Tiene dudas: un asesor debe llamarle",
      no_interesado: "Ya no está interesado",
      llamar_despues: "Pidió que le llamen después",
      no_contesta: "No contestó",
      buzon: "Buzón de voz",
      no_llamar: "Pidió no ser llamado",
      error: "Error en la llamada",
    };
    await registrarActividad(sb, {
      prospectoId: ll.prospecto_id,
      tipo: "llamada",
      titulo: `Llamada IA (Sofía): ${etiquetas[resultado] ?? resultado}`,
      detalle: resumen,
    });
  }

  return { ok: true };
}

/** Despacha las llamadas aprobadas cuyo intento ya toca (lo usa el cron). */
export async function despacharPendientes(limite = 3): Promise<{ despachadas: number; errores: string[] }> {
  if (!enHorarioDeLlamadas()) return { despachadas: 0, errores: [] };
  const sb = supabaseServidor();
  const { data } = await sb
    .from("llamadas_campana")
    .select("id")
    .eq("estado", "aprobada")
    .or(`proximo_intento.is.null,proximo_intento.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limite);

  let despachadas = 0;
  const errores: string[] = [];
  for (const { id } of data ?? []) {
    const r = await despacharLlamada(id as string);
    if (r.ok) despachadas++;
    else if (r.error) errores.push(`${id}: ${r.error}`);
  }
  return { despachadas, errores };
}

/** Crea un registro de prueba (aprobado) para un teléfono propio. */
export async function crearLlamadaPrueba(datos: {
  telefono: string;
  nombre?: string;
  servicio?: string;
  colonia?: string;
  creadoPor?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const canon = normalizarTelefono(datos.telefono);
  if (!canon || canon.length < 12) return { ok: false, error: "Teléfono no válido (10 dígitos)." };
  const { data, error } = await supabaseServidor()
    .from("llamadas_campana")
    .insert({
      telefono: canon,
      nombre: datos.nombre?.trim() || "Prueba",
      es_prueba: true,
      estado: "aprobada",
      contexto: {
        servicio: datos.servicio?.trim() || "impermeabilización",
        colonia: datos.colonia?.trim() || "",
      },
      creado_por: datos.creadoPor ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message || "No se pudo crear la prueba." };
  return { ok: true, id: data.id as string };
}

const NOMBRE_SERVICIO: Record<string, string> = {
  impermeabilizacion: "impermeabilización",
  pintura: "pintura",
  losa: "losa",
  remodelacion: "remodelación",
  otro: "su proyecto",
};

/**
 * Arma la lista (en estado 'pendiente', sin marcar) con las cotizaciones en
 * 'esperando_visita' que aún no están en la cola ni en la lista de no llamar.
 */
export async function generarListaReagendarVisitas(creadoPor?: string | null): Promise<{ agregadas: number }> {
  const sb = supabaseServidor();
  const [{ data: cots }, { data: enCola }, { data: bloqueados }] = await Promise.all([
    sb
      .from("cotizaciones")
      .select("id, prospecto_id, servicio_tipo, precio_final, prospectos(nombre, telefono, direccion)")
      .eq("estatus", "esperando_visita"),
    sb.from("llamadas_campana").select("cotizacion_id").not("cotizacion_id", "is", null).neq("estado", "cancelada"),
    sb.from("telefonos_no_llamar").select("telefono"),
  ]);
  const yaEnCola = new Set((enCola ?? []).map((r) => r.cotizacion_id as string));
  const noLlamar = new Set((bloqueados ?? []).map((r) => r.telefono as string));

  const filas = [];
  const vistos = new Set<string>();
  for (const c of cots ?? []) {
    const p = (Array.isArray(c.prospectos) ? c.prospectos[0] : c.prospectos) as
      | { nombre: string; telefono: string; direccion: string }
      | null;
    const tel = normalizarTelefono(p?.telefono || "");
    if (!tel || tel.length < 12 || yaEnCola.has(c.id) || noLlamar.has(tel) || vistos.has(tel)) continue;
    vistos.add(tel);
    filas.push({
      telefono: tel,
      nombre: p?.nombre || "",
      prospecto_id: c.prospecto_id,
      cotizacion_id: c.id,
      contexto: {
        servicio: NOMBRE_SERVICIO[c.servicio_tipo as string] ?? "su proyecto",
        colonia: p?.direccion || "",
        monto: Number(c.precio_final) || 0,
      },
      creado_por: creadoPor ?? null,
    });
  }
  if (filas.length) {
    const { error } = await sb.from("llamadas_campana").insert(filas);
    if (error) throw new Error(error.message);
  }
  return { agregadas: filas.length };
}
