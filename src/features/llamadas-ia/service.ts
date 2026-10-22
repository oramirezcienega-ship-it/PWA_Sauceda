import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { normalizarTelefono } from "@/lib/telefono";
import { obtenerAgenteDisponible, registrarInicioLlamada } from "@/features/conmutador/service";
import { cargarProductosImper, ETIQUETA_PAQUETE } from "@/lib/ia/catalogo-imper";
import {
  anticipoInspeccion,
  cargarCostosInspeccion,
  costoInspeccionPorTipo,
  formatoPesosEnteros,
} from "@/lib/costo-inspeccion";
import { avisarAsesorDesdeIA } from "@/lib/ia/aviso-asesor";

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
 *   VAPI_CAMPANA_MODELO      opcional, modelo de OpenAI (default gpt-4o-mini)
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
  /** Estimado que ya recibió el cliente (precio_final de la cotización). */
  monto?: number;
  /** tipo_negocio para el costo de la visita técnica. */
  tipoNegocio?: string;
}

/** Versión del guion: se guarda con cada resultado para comparar versiones. */
export const GUION_VERSION = "reagendar-v2";

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

const TIPO_POR_SERVICIO: Record<string, string> = {
  impermeabilizacion: "construccion-impermeabilizacion",
  pintura: "construccion",
  losa: "construccion",
  remodelacion: "construccion-remodelacion",
  otro: "construccion",
};

/** Qué revisa el especialista en la visita, por línea (mismo texto que usa Sofía en WhatsApp). */
const QUE_REVISA: Record<string, string> = {
  "construccion-impermeabilizacion": "el estado de la losa, grietas, humedad, filtraciones y desagües",
  "construccion-remodelacion": "el espacio, las medidas y lo que hace falta para el proyecto",
  construccion: "el lugar y el origen real del problema",
};

interface ConocimientoLlamada {
  esImper: boolean;
  precios: string;
  minimo: string;
  visita: string;
  anticipo: string;
  resto: string;
  queRevisa: string;
}

/**
 * Datos oficiales que Sofía puede decir: precios por m² del catálogo (Productos y
 * Servicios) y costo de la visita técnica (configuracion_agente). Lo que no esté
 * aquí, Sofía no lo afirma.
 */
async function conocimientoLlamada(ll: LlamadaIA): Promise<ConocimientoLlamada> {
  const sb = supabaseServidor();
  const tipo =
    ll.contexto.tipoNegocio ||
    (/imper/i.test(ll.contexto.servicio || "") ? "construccion-impermeabilizacion" : "construccion");
  const esImper = tipo === "construccion-impermeabilizacion";

  const [costos, productos] = await Promise.all([
    cargarCostosInspeccion(sb),
    esImper ? cargarProductosImper(sb) : Promise.resolve({} as Awaited<ReturnType<typeof cargarProductosImper>>),
  ]);
  const costo = costoInspeccionPorTipo(costos, tipo);
  const anticipo = anticipoInspeccion(costo);

  const lineas: string[] = [];
  const minimos: number[] = [];
  for (const p of ["acrilico", "estandar", "premium"] as const) {
    const prod = productos[p];
    if (!prod || !prod.aptoParaIa || prod.precioM2 <= 0) continue;
    const garantia = prod.nombre.match(/garant[ií]a\s*(?:de\s*)?(\d+)\s*a[ñn]os?/i)?.[1];
    const volumen = prod.preciosVolumen.length
      ? `; desde ${prod.preciosVolumen.map((t) => `${t.desde} m² baja a ${formatoPesosEnteros(t.precio)}`).join(", ")}`
      : "";
    lineas.push(
      `${ETIQUETA_PAQUETE[p]}: ${formatoPesosEnteros(prod.precioM2)} por m² más IVA${garantia ? `, garantía ${garantia} años` : ""}${volumen}`,
    );
    if (prod.minimoM2 > 0) minimos.push(prod.minimoM2);
  }

  return {
    esImper,
    precios: lineas.join("\n- "),
    minimo: minimos.length ? `${Math.round(Math.min(...minimos))}–${Math.round(Math.max(...minimos))} m²` : "",
    visita: formatoPesosEnteros(costo),
    anticipo: formatoPesosEnteros(anticipo),
    resto: formatoPesosEnteros(costo - anticipo),
    queRevisa: QUE_REVISA[tipo] ?? QUE_REVISA.construccion,
  };
}

