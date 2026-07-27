import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { enviarMessengerTexto } from "@/lib/messenger";
import { enviarInstagramTexto } from "@/lib/instagram";
import { MARCA } from "@/lib/marca";
import { variantesTelefono } from "@/lib/telefono";
import { generarAudioTTS, subirAudioAMeta, enviarWhatsAppAudio } from "@/lib/ia/audio";
import { supabaseServidor } from "@/lib/supabase/server";

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
  if (process.env.IA_AGENTE === "off") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(process.env.KIMI_API_KEY) || process.env.IA_PROVEEDOR === "ollama";
}

/**
 * Diagnóstico del agente: comprueba configuración y hace un "ping" real a
 * Claude u Ollama para verificar que funcione correctamente.
 */
export async function diagnosticoIA(): Promise<{ ok: boolean; mensaje: string }> {
  if (process.env.IA_AGENTE === "off") {
    return {
      ok: false,
      mensaje: "La IA está apagada (IA_AGENTE = off). Cámbiala a 'on' y vuelve a desplegar.",
    };
  }

  let proveedor = process.env.IA_PROVEEDOR || "anthropic";
  try {
    const sb = supabaseServidor();
    const { data } = await sb
      .from("configuracion_agente")
      .select("valor")
      .eq("clave", "ia_proveedor")
      .maybeSingle();
    if (data?.valor && ["anthropic", "kimi", "ollama"].includes(data.valor.trim())) {
      proveedor = data.valor.trim();
    }
  } catch (err) {
    console.error("Error al obtener proveedor en diagnosticoIA:", err);
  }

  if (proveedor === "kimi") {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        mensaje: "Falta KIMI_API_KEY en este deploy. Agrégala en Coolify y vuelve a desplegar.",
      };
    }
    const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
    const model = process.env.KIMI_MODEL || "kimi-k3";
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) {
        return { ok: true, mensaje: `Kimi API listo ✓ — modelo ${model} responde correctamente.` };
      }
      const cuerpo = (await res.text()).slice(0, 200);
      return { ok: false, mensaje: `Kimi API respondió ${res.status}. ${cuerpo}` };
    } catch (err) {
      return { ok: false, mensaje: `No se pudo contactar a Kimi API en ${baseUrl}: ${String(err)}` };
    }
  }

  if (proveedor === "ollama") {
    const url = process.env.OLLAMA_URL || "http://192.168.100.253:11434/v1/chat/completions";
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) {
        return { ok: true, mensaje: `Ollama local listo ✓ — modelo ${model} responde correctamente.` };
      }
      const cuerpo = (await res.text()).slice(0, 200);
      return { ok: false, mensaje: `Ollama local respondió ${res.status}. ${cuerpo}` };
    } catch (err) {
      return { ok: false, mensaje: `No se pudo contactar a Ollama local en ${url}: ${String(err)}` };
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      mensaje:
        "Falta ANTHROPIC_API_KEY en este deploy. Agrégala en Netlify/Coolify y dispara un Trigger deploy.",
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
  operador_id?: string | null;
  ultimo_paso_flujo?: string | null;
  ultimo_paso_alcanzado?: string | null;
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
}

function formatearFechaLegible(fechaStr: string, horaStr: string): string {
  try {
    const [y, m, d] = fechaStr.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const diaSemana = dias[fecha.getDay()];
    const mesLabel = meses[fecha.getMonth()];

    const partesHora = horaStr.split(":");
    let hrs = parseInt(partesHora[0], 10) || 0;
    const mins = partesHora[1] || "00";
    const ampm = hrs >= 12 ? "PM" : "AM";
    hrs = hrs % 12;
    if (hrs === 0) hrs = 12;

    return `${diaSemana} ${d} de ${mesLabel} a las ${hrs}:${mins} ${ampm}`;
  } catch (e) {
    return `${fechaStr} a las ${horaStr}`;
  }
}

function generarSlotsFallback(): { texto: string; raw: { fecha: string; hora: string } }[] {
  const slots: { texto: string; raw: { fecha: string; hora: string } }[] = [];
  const hoy = new Date();
  
  let count = 0;
  for (let i = 1; i < 7; i++) {
    if (slots.length >= 3) break;
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + i);
    
    if (fecha.getDay() === 0) continue; // omitir domingos
    
    const fechaStr = fecha.toISOString().slice(0, 10);
    if (count === 0) {
      slots.push({
        texto: formatearFechaLegible(fechaStr, "10:00:00"),
        raw: { fecha: fechaStr, hora: "10:00:00" }
      });
    } else if (count === 1) {
      slots.push({
        texto: formatearFechaLegible(fechaStr, "16:00:00"),
        raw: { fecha: fechaStr, hora: "16:00:00" }
      });
    } else if (count === 2) {
      slots.push({
        texto: formatearFechaLegible(fechaStr, "11:00:00"),
        raw: { fecha: fechaStr, hora: "11:00:00" }
      });
    }
    count++;
  }
  return slots;
}

