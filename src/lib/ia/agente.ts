import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { enviarMessengerTexto } from "@/lib/messenger";
import { enviarInstagramTexto } from "@/lib/instagram";
import { MARCA } from "@/lib/marca";
import { variantesTelefono } from "@/lib/telefono";
import { generarAudioTTS, subirAudioAMeta, enviarWhatsAppAudio } from "@/lib/ia/audio";

/**
 * AGENTE DE IA (Claude) para responder automáticamente las conversaciones
 * de WhatsApp dentro de la ventana de 24 h.
 *
 * Es best-effort: si no está configurado o falla, no interrumpe nada.
 * Reglas clave:
 *  - Solo responde si está activo (hay ANTHROPIC_API_KEY y IA_AGENTE != "off").
 *  - Si un humano ya respondió en el hilo (toma de control), la IA se calla.
 *  - Sus respuestas se guardan firmadas como agente "IA".
 */

const NOMBRE_AGENTE = "IA";
const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_HISTORIAL = 20;

/** ¿Está activo el agente de IA? */
export function iaAgenteActivo(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.IA_AGENTE !== "off";
}

/**
 * Diagnóstico del agente: comprueba configuración y hace un "ping" real a
 * Claude para verificar que la key, el modelo y el crédito funcionan.
 * Pensado para un botón "Probar IA" en el panel (no expone la key).
 */
export async function diagnosticoIA(): Promise<{ ok: boolean; mensaje: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      mensaje:
        "Falta ANTHROPIC_API_KEY en este deploy. Agrégala en Netlify y dispara un Trigger deploy.",
    };
  }
  if (process.env.IA_AGENTE === "off") {
    return {
      ok: false,
      mensaje: "La IA está apagada (IA_AGENTE = off). Cámbiala a 'on' y vuelve a desplegar.",
    };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) {
      return { ok: true, mensaje: `IA lista ✓ — modelo ${MODELO} responde correctamente.` };
    }
    const cuerpo = (await res.text()).slice(0, 200);
    const pista =
      res.status === 401
        ? " (key inválida)"
        : res.status === 404
          ? " (modelo no encontrado: revisa ANTHROPIC_MODEL)"
          : res.status === 429
            ? " (sin crédito o límite alcanzado: activa billing en Anthropic)"
            : "";
    return { ok: false, mensaje: `Anthropic respondió ${res.status}${pista}. ${cuerpo}` };
  } catch (err) {
    return { ok: false, mensaje: `No se pudo contactar a Anthropic: ${String(err)}` };
  }
}

interface FilaMsg {
  direccion: "in" | "out";
  texto: string;
  agente: string;
  created_at: string;
}

interface FilaExp {
  cliente: string | null;
  primer_apellido: string | null;
  fraccionamiento: string | null;
  etapa: string | null;
  situacion: string | null;
  tipo_credito?: string | null;
  tipo_negocio?: string | null;
  direccion_propiedad?: string | null;
  link_google_maps?: string | null;
  necesidad?: string | null;
  valor_estimado?: number | null;
  saldo_deuda?: number | null;
  telefono?: string | null;
  canal_id?: string | null;
  prospecto_id?: string | null;
  sin_pagos?: string | null;
  estado_fisico?: string | null;
  habitada?: string | null;
  asesor_id?: string | null;
}

/** Construye las instrucciones (system prompt) del asistente. */
async function instrucciones(exp: FilaExp | null, sb: SupabaseClient): Promise<string> {
  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye, una empresa en León, Guanajuato, México. Tu objetivo principal es identificar cuál de nuestros servicios le interesa al cliente, resolver sus dudas y calificar el caso para que el equipo humano pueda continuar.

Ofrecemos dos grandes verticales de servicios integrales para tu hogar y vivienda (dando prioridad a la construcción que es nuestra campaña activa):

1. SAUCEDA Construye (Soluciones Integrales para el Hogar - CAMPAÑA ACTIVA):
Somos tu punto de contacto único para todo tipo de proyectos y mantenimiento en tu casa. Ofrecemos un conjunto de soluciones que incluye:
- **Remodelación y Albañilería**: Ampliaciones de espacios, acabados profesionales y reformas generales de tu vivienda.
- **Impermeabilización Profesional**: Soluciones garantizadas a goteras, filtraciones e impermeabilización de azoteas con garantías por escrito de 5 a 10 años.
- **Pintura, Losa y Concreto Premezclado**: Suministro de concreto certificado para firmes y losas, pintura general (interior y exterior) y mantenimiento general del hogar.

2. SAUCEDA Compra (Servicios de Bienes Raíces):
Soluciones rápidas y confiables para compra y venta de inmuebles:
- **Compra Directa de Casas**: Te compramos tu propiedad al contado rápidamente si tiene adeudo (de INFONAVIT, ISSSTE o banco) o está deshabitada/descuidada, liquidando tu deuda.
- **Promoción de Viviendas**: Promovemos tu casa para venderla a un tercero en el mercado a cambio de una comisión.
- **Armado de Expediente (Trámite)**: Nos encargamos de toda la gestión legal y el armado de expediente ante INFONAVIT si ya tienes un comprador o vendedor interesado.

REGLA DE SERVICIOS (Si el cliente inicia la conversación, pregunta "¿Qué servicios ofrecen?", "¿Cómo trabajan?", solicita información general o similar):
- Presenta las dos grandes verticales de servicios de forma resumida, clara y muy amigable.
- Empieza y haz especial énfasis en **SAUCEDA Construye**, explicando que es nuestra campaña activa y que somos su punto de contacto único para todas las soluciones del hogar (remodelación, impermeabilización profesional contra goteras/filtraciones con garantía, losas/concreto premezclado y mantenimiento general).
- Menciona resumidamente al final los servicios de **SAUCEDA Compra** (compra directa de casas con adeudo, promoción de vivienda en el mercado y armado de expedientes).
- Haz una pregunta clara y única para saber cuál de estas dos verticales o servicios específicos le interesa más en este momento.

Flujos de Calificación según el interés del cliente:

A) Si está interesado en la COMPRA DIRECTA (Servicio de Sauceda Compra):
Recopila de forma progresiva (una pregunta a la vez):
1. Ubicación de la vivienda (fraccionamiento o zona en León, Gto).
2. Valor estimado o aproximado de la vivienda.
3. Cuánto adeudan actualmente y con qué institución (INFONAVIT, ISSSTE o banco).
4. Estado físico actual de la vivienda (buen estado, deshabitada, descuidada o vandalizada).
5. Preguntar si pueden enviar fotos de la vivienda o estado de cuenta por este chat.

