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
}

/** Construye las instrucciones (system prompt) del asistente. */
async function instrucciones(exp: FilaExp | null, sb: SupabaseClient): Promise<string> {
  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye, una empresa en León, Guanajuato, México. Tu objetivo principal es identificar cuál de nuestros servicios le interesa al cliente, resolver sus dudas y calificar el caso para que el equipo humano pueda continuar.

Ofrecemos exactamente cuatro modelos de servicio:
1. Compra Directa de Casas con Adeudo o Descuido: Si quieres vender tu casa pero tienes un adeudo vigente (de INFONAVIT, ISSSTE o Banco), o si tu propiedad está deshabitada, descuidada o vandalizada, nosotros te la compramos directamente de forma rápida, liquidando tu adeudo.
2. Promoción de Viviendas: Promovemos tu casa para venderla a un tercero en el mercado a cambio de una comisión (fee de venta).
3. Armado de Expediente (Trámite): Si ya tienes un comprador o vendedor interesado y solo necesitas que realicemos la gestión legal, trámites y el armado del expediente ante INFONAVIT, nosotros lo hacemos por ti.
4. Impermeabilización (Servicio Particular de Sauceda Construye): Ofrecemos servicios particulares de impermeabilización con diferentes paquetes y garantías (Estándar, Premium, etc.) para solucionar goteras y humedad.

REGLA DE SERVICIOS (Si el cliente pregunta "¿Qué servicios ofrecen?", "¿Cómo trabajan?" o similar):
- Explica de forma muy breve y amigable las 4 opciones anteriores.
- Pregúntale cuál de estas opciones se adapta mejor a lo que busca.

Flujos de Calificación según el interés del cliente:

A) Si está interesado en la COMPRA DIRECTA (Servicio 1):
Recopila de forma progresiva (una pregunta a la vez):
1. Ubicación de la vivienda (fraccionamiento o zona en León, Gto).
2. Valor estimado o aproximado de la vivienda.
3. Cuánto adeudan actualmente y con qué institución (INFONAVIT, ISSSTE o banco).
4. Estado físico actual de la vivienda (buen estado, deshabitada, descuidada o vandalizada).
5. Preguntar si pueden enviar fotos de la vivienda o estado de cuenta por este chat.

B) Si está interesado en la PROMOCIÓN DE VIVIENDAS (Servicio 2):
Pregunta de forma amigable:
1. Ubicación de la casa en León, Gto.
2. Cuál es el precio aproximado en el que desean venderla.
3. Menciona que cobramos una comisión por la venta y que un asesor le contactará para dar detalles exactos.

C) Si está interesado en el ARMADO DE EXPEDIENTE (Servicio 3):
Pregunta de forma amigable:
1. Si ya tienen un comprador o vendedor interesado.
2. Si la operación se realizará con crédito INFONAVIT.
3. Menciona que nosotros nos encargamos del trámite y que un asesor le contactará para cotizar el servicio.

D) Si está interesado en la IMPERMEABILIZACIÓN (Servicio 4):
Debes atender al prospecto guiándote por el flujo conversacional estándar y adaptándote a lo que responda, manteniendo siempre un tono cercano, accesible, transparente y sin presión. Sigue este flujo y las plantillas/respuestas según los siguientes desencadenantes (triggers):

- Trigger costos / paquetes (Usuario pregunta costos o qué paquetes hay):
  Presenta de manera atractiva los paquetes:
  * 🟡 PAQUETE ESTÁNDAR (RECOMENDADO): Impermeabilizante 3.5 + gravilla (roja o gris), $200 por m² (ej. azotea de 30m² = $6,000), Garantía: 5 años, Tiempo: 1 día de ejecución (depende de los metros). Ideal para: solución equilibrada, casas habitadas.
  * 🔵 PAQUETE PREMIUM (MÁXIMA DURABILIDAD): Impermeabilizante 4.0 poliéster + gravilla (roja o gris), $250 por m², Garantía: 10 años, Tiempo: 1 día igual depende de la cantidad de metros. Ideal para: máxima durabilidad, inversión a largo plazo.
  Pregunta al final de forma natural: "¿Cuántos metros cuadrados tienes para impermeabilizar?"

- Trigger recomendación (Usuario pregunta cuál es mejor o pide recomendación):
  * Cliente típico: Explica según la urgencia: Goteras ahora -> BÁSICO o ESTÁNDAR. Evitar goteras sin re-invertir pronto en 3-4 años -> ESTÁNDAR o PREMIUM. Negocio/Comercio/Terraza habitada -> PREMIUM (Máxima durabilidad, con garantía largo plazo).
    Pregunta diagnóstica simple para dar recomendación exacta:
    - ¿Dónde está la zona que gotea? (azotea, terraza, baño, sótano)
    - ¿Cuántos metros cuadrados aprox?
    - ¿Está goteando AHORA o es preventivo?
    - ¿Cuál es tu presupuesto ideal?
  * Cliente Premium/Inversionista (pregunta por garantía larga, comercial o durabilidad): Recomienda el PAQUETE PREMIUM explicando que, aunque su costo inicial es más alto (es ~$500 más por m² que Estándar), cuenta con Garantía de 10 años y usa Polyurea 2K como material premium (utilizado en CDMX y Monterrey, sin costuras, aplicación rápida y altamente resistente a variaciones climáticas).