async function obtenerSiguientesTresSlots(operadorId: string, sb: SupabaseClient): Promise<{ texto: string; raw: { fecha: string; hora: string } }[]> {
  try {
    const { obtenerSlotsDisponibles } = await import("@/app/actions/agenda");
    const slotsEncontrados: { texto: string; raw: { fecha: string; hora: string } }[] = [];
    const hoy = new Date();
    
    for (let i = 0; i < 14; i++) {
      if (slotsEncontrados.length >= 3) break;
      
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + i);
      const fechaStr = fecha.toISOString().slice(0, 10);
      
      const slots = await obtenerSlotsDisponibles(operadorId, fechaStr);
      for (const slot of slots) {
        if (slotsEncontrados.length >= 3) break;
        
        const legible = formatearFechaLegible(fechaStr, slot.inicio);
        slotsEncontrados.push({
          texto: legible,
          raw: {
            fecha: fechaStr,
            hora: slot.inicio
          }
        });
      }
    }
    
    return slotsEncontrados;
  } catch (err) {
    console.error("Error al obtener siguientes slots para el agente:", err);
    return [];
  }
}

/** Construye las instrucciones (system prompt) del asistente. */
async function instrucciones(exp: FilaExp | null, sb: SupabaseClient): Promise<string> {
  // 1. Encontrar el operador asignado o el fallback a Alex
  let operadorId = exp?.asesor_id || exp?.operador_id;
  if (!operadorId) {
    try {
      const { data: perfAlex } = await sb
        .from("perfiles")
        .select("id")
        .or("nombre.ilike.%Alex%,nombre.ilike.%Alejandro%")
        .eq("activo", true)
        .maybeSingle();
      if (perfAlex) {
        operadorId = perfAlex.id;
      }
    } catch (err) {
      console.error("IA: Error al buscar Alex en instrucciones:", err);
    }
  }

  // 2. Obtener los siguientes 3 slots
  const slots = operadorId ? await obtenerSiguientesTresSlots(operadorId, sb) : [];
  const finalSlots = slots.length >= 3 ? slots : generarSlotsFallback();
  const opcionesTexto = finalSlots.map((s, idx) => `Opción ${idx + 1}: ${s.texto}`).join("\n");

  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye, una empresa en León, Guanajuato, México. Tu objetivo principal es identificar cuál de nuestros servicios le interesa al cliente, resolver sus dudas y calificar el caso para que el equipo humano pueda continuar.

Ofrecemos soluciones integrales para la vivienda, todo en un solo lugar. Contamos con los siguientes servicios principales:
1️⃣ **Remodelación y Ampliación**: Ampliación de recámaras, cocheras, baños y cocinas bajo diseño estructural (servicio de construcción).
2️⃣ **Impermeabilización Profesional**: Goteras, filtraciones y humedad con garantía de hasta 10 años (servicio de construcción).
3️⃣ **Concreto Premezclado**: Suministro de concreto certificado para losas, firmes y obras en León (servicio de construcción).
4️⃣ **Fontanería Profesional**: Instalaciones hidráulicas, aljibes, cisternas y localización de fugas (servicio de construcción).
5️⃣ **Instalaciones Eléctricas**: Cableado, iluminación LED y reparación de cortocircuitos (servicio de construcción).
6️⃣ **Acabados y Pintura**: Pasta pulida, texturas, yeso, tablaroca y aplicación de pintura premium (servicio de construcción).
7️⃣ **Mantenimiento Técnico**: Cerrajería, herrería y reparaciones menores preventivas/correctivas (servicio de construcción).
8️⃣ **Promoción de Viviendas**: Promovemos tu propiedad para venderla en el mercado por una comisión.
9️⃣ **Armado de Expediente**: Gestión de trámites y armado de expediente ante INFONAVIT si ya tienes comprador/vendedor interesado.
🔟 **Compra Directa de Casas**: Compramos tu casa de contado rápidamente, liquidamos tu adeudo (de INFONAVIT, banco, etc.) o compramos casas abandonadas (muy al final).

REGLA DE SERVICIOS (Si el cliente inicia la conversación, pregunta "¿Qué servicios ofrecen?", "¿Cómo trabajan?", solicita información general o similar):
- Da la bienvenida usando exactamente o de forma muy similar esta frase: "Te damos la bienvenida a SAUCEDA. Soluciones integrales para la vivienda, todo en un solo lugar."
- Presenta el menú numerado completo de servicios (opciones 1️⃣ a 🔟) de forma clara, amigable y concisa.
- Pídele al cliente que responda con el número (1 al 10) o el nombre del servicio que le interesa.

Flujos de Calificación según el interés del cliente (asocia la selección del número de servicio al tipo de negocio correspondiente en el JSON):

A) Si está interesado en la COMPRA DIRECTA (Servicio 10 - tipo_negocio: 'traspaso_compra'):
Recopila de forma progresiva (una pregunta a la vez):
1. Ubicación de la vivienda (fraccionamiento o zona en León, Gto).
2. Valor estimado o aproximado de la vivienda.
3. Cuánto adeudan actualmente y con qué institución (INFONAVIT, ISSSTE o banco).
4. Estado físico actual de la vivienda (buen estado, deshabitada, descuidada o vandalizada).
5. Preguntar si pueden enviar fotos de la vivienda o estado de cuenta por este chat.