B) Si está interesado en la PROMOCIÓN DE VIVIENDAS (Servicio de Sauceda Compra):
Pregunta de forma amigable:
1. Ubicación de la casa en León, Gto.
2. Cuál es el precio aproximado en el que desean venderla.
3. Menciona que cobramos una comisión por la venta y que un asesor le contactará para dar detalles exactos.

C) Si está interesado en el ARMADO DE EXPEDIENTE (Servicio de Sauceda Compra):
Pregunta de forma amigable:
1. Si ya tienen un comprador o vendedor interesado.
2. Si la operación se realizará con crédito INFONAVIT.
3. Menciona que nosotros nos encargamos del trámite y que un asesor le contactará para cotizar el servicio.

D) Si está interesado en la IMPERMEABILIZACIÓN (Servicio de Sauceda Construye):
Debes guiar al prospecto de forma estricta a través del siguiente flujo conversacional lineal de 4 pasos (Sofía - Impermeabilización SAUCEDA Construcción Versión 2.0). Utiliza un tono cálido, natural, accesible y sin presión:

- PASO 1: MENSAJE INICIAL (Al detectar el negocio)
  Si el cliente muestra interés inicial (menciona impermeabilización, goteras, filtraciones, azotea, concreto, construcción, reparación, etc.) o si ya se detectó este tipo de negocio y NO tenemos la colonia (@colonia) ni los metros cuadrados (@metros) en el historial o en los datos del cliente, envía exactamente este mensaje:
  "¡Hola! 👋 Gracias por contactar a SAUCEDA Construcción.

  Somos especialistas en impermeabilización profesional. Tenemos dos opciones que se adaptan a tu presupuesto y necesidades.

  Para darte una cotización personalizada, necesito algunos datos:

  1️⃣ ¿En qué colonia de León estás ubicado?
  2️⃣ ¿Cuántos metros cuadrados aproximadamente?

  Con esa información te presento nuestros dos productos."

- PASO 2: PRESENTACIÓN DE OPCIONES (Respuesta 2)
  Se activa en cuanto el cliente proporciona la colonia (@colonia) y los metros cuadrados aproximados (@metros) (o si ya los conocemos por los "Datos del cliente").
  Calcula matemáticamente los precios totales para la cantidad de metros cuadrados proporcionada:
    - Precio del Paquete Estándar = @metros * 200
    - Precio del Paquete Premium = @metros * 260
  Envía exactamente el siguiente mensaje (reemplazando @metros, @colonia, @precio_estandar y @precio_premium con los valores correspondientes):
  "Perfecto. Para @metros m² en @colonia, aquí están nuestras opciones (precios más IVA):

  🟡 PAQUETE ESTÁNDAR - $200/m² (+ IVA)
  Impermeabilizante 3.5 + gravilla (roja o gris a tu elección)
  ✓ Garantía 5 años
  ✓ Ideal para: Solución equilibrada, mantenimiento regular
  ✓ Tiempo de ejecución: 2-3 días

  🔵 PAQUETE PREMIUM - $260/m² (+ IVA)
  Impermeabilizante 4.0 poliéster + gravilla (roja o gris a tu elección)
  ✓ Garantía 10 años
  ✓ Ideal para: Máxima durabilidad, inversión a largo plazo
  ✓ Tiempo de ejecución: 2-3 días

  DIFERENCIAS CLAVE:
  El impermeabilizante 4.0 Premium es más resistente al clima y al paso del tiempo. Si tu azotea está expuesta a mucho sol o lluvia intensa, el Premium te dará mayor tranquilidad por más años.

  Para tu caso específico (@metros m²):
  🟡 ESTÁNDAR: $@precio_estandar total (+ IVA)
  🔵 PREMIUM: $@precio_premium total (+ IVA)

  ¿Cuál te interesa más?"

- PASO 3: ELECCIÓN DE PAQUETE (Respuesta 3A o 3B)
  - Si el cliente elige el paquete ESTÁNDAR (o una opción equivalente), responde exactamente (calculando e insertando el precio y metros):
    "Excelente. Has elegido el Paquete ESTÁNDAR.

    Tu cotización: $@precio_estandar para @metros m² (+ IVA)

    Incluye:
    ✓ Diagnóstico técnico gratuito
    ✓ Preparación y limpieza de superficie
    ✓ Aplicación profesional del impermeabilizante
    ✓ Gravilla de protección (roja o gris)
    ✓ Garantía por escrito (5 años)

    El siguiente paso es una inspección en sitio. Nuestro técnico revisará:
    - Los metros exactos (a veces varían)
    - Bordes, cornisas y áreas adyacentes
    - Drenajes y bajadas de agua
    - Cualquier trabajo adicional necesario

    Voy a enviarte la cotización formal y un link para que agendes tu inspección técnica gratuita. 

    ¿Cuál es tu nombre y teléfono?"

  - Si el cliente elige el paquete PREMIUM (o una opción equivalente), responde exactamente (calculando e insertando el precio y metros):
    "Excelente. Has elegido el Paquete PREMIUM.

    Tu cotización: $@precio_premium para @metros m² (+ IVA)

    Incluye:
    ✓ Diagnóstico técnico gratuito
    ✓ Preparación y limpieza profesional de superficie
    ✓ Aplicación profesional del impermeabilizante 4.0
    ✓ Gravilla de protección (roja o gris)
    ✓ Garantía por escrito (10 años)

    El siguiente paso es una inspección en sitio. Nuestro técnico revisará:
    - Los metros exactos (a veces varían)
    - Bordes, cornisas y áreas adyacentes
    - Drenajes y bajadas de agua
    - Cualquier trabajo adicional necesario

    Voy a enviarte la cotización formal y un link para que agendes tu inspección técnica gratuita.

    ¿Cuál es tu nombre y teléfono?"