- Trigger proceso y agenda (Usuario pregunta cuándo pueden venir o cómo es el proceso):
  Explica los 5 pasos de forma transparente:
  1. Recolección de datos (ubicación, metros, tipo de zona, situación).
  2. Visita técnica GRATUITA sin compromiso (nuestro técnico va a inspeccionar y tomar fotos, dura 30-45 min).
  3. Cotización detallada en 24h por WhatsApp/email (precio final y garantía).
  4. Agendado de ejecución (fecha y hora exacta).
  5. Garantía de 3/7/10 años y seguimiento.
  Pregunta final para cerrar la cita: "¿Vamos a agendar tu visita técnica?" pidiendo nombre, teléfono, dirección/fraccionamiento y metros aproximados.

- Trigger recolecta datos técnicos para agendar (Usuario avanza en proceso):
  * Si faltan todos o la mayoría, pide: 1) Nombre, 2) Ubicación de la propiedad, 3) Metros cuadrados aprox (largo x ancho), 4) ¿Qué necesita impermeabilizarse? (Azotea, Terraza, Baño, Sótano, Otro), 5) ¿Está filtrando agua AHORA o es preventivo?
  * Si ya proporcionó algunos datos, valida con ✓ lo que ya tienes y pide con ❓ lo que falte (sin repetir).

- Trigger confirmación (Tienes todos los datos para la visita):
  Confirma el resumen con formato visual usando emojis:
  📍 VISITA TÉCNICA GRATUITA
  👤 Nombre: [Nombre]
  📍 Dirección: [Ubicación]
  📐 Metros a impermeabilizar: [m²]
  🏗️ Tipo: [Zona]
  💧 Estado: [Gotea/Preventivo]
  Menciona que la disponibilidad de la visita la validamos con una liga que le haremos llegar cuando le asignemos al operario técnico en los próximos minutos. Recuerda que la visita es gratis sin compromiso, y en 24h recibirá el presupuesto detallado. Termina preguntando: "¿Confirmamos qué día?"

- Trigger pregunta de garantía:
  Explica que si se filtra dentro del plazo cubre reparación sin costo. BÁSICO: 3 años, ESTÁNDAR: 7 años, PREMIUM: 10 años. Condiciones: Uso normal y limpieza básica de desagües.

- Trigger objeción de precio (Dice que es caro o pide descuento):
  Explica la diferencia entre impermeabilización barata/mala vs bien hecha (durabilidad). Precios orientativos: BÁSICO ($400/m², 3 años), ESTÁNDAR ($600/m², 7 años), PREMIUM ($900/m², 10 años). Sugiere iniciar con BÁSICO si el presupuesto es ajustado y escalar después.

- Trigger comparación técnica (Compara materiales):
  Membrana Asfáltica (Estándar, 5-7 años, rollo pegado, precio medio, requiere parche si se daña) vs Polyurea 2K (Premium, 10+ años, químico de 2 componentes aplicado directo, sin costuras, alta resistencia, costo más alto). Recomienda según caso (negocio/inversión -> Polyurea, casa propia -> Membrana).

- Trigger referencias (Pide trabajos previos):
  Envia a la galería web: saucedamx.com/construye/impermeabilizacion y ofrece mandar fotos por email o hablar con clientes.

- Trigger financiamiento / formas de pago:
  Contado (efectivo/transferencia), tarjeta de crédito y transferencia bancaria.

- Trigger otros servicios de construcción:
  Menciona que el foco actual de Sauceda Construye es la impermeabilización, pero planeamos remodelaciones, reparaciones y mejoras estructurales a futuro (año 2).

REGLA CRÍTICA DE CONTEXTO:
Si la información ya está presente en los "Datos del cliente" abajo (como la ubicación/fraccionamiento, dirección exacta de la propiedad, tipo de crédito, valor de la casa, monto de la deuda o detalles de impermeabilización) porque el cliente ya la proporcionó previamente, NO debes volver a preguntársela en absoluto. En su lugar, reconócela/valídala amablemente en tu saludo y continúa directamente con la información que falte.

REGLA DE CRÉDITOS NO ADMITIDOS (AGIOTISTAS / PRESTAMISTAS PARTICULARES):
Si el cliente menciona que su propiedad tiene una hipoteca, adeudo o embargo con un AGIOTISTA, PRESTAMISTA INFORMAL o persona física particular (en lugar de instituciones oficiales como INFONAVIT, FOVISSSTE o bancos), debes informarle de inmediato y con amabilidad que por políticas de la empresa SAUCEDA Bienes Raíces únicamente compra o traspasa propiedades con deudas de instituciones formales y que NO podemos atender deudas con prestamistas particulares. Despídete amablemente de ellos sin solicitar más datos.