B) Si está interesado en la PROMOCIÓN DE VIVIENDAS (Servicio 8 - tipo_negocio: 'promocion_venta'):
Pregunta de forma amigable:
1. Ubicación de la casa en León, Gto.
2. Cuál es el precio aproximado en el que desean venderla.
3. Menciona que cobramos una comisión por la venta y que un asesor le contactará para dar detalles exactos.

C) Si está interesado en el ARMADO DE EXPEDIENTE (Servicio 9 - tipo_negocio: 'solo_tramite'):
Pregunta de forma amigable:
1. Si ya tienen un comprador o vendedor interesado.
2. Si la operación se realizará con crédito INFONAVIT.
3. Menciona que nosotros nos encargamos del trámite y que un asesor le contactará para cotizar el servicio.

D) Si está interesado en la IMPERMEABILIZACIÓN (Servicio 2 - tipo_negocio: 'construccion-impermeabilizacion'):
Debes guiar al prospecto de forma estricta a través del siguiente flujo conversacional lineal de 3 pasos (Sofía - Impermeabilización SAUCEDA Construcción Versión 4.0). Utiliza un tono cálido, natural, accesible y sin presión. PROHIBIDO enviar enlaces, archivos, links o páginas web de cotización o cita en tu respuesta:

- PASO 1: SALUDO E INFORMACIÓN DEL SERVICIO (Al detectar el negocio o si no tenemos los metros)
  Si el cliente muestra interés inicial (menciona impermeabilización, goteras, filtraciones, azotea, concreto, construcción, reparación, etc.) o si ya se detectó este tipo de negocio y NO tenemos los metros cuadrados (@metros) en el historial o en los datos del cliente, envía exactamente este mensaje:
  "¡Hola! 👋 Gracias por contactar a SAUCEDA Construcción. Somos especialistas en impermeabilización profesional en León y alrededores.

  🟡 NUESTRO SERVICIO:
  Aplicamos Impermeabilizante Profesional Estándar de 3.5 mm con acabado de gravilla protectora (roja o gris a tu elección).
  ⏱️ INSTALACIÓN EN 1 DÍA: Realizamos todo el trabajo de instalación en tan solo 1 día.
  🛠️ ¿QUÉ INCLUYE?: Diagnóstico técnico, limpieza profunda de la superficie, resane y sellado de grietas, y la aplicación profesional.
  🏆 ¿POR QUÉ ELEGIRNOS?: Te entregamos una garantía de 5 años por escrito, utilizamos materiales de primera y contamos con mano de obra altamente capacitada para proteger tu azotea de goteras y filtraciones.

  Para darte una cotización personalizada de inmediato, ¿me podrías compartir cuántos metros cuadrados aproximadamente tiene tu azotea/área a impermeabilizar?"

- PASO 2: PRESENTACIÓN DEL PRESUPUESTO Y PAGO (Al tener los metros cuadrados)
  Se activa en cuanto el cliente proporciona los metros cuadrados aproximados (@metros) (o si ya los conocemos por los "Datos del cliente").
  Calcula matemáticamente los valores del presupuesto:
    - TOTAL_SIN_IVA = @metros * 210
  Construye tu respuesta incluyendo exactamente la siguiente estructura de cotización (solo para el producto Estándar, sin mencionar paquetes Premium ni enviar links):

  "Perfecto. Para [METROS] m², aquí están los detalles de nuestro servicio:

  🟡 IMPERMEABILIZACIÓN ESTÁNDAR
  • Impermeabilizante 3.5 mm + gravilla (roja o gris a tu elección)
  • ✓ Garantía de 5 años por escrito
  • Incluye: Limpieza profunda + resane de grietas + aplicación profesional
  • Tiempo de ejecución: 1 día

  💰 PRESUPUESTO: $210/m² × [METROS] m² = $[TOTAL_SIN_IVA] MXN (Precios más IVA)

  💳 Ofrecemos opción de pago con tarjeta de crédito.[REGLA_PROMO: Si el TOTAL_SIN_IVA es mayor a 10000, agrega exactamente este texto: " ¡Y contamos con 3 meses sin intereses!"]

  ¿Confirmamos inspección técnica gratuita esta semana?"

- PASO 3: CONFIRMACIÓN DE INSPECCIÓN (Al aceptar la visita)
  Se activa cuando el cliente responde afirmativamente a la inspección (ejemplo: "sí", "de acuerdo", "sí, agendemos", etc.). Coloca en tu campo JSON "respuesta" exactamente:
  "¡Excelente! Un asesor te contactará vía telefónica o por WhatsApp para agendar la cita de inspección técnica si es necesario. ¡Que tengas un excelente día! 👍"