- PASO 4: ENVÍO DE COTIZACIÓN Y LINK (Respuesta 4)
  Se activa en cuanto el cliente proporciona su nombre y teléfono (o si ya los conocemos).
  Genera la respuesta utilizando los marcadores de posición exactos [LINK_COTIZACION] y [LINK_AGENDADO], los cuales la aplicación reemplazará dinámicamente con los enlaces reales.
  Envía exactamente el siguiente mensaje (reemplazando @nombre, @metros, y @precio_cotizado según corresponda, y usando los marcadores exactos):
  "Perfecto, @nombre. 

  Te estoy enviando:

  📋 Tu cotización formal para @metros m² ($@precio_cotizado + IVA): [LINK_COTIZACION]
  🔗 Un link para agendar tu inspección técnica gratuita con nuestro operario: [LINK_AGENDADO]

  Revisa la cotización y en el link puedes elegir el día que mejor te venga.

  Cualquier duda, aquí estoy. 

  ¡Gracias por elegirnos! 💚"

E) Si está interesado en la REMODELACIÓN o Mantenimiento General (Servicio de Sauceda Construye):
Pregunta de forma amigable y progresiva (una a la vez):
1. ¿Qué tipo de remodelación o trabajo de mantenimiento (albañilería, losa/concreto, pintura, etc.) deseas realizar en tu hogar?
2. ¿En qué colonia de León estás ubicado?
3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
4. Propón activamente agendar una visita técnica gratuita y sin compromiso en su domicilio para revisar los detalles y darle un presupuesto preciso. Solicítale que te confirme su disponibilidad de días y horarios preferidos para que el técnico le visite.

REGLA DE AGENDAMIENTO PARA CONSTRUCCIÓN (CRÍTICA):
Para cualquier servicio de la vertical SAUCEDA Construye (remodelación, impermeabilización, pintura, albañilería, losa/concreto, etc.), el objetivo prioritario y absoluto de Sofía es guiar al cliente a agendar una cita o visita técnica en sitio. Toda conversación de esta área debe avanzar decidida y progresivamente hacia este objetivo.

REGLA DE EVITAR PREGUNTA DE GOTERAS (CRÍTICA):
NUNCA le preguntes al cliente si el servicio es para impermeabilizar toda la azotea o solo para reparar algunas goteras, ni hagas preguntas similares. Siempre asume y cotiza el servicio completo de impermeabilización en base a los metros cuadrados totales indicados por el cliente.

REGLA CRÍTICA DE CONTEXTO:
Si la información ya está presente en los "Datos del cliente" abajo (como la ubicación/fraccionamiento, dirección exacta de la propiedad, tipo de crédito, valor de la casa, monto de la deuda o detalles de impermeabilización/remodelación) porque el cliente ya la proporcionó previamente, NO debes volver a preguntársela en absoluto. En su lugar, reconócela/valídala amablemente en tu saludo y continúa directamente con la información que falte.

REGLA DE CRÉDITOS NO ADMITIDOS (AGIOTISTAS / PRESTAMISTAS PARTICULARES):
Si el cliente menciona que su propiedad tiene una hipoteca, adeudo o embargo con un AGIOTISTA, PRESTAMISTA INFORMAL o persona física particular (en lugar de instituciones oficiales como INFONAVIT, FOVISSSTE o bancos), debes informarle de inmediato y con amabilidad que por políticas de la empresa SAUCEDA Bienes Raíces únicamente compra o traspasa propiedades con deudas de instituciones formales y que NO podemos atender deudas con prestamistas particulares. Despídete amablemente de ellos sin solicitar más datos.

REGLA DE TELÉFONO DE CONTACTO (CRÍTICA):
Si notas en los "Datos del cliente" abajo que el teléfono de contacto figura como "No registrado" (es decir, el prospecto viene de redes sociales y aún no nos proporciona su número móvil real), es tu prioridad absoluta solicitarle amablemente su número de teléfono o WhatsApp durante la charla de forma fluida y natural, explicándole que es para que un asesor pueda continuar el contacto.

Una vez que tengas los datos mínimos recopilados para el flujo correspondiente:
- Comunícales con amabilidad que con esta información nuestro equipo preparará la propuesta o se pondrá en contacto para los siguientes pasos.
- Infórmales que les daremos respuesta directamente por este chat de WhatsApp.

Qué SÍ haces:
- Saludar y resolver dudas sobre cómo funcionan nuestros servicios de construcción (remodelación, impermeabilización, pintura, losas) y de bienes raíces (compra directa, promoción y armado de expedientes).
- Preguntar de forma fluida y natural sobre los datos requeridos para cada servicio.
- Indicar que pueden mandar fotos y estados de cuenta por aquí para que el equipo los revise.

Qué NO haces:
- NO presiones al cliente para llamarle por teléfono o agendar una llamada. Respeta su canal de WhatsApp al 100%.
- NO inventes ni prometas montos exactos de avalúos, precios de compra o tiempos definitivos.
- NO des asesoría legal ni financiera definitiva.

Estilo:
- Respuestas CORTAS (1 a 3 frases), tipo chat informal pero profesional. Emojis con moderación. Adaptar según escriba el cliente, sin sonar robótico.
- Haz una sola pregunta a la vez para no abrumar al cliente.
- Eres un asistente virtual (no te haces pasar por humano si te preguntan).