function promptReagendarVisita(
  ll: LlamadaIA,
  espacios: { iso: string; texto: string }[],
  hayAsesor: boolean,
  k: ConocimientoLlamada,
): string {
  const servicio = ll.contexto.servicio || "su proyecto";
  const horarios = espacios.map((e) => `- ${e.texto} (valor para fecha_visita: ${e.iso})`).join("\n");
  const sinRespuesta = hayAsesor
    ? "ofrece comunicarlo con un asesor ahora; si acepta, usa la herramienta de transferencia"
    : "dile que un asesor le llama hoy para resolverlo";

  return `Eres Sofía, asistente virtual de Sauceda, en una llamada telefónica. Español de México, cálida y directa.

ESTILO (obligatorio): máximo 2 frases cortas por turno y una sola pregunta. Nada de listas ni explicaciones largas. Si te interrumpen, no repitas lo que ya dijiste.

OBJETIVO: que el cliente acepte la visita técnica y elija horario. Después de resolver cualquier duda, vuelve a ofrecer la visita.

DATOS OFICIALES (lo ÚNICO que puedes afirmar):
- Cliente: ${ll.nombre || "sin nombre"}. Pidió cotización de ${servicio}${ll.contexto.colonia ? ` en ${ll.contexto.colonia}` : ""}.
${ll.contexto.monto ? `- Ya recibió su estimado: alrededor de ${formatoPesosEnteros(ll.contexto.monto)}. Es un estimado; el precio final se confirma en la visita.\n` : ""}${
    k.precios
      ? `- Precios por m² (catálogo):\n- ${k.precios}${k.minimo ? `\n- Para superficies pequeñas hay un mínimo de cobro de ${k.minimo}.` : ""}\n`
      : "- No tienes precios de este servicio: si preguntan, el precio lo confirma un asesor.\n"
  }- Visita técnica: un especialista revisa ${k.queRevisa} y le da el precio final. Cuesta ${k.visita} y se le descuenta completa si contrata (para el cliente termina costando $0).
- Para apartarla: anticipo de ${k.anticipo} con una liga de Mercado Pago que le envía un asesor por WhatsApp; los ${k.resto} restantes se pagan al especialista al llegar.
- Horarios disponibles (ofrece dos):
${horarios || "- Ninguno: no ofrezcas horarios; dile que un asesor le propone fecha."}

CÓMO LLEVAR LA LLAMADA:
1. Si confirma que sigue interesado: en una frase di qué es la visita, cuánto cuesta y que se descuenta si contrata; ofrece dos horarios.
2. Si elige horario: repítelo y explica que un asesor le manda por WhatsApp la liga del anticipo y le confirma la cita. Tú NO confirmas la cita. Despídete.
3. Si ningún horario le queda: pregunta qué día y hora prefiere, anótalo y di que el asesor se lo confirma.
4. Precio por m²: da el dato oficial en una frase (siempre "más IVA") y vuelve a ofrecer la visita.
5. Objeciones:
   - "Otros vienen gratis": nuestra visita deja el precio exacto, no un aproximado, y si contrata se la descontamos completa.
   - "Está caro": ${k.esImper && k.precios ? "el acrílico es la opción más económica; " : ""}el precio exacto depende de lo que vea el especialista en la visita.
   - "Lo pienso": sin presión; ofrece que un asesor le escriba por WhatsApp y despídete.
   - "Ya contraté a alguien" o ya no le interesa: agradece, pregunta brevemente el motivo y despídete.
6. Cualquier cosa que NO esté en DATOS OFICIALES (meses sin intereses, descuentos, tiempos de obra, marcas, otros paquetes, garantías distintas): no la inventes; ${sinRespuesta}.
7. Si se molesta o pide hablar con una persona: ${hayAsesor ? "transfiérelo a un asesor" : "dile que un asesor le llama hoy"}.
8. "Llámame después": pregunta cuándo y despídete. "No me vuelvan a llamar": discúlpate, confirma que no se le llamará más y cuelga.
9. Si contesta un buzón de voz, una grabación o un menú automático: cuelga de inmediato sin decir nada.
10. Cierra con la herramienta para colgar. La llamada no debe pasar de 2 minutos.`;
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
        "visita_agendada: aceptó la visita técnica y dio un horario (falta el anticipo). transferido: se pasó a un asesor. duda: tiene preguntas o lo piensa y un asesor debe contactarlo. no_interesado: ya no quiere el servicio. llamar_despues: pidió otra hora. buzon: contestó un buzón o grabación. no_llamar: pidió no ser llamado. no_contesta: nadie habló.",
    },
    fecha_visita: {
      type: "string",
      description: "Si eligió uno de los horarios ofrecidos, su 'valor para fecha_visita' exacto (ISO 8601).",
    },
    horario_cliente: {
      type: "string",
      description: "Si propuso otro día u horario, tal como lo dijo (ej. 'sábado en la mañana').",
    },
    llamar_despues: {
      type: "string",
      description: "Si pidió otra hora, fecha y hora en ISO 8601 con zona -06:00.",
    },
    interes: { type: "integer", minimum: 1, maximum: 5, description: "Nivel de interés del 1 al 5." },
    objecion: { type: "string", description: "Objeción o duda principal del cliente, si la hubo." },
    pregunta_sin_respuesta: {
      type: "string",
      description: "Pregunta del cliente que Sofía no pudo responder con los datos oficiales, si la hubo.",
    },
  },
  required: ["resultado"],
};