E) Si está interesado en CONCRETO, FONTANERÍA, ELECTRICIDAD, ACABADOS/PINTURA o MANTENIMIENTO TÉCNICO (Servicios 3, 4, 5, 6, 7 - tipo_negocio: 'construccion'):
  Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿Qué tipo de trabajo específico (concreto premezclado, fontanería, instalación eléctrica, acabados/pintura, o mantenimiento técnico) deseas realizar en tu hogar?
  2. ¿En qué colonia de León estás ubicado?
  3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
  4. Menciona de forma amigable que un asesor del equipo humano le contactará a la brevedad por este chat para coordinar y agendar de forma manual una visita técnica gratuita y sin compromiso en su domicilio para revisar los detalles y darle un presupuesto preciso.

F) Si está interesado en REMODELACIÓN O AMPLIACIÓN (Servicio 1 - tipo_negocio: 'construccion-remodelacion'):
  Debes enfocar la conversación específicamente en su proyecto de remodelación o ampliación. Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿Qué espacio o área deseas remodelar o ampliar (por ejemplo, recámaras, cochera, cocina, baño, segunda planta, etc.)?
  2. ¿En qué colonia de León estás ubicado?
  3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
  4. Menciona que un asesor de nuestro equipo se pondrá en contacto con él a la brevedad por este chat para agendar de forma manual una visita técnica en su domicilio para que nuestro arquitecto/técnico tome medidas y le podamos dar un presupuesto formal sin compromiso.

REGLA DE CALCULADORA DE IMPERMEABILIZACIÓN:
  Si el cliente tiene dudas sobre las dimensiones de su azotea, no conoce sus metros cuadrados, o prefiere estimar el costo él mismo ingresando el largo y ancho de su propiedad, compártele amablemente el enlace a nuestra calculadora interactiva: https://saucedamx.com/calculadora

REGLA DE AGENDAMIENTO PARA CONSTRUCCIÓN (CRÍTICA):
  Para cualquier servicio de la vertical SAUCEDA Construye (remodelación, impermeabilización, pintura, albañilería, losa/concreto, etc.), todo agendamiento de visitas o citas es MANUAL. El objetivo absoluto de Sofía es calificar al cliente y recopilar los datos básicos (servicio de interés, metros o área, colonia, nombre y teléfono) para que el equipo humano proceda a coordinar y agendar la cita.

REGLA DE EVITAR PREGUNTA DE GOTERAS (CRÍTICA):
  NUNCA le preguntes al cliente si el servicio es para impermeabilizar toda la azotea o solo para reparar algunas goteras, ni hagas preguntas similares. Siempre asume y cotiza el servicio completo de impermeabilización en base a los metros cuadrados totales indicados por el cliente.

REGLA CRÍTICA DE CONTEXTO:
  Si la información ya está presente en los "Datos del cliente" abajo (como la ubicación/fraccionamiento, dirección exacta de la propiedad, tipo de crédito, valor de la casa, monto de la deuda o detalles de impermeabilización/remodelación) porque el cliente ya la proporcionó previamente, NO debes volver a preguntársela en absoluto. En su lugar, reconócela/valídala amablemente en tu saludo y continúa directamente con la información que falte.

REGLA DE CRÉDITOS NO ADMITIDOS (AGIOTISTAS / PRESTAMISTAS PARTICULARES):
Si el cliente menciona que su propiedad tiene una hipoteca, adeudo o embargo con un AGIOTISTA, PRESTAMISTA INFORMAL o persona física particular (en lugar de instituciones oficiales como INFONAVIT, FOVISSSTE o bancos), debes informarle de inmediato y con amabilidad que por políticas de la empresa SAUCEDA Bienes Raíces únicamente compra o traspasa propiedades con deudas de instituciones formales y que NO podemos atender deudas con prestamistas particulares. Despídete amablemente de ellos sin solicitar más datos.