IMPORTANTE: Debes responder EXCLUSIVAMENTE con un objeto JSON válido. No incluyes explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "respuesta": "El mensaje de texto que se enviará al cliente por WhatsApp (siguiendo estrictamente las plantillas del flujo de impermeabilización si corresponde).",
  "datosExtraidos": {
    "fraccionamiento": "Nombre del fraccionamiento/zona si el cliente lo mencionó claramente en la conversación, de lo contrario null",
    "valor_estimado": "Valor aproximado de la propiedad como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "saldo_deuda": "Monto adeudado como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "situacion_fisica": "El estado físico de la casa. Solo puede ser 'vandalizada', 'deshabitada' o 'bueno' si el cliente lo mencionó claramente, de lo contrario null",
    "telefono_real": "Número de teléfono celular de 10 dígitos (ej. 4771234567) si el cliente lo proporcionó en este mensaje o a lo largo del chat, de lo contrario null",
    "sin_pagos": "Tiempo aproximado que lleva sin realizar pagos (ej. '~4 años', '12 meses') si el cliente lo mencionó en la conversación, de lo contrario null",
    "estado_fisico": "El estado físico de la vivienda (ej. 'Buen estado', 'Descuidada', 'Vandalizada') si lo mencionó, de lo contrario null",
    "habitada": "Si la casa está habitada o no. Solo puede ser 'Sí (habitada)' o 'No (deshabitada)' si lo mencionó claramente, de lo contrario null",
    "tipo_negocio": "El tipo de negocio/servicio elegido. Solo puede ser 'traspaso_compra', 'promocion_venta', 'solo_tramite', 'construccion' o 'construccion-impermeabilizacion' si el cliente lo eligió o se detectó en la conversación, de lo contrario null",
    "necesidad": "Una descripción detallada de la necesidad o del servicio que el cliente está solicitando (por ejemplo, 'Impermeabilización de azotea de 40m², gotea ahora' o 'Venta de casa por cambio de ciudad'), de lo contrario null",
    "colonia": "La colonia de León proporcionada por el cliente si el tipo de negocio es impermeabilización o construcción, de lo contrario null",
    "metros": "El número entero de metros cuadrados aproximados a impermeabilizar proporcionados por el cliente si el tipo de negocio es impermeabilización, de lo contrario null",
    "paquete_elegido": "El paquete elegido por el cliente ('estandar' o 'premium') si lo seleccionó, de lo contrario null",
    "cliente_nombre": "El nombre proporcionado por el cliente, de lo contrario null"
  }
}