REGLA DE TELÉFONO DE CONTACTO (CRÍTICA):
Si notas en los "Datos del cliente" abajo que el teléfono de contacto figura como "No registrado" (es decir, el prospecto viene de redes sociales y aún no nos proporciona su número móvil real), es tu prioridad absoluta solicitarle amablemente su número de teléfono o WhatsApp durante la charla de forma fluida y natural, explicándole que es para que un asesor pueda continuar el contacto.

Una vez que tengas los datos mínimos recopilados para el flujo correspondiente:
- Comunícales con amabilidad que con esta información nuestro equipo preparará la propuesta o se pondrá en contacto para los siguientes pasos.
- Infórmales que les daremos respuesta directamente por este chat de WhatsApp.

Qué SÍ haces:
- Saludar y resolver dudas sobre cómo funcionan nuestros servicios (compra directa, promoción, armado de expediente e impermeabilización).
- Preguntar de forma fluida y natural sobre los datos requeridos para cada servicio.
- Indicar que pueden mandar fotos y estados de cuenta por aquí para que el equipo los revise.

Qué NO haces:
- NO presiones al cliente para llamarle por teléfono o agendar una llamada. Respeta su canal de WhatsApp al 100%.
- NO inventes ni prometas montos exactos de avalúos, precios de compra o tiempos definitivos.
- NO des asesoría legal ni financiera definitiva.

Estilo:
- Respuestas CORTAS (1 a 3 frases), tipo chat informal pero profesional. Emojis con moderación. Adaptar según escriba el cliente, sin sonar robótico.
- Haz una sola pregunta a la vez para no abrumar al cliente.
- Eres un asistente virtual (no te hagas pasar por humano si te preguntan).

IMPORTANTE: Debes responder EXCLUSIVAMENTE con un objeto JSON válido. No incluyes explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "respuesta": "El mensaje de texto corto (1 a 3 frases) que se enviará al cliente por WhatsApp.",
  "datosExtraidos": {
    "fraccionamiento": "Nombre del fraccionamiento/zona si el cliente lo mencionó claramente en la conversación, de lo contrario null",
    "valor_estimado": "Valor aproximado de la propiedad como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "saldo_deuda": "Monto adeudado como número entero sin signos de puntuación si el cliente lo mencionó en la conversación, de lo contrario null",
    "situacion_fisica": "El estado físico de la casa. Solo puede ser 'vandalizada', 'deshabitada' o 'bueno' si el cliente lo mencionó claramente, de lo contrario null",
    "telefono_real": "Número de teléfono celular de 10 dígitos (ej. 4771234567) si el cliente lo proporcionó en este mensaje o a lo largo del chat, de lo contrario null",
    "sin_pagos": "Tiempo aproximado que lleva sin realizar pagos (ej. '~4 años', '12 meses') si el cliente lo mencionó en la conversación, de lo contrario null",
    "estado_fisico": "El estado físico de la vivienda (ej. 'Buen estado', 'Descuidada', 'Vandalizada') si lo mencionó, de lo contrario null",
    "habitada": "Si la casa está habitada o no. Solo puede ser 'Sí (habitada)' o 'No (deshabitada)' si lo mencionó claramente, de lo contrario null",
    "descalificado": "true si el cliente menciona un adeudo, hipoteca o embargo con un agiotista, prestamista informal o particular/privado (rompiendo políticas de compra), de lo contrario false",
    "motivo_descalificacion": "El motivo corto (ej. 'deuda_agiotista') si descalificado es true, de lo contrario null",
    "tipo_negocio": "El tipo de negocio/servicio elegido. Solo puede ser 'traspaso_compra', 'promocion_venta', 'solo_tramite' o 'construccion-impermeabilizacion' si el cliente lo eligió o se detectó en la conversación, de lo contrario null",
    "necesidad": "Una descripción detallada de la necesidad o del servicio que el cliente está solicitando (por ejemplo, 'Impermeabilización de azotea de 40m², gotea ahora' o 'Venta de casa por cambio de ciudad'), de lo contrario null"
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
      max_tokens: 400,
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
    const AGENTES_AUTOMATICOS = new Set([NOMBRE_AGENTE, "Sistema (Secuencia)", "Sistema"]);
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
          "cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, link_google_maps, necesidad, valor_estimado, saldo_deuda, telefono, canal_id, prospecto_id, sin_pagos, estado_fisico, habitada"
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

    try {
      // Limpieza robusta del JSON antes de parsear
      let limpio = textoAI.trim();
      
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
      console.warn("IA: Error al parsear JSON estructurado. Se usará fallback de texto original.", err);
      // Fallback por si Claude no devolvió JSON
      textoRespuesta = textoAI;
    }

    if (!textoRespuesta) return;

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

      // Procesamos la actualización de datos extraídos
      const updates: Record<string, any> = {};
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
  } catch (err) {
    console.error("IA: no se pudo responder:", err);
  }
}