REGLA GEOGRÁFICA (CRÍTICA):
- Únicamente operamos en la ciudad de León, Guanajuato.
- **NUNCA** infieras ni evalúes la ubicación geográfica del cliente basándote en la lada o código de área de su número de teléfono celular (muchas personas que viven en León tienen celulares con ladas de otros lugares). Solo aplica la descalificación por fuera de zona si el cliente te confirma de forma explícita en el texto del chat que su propiedad o él se encuentran fuera de León y que no tiene ninguna propiedad en León.
- Si el cliente menciona que se encuentra en otra ciudad (por ejemplo, Querétaro, Lagos de Moreno, Silao, etc.) o que su propiedad está fuera de León, Gto:
  - ANTES de despedirte, debes preguntarle exactamente o de forma muy similar: "Por ahora operamos solo en León, Gto. ¿Tienes alguna propiedad en León donde podamos ayudarte?"
  - Si responde que SÍ tiene propiedad en León, continúas con el flujo normal.
  - Si responde que NO (o insiste en que no tiene ninguna propiedad en León), despídete de forma muy amable. En tu JSON de respuesta, en "datosExtraidos", debes incluir la propiedad "fuera_de_zona": true.

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
    "tipo_negocio": "El tipo de negocio/servicio elegido. Solo puede ser 'traspaso_compra', 'promocion_venta', 'solo_tramite', 'construccion', 'construccion-impermeabilizacion' o 'construccion-remodelacion' si el cliente lo eligió o se detectó en la conversación, de lo contrario null",
    "necesidad": "Una descripción detallada de la necesidad o del servicio que el cliente está solicitando (por ejemplo, 'Impermeabilización de azotea de 40m², gotea ahora' o 'Venta de casa por cambio de ciudad'), de lo contrario null",
    "colonia": "La colonia de León proporcionada por el cliente si la mencionó, de lo contrario null",
    "metros": "El número entero de metros cuadrados aproximados a impermeabilizar proporcionados por el cliente si el tipo de negocio es impermeabilización, de lo contrario null",
    "paquete_elegido": "El paquete de impermeabilización. Asigna siempre 'estandar' si se trata de impermeabilización, de lo contrario null",
    "cliente_nombre": "El nombre proporcionado por el cliente, de lo contrario null",
    "fuera_de_zona": "Boolean (true) si el cliente confirmó que NO tiene propiedades en León y está fuera de nuestra cobertura geográfica, de lo contrario null",
    "paso_flujo": "El paso del flujo de impermeabilización que estás ejecutando con tu respuesta actual. Debe ser exactamente 'paso_1' (al saludar y presentar información del servicio estándar para pedir metros), 'paso_2' (al presentar el presupuesto y condiciones de pago) o 'paso_3' (al confirmar que un asesor le contactará). Si el tipo de negocio no es impermeabilización, pon null",
    "fecha_inspeccion_confirmada": "La fecha en formato YYYY-MM-DD del slot seleccionado si el cliente eligió una de las 3 opciones (ej. '${finalSlots[0]?.raw.fecha}'), de lo contrario null",
    "hora_inspeccion_confirmada": "La hora de inicio en formato HH:MM:SS del slot seleccionado si el cliente eligió una de las 3 opciones (ej. '${finalSlots[0]?.raw.hora}'), de lo contrario null"
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
      exp.campaign_name && `Campaña Meta de origen: ${exp.campaign_name}`,
      exp.adset_name && `Grupo de anuncios de origen: ${exp.adset_name}`,
      exp.ad_name && `Anuncio de origen: ${exp.ad_name}`,
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
      exp.ultimo_paso_flujo && `Último paso de flujo de impermeabilización ejecutado: ${exp.ultimo_paso_flujo}`,
      exp.ultimo_paso_alcanzado && `Paso del funnel más avanzado alcanzado: ${exp.ultimo_paso_alcanzado}`,
    ].filter(Boolean);
    if (partes.length) contexto = `\n\nDatos del cliente:\n${partes.join("\n")}`;
  }

  const instruccionesFlujo = (exp && exp.tipo_negocio === "construccion-impermeabilizacion" && exp.ultimo_paso_flujo)
    ? `\n\nESTADO DE CONVERSIÓN CRÍTICO:\nEl último paso del flujo de impermeabilización que ya ejecutaste con este cliente es "${exp.ultimo_paso_flujo}". Está ESTRICTAMENTE PROHIBIDO repetir preguntas, enviar mensajes o solicitar información de este paso o de pasos anteriores. Debes avanzar de inmediato al siguiente paso del flujo (por ejemplo, si el último paso ejecutado fue paso_3 y el cliente ya dio su nombre y teléfono, debes continuar ejecutando el paso_4 y enviarle sus links de agendamiento y cotización).`
    : "";

  const finalPrompt = [base, extra && `\nIndicaciones adicionales del negocio:\n${extra}`, instruccionesFlujo, contexto]
    .filter(Boolean)
    .join("\n");

  return finalPrompt
    .replace(/\[OPCION_1\]/g, finalSlots[0]?.texto || "")
    .replace(/\[OPCION_2\]/g, finalSlots[1]?.texto || "")
    .replace(/\[OPCION_3\]/g, finalSlots[2]?.texto || "");
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