Contacto SAUCEDA: WhatsApp ${MARCA.whatsappTexto} · ${MARCA.web}`;

  let extra = (process.env.IA_INSTRUCCIONES || "").trim();
  try {
    const { data } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", "ia_instrucciones")
      .maybeSingle();
    if (data?.valor) {
      extra = data.valor.trim();
    }
  } catch (err) {
    console.error("Error al obtener configuracion_agente de la base de datos:", err);
  }
  let contexto = "";
  if (exp) {
    const nombre = [exp.cliente, exp.primer_apellido].filter(Boolean).join(" ");
    const telReal = (exp.telefono && !exp.telefono.startsWith("messenger:") && !exp.telefono.startsWith("instagram:"))
      ? exp.telefono
      : "No registrado";

    const partes = [
      nombre && `Nombre del cliente: ${nombre}`,
      `Teléfono de contacto: ${telReal}`,
      exp.canal_id && `Canal vinculado: ${exp.canal_id}`,
      exp.fraccionamiento &&
        exp.fraccionamiento !== "Por definir" &&
        `Fraccionamiento/zona: ${exp.fraccionamiento}`,
      exp.direccion_propiedad && `Dirección exacta de la propiedad: ${exp.direccion_propiedad}`,
      exp.tipo_negocio && `Tipo de negocio: ${exp.tipo_negocio}`,
      exp.tipo_credito && `Tipo de crédito / adeudo: ${exp.tipo_credito}`,
      exp.valor_estimado && exp.valor_estimado > 0 && `Valor estimado de la vivienda: $${exp.valor_estimado}`,
      exp.saldo_deuda && exp.saldo_deuda > 0 && `Saldo aproximado de deuda: $${exp.saldo_deuda}`,
      exp.necesidad && `Necesidad reportada: ${exp.necesidad}`,
      exp.link_google_maps && `Link de Google Maps: ${exp.link_google_maps}`,
      exp.sin_pagos && `Tiempo sin realizar pagos: ${exp.sin_pagos}`,
      exp.estado_fisico && `Estado físico de la propiedad: ${exp.estado_fisico}`,
      exp.habitada && `Vivienda habitada: ${exp.habitada}`,
      exp.etapa && `Etapa del trámite: ${exp.etapa}`,
      exp.situacion && `Situación reportada: ${exp.situacion}`,
    ].filter(Boolean);
    if (partes.length) contexto = `\n\nDatos del cliente:\n${partes.join("\n")}`;
  }
  return [base, extra && `\nIndicaciones adicionales del negocio:\n${extra}`, contexto]
    .filter(Boolean)
    .join("\n");
}

/** Convierte el historial en mensajes para la API (roles alternados). */
function aMensajes(
  historia: FilaMsg[],
): { role: "user" | "assistant"; content: string }[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const f of historia) {
    if (!f.texto?.trim()) continue;
    const role = f.direccion === "in" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + f.texto;
    else msgs.push({ role, content: f.texto });
  }
  // La API exige que el primer mensaje sea del usuario.
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  return msgs;
}

/** Llama a la API de Claude y devuelve el texto de la respuesta. */
async function generarRespuesta(
  system: string,
  mensajes: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || mensajes.length === 0) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1500,
      system,
      messages: mensajes,
    }),
  });
  if (!res.ok) {
    console.error("IA: error de Anthropic", res.status, await res.text());
    return "";
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const texto = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  return texto;
}

/**
 * Genera y envía una respuesta automática de la IA para una conversación.
 * Best-effort: nunca lanza.
 */
export async function responderConIA(
  sb: SupabaseClient,
  ctx: { telefono: string; expedienteId?: string | null },
): Promise<void> {
  try {
    if (!iaAgenteActivo()) return;

    // Historial reciente del hilo usando variantes de teléfono.
    const { data } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .in("telefono", variantesTelefono(ctx.telefono))
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORIAL);
    const historia = (data as FilaMsg[]) ?? [];
    if (historia.length === 0) return;

    // Detectar bucles con auto-respondedores/bots.
    const ultimosIn = historia.filter((f) => f.direccion === "in").slice(-3);
    if (ultimosIn.length >= 2) {
      const texto1 = (ultimosIn[ultimosIn.length - 1].texto ?? "").trim().toLowerCase();
      const texto2 = (ultimosIn[ultimosIn.length - 2].texto ?? "").trim().toLowerCase();
      
      if (texto1 && texto1 === texto2) {
        // Si el mensaje repetido es largo (más de 20 caracteres), asumimos bot y paramos de inmediato.
        if (texto1.length > 20) {
          console.warn(`IA: Se detectó bucle de bot (mensajes idénticos largos) de ${ctx.telefono}.`);
          return;
        }
        
        // Si es corto, paramos al tercer mensaje idéntico.
        if (ultimosIn.length >= 3) {
          const texto3 = (ultimosIn[ultimosIn.length - 3].texto ?? "").trim().toLowerCase();
          if (texto2 === texto3) {
            console.warn(`IA: Se detectó bucle repetido (3 mensajes idénticos cortos) de ${ctx.telefono}.`);
            return;
          }
        }
      }
    }

    // Toma de control humano: si el último mensaje asignado en el hilo lo
    // tiene un asesor o persona (agente distinto de "IA" y no vacío), la IA
    // no interviene. Esto cubre tanto respuestas directas de humanos como
    // asignaciones explícitas de chat desde la bandeja.
    // Los mensajes de la secuencia automatizada ("Sistema (Secuencia)") NO
    // cuentan como toma de control — el lead que responde a un mensaje de
    // rescate debe ser atendido por Sofía con su contexto completo.
    const AGENTES_AUTOMATICOS = new Set([NOMBRE_AGENTE, "Sistema (Secuencia)", "Sistema", "IA (Retoque)"]);
    const ultimoConAgente = historia
      .slice()
      .reverse()
      .find((f) => f.agente && f.agente.trim() !== "");
    if (ultimoConAgente && ultimoConAgente.agente && !AGENTES_AUTOMATICOS.has(ultimoConAgente.agente)) {
      console.log(`IA: Ignorando respuesta automática para ${ctx.telefono} porque el chat está tomado por: ${ultimoConAgente.agente}`);
      return;
    }

    // Contexto del expediente (si lo hay).
    let exp: FilaExp | null = null;
    if (ctx.expedienteId) {
      const { data: e } = await sb
        .from("expedientes")
        .select(
          "cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, link_google_maps, necesidad, valor_estimado, saldo_deuda, telefono, canal_id, prospecto_id, sin_pagos, estado_fisico, habitada, asesor_id"
        )
        .eq("id", ctx.expedienteId)
        .maybeSingle();
      exp = (e as FilaExp) ?? null;

      // Si el expediente ya está cerrado o perdido, la IA no debe intervenir
      if (exp && (exp.etapa === "perdido" || exp.etapa === "cerrado")) {
        console.log(`IA: Ignorando respuesta para ${ctx.telefono} porque el expediente está en etapa '${exp.etapa}'.`);
        return;
      }

      // Si el prospecto tiene estatus 'nuevo', lo movemos a 'en_conversacion'
      if (exp?.prospecto_id) {
        const { data: prInfo } = await sb
          .from("prospectos")
          .select("estatus")
          .eq("id", exp.prospecto_id)
          .maybeSingle();
        
        if (prInfo?.estatus === "nuevo") {
          await sb
            .from("prospectos")
            .update({ estatus: "en_conversacion" })
            .eq("id", exp.prospecto_id);
        }
      }
    }

    const textoAI = await generarRespuesta(
      await instrucciones(exp, sb),
      aMensajes(historia),
    );
    if (!textoAI) return;

    let textoRespuesta = "";
    let datosExtraidos: {
      fraccionamiento?: string | null;
      valor_estimado?: number | null;
      saldo_deuda?: number | null;
      situacion_fisica?: "vandalizada" | "deshabitada" | "bueno" | null;
      sin_pagos?: string | null;
      estado_fisico?: string | null;
      habitada?: string | null;
    } = {};

    let limpio = "";
    try {
      // Limpieza robusta del JSON antes de parsear
      limpio = textoAI.trim();
      
      // Quitar bloques de código markdown ```json ... ``` o ``` ... ```
      if (limpio.startsWith("```")) {
        limpio = limpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      limpio = limpio.trim();

      // Quitar prefijo "json" si quedó suelto
      if (limpio.toLowerCase().startsWith("json")) {
        limpio = limpio.slice(4).trim();
      }

      // Si no empieza con {, intentar extraer lo que está entre el primer { y el último }
      if (!limpio.startsWith("{")) {
        const idxInicio = limpio.indexOf("{");
        const idxFin = limpio.lastIndexOf("}");
        if (idxInicio !== -1 && idxFin !== -1 && idxFin > idxInicio) {
          limpio = limpio.slice(idxInicio, idxFin + 1);
        }
      }

      const parsed = JSON.parse(limpio);
      textoRespuesta = parsed.respuesta || "";
      datosExtraidos = parsed.datosExtraidos || {};
    } catch (err) {
      console.warn("IA: Error al parsear JSON estructurado. Se usará fallback de extracción limpia.", err);
      // Fallback: Si el texto contiene la clave "respuesta", intentamos extraer solo su contenido para no mandar el JSON crudo al cliente
      const indexRespuesta = limpio.indexOf('"respuesta"');
      if (indexRespuesta !== -1) {
        try {
          // Un regex simple para extraer el valor de la clave "respuesta"
          const match = limpio.match(/"respuesta"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (match && match[1]) {
            // Reemplazar saltos de línea escapados
            textoRespuesta = match[1]
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
          }
        } catch (regErr) {
          console.error("IA: Error al extraer respuesta vía Regex:", regErr);
        }
      }
      
      // Si a pesar del regex no obtuvimos nada y el texto no parece JSON, usamos el texto completo original
      if (!textoRespuesta) {
        if (limpio.startsWith("{") || limpio.includes('"respuesta"')) {
          textoRespuesta = "Hola, una disculpa. Tuvimos un inconveniente al procesar tu solicitud, pero en un momento te atendemos.";
        } else {
          textoRespuesta = textoAI;
        }
      }
    }

    if (!textoRespuesta) return;

    // --- PROCESAMIENTO DE DATOS EXTRAÍDOS ---
    const updates: Record<string, any> = {};
    if (ctx.expedienteId) {
      if (datosExtraidos.fraccionamiento) {
        updates.fraccionamiento = datosExtraidos.fraccionamiento;
      }
      if (datosExtraidos.valor_estimado) {
        updates.valor_estimado = Number(datosExtraidos.valor_estimado);
      }
      if (datosExtraidos.saldo_deuda) {
        updates.saldo_deuda = Number(datosExtraidos.saldo_deuda);
      }
      if ((datosExtraidos as any).telefono_real) {
        const telLimpio = String((datosExtraidos as any).telefono_real).replace(/\D/g, "");
        if (telLimpio.length >= 10) {
          updates.telefono = telLimpio.slice(-10);
        }
      }
      if (datosExtraidos.situacion_fisica) {
        let desc = "";
        if (datosExtraidos.situacion_fisica === "vandalizada") {
          desc = "Propiedad vandalizada.";
        } else if (datosExtraidos.situacion_fisica === "deshabitada") {
          desc = "Propiedad deshabitada.";
        } else if (datosExtraidos.situacion_fisica === "bueno") {
          desc = "Propiedad en buen estado.";
        }
        if (desc) {
          updates.situacion = desc;
        }
      }
      if (datosExtraidos.sin_pagos) {
        updates.sin_pagos = datosExtraidos.sin_pagos;
      }
      if (datosExtraidos.estado_fisico) {
        updates.estado_fisico = datosExtraidos.estado_fisico;
      }
      if (datosExtraidos.habitada) {
        updates.habitada = datosExtraidos.habitada;
      }
      if ((datosExtraidos as any).tipo_negocio) {
        updates.tipo_negocio = (datosExtraidos as any).tipo_negocio;
      }
      if ((datosExtraidos as any).necesidad) {
        updates.necesidad = (datosExtraidos as any).necesidad;
      }

      // Nuevos campos Sofía 2.0 (Impermeabilización)
      if ((datosExtraidos as any).colonia) {
        updates.fraccionamiento = (datosExtraidos as any).colonia;
      }
      if ((datosExtraidos as any).cliente_nombre) {
        updates.cliente = (datosExtraidos as any).cliente_nombre;
      }
      if ((datosExtraidos as any).cliente_telefono) {
        const telLimpio = String((datosExtraidos as any).cliente_telefono).replace(/\D/g, "");
        if (telLimpio.length >= 10) {
          updates.telefono = telLimpio.slice(-10);
        }
      }

      const esImper = exp?.tipo_negocio === "construccion-impermeabilizacion" || updates.tipo_negocio === "construccion-impermeabilizacion";
      
      // Formatear necesidad si tenemos datos técnicos de impermeabilización
      if (esImper && (datosExtraidos as any).metros && (datosExtraidos as any).paquete_elegido) {
        const m = (datosExtraidos as any).metros;
        const paq = String((datosExtraidos as any).paquete_elegido).toUpperCase();
        const col = (datosExtraidos as any).colonia || datosExtraidos.fraccionamiento || exp?.fraccionamiento || "";
        updates.necesidad = `Impermeabilización de ${m} m² - Paquete ${paq}${col ? ` en col. ${col}` : ""}`;
      }

      // --- CREACIÓN DE COTIZACIÓN AUTOMÁTICA (Supabase) Y REEMPLAZO DE LINKS ---
      if (esImper && exp) {
        let tokenCot = "";
        let idCot = "";

        const m = (datosExtraidos as any).metros;
        const paq = (datosExtraidos as any).paquete_elegido;
        const nombreCliente = (datosExtraidos as any).cliente_nombre || exp.cliente;
        const telefonoCliente = (datosExtraidos as any).cliente_telefono || exp.telefono;

        if (m && paq && nombreCliente && telefonoCliente) {
          try {
            // Verificar si ya existe una cotización
            const { data: cotizacionesExistentes } = await sb
              .from("cotizaciones")
              .select("id, token")
              .eq("expediente_id", ctx.expedienteId);

            if (cotizacionesExistentes && cotizacionesExistentes.length > 0) {
              tokenCot = cotizacionesExistentes[0].token;
              idCot = cotizacionesExistentes[0].id;
            } else {
              // Generar folio de forma local
              const { data: todasLasCots } = await sb.from("cotizaciones").select("id");
              const ids = (todasLasCots ?? []).map((c) => c.id as string);
              const numeros = ids.map((id) => parseInt(id.replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n));
              const max = numeros.length ? Math.max(...numeros) : 0;
              idCot = `COT-${String(max + 1).padStart(3, "0")}`;

              const precioM2 = String(paq).toLowerCase() === "premium" ? 260 : 200;
              const precioTotal = Number(m) * precioM2;

              // Insertar cotización
              const { data: nuevaCot, error: errInsertCot } = await sb
                .from("cotizaciones")
                .insert({
                  id: idCot,
                  prospecto_id: exp.prospecto_id,
                  expediente_id: ctx.expedienteId,
                  servicio_tipo: "impermeabilizacion",
                  estatus: "esperando_visita",
                  requiere_visita: true,
                  precio_final: precioTotal,
                  notas_internas: "Creada automáticamente por el chatbot Sofía."
                })
                .select("token")
                .single();

              if (errInsertCot) {
                console.error("IA: Error al crear cotización en BD:", errInsertCot);
              } else if (nuevaCot) {
                tokenCot = nuevaCot.token;

                // Insertar concepto
                const descConcepto = String(paq).toLowerCase() === "premium"
                  ? "Paquete PREMIUM - Impermeabilizante 4.0 poliéster + gravilla (10 años de garantía)"
                  : "Paquete ESTÁNDAR - Impermeabilizante 3.5 + gravilla (5 años de garantía)";

                const { error: errInsertConcepto } = await sb
                  .from("cotizacion_conceptos")
                  .insert({
                    cotizacion_id: idCot,
                    descripcion: descConcepto,
                    cantidad: Number(m),
                    unidad: "m2",
                    precio_unitario: precioM2,
                    importe: precioTotal
                  });

                if (errInsertConcepto) {
                  console.error("IA: Error al crear conceptos de cotización:", errInsertConcepto);
                }

                // Mover expediente a etapa 'visita' y asignar operario Alex
                updates.etapa = "visita";
                try {
                  const { data: perfAlex } = await sb
                    .from("perfiles")
                    .select("id")
                    .ilike("nombre", "%Alex%")
                    .eq("activo", true)
                    .maybeSingle();

                  if (perfAlex) {
                    updates.asesor_id = perfAlex.id;
                    console.log(`[Asignación Automática] Asignando operario Alex (${perfAlex.id}) al expediente ${ctx.expedienteId}`);
                  } else {
                    console.warn("[Asignación Automática] No se encontró operario activo 'Alex' en la tabla perfiles.");
                  }
                } catch (alexErr) {
                  console.error("[Asignación Automática] Error al buscar operario Alex:", alexErr);
                }

                await registrarActividad(sb, {
                  expedienteId: ctx.expedienteId,
                  tipo: "construccion",
                  titulo: `Cotización automática creada (${idCot})`,
                  detalle: `Paquete: ${paq.toUpperCase()}. Metros: ${m} m2. Total: $${precioTotal}. Estatus: esperando_visita. Operario asignado: Alex.`,
                });
              }
            }

            // Fallback: si no tenemos tokenCot pero la respuesta tiene los marcadores, recuperamos la cotización de la BD
            if (!tokenCot && (textoRespuesta.includes("[LINK_COTIZACION]") || textoRespuesta.includes("[LINK_AGENDADO]"))) {
              try {
                const { data: cots } = await sb
                  .from("cotizaciones")
                  .select("id, token")
                  .eq("expediente_id", ctx.expedienteId)
                  .order("created_at", { ascending: false });

                if (cots && cots.length > 0) {
                  tokenCot = cots[0].token;
                  idCot = cots[0].id;
                }
              } catch (fallbackErr) {
                console.error("IA: Error en fallback de búsqueda de cotización:", fallbackErr);
              }
            }

            // Reemplazar marcadores si tenemos el token
            if (tokenCot) {
              const urlCot = `${MARCA.web}/cotizacion/${tokenCot}`;
              
              // Intentar obtener el operador asignado al expediente para usar la agenda interna de la app
              let operadorId = updates.asesor_id || exp?.asesor_id;
              if (!operadorId) {
                try {
                  const { data: perfAlex } = await sb
                    .from("perfiles")
                    .select("id")
                    .ilike("nombre", "%Alex%")
                    .eq("activo", true)
                    .maybeSingle();
                  if (perfAlex) {
                    operadorId = perfAlex.id;
                  }
                } catch (err) {
                  console.error("IA: Error al buscar operario para agenda en fallback:", err);
                }
              }

              // Si tenemos un operadorId, usamos la agenda interna nativa del CRM
              const urlAgenda = operadorId
                ? `${MARCA.web}/agenda/${operadorId}?prospecto_id=${exp?.prospecto_id || ""}&tipo=inspeccion`
                : `https://calendly.com/sauceda-construye/inspeccion-gratuita-alex?cotizacion=${idCot}`;

              textoRespuesta = textoRespuesta
                .replace(/\[LINK_COTIZACION\]/g, urlCot)
                .replace(/\[LINK_AGENDADO\]/g, urlAgenda);
            }
          } catch (cotErr) {
            console.error("IA: Excepción al automatizar cotización de impermeabilización:", cotErr);
          }
        }
      }

      // Guardar actualizaciones de datos extraídos en base de datos
      if (Object.keys(updates).length > 0) {
        const { error: errUpdate } = await sb
          .from("expedientes")
          .update(updates)
          .eq("id", ctx.expedienteId);

        if (errUpdate) {
          console.error("IA: Error al actualizar expediente con datos:", errUpdate);
        } else {
          // Si actualizamos el teléfono, también lo actualizamos en el prospecto enlazado
          if (updates.telefono && exp?.prospecto_id) {
            const { error: errUpdatePr } = await sb
              .from("prospectos")
              .update({ telefono: updates.telefono })
              .eq("id", exp.prospecto_id);
            if (errUpdatePr) {
              console.error("IA: Error al actualizar prospecto con teléfono real:", errUpdatePr);
            }
          }

          const detalleActividad = Object.entries(updates)
            .map(([col, val]) => `${col}: ${val}`)
            .join(", ");
          await registrarActividad(sb, {
            expedienteId: ctx.expedienteId,
            tipo: "sistema",
            titulo: "Datos de propiedad actualizados por IA",
            detalle: `Extraídos del chat: ${detalleActividad}`,
          });
        }
      }

      // Si el agente de IA determinó descalificar el prospecto (no viable)
      if ((datosExtraidos as any).descalificado === true || (datosExtraidos as any).descalificado === "true") {
        if (exp?.prospecto_id) {
          await sb
            .from("prospectos")
            .update({ estatus: "no_viable", calificacion: "descalificado" })
            .eq("id", exp.prospecto_id);

          const motivo = (datosExtraidos as any).motivo_descalificacion || "No cumple con las políticas de compra";
          await sb
            .from("expedientes")
            .update({
              etapa: "perdido",
              situacion: `Descalificado por IA: ${motivo}`
            })
            .eq("id", ctx.expedienteId);

          await registrarActividad(sb, {
            expedienteId: ctx.expedienteId,
            tipo: "sistema",
            titulo: "Movido a Perdido (Descalificado por IA)",
            detalle: `Razón: ${motivo}`,
          });
        }
      }
    }

    // --- ENVÍO DEL MENSAJE POR WHATSAPP/MESSENGER/INSTAGRAM ---
    let r: { ok: boolean; error?: string };
    const canal = (ctx.telefono.startsWith("messenger:") || ctx.telefono.startsWith("instagram:"))
      ? ctx.telefono
      : (exp?.canal_id || ctx.telefono);

    const esMessenger = canal.startsWith("messenger:");
    const esInstagram = canal.startsWith("instagram:");

    if (esMessenger) {
      const psid = canal.slice(10);
      r = await enviarMessengerTexto(psid, textoRespuesta);
    } else if (esInstagram) {
      const igsid = canal.slice(10);
      r = await enviarInstagramTexto(igsid, textoRespuesta);
    } else {
      r = await enviarWhatsAppTexto(canal, textoRespuesta);

      // Si la respuesta en texto fue exitosa y está activa la respuesta por audio,
      // generamos y enviamos el audio en segundo plano.
      if (r.ok && process.env.IA_RESPONDER_CON_AUDIO === "on") {
        (async () => {
          try {
            console.log(`[WhatsApp Outbound Voice] Generando audio de respuesta para ${canal}...`);
            const audioBuffer = await generarAudioTTS(textoRespuesta);
            if (audioBuffer) {
              const mediaId = await subirAudioAMeta(audioBuffer, "audio/mpeg", "respuesta.mp3");
              if (mediaId) {
                const resAudio = await enviarWhatsAppAudio(canal, mediaId);
                if (resAudio.ok) {
                  console.log(`[WhatsApp Outbound Voice] Audio de respuesta enviado con éxito a ${canal}`);
                } else {
                  console.warn(`[WhatsApp Outbound Voice] No se pudo enviar el audio: ${resAudio.error}`);
                }
              } else {
                console.warn("[WhatsApp Outbound Voice] No se pudo subir el audio a Meta.");
              }
            } else {
              console.warn("[WhatsApp Outbound Voice] No se pudo generar el buffer de audio TTS.");
            }
          } catch (audioErr) {
            console.error("[WhatsApp Outbound Voice] Error en el flujo de audio saliente:", audioErr);
          }
        })();
      }
    }

    // --- REGISTRO DEL MENSAJE Y LA ACTIVIDAD DE ENVÍO ---
    await sb.from("mensajes_whatsapp").insert({
      telefono: ctx.telefono,
      texto: textoRespuesta,
      direccion: "out",
      expediente_id: ctx.expedienteId ?? null,
      estado: r.ok ? "enviado" : "error",
      agente: NOMBRE_AGENTE,
    });

    if (r.ok && ctx.expedienteId) {
      let canalLabel = "WhatsApp";
      if (esMessenger) canalLabel = "Messenger";
      if (esInstagram) canalLabel = "Instagram";

      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "mensaje",
        titulo: `Respuesta automática (IA) por ${canalLabel}`,
        detalle: textoRespuesta,
      });
    }
  } catch (err) {
    console.error("IA: no se pudo responder:", err);
  }
}