function asistenteReagendarVisita(
  ll: LlamadaIA,
  espacios: { iso: string; texto: string }[],
  asesorTel: string | null,
  k: ConocimientoLlamada,
) {
  const nombre = (ll.nombre || "").split(" ")[0];
  const servicio = ll.contexto.servicio || "su proyecto";
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
    firstMessage: `Hola${nombre ? ` ${nombre}` : ""}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba. Le llamo por la cotización de ${servicio} que le enviamos. ¿Sigue interesado?`,
    model: {
      provider: "openai",
      model: process.env.VAPI_CAMPANA_MODELO || "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 150,
      messages: [{ role: "system", content: promptReagendarVisita(ll, espacios, !!asesorTel, k) }],
      tools,
    },
    voice: {
      provider: process.env.VAPI_CAMPANA_VOZ_PROVEEDOR || "azure",
      voiceId: process.env.VAPI_CAMPANA_VOZ_ID || "es-MX-DaliaNeural",
    },
    transcriber: { provider: "deepgram", model: "nova-2", language: "es" },
    // Candados de costo: duración, silencio y buzón.
    maxDurationSeconds: 180,
    silenceTimeoutSeconds: 10,
    voicemailDetection: { provider: "vapi" },
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: { enabled: true, schema: ESQUEMA_RESULTADO },
    },
    server: { url: `${baseUrl()}/api/conmutador/webhook-campana` },
    serverMessages: ["end-of-call-report"],
    metadata: { llamadaCampanaId: ll.id, esPrueba: ll.es_prueba, guion: GUION_VERSION },
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

  const [espacios, agente, conocimiento] = await Promise.all([
    espaciosDeVisita(),
    obtenerAgenteDisponible(),
    conocimientoLlamada(ll),
  ]);
  const asesorTel = agente?.telefono_desvio ? e164(agente.telefono_desvio) || null : null;

  // Se reserva el intento antes de marcar para que el cron no la tome dos veces.
  await actualizar(id, { estado: "en_curso", intentos: ll.intentos + 1, error: null });
  try {
    const call = await vapi<{ id: string }>("/call", {
      method: "POST",
      body: JSON.stringify({
        phoneNumberId,
        customer: { number: numero, ...(ll.nombre ? { name: ll.nombre.slice(0, 40) } : {}) },
        assistant: asistenteReagendarVisita(ll, espacios, asesorTel, conocimiento),
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
    datos: { ...datos, endedReason: motivo, guion: GUION_VERSION },
    error: resultado === "error" ? motivo || "Error en la llamada" : null,
  });

  if (resultado === "no_llamar") {
    await sb
      .from("telefonos_no_llamar")
      .upsert({ telefono: normalizarTelefono(ll.telefono), motivo: "Lo pidió en llamada IA" }, { onConflict: "telefono" });
  }

  // La cita no se confirma aquí: la confirma el asesor al validar el anticipo
  // (misma regla que Sofía en WhatsApp). Se le avisa con lo que pidió el cliente.
  const horarioCliente = typeof datos.horario_cliente === "string" ? datos.horario_cliente.trim() : "";
  const preferencia = fechaVisita ? textoFecha(fechaVisita) : horarioCliente;
  const avisos: Partial<Record<ResultadoLlamadaIA, string>> = {
    visita_agendada: `Llamada IA: aceptó la visita técnica${preferencia ? ` (${preferencia})` : ""}. Enviar liga de anticipo y confirmar cita${ll.cotizacion_id ? ` · ${ll.cotizacion_id}` : ""}.`,
    duda: `Llamada IA: tiene dudas, llamarle${typeof datos.objecion === "string" && datos.objecion ? ` · ${datos.objecion}` : ""}.`,
  };
  const aviso = avisos[resultado];
  if (aviso && !ll.es_prueba) {
    const { data: pros } = ll.prospecto_id
      ? await sb.from("prospectos").select("asesor_id").eq("id", ll.prospecto_id).maybeSingle()
      : { data: null };
    await avisarAsesorDesdeIA(sb, {
      telefono: ll.telefono,
      motivo: aviso,
      expedienteId: null,
      prospectoId: ll.prospecto_id,
      asesorId: (pros?.asesor_id as string | null) ?? null,
      nombreCliente: ll.nombre,
    });
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
      visita_agendada: `Aceptó la visita${preferencia ? ` (${preferencia})` : ""}, falta anticipo`,
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
        tipoNegocio: TIPO_POR_SERVICIO[c.servicio_tipo as string] ?? "construccion",
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