/** Llama a la API de Claude u Ollama y devuelve el texto de la respuesta. */
async function generarRespuesta(
  system: string,
  mensajes: { role: "user" | "assistant"; content: string }[],
  sb?: SupabaseClient | null,
): Promise<string> {
  if (mensajes.length === 0) return "";

  let systemFinal = system;
  if (system.includes("JSON")) {
    systemFinal = `${system}\n\nREGLA CRÍTICA DE RESPUESTA: Tu salida debe ser ESTRICTAMENTE un objeto JSON válido con la estructura solicitada. No agregues introducciones, comentarios ni bloques markdown fuera del JSON. Si estás confirmando una cita (Paso 5), debes incluir en "datosExtraidos" los campos "fecha_inspeccion_confirmada" (YYYY-MM-DD) y "hora_inspeccion_confirmada" (HH:MM). NUNCA escribas o inventes URLs estáticas genéricas de cotización o cita (como saucedamx.com/cotizacion o saucedamx.com/cita-confirmada) ni copies URLs previas del historial. Deja que el sistema use los marcadores [LINK_COTIZACION] y [LINK_CITA_CONFIRMADA] tal cual.`;
  }

  let proveedorOriginal = process.env.IA_PROVEEDOR || "anthropic";

  if (sb) {
    try {
      const { data } = await sb
        .from("configuracion_agente")
        .select("valor")
        .eq("clave", "ia_proveedor")
        .maybeSingle();
      if (data?.valor && ["anthropic", "kimi", "ollama"].includes(data.valor.trim())) {
        proveedorOriginal = data.valor.trim();
      }
    } catch (err) {
      console.error("Error al obtener ia_proveedor de la base de datos:", err);
    }
  }

  // Definir la cadena de proveedores a intentar en caso de fallo
  const proveedoresAProbar = [proveedorOriginal];
  if (proveedorOriginal === "kimi") {
    proveedoresAProbar.push("anthropic"); // Fallback a Claude
  } else if (proveedorOriginal === "ollama") {
    proveedoresAProbar.push("anthropic"); // Fallback a Claude
  } else {
    proveedoresAProbar.push("kimi"); // Fallback a Kimi
  }

  for (const proveedor of proveedoresAProbar) {
    console.log(`[IA Router] Intentando generar respuesta con proveedor: ${proveedor}`);
    try {
      if (proveedor === "ollama") {
        let url = process.env.OLLAMA_URL || "http://192.168.100.253:11434/v1/chat/completions";
        // Convertir a endpoint nativo de chat para poder configurar num_ctx y evitar truncado de prompt
        if (url.endsWith("/v1/chat/completions")) {
          url = url.replace("/v1/chat/completions", "/api/chat");
        } else if (!url.endsWith("/api/chat")) {
          url = url.endsWith("/") ? `${url}api/chat` : `${url}/api/chat`;
        }

        const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
        const messagesOllama = [
          { role: "system", content: systemFinal },
          ...mensajes.map(m => ({ role: m.role, content: m.content }))
        ];

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: messagesOllama,
            options: {
              num_ctx: 16384,
              temperature: 0.1,
            },
            stream: false,
          }),
        });

        if (!res.ok) {
          throw new Error(`Ollama respondió status ${res.status}`);
        }

        const json = await res.json();
        const texto = (json.message?.content || "").trim();
        if (texto) return texto;
      }

      if (proveedor === "kimi") {
        const apiKey = process.env.KIMI_API_KEY;
        if (!apiKey) throw new Error("Falta KIMI_API_KEY");
        const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
        const model = process.env.KIMI_MODEL || "kimi-k3";

        const messagesOpenAI = [
          { role: "system", content: systemFinal },
          ...mensajes.map(m => ({ role: m.role, content: m.content }))
        ];

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: messagesOpenAI,
            temperature: 1,
          }),
        });

        if (!res.ok) {
          throw new Error(`Kimi respondió status ${res.status}`);
        }

        const json = await res.json();
        const texto = (json.choices?.[0]?.message?.content || "").trim();
        if (texto) return texto;
      }

      if (proveedor === "anthropic") {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");

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
            system: systemFinal,
            messages: mensajes,
          }),
        });

        if (!res.ok) {
          throw new Error(`Anthropic respondió status ${res.status}`);
        }

        const json = await res.json();
        const texto = (json.content ?? [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text ?? "")
          .join("")
          .trim();
        if (texto) return texto;
      }
    } catch (err: any) {
      console.warn(`[IA Router Failover] Proveedor ${proveedor} falló: ${err.message}. Intentando siguiente fallback...`);
    }
  }

  console.error("[IA Router Failover] Todos los proveedores configurados fallaron.");
  return "";
}

/**
 * Genera y envía una respuesta automática de la IA para una conversación.
 * Best-effort: nunca lanza.
 */