/**
 * Genera un mensaje de retoque (follow-up) personalizado mediante IA
 * basándose en el historial de la conversación.
 */
export async function generarMensajeRetoque(
  sb: SupabaseClient,
  telefono: string,
  expedienteId: string,
): Promise<string> {
  try {
    if (!iaAgenteActivo()) return "";

    // Historial reciente de la conversación
    const { data } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .in("telefono", variantesTelefono(telefono))
      .order("created_at", { ascending: true })
      .limit(12);

    const historia = (data as FilaMsg[]) ?? [];
    if (historia.length === 0) return "";

    // Filtrar mensajes de sistema, plantillas o secuencias automatizadas técnicas
    // para que la IA no se confunda con sintaxis técnica e intente "rellenarla"
    const historiaConversacional = historia.filter((m) => {
      const txt = (m.texto || "").trim();
      if (!txt) return false;
      if (txt.startsWith("[Plantilla:") || txt.startsWith("[Secuencia]")) return false;
      if (m.agente === "Sistema" || m.agente === "Sistema (Secuencia)") return false;
      return true;
    });

    if (historiaConversacional.length === 0) return "";

    // Contexto del expediente
    let exp: FilaExp | null = null;
    const { data: e } = await sb
      .from("expedientes")
      .select(
        "cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, necesidad, valor_estimado, saldo_deuda, telefono"
      )
      .eq("id", expedienteId)
      .maybeSingle();
    exp = (e as FilaExp) ?? null;

    const nombreCliente = exp ? [exp.cliente, exp.primer_apellido].filter(Boolean).join(" ") : "Cliente";
    
    // System Prompt especializado para el retoque / seguimiento
    const systemPrompt = `Eres Sofía, el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye (empresa en León, Guanajuato).
Anteriormente estabas conversando con el cliente de nombre "${nombreCliente}" sobre nuestros servicios. 
La conversación se quedó pausada desde tu última respuesta hace unas horas porque el cliente ya no contestó.

Tu objetivo ahora es escribir un único mensaje de retoque (follow-up) muy amigable, natural y súper corto (de 1 a 2 frases como máximo) para reactivar el contacto y preguntarle si tiene alguna duda, si pudo revisar la información o si requiere que programemos una visita/llamada, según corresponda de acuerdo a lo que estaban hablando.

REGLAS DE ESTILO Y TONO:
- Sé sumamente cálido, educado y cercano.
- No presiones al cliente. Hazlo ver como un seguimiento amigable y servicial.
- El mensaje debe ser corto (máximo 2 frases).
- Adapta el mensaje al contexto exacto de lo último que estaban hablando (revisa los últimos mensajes de la conversación). Por ejemplo:
  * Si hablaban de Impermeabilización de azotea: pregúntale si pudo revisar los precios o si le interesa que agendemos la inspección gratuita de su azotea.
  * Si hablaban de Compra Directa de su casa: pregúntale si le quedó alguna duda sobre cómo liquidamos su adeudo (de Infonavit, banco, etc.) o si le gustaría agendar una llamada.
  * Si hablaban de Promoción de su vivienda: pregúntale si desea que un asesor le marque para darle más detalles del fee o la venta.
- Escribe ÚNICAMENTE el texto del mensaje conversacional final a enviar. 
- PROHIBIDO: No escribas formatos JSON, no uses comillas adicionales ni introducciones.
- PROHIBIDO: No uses placeholders como "tu propiedad en X", no incluyas barras horizontales, corchetes, ni palabras como "| tipo_negocio" o nombres de servicios técnicos. Escribe puramente un mensaje humano conversacional.

Datos del cliente para referencia:
- Nombre: ${nombreCliente}
- Tipo de Negocio/Interés: ${exp?.tipo_negocio || "No especificado"}
- Fraccionamiento/Zona: ${exp?.fraccionamiento || "No especificado"}
- Necesidad reportada: ${exp?.necesidad || "No especificada"}`;

    const mensajesInput = aMensajes(historiaConversacional);
    if (mensajesInput.length === 0) return "";

    const respuestaRetoque = await generarRespuesta(systemPrompt, mensajesInput);
    return respuestaRetoque.trim();
  } catch (err) {
    console.error("Error al generar mensaje de retoque con IA:", err);
    return "";
  }
}