export async function responderConIA(
  sb: SupabaseClient,
  ctx: { telefono: string; expedienteId?: string | null; host?: string },
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
          "cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, link_google_maps, necesidad, valor_estimado, saldo_deuda, telefono, canal_id, prospecto_id, sin_pagos, estado_fisico, habitada, asesor_id, ultimo_paso_flujo, ultimo_paso_alcanzado, campaign_name, adset_name, ad_name"
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
      sb,
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
      fuera_de_zona?: boolean | null;
      paso_flujo?: string | null;
      cliente_nombre?: string | null;
      telefono_real?: string | null;
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

    // --- CORRECCIÓN DE ALUCINACIONES DE URL DEL LLM ---
    // Si el LLM escribe la URL base sin el token, la reemplazamos con el marcador correspondiente
    // para que la lógica de abajo inserte la cotización/cita y genere la URL correcta.
    textoRespuesta = textoRespuesta
      .replace(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\/(?:cotizacion|c)\b(?!\/[a-zA-Z0-9-])\/?/gi, "[LINK_COTIZACION]")
      .replace(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\/(?:cita-confirmada|a)\b(?!\/[a-zA-Z0-9-])\/?/gi, "[LINK_CITA_CONFIRMADA]");

    // --- PROCESAMIENTO DE DATOS EXTRAÍDOS ---
    const updates: Record<string, any> = {};
    if (ctx.expedienteId) {
      // 1. Regla Geográfica Suave: Marcar como fuera_de_zona si el cliente no opera en León
      if (datosExtraidos.fuera_de_zona === true) {
        updates.etapa = "fuera_de_zona";
        console.log(`[Regla Geográfica] Expediente ${ctx.expedienteId} marcado fuera_de_zona.`);
      }

      // 2. Tracking de Embudo y Control de Flujo (Impermeabilización)
      const esImperFlujo = exp?.tipo_negocio === "construccion-impermeabilizacion";
      if (esImperFlujo && datosExtraidos.paso_flujo) {
        const pasoDetectado = datosExtraidos.paso_flujo;
        updates.ultimo_paso_flujo = pasoDetectado;

        // Mapear paso_flujo a ultimo_paso_alcanzado (embudo)
        let pasoAlcanzado = exp?.ultimo_paso_alcanzado || "lead_entro";
        
        if (pasoDetectado === "paso_1") {
          pasoAlcanzado = "respondio_paso1";
        } else if (pasoDetectado === "paso_2") {
          pasoAlcanzado = "vio_precios";
        } else if (pasoDetectado === "paso_3") {
          pasoAlcanzado = "agendo_inspeccion";
        } else if (pasoDetectado === "paso_4") {
          pasoAlcanzado = "recibio_link";
        } else if (pasoDetectado === "paso_5") {
          pasoAlcanzado = "agendo_inspeccion";
        }

        updates.ultimo_paso_alcanzado = pasoAlcanzado;
        console.log(`[Funnel Tracking] paso_flujo: ${pasoDetectado} -> ultimo_paso_alcanzado: ${pasoAlcanzado}`);
      }

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
      if (esImper && (datosExtraidos as any).metros) {
        const m = (datosExtraidos as any).metros;
        const col = (datosExtraidos as any).colonia || datosExtraidos.fraccionamiento || exp?.fraccionamiento || "";
        updates.necesidad = `Impermeabilización de ${m} m² - Paquete Estándar ($210/m²)${col ? ` en col. ${col}` : ""}`;
      }

      // --- CREACIÓN DE COTIZACIÓN AUTOMÁTICA (Supabase) Y REEMPLAZO DE LINKS ---
      if (esImper && exp) {
        let tokenCot = "";
        let idCot = "";

        const m = (datosExtraidos as any).metros;
        const nombreCliente = (datosExtraidos as any).cliente_nombre || exp.cliente;
        const telefonoCliente = (datosExtraidos as any).cliente_telefono || exp.telefono;

        if (m && nombreCliente && telefonoCliente) {
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
              const precioM2 = 210;
              const precioTotal = Number(m) * precioM2;

              // Consultar costo unitario en el catálogo
              let costoM2 = 165; // fallback razonable
              try {
                const { data: prodCatalog } = await sb
                  .from("productos_servicios")
                  .select("costo_unitario")
                  .ilike("nombre", "%Estándar%")
                  .eq("categoria", "impermeabilizacion")
                  .maybeSingle();
                
                if (prodCatalog?.costo_unitario) {
                  costoM2 = Number(prodCatalog.costo_unitario);
                }
              } catch (errDb) {
                console.error("IA: Error al buscar costo en catálogo:", errDb);
              }

              const costoTotal = Number(m) * costoM2;

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
                  costo_estimado: costoTotal,
                  notas_internas: "Creada automáticamente por el chatbot Sofía."
                })
                .select("token")
                .single();

              if (errInsertCot) {
                console.error("IA: Error al crear cotización en BD:", errInsertCot);
              } else if (nuevaCot) {
                tokenCot = nuevaCot.token;

                // Insertar concepto
                const descConcepto = "Impermeabilización Profesional - Impermeabilizante 3.5 mm + gravilla (5 años de garantía)";

                const { error: errInsertConcepto } = await sb
                  .from("cotizacion_conceptos")
                  .insert({
                    cotizacion_id: idCot,
                    descripcion: descConcepto,
                    cantidad: Number(m),
                    unidad: "m2",
                    precio_unitario: precioM2,
                    costo_unitario: costoM2,
                    importe: precioTotal
                  });

                if (errInsertConcepto) {
                  console.error("IA: Error al crear conceptos de cotización:", errInsertConcepto);
                }

                await registrarActividad(sb, {
                  expedienteId: ctx.expedienteId,
                  tipo: "construccion",
                  titulo: `Cotización automática creada (${idCot})`,
                  detalle: `Impermeabilización Profesional 3.5 mm. Metros: ${m} m2. Total: $${precioTotal}. Estatus: esperando_visita.`,
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

            if (textoRespuesta.includes("[LINK_COTIZACION]") || textoRespuesta.includes("[LINK_AGENDADO]")) {
              let siteUrl = process.env.SITE_URL || "https://app.saucedamx.com";
              const host = ctx.host;
              if (host) {
                if (host.includes("sslip.io")) {
                  siteUrl = "https://crm-staging.saucedamx.com";
                } else if (!process.env.SITE_URL) {
                  const protocol = host.includes("localhost") || host.startsWith("192.168.") ? "http" : "https";
                  siteUrl = `${protocol}://${host}`;
                }
              }

              // Saneamiento de dominio: redirigir de la landing page estática (saucedamx.com) al CRM (app.saucedamx.com)
              if (siteUrl.includes("saucedamx.com") && 
                  !siteUrl.includes("app.saucedamx.com") && 
                  !siteUrl.includes("crm.saucedamx.com") && 
                  !siteUrl.includes("crm-staging.saucedamx.com")) {
                siteUrl = siteUrl.replace(/https?:\/\/(www\.)?saucedamx\.com/, "https://app.saucedamx.com");
              }

              const urlCot = tokenCot ? `${siteUrl}/c/${tokenCot}` : "";
              
              // Intentar obtener el operador asignado al expediente para usar la agenda interna de la app
              let operadorId = updates.asesor_id || exp?.asesor_id;
              if (!operadorId) {
                try {
                  const { data: perfAlex } = await sb
                    .from("perfiles")
                    .select("id")
                    .or("nombre.ilike.%Alex%,nombre.ilike.%Alejandro%")
                    .eq("activo", true)
                    .maybeSingle();
                  if (perfAlex) {
                    operadorId = perfAlex.id;
                  }
                } catch (err) {
                  console.error("IA: Error al buscar operario para agenda en fallback:", err);
                }
              }

              // Si tenemos un operadorId, usamos la agenda interna nativa del CRM. De lo contrario, un link general de inspección
              const urlAgenda = operadorId
                ? `${siteUrl}/agenda/${operadorId}?prospecto_id=${exp?.prospecto_id || ""}&tipo=inspeccion`
                : `${siteUrl}/agenda/inspeccion-general?prospecto_id=${exp?.prospecto_id || ""}`;

              // Forzado: Deshabilitado el envío automático de ligas de cotización o de cita por políticas manuales
              textoRespuesta = textoRespuesta
                .replace(/.*\[LINK_COTIZACION\].*\n?/g, "")
                .replace(/.*\[LINK_CITA_CONFIRMADA\].*\n?/g, "")
                .replace(/.*\[LINK_AGENDADO\].*\n?/g, "");

              // --- AUTO-AGENDAMIENTO DE INSPECCIÓN (DESHABILITADO) ---
              const fechaConfirmada = null;
              const horaConfirmada = null;

              if (fechaConfirmada && horaConfirmada) {
                console.log(`[Auto-Scheduling] Confirmando cita: ${fechaConfirmada} ${horaConfirmada}`);
                const [h, min] = horaConfirmada.split(":");
                const hrsFin = String((parseInt(h, 10) + 1) % 24).padStart(2, "0");
                const horaFin = `${hrsFin}:${min || "00"}:00`;

                const nombreCliente = [exp.cliente, exp.primer_apellido].filter(Boolean).join(" ") || "Cliente WhatsApp";

                const { data: nuevaCita, error: errCita } = await sb
                  .from("agenda_citas")
                  .insert({
                    perfil_id: operadorId || exp.asesor_id,
                    prospecto_id: exp.prospecto_id ?? null,
                    expediente_id: ctx.expedienteId,
                    fraccionamiento: exp.fraccionamiento ?? null,
                    cliente_nombre: nombreCliente,
                    cliente_telefono: exp.telefono || ctx.telefono,
                    tipo_cita: "inspeccion",
                    fecha: fechaConfirmada,
                    hora_inicio: horaConfirmada,
                    hora_fin: horaFin,
                    notas: "Agendado automáticamente por Sofía IA",
                    estado: "confirmada",
                  })
                  .select("id")
                  .maybeSingle();

                if (errCita) {
                  console.error("IA: Error al crear cita automática:", errCita);
                } else if (nuevaCita?.id) {
                  const linkCitaConfirmada = `${siteUrl}/a/${nuevaCita.id}`;
                  textoRespuesta = textoRespuesta
                    .replace(/\[LINK_CITA_CONFIRMADA\]/g, linkCitaConfirmada)
                    .replace(/\[LINK_AGENDADO\]/g, linkCitaConfirmada);

                  await registrarActividad(sb, {
                    expedienteId: ctx.expedienteId,
                    tipo: "sistema",
                    titulo: "📅 Inspección Programada por IA",
                    detalle: `Visita técnica agendada automáticamente para el ${fechaConfirmada} a las ${horaConfirmada}hs.`,
                  });

                  updates.etapa = "visita";
                  if (operadorId) {
                    updates.asesor_id = operadorId;
                  }
                }
              }
              // Asegurar que no se envíe el marcador crudo si no se agendó
              textoRespuesta = textoRespuesta.replace(/.*\[LINK_CITA_CONFIRMADA\].*\n?/g, "");
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

