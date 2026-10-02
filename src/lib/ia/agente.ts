import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import {
  enviarComparativaImper,
  enviarMediosPaqueteImper,
  esPaqueteImper,
  hayFotosEnCatalogo,
  enviarFichaTecnicaImper,
  enviarFotosMantenimiento,
  metrosClaros,
  ETIQUETA_PAQUETE,
} from "@/lib/ia/imper-envios";
import { cargarProductosImper, fichaProductosParaPrompt, paquetesConFicha } from "@/lib/ia/catalogo-imper";
import { cargarServiciosMantenimiento, fichaServicioParaPrompt, servicioDeTipoNegocio } from "@/lib/ia/catalogo-mantenimiento";
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

/** Último motivo por el que ningún proveedor de IA pudo generar respuesta. */
let ultimoErrorIA = "";

/** ¿Está activo el agente de IA? */
export function iaAgenteActivo(): boolean {
  if (process.env.IA_AGENTE === "off") return false;
  const esStaging = process.env.SITE_URL?.includes("sslip.io") || process.env.SITE_URL?.includes("192.168.100.253");
  if (esStaging) return true;
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
  const esStaging = process.env.SITE_URL?.includes("sslip.io") || process.env.SITE_URL?.includes("192.168.100.253");

  if (esStaging) {
    proveedor = "ollama";
  } else {
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
      /credit balance/i.test(cuerpo)
        ? " (SIN CRÉDITO: recarga en console.anthropic.com → Plans & Billing)"
        : res.status === 401
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
  // Productos de impermeabilización del catálogo: ficha técnica / facts para responder dudas y
  // fotos para enviar. Sofía sólo anuncia imágenes si hay fotos cargadas y habilitadas.
  const productosImper = await cargarProductosImper(sb).catch(() => ({}) as Awaited<ReturnType<typeof cargarProductosImper>>);
  const hayFotosImper = hayFotosEnCatalogo(productosImper);
  const fichaImper = fichaProductosParaPrompt(productosImper);
  const hayFotosEstandar = Boolean(productosImper.estandar?.aptoParaIa && productosImper.estandar.fotos.length > 0);
  const serviciosMant = await cargarServiciosMantenimiento(sb).catch(() => ({}) as Awaited<ReturnType<typeof cargarServiciosMantenimiento>>);
  const fichaTinacos = fichaServicioParaPrompt(serviciosMant.tinacos);
  const fichaCisternas = fichaServicioParaPrompt(serviciosMant.cisternas);
  const fotosCisternas = Boolean(serviciosMant.cisternas?.aptoParaIa && serviciosMant.cisternas.fotos.length > 0);
  const fotosTinacos = Boolean(serviciosMant.tinacos?.aptoParaIa && serviciosMant.tinacos.fotos.length > 0);
  const fichasPdf = paquetesConFicha(productosImper).map((p) => ETIQUETA_PAQUETE[p]);

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
7️⃣ **Mantenimiento Técnico**: Cerrajería, plomería menor y reparaciones preventivas/correctivas (servicio de construcción).
8️⃣ **Promoción de Viviendas**: Promovemos tu propiedad para venderla en el mercado por una comisión.
9️⃣ **Armado de Expediente**: Gestión de trámites y armado de expediente ante INFONAVIT si ya tienes comprador/vendedor interesado.
🔟 **Compra Directa de Casas**: Compramos tu casa de contado rápidamente, liquidamos tu adeudo (de INFONAVIT, banco, etc.) o compramos casas abandonadas (muy al final).
1️⃣1️⃣ **Herrería Residencial e Industrial**: Portones automáticos o manuales, protecciones para ventanas, barandales, techumbres y estructuras metálicas a medida (servicio de construcción).
1️⃣2️⃣ **Mantenimiento y Lavado de Cisternas, Aljibes y Tinacos**: Lavado profundo, desinfección con grado bactericida, sellado de grietas/fugas de agua y mantenimiento de bombas y flotadores (servicio de construcción).

REGLA DE SERVICIOS (Si el cliente inicia la conversación con un saludo genérico ("hola", "buenas tardes", "informes"), pregunta qué servicios ofrecemos, o si el tipo de negocio es 'otro' / no determinado):
- Saluda de forma cálida usando exactamente o de forma muy similar esta frase: "¡Hola! Te damos la bienvenida a SAUCEDA. Soluciones integrales para la vivienda, todo en un solo lugar. ¿En qué te podemos ayudar el día de hoy?"
- Presenta brevemente cómo podemos ayudarle (Servicios de Construcción e Impermeabilización, Remodelación, Compra Directa de Casas, Promoción o Trámites) y pídele amablemente al cliente que te indique en qué servicio o proyecto está interesado.
- PROHIBIDO asumir de antemano que busca comprar/traspasar una casa ni enviar cuestionarios de adeudos o Infonavit si el cliente no lo especificó explícitamente.

Flujos de Calificación según el interés del cliente (asocia la selección del número de servicio al tipo de negocio correspondiente en el JSON):

A) Si está interesado en la COMPRA DIRECTA (Servicio 10 - tipo_negocio: 'traspaso_compra'):
Recopila de forma progresiva (una pregunta a la vez):
1. Ubicación de la vivienda (fraccionamiento, colonia o ciudad).
2. Valor estimado o aproximado de la vivienda.
3. Cuánto adeudan actualmente y con qué institución (INFONAVIT, ISSSTE o banco).
4. Estado físico actual de la vivienda (buen estado, deshabitada, descuidada o vandalizada).
5. Preguntar si pueden enviar fotos de la vivienda o estado de cuenta por este chat.

B) Si está interesado en la PROMOCIÓN DE VIVIENDAS (Servicio 8 - tipo_negocio: 'promocion_venta'):
Pregunta de forma amigable:
1. Ubicación de la casa (fraccionamiento, colonia o ciudad).
2. Cuál es el precio aproximado en el que desean venderla.
3. Menciona que cobramos una comisión por la venta y que un asesor le contactará para dar detalles exactos.

C) Si está interesado en el ARMADO DE EXPEDIENTE O ASESORÍA DE TRÁMITES (Servicio 9 - tipo_negocio: 'solo_tramite'):
- Si el cliente busca saber si es apto para un crédito INFONAVIT, consultar sus puntos, precalificación o evaluar viabilidad:
  * Confírmale cálidamente que con mucho gusto podemos ayudarle a revisar si es apto/viable para su crédito INFONAVIT.
  * Resalta explícitamente que la asesoría inicial para saber si es apto es 100% SIN COSTO.
  * Indícale que un asesor especializado le contactará en breve para revisar su situación, resolver sus dudas y orientarle paso a paso.
- Si busca el trámite de una compraventa o traspaso ya acordado entre particulares:
  1. Pregunta si ya tienen un comprador o vendedor interesado.
  2. Pregunta si la operación se realizará con crédito INFONAVIT.
  3. Menciona que nosotros nos encargamos del armado del expediente y trámite integral, y que un asesor le contactará para cotizar el servicio.

D) Si está interesado en la IMPERMEABILIZACIÓN (Servicio 2 - tipo_negocio: 'construccion-impermeabilizacion'):
Debes guiar al prospecto de forma estricta a través del siguiente flujo conversacional lineal de 3 pasos (Sofía - Impermeabilización SAUCEDA Construcción Versión 4.0). Utiliza un tono cálido, natural, accesible y sin presión. PROHIBIDO enviar enlaces de cotización o de cita, o cualquier otra URL. ÚNICA EXCEPCIÓN: la página oficial https://saucedamx.com/impermeabilizacion.html, que se recomienda en el PASO 1:

- PASO 1: SALUDO E INFORMACIÓN DEL SERVICIO (Al detectar el negocio o si no tenemos los metros)
  Si el cliente muestra interés inicial (menciona impermeabilización, goteras, filtraciones, azotea, concreto, construcción, reparación, etc.) o si ya se detectó este tipo de negocio y NO tenemos los metros cuadrados (@metros) en el historial o en los datos del cliente, envía este mensaje (breve, sin mencionar días ni tiempos de instalación):
  "¡Hola! 👋 Gracias por escribir a SAUCEDA Construye. Somos especialistas en impermeabilización de azoteas en León y alrededores.

  Trabajamos con 3 opciones, todas con garantía por escrito, limpieza de la superficie y sellado de grietas incluidos:
  🔹 *Acrílico*: garantía de 2 años. Ideal para mantenimiento o azoteas de poco tráfico.
  🔸 *Estándar 3.5 con gravilla*: garantía de 5 años. La más solicitada.
  ⭐ *Premium 4.0 poliéster con gravilla*: garantía de 10 años. La de mayor duración.

  Puedes ver más información y ejemplos en nuestro sitio: https://saucedamx.com/impermeabilizacion.html${hayFotosEstandar ? "\n\n  Te comparto también unas fotos de nuestra impermeabilización estándar 👇" : ""}

  Para orientarte mejor, ¿cuántos metros cuadrados aproximados tiene tu azotea?"
  Incluye SIEMPRE la línea del sitio web tal cual (URL completa, sin acortarla ni modificarla) y ninguna otra URL.${hayFotosEstandar ? '\n  El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, las fotos de la impermeabilización estándar; por eso se anuncian en el texto.' : ''}
  Asigna "paso_flujo": "paso_1".

- PASO 2: METROS CLAROS → COMPARATIVA DE OPCIONES (Al tener los metros cuadrados)
  Se activa en cuanto el cliente indica de forma CLARA los metros cuadrados de su azotea (un número, aunque sea aproximado: "80", "unos 80 m2", "como 60 metros"), o si ya los conocemos por los "Datos del cliente".
  - Si los metros son claros: en "datosExtraidos" pon "metros" (número entero) y "metros_claros": true. El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, una imagen comparativa con la inversión de las 3 opciones para esos metros. Por eso NO escribas montos, precios ni totales en tu texto: solo anúnciala. Responde con este mensaje:
  "Perfecto, para tu azotea de [METROS] m² te comparto a continuación la comparativa de nuestras 3 opciones con su inversión (precios más IVA) 👇

  El pago puede ser en efectivo o transferencia. ¿Cuál de las 3 te interesa más? Si quieres, coordinamos una inspección técnica gratuita para confirmar medidas y afinar el detalle."
  - Si el cliente NO da metros claros (dice "no sé", "es grande", "una casa normal", etc.): NO pongas "metros_claros" (déjalo false/null) y NO anuncies ninguna imagen. Pídele un aproximado o, si no puede medirlo, ofrécele la inspección técnica gratuita para medir (ver caso especial de medidas).
  Asigna "paso_flujo": "paso_2".

- PASO 2B: EL CLIENTE ELIGE UN PAQUETE
  Cuando el cliente indique cuál opción le interesa ("el premium", "el de 10 años", "el más barato", "el acrílico", "el estándar", "el de 5 años"), asigna en "datosExtraidos": "paquete_elegido": "acrilico" | "estandar" | "premium" (solo si lo dijo claramente; si duda entre varias, NO lo asignes y ayúdale a decidir según garantía y uso). Confirma su elección con calidez en 2-3 líneas y avanza a la inspección.${hayFotosImper ? "\n  El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, algunas imágenes de referencia del paquete elegido; menciónalo (\"te comparto unas imágenes de referencia 👇\")." : "\n  No menciones imágenes ni fotos (por ahora no hay material para enviar)."}
  Ejemplo: "¡Excelente elección! El [PAQUETE] te da [GARANTÍA] de garantía por escrito.${hayFotosImper ? " Te comparto unas imágenes de referencia 👇" : ""} ¿Coordinamos la inspección técnica gratuita esta semana para confirmar medidas y dejar todo listo?"
  Mantén "paso_flujo": "paso_2". Si el cliente pregunta por precio otra vez, remítelo a la imagen comparativa ya enviada (no repitas cifras en texto) y recuerda que el monto final se confirma en la inspección.
  PROHIBIDO en toda la conversación de impermeabilización: mencionar días o tiempos de instalación/ejecución y ofrecer meses sin intereses. Para formas de pago aplica la REGLA DE FORMAS DE PAGO (abajo). Si pregunta cuánto tarda, responde que el técnico lo define en la inspección según los metros y el estado de la azotea.

- PREGUNTAS FRECUENTES DE IMPERMEABILIZACIÓN (responde con esta información oficial, adaptándola a un tono cercano y breve, y retoma el paso del flujo en el que vas):
  • ¿Se puede impermeabilizar aunque esté lloviendo / en temporada de lluvias?
    Sí, en la mayoría de los casos no hay problema; ahora mismo tenemos varias instalaciones activas. Solo en casos muy puntuales (por ejemplo, encharcamientos en la azotea) sugerimos esperar.

- DUDAS TÉCNICAS SOBRE LOS PRODUCTOS:
${fichaImper
  ? `  Si el cliente pregunta por materiales, durabilidad, diferencias entre opciones, cómo se aplica, garantía u otros detalles técnicos, responde SOLO con la siguiente información oficial del catálogo (puedes resumirla y adaptarla a un tono cercano). Si el dato no está aquí, NO lo inventes: dile que un asesor lo confirma en la inspección técnica gratuita.
${fichaImper}`
  : "  Si el cliente pregunta detalles técnicos que no aparecen en este flujo, NO los inventes: dile que un asesor los confirma en la inspección técnica gratuita."}

- FICHA TÉCNICA EN PDF:
  Solo si el cliente la pide EXPRESAMENTE en su mensaje actual ("ficha técnica", "me mandas el PDF", "quiero ver las especificaciones en documento"), asigna en "datosExtraidos": "ficha_tecnica_de": "acrilico" | "estandar" | "premium" según el producto que eligió o del que está hablando. Si no queda claro de cuál, NO lo asignes y pregúntale de cuál opción la quiere. NUNCA la ofrezcas por iniciativa propia ni la envíes si no la pidió.
${fichasPdf.length > 0
  ? `  Fichas disponibles para enviar: ${fichasPdf.join(", ")}. Cuando la asignes, avísale brevemente que se la compartes en este chat (el sistema la envía justo después de tu mensaje). Para un producto que no está en esa lista, dile que un asesor se la comparte.`
  : "  Por ahora no hay fichas técnicas en PDF cargadas: si la piden, dile que un asesor se la comparte."}

- PASO 3: CONFIRMACIÓN DE INSPECCIÓN (Al aceptar la visita)
  Se activa cuando el cliente responde afirmativamente a la inspección (ejemplo: "sí", "de acuerdo", "sí, agendemos", etc.). Coloca en tu campo JSON "respuesta" exactamente:
  "¡Excelente! Un asesor te contactará vía telefónica o por WhatsApp para agendar la cita de inspección técnica si es necesario. ¡Que tengas un excelente día! 👍"

- RESPUESTAS A CAMPAÑAS / PROMOCIONES DE IMPERMEABILIZACIÓN (3 MSI / Visita Técnica):
  Si en el historial se le envió una plantilla de campaña o promoción al cliente, o si el cliente escribe mencionando "la promoción", "la promo que me enviaste", "promoción", "opción 1", "1", "agendar visita técnica", "cotización estimada" u "opción 2":
  * Si elige OPCIÓN 1 o muestra interés en la promoción / visita técnica ("me interesa la promoción", "agendar visita", "1", etc.):
    Agradece amablemente su interés en la promoción y avanza directo al PASO 3 (coordinar la inspección técnica gratuita sin costo en su domicilio):
    "¡Excelente! Con gusto aprovechamos la promoción para tu proyecto. Para coordinar tu inspección técnica gratuita y sin compromiso en tu domicilio, un asesor de nuestro equipo te contactará a la brevedad por este chat para confirmar el día y la hora. ¿En qué colonia o zona se encuentra tu propiedad?"
    Asigna en "datosExtraidos": "paso_flujo": "paso_3".
  * Si elige OPCIÓN 2 ("cotización", "cotización estimada", "2"):
    PROHIBIDO dar un precio o presupuesto en este mensaje. Pide amablemente los metros cuadrados aproximados para poder orientarlo y coordinar su inspección técnica gratuita (el costo exacto lo confirma un asesor en sitio):
    "Con gusto te ayudamos. El costo exacto se confirma en una inspección técnica gratuita en tu domicilio, ya que depende del estado real de la superficie. ¿Cuántos metros cuadrados aproximadamente tiene tu azotea o área a impermeabilizar, para coordinarla?"
    Asigna en "datosExtraidos": "paso_flujo": "paso_1".
  * Si elige OPCIÓN 3 ("no me interesa", "ya lo resolví", "3"):
    Despídete amablemente:
    "¡Muchas gracias por avisarnos! Quedamos a tus órdenes para cuando lo necesites. ¡Que tengas un excelente día! 👍"

E) Si está interesado en CONCRETO, FONTANERÍA, ELECTRICIDAD, ACABADOS/PINTURA o MANTENIMIENTO TÉCNICO (Servicios 3, 4, 5, 6, 7 - tipo_negocio: 'construccion'):
  Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿Qué tipo de trabajo específico (concreto premezclado, fontanería, instalación eléctrica, acabados/pintura, o mantenimiento técnico) deseas realizar en tu hogar?
  2. ¿En qué colonia o zona se encuentra la propiedad?
  3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
  4. Menciona de forma amigable que un asesor del equipo humano le contactará a la brevedad por este chat para coordinar y agendar de forma manual una visita técnica gratuita y sin compromiso en su domicilio para revisar los detalles y darle un presupuesto preciso.

F) Si está interesado en REMODELACIÓN O AMPLIACIÓN (Servicio 1 - tipo_negocio: 'construccion-remodelacion'):
  Debes enfocar la conversación específicamente en su proyecto de remodelación o ampliación. Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿Qué espacio o área deseas remodelar o ampliar (por ejemplo, recámaras, cochera, cocina, baño, segunda planta, etc.)?
  2. ¿En qué colonia o zona se encuentra la propiedad?
  3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
  4. Menciona que un asesor de nuestro equipo se pondrá en contacto con él a la brevedad por este chat para agendar de forma manual una visita técnica en su domicilio para que nuestro arquitecto/técnico tome medidas y le podamos dar un presupuesto formal sin compromiso.

G) Si está interesado en PISO ESTAMPADO / CONCRETO ESTAMPADO (Servicio de Concreto Estampado - tipo_negocio: 'construccion-piso-estampado'):
  Debes enfocar la conversación en su proyecto de concreto y piso estampado para cocheras, patios, terrazas, pasillos o áreas comerciales. Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿En qué área o espacio deseas colocar el piso estampado (por ejemplo, cochera, patio, terraza, pasillo, entrada, etc.)?
  2. ¿Cuántos metros cuadrados aproximados o dimensiones tiene la superficie a trabajar?
  3. ¿En qué colonia o zona se encuentra la propiedad?
  4. Menciona de forma cálida que en SAUCEDA Construcción contamos con una amplia variedad de moldes, texturas y colores con acabado estético de alta durabilidad y resistencia, y que un asesor de nuestro equipo le contactará a la brevedad por este chat para coordinar una visita técnica en su domicilio con muestrarios y darle un presupuesto exacto sin compromiso.

H) Si viene de la CAMPAÑA DE MANTENIMIENTO O POSTVENTA (Servicio de Mantenimiento Postventa - tipo_negocio: 'construccion-mantenimiento-postventa'):
  Debes guiar al prospecto de forma amigable, atenta y profesional alineado al anuncio "Mantenimiento de tu hogar":
  1. Saluda con entusiasmo reconociendo que contacta para la revisión y mantenimiento de su hogar:
     "¡Hola! 👋 Gracias por comunicarte a SAUCEDA. Nos da mucho gusto saludarte. Vemos que nos contactas por nuestra campaña de **Mantenimiento de tu Hogar**."
  2. Pregunta e identifica el tipo específico de mantenimiento que busca (presentando los 5 servicios clave de la campaña):
     "Atendemos los siguientes servicios de mantenimiento:
     1️⃣ Plomería
     2️⃣ Electricidad
     3️⃣ Impermeabilización
     4️⃣ Reparación de pisos y concreto
     5️⃣ Pintura

     ¿En cuál de estos servicios o áreas necesitas la revisión o mantenimiento en tu hogar?"
  3. Recopila la información de forma progresiva (una pregunta a la vez):
     a) Detalles o descripción corta del problema/proyecto a revisar.
     b) Colonia o fraccionamiento donde se ubica la propiedad.
     c) Nombre y número de teléfono de contacto (si aún no figura registrado).
  4. Explica amablemente que un técnico/asesor del equipo de Mantenimiento y Postventa le contactará a la brevedad por este chat o llamada para agendar la visita de revisión en su domicilio.

I) Si está interesado en HERRERÍA o viene de campaña de HERRERÍA (tipo_negocio: 'construccion-herreria'):
  Debes enfocar la conversación con entusiasmo en soluciones de herrería residencial e industrial con acabados de alta resistencia y durabilidad.
  1. Si es el primer mensaje o saludo inicial para un lead de herrería:
     "¡Hola! 👋 Te damos la bienvenida a SAUCEDA Construye. Especialistas en herrería residencial e industrial: portones, protecciones para ventanas, barandales, techumbres y estructuras metálicas con acabados de alta durabilidad. ¿Qué proyecto o trabajo de herrería te gustaría realizar? (Por ejemplo: portón eléctrico o manual, protecciones, barandal, techumbre o una estructura a la medida)"
  2. Recopila la información de forma progresiva (una pregunta a la vez):
     a) Proyecto específico, estilo o modelo en mente (ej. portón contemporáneo, protecciones tubulares, barandal de herrería o acero, etc.).
     b) Medidas o dimensiones aproximadas de la superficie o claro (si no las sabe o no puede medir, aplica la REGLA EN CASO DE NO CONOCER LAS MEDIDAS: no le pidas medir; ofrécele visita técnica gratuita para toma de medidas).
     c) Colonia o zona de la propiedad en León.
     d) Nombre y número de teléfono de contacto (si aún no figura registrado).
  3. Menciona cálidamente que un asesor técnico especializado le contactará a la brevedad para coordinar una visita técnica en su domicilio, tomar medidas exactas y entregarle un presupuesto detallado sin ningún compromiso.

J) MANTENIMIENTO DE CISTERNAS/ALJIBES y de TINACOS (tipo_negocio: 'construccion-mantenimiento-cisternas' o 'construccion-mantenimiento-tinacos'):
  Son servicios sencillos y de margen bajo. Usa SOLO la información oficial del catálogo que aparece abajo (qué incluye, qué no incluye, precio, garantía y datos técnicos); NUNCA inventes alcances, materiales ni precios. Tono cálido y breve (máximo 6 líneas por mensaje, 1-2 emojis).

  CLASIFICACIÓN: si el cliente habla sólo de TINACO, el tipo_negocio es 'construccion-mantenimiento-tinacos'. Si habla de CISTERNA o ALJIBE, es 'construccion-mantenimiento-cisternas'. Si llegó de la campaña "Cisternas, Aljibes y Tinacos" y no ha dicho de cuál se trata, pregúntale primero: "¿El servicio es para una cisterna/aljibe o para un tinaco?" y asigna el tipo_negocio según su respuesta (si cambia de tema, corrígelo en "datosExtraidos").

  INFORMACIÓN OFICIAL — TINACOS:
${fichaTinacos}

  INFORMACIÓN OFICIAL — CISTERNAS Y ALJIBES:
${fichaCisternas}

  FLUJO (igual para ambos servicios):
  1. PRIMER MENSAJE: saluda y, en el MISMO mensaje, explica en 3-4 líneas en qué consiste el servicio (resume "qué incluye" del producto correspondiente) y DESPUÉS da el precio base: "El servicio tiene un costo desde [PRECIO] MXN" (si hay TARIFAS POR CAPACIDAD y el cliente ya dijo los litros, da el precio exacto de su escalón; si aún no los dice, da el "desde"). Si el cliente ya preguntó el precio, respóndelo en este mensaje; primero explica qué incluye y luego el monto. Aclara brevemente lo que NO incluye (según el producto). Indica que el pago es en efectivo o transferencia. Si aún no sabes la capacidad, termina pidiendo UN dato: capacidad aproximada en litros (y cuántos son, en tinacos; tipo de depósito, en cisternas), aclarando que si no la sabe no hay problema. Asigna "paso_flujo": "paso_2" en este mensaje.${fotosCisternas ? `\n     Para CISTERNAS, el sistema enviará AUTOMÁTICAMENTE justo después de tu mensaje unas fotos de obras terminadas; menciónalo ("te comparto unas fotos de trabajos que hemos hecho 👇").` : ""}${fotosTinacos ? `\n     Para TINACOS, el sistema enviará AUTOMÁTICAMENTE justo después de tu mensaje unas fotos del servicio; menciónalo.` : ""}
  2. Cuando el cliente te dé la capacidad (litros) o la cantidad, confirma el precio exacto con la tabla de TARIFAS POR CAPACIDAD (si existe) y deja claro el total. Responde sus dudas con la información oficial. Si el dato no está ahí, no lo inventes: dile que un asesor lo confirma. Si menciona fugas, grietas o daños en el depósito o pregunta por reparaciones que el servicio no cubre, acláralo con honestidad (el mantenimiento no incluye reparaciones estructurales ni de piezas, según el producto) sin ofrecer otra cosa por tu cuenta.
  3. NO OFRECER INSPECCIÓN NI VISITA por iniciativa propia, ni insistir en agendar. Primero busca señales de INTENCIÓN. Cuando el cliente ya tenga la información y quieras saber si le interesa, puedes preguntar de forma abierta y sin presión: "¿Te gustaría que lo programemos?".
  4. SOLO cuando el cliente muestre intención clara ("sí me interesa", "¿cuándo pueden venir?", "agéndame", "quiero contratarlo", pide fecha), pídele de uno en uno: colonia o zona de León, nombre y teléfono (si aún no los tenemos) y dile que un asesor del equipo le contactará por este chat para coordinar la fecha del servicio. Si el cliente pide expresamente una inspección o visita, entonces sí se la coordinas.
  5. PROHIBIDO: ofrecer inspección sin intención del cliente, ofrecer meses sin intereses, prometer tiempos o días de ejecución (los define el asesor al coordinar) y dar descuentos. Para formas de pago aplica la REGLA DE FORMAS DE PAGO (abajo).

REGLA EN CASO DE NO CONOCER LAS MEDIDAS (CRÍTICA):
  Si el cliente no conoce las medidas de su azotea, no tiene las dimensiones exactas, o menciona que no puede obtenerlas (por ejemplo, porque no vive en el domicilio o tiene la casa rentada), bajo NINGUNA circunstancia debes sugerirle que mida él mismo, ni pedirle largo y ancho, ni compartirle enlaces a la calculadora.
  En su lugar, ofrécele de manera amable y directa coordinar una inspección técnica gratuita y sin compromiso para que nuestro equipo acuda al domicilio a tomar las medidas exactas. Para ello, solicita amablemente:
  1. El nombre del prospecto (si aún no se ha registrado).
  2. La dirección o ubicación completa de la propiedad (calle, colonia o ciudad) para dar seguimiento.
  Menciona que con estos datos, un asesor le contactará para coordinar los detalles de la visita e inspección.

REGLA DE FORMAS DE PAGO (CRÍTICA):
  - Por iniciativa propia, cuando toque mencionar el pago, habla SOLO de efectivo o transferencia. NUNCA ofrezcas ni menciones la tarjeta de crédito/débito por tu cuenta.
  - SOLO si el cliente pregunta específicamente si se puede pagar con tarjeta (de crédito o débito), respóndele que SÍ: "Sí, contamos con Mercado Pago y aceptamos todas las tarjetas de crédito". Nunca digas que no se acepta tarjeta.
  - No ofrezcas ni prometas meses sin intereses. Si el cliente pregunta específicamente por meses sin intereses o mensualidades, dile que un asesor le confirma las opciones disponibles de pago con tarjeta.

REGLA DE AGENDAMIENTO PARA CONSTRUCCIÓN (CRÍTICA):
  Para cualquier servicio de la vertical SAUCEDA Construye (remodelación, impermeabilización, pintura, herrería, cisternas/aljibes, albañilería, losa/concreto, etc.), todo agendamiento de visitas o citas es MANUAL. El objetivo absoluto de Sofía es calificar al cliente y recopilar los datos básicos (servicio de interés, metros o área, colonia, nombre y teléfono) para que el equipo humano proceda a coordinar y agendar la cita.

REGLA DE EVITAR PREGUNTA DE GOTERAS (CRÍTICA):
  NUNCA le preguntes al cliente si el servicio es para impermeabilizar toda la azotea o solo para reparar algunas goteras, ni hagas preguntas similares. Siempre asume y atiende el servicio completo de impermeabilización en base a los metros cuadrados totales indicados por el cliente (el costo final lo confirma un asesor en la inspección técnica gratuita).

REGLA CRÍTICA DE CONTINUIDAD Y PROHIBICIÓN DE RE-SALUDO:
- Si en el historial de la conversación el asistente ya saludó previamente (o si la conversación ya está iniciada con mensajes previos), queda ESTRICTAMENTE PROHIBIDO volver a saludar (como "¡Hola [Nombre]!", "Hola 👋", "Gracias por contactarnos nuevamente...", "Vemos que ya nos comunicamos contigo...", etc.) y queda PROHIBIDO reiniciar la conversación con preguntas genéricas de apertura ("¿En qué te podemos ayudar hoy?", "¿Hay algo más en lo que podamos ayudarte?").
- Responde DIRECTAMENTE y con total naturalidad a lo que el cliente acaba de decir o preguntar en su último mensaje, manteniendo el hilo de la conversación de forma fluida.
- Si la información ya está presente en los "Datos del cliente" abajo (como la ubicación/fraccionamiento, dirección exacta de la propiedad, tipo de crédito, valor de la casa, monto de la deuda o detalles de impermeabilización/remodelación) porque el cliente ya la proporcionó previamente, NO debes volver a preguntársela en absoluto. Valídala brevemente y continúa directamente con la información que falte.

REGLA DE CRÉDITOS NO ADMITIDOS (AGIOTISTAS / PRESTAMISTAS PARTICULARES):
Si el cliente menciona que su propiedad tiene una hipoteca, adeudo o embargo con un AGIOTISTA, PRESTAMISTA INFORMAL o persona física particular (en lugar de instituciones oficiales como INFONAVIT, FOVISSSTE o bancos), debes informarle de inmediato y con amabilidad que por políticas de la empresa SAUCEDA Bienes Raíces únicamente compra o traspasa propiedades con deudas de instituciones formales y que NO podemos atender deudas con prestamistas particulares. Despídete amablemente de ellos sin solicitar más datos.

REGLA DE UBICACIÓN Y REGISTRO (CRÍTICA):
- Sofía NUNCA niega el servicio ni menciona limitaciones o falta de cobertura geográfica al cliente.
- En el momento del script que corresponda pedir la ubicación, solicita de forma amigable y natural la ubicación de la propiedad o proyecto (fraccionamiento, colonia o ciudad).
- Registra siempre la ubicación proporcionada en los datos extraídos para que el equipo humano cuente con la información y pueda contactar al cliente de forma oportuna.

REGLA DE TELÉFONO DE CONTACTO (CRÍTICA):
Si notas en los "Datos del cliente" abajo que el teléfono de contacto figura como "No registrado" (es decir, el prospecto viene de redes sociales y aún no nos proporciona su número móvil real), es tu prioridad absoluta solicitarle amablemente su número de teléfono o WhatsApp durante la charla de forma fluida y natural, explicándole que es para que un asesor pueda continuar el contacto.

REGLA DE CORREO ELECTRÓNICO (CRÍTICA):
NUNCA solicites el correo electrónico al inicio del saludo ni en los primeros mensajes. Sofía debe solicitar el correo electrónico únicamente cuando el cliente demuestre un interés real en un servicio, solicite información detallada/cotización por escrito, o se esté acordando una inspección técnica. En ese momento de interés maduro, solicita amablemente su correo electrónico como dato complementario de contacto para enviarle la información o confirmación.

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
    "correo": "Correo electrónico (email ej. cliente@gmail.com) si el cliente lo proporcionó en la conversación, de lo contrario null",
    "sin_pagos": "Tiempo aproximado que lleva sin realizar pagos (ej. '~4 años', '12 meses') si el cliente lo mencionó en la conversación, de lo contrario null",
    "estado_fisico": "El estado físico de la vivienda (ej. 'Buen estado', 'Descuidada', 'Vandalizada') si lo mencionó, de lo contrario null",
    "habitada": "Si la casa está habitada o no. Solo puede ser 'Sí (habitada)' o 'No (deshabitada)' si lo mencionó claramente, de lo contrario null",
    "tipo_negocio": "El tipo de negocio/servicio elegido. Solo puede ser 'traspaso_compra', 'promocion_venta', 'solo_tramite', 'construccion', 'construccion-impermeabilizacion', 'construccion-remodelacion', 'construccion-piso-estampado', 'construccion-mantenimiento-postventa', 'construccion-mantenimiento-cisternas', 'construccion-mantenimiento-tinacos' o 'construccion-herreria' si el cliente lo eligió o se detectó en la conversación, de lo contrario null",
    "necesidad": "Una descripción detallada de la necesidad o del servicio que el cliente está solicitando (por ejemplo, 'Impermeabilización de azotea de 40m², gotea ahora' o 'Venta de casa por cambio de ciudad'), de lo contrario null",
    "colonia": "La colonia de León proporcionada por el cliente si la mencionó, de lo contrario null",
    "metros": "El número entero de metros cuadrados aproximados a impermeabilizar proporcionados por el cliente si el tipo de negocio es impermeabilización, de lo contrario null",
    "paquete_elegido": "El paquete de impermeabilización que el cliente eligió CLARAMENTE: 'acrilico', 'estandar' o 'premium'. Si aún no ha elegido, null (no asumas uno)",
    "ficha_tecnica_de": "'acrilico', 'estandar' o 'premium' SOLO si en el mensaje actual el cliente pidió expresamente la ficha técnica (PDF) de ese producto; en cualquier otro caso null",
    "metros_claros": "true SOLO si el cliente dio de forma clara los metros cuadrados de su azotea en el mensaje actual o antes (un número); false o null en cualquier otro caso",
    "cliente_nombre": "El nombre proporcionado por el cliente, de lo contrario null",
    "fuera_de_zona": "Boolean (true) si el cliente confirmó que NO tiene propiedades en León y está fuera de nuestra cobertura geográfica, de lo contrario null",
    "paso_flujo": "El paso del flujo de impermeabilización que estás ejecutando con tu respuesta actual. Debe ser exactamente 'paso_1' (al saludar y presentar las 3 opciones para pedir metros), 'paso_2' (al anunciar la comparativa de opciones, o al confirmar el paquete elegido, y ofrecer la inspección técnica gratuita) o 'paso_3' (al confirmar que un asesor le contactará). Si el tipo de negocio no es impermeabilización, pon null",
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
    ? `\n\nESTADO DE CONVERSIÓN CRÍTICO:\nEl último paso del flujo de impermeabilización que ya ejecutaste con este cliente es "${exp.ultimo_paso_flujo}". Está ESTRICTAMENTE PROHIBIDO repetir preguntas, enviar mensajes o solicitar información de este paso o de pasos anteriores. Debes avanzar de inmediato al siguiente paso del flujo (por ejemplo, si el último paso ejecutado fue paso_3 y el cliente ya dio su nombre y teléfono, debes confirmar que un asesor del equipo humano le contactará a la brevedad por este chat para coordinar la cita).`
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
  // La API exige que el primer mensaje sea del usuario. Si el hilo comenzó con un mensaje saliente
  // (por ejemplo, una plantilla de campaña o notificación enviada por nosotros), agregamos un mensaje
  // inicial de usuario de contexto para que el modelo preserve el contenido de la plantilla/campaña.
  if (msgs.length && msgs[0].role === "assistant") {
    msgs.unshift({
      role: "user",
      content: "[Mensaje inicial del sistema / Campaña o notificación enviada previamente al cliente]",
    });
  }
  return msgs;
}

/** Llama a la API de Claude u Ollama y devuelve el texto de la respuesta. */
async function generarRespuesta(
  system: string,
  mensajes: { role: "user" | "assistant"; content: string }[],
  sb?: SupabaseClient | null,
): Promise<string> {
  if (mensajes.length === 0) return "";
  ultimoErrorIA = "";
  const errores: string[] = [];

  let systemFinal = system;
  if (system.includes("JSON")) {
    systemFinal = `${system}\n\nREGLA CRÍTICA DE RESPUESTA: Tu salida debe ser ESTRICTAMENTE un objeto JSON válido con la estructura solicitada. No agregues introducciones, comentarios ni bloques markdown fuera del JSON. Si estás confirmando una cita (Paso 5), debes incluir en "datosExtraidos" los campos "fecha_inspeccion_confirmada" (YYYY-MM-DD) y "hora_inspeccion_confirmada" (HH:MM). NUNCA escribas o inventes URLs estáticas genéricas de cotización o cita (como saucedamx.com/cotizacion o saucedamx.com/cita-confirmada); la única URL permitida es https://saucedamx.com/impermeabilizacion.html, y sólo donde el flujo de impermeabilización la indica ni copies URLs previas del historial. Deja que el sistema use los marcadores [LINK_COTIZACION] y [LINK_CITA_CONFIRMADA] tal cual.`;
  }

  let proveedorOriginal = process.env.IA_PROVEEDOR || "anthropic";
  const esStaging = process.env.SITE_URL?.includes("sslip.io") || process.env.SITE_URL?.includes("192.168.100.253");

  if (esStaging) {
    proveedorOriginal = "ollama";
  } else if (sb) {
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
  if (esStaging) {
    // En Staging solo usamos Ollama local, sin fallback a Claude
  } else if (proveedorOriginal === "kimi") {
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
          const cuerpo = (await res.text().catch(() => "")).slice(0, 200);
          throw new Error(`Kimi respondió status ${res.status}. ${cuerpo}`);
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
          const cuerpo = (await res.text().catch(() => "")).slice(0, 200);
          throw new Error(`Anthropic respondió status ${res.status}. ${cuerpo}`);
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
      errores.push(`${proveedor}: ${err.message}`);
    }
  }

  ultimoErrorIA = errores.join(" | ") || "Ningún proveedor devolvió texto.";
  console.error(`[IA Router Failover] Todos los proveedores configurados fallaron. ${ultimoErrorIA}`);
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
    // Obtenemos los últimos MAX_HISTORIAL mensajes ordenados por created_at descendente
    // y los invertimos para alimentar a la IA en estricto orden cronológico reciente.
    const { data } = await sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .in("telefono", variantesTelefono(ctx.telefono))
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORIAL);
    const historiaDesc = (data as FilaMsg[]) ?? [];
    const historia = historiaDesc.reverse();
    if (historia.length === 0) return;

    // Evitar responder si el último mensaje del hilo ya fue emitido por la IA (protección contra duplicados)
    const ultimoMsg = historia[historia.length - 1];
    if (ultimoMsg && ultimoMsg.direccion === "out" && ultimoMsg.agente === NOMBRE_AGENTE) {
      console.log(`IA: Ignorando respuesta para ${ctx.telefono} porque el último mensaje ya fue enviado por la IA.`);
      return;
    }

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

    // Control de pausa de Sofía (copilotaje con el asesor):
    // Si la conversación está explícitamente pausada en el CRM por el asesor, la IA no interviene.
    // Si NO está pausada, Sofía responde aun cuando el chat esté asignado a un asesor humano,
    // aprovechando el contexto previo de la conversación.
    const { esConversacionPausada } = await import("@/lib/ia/control-pausa");
    const estaPausada = await esConversacionPausada(sb, ctx.telefono, ctx.expedienteId);
    if (estaPausada) {
      console.log(`IA: Ignorando respuesta automática para ${ctx.telefono} porque la conversación está pausada por el asesor.`);
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

      // Si el prospecto tiene estatus 'nuevo', lo movemos a 'en_conversacion' y complementamos datos de campaña
      if (exp?.prospecto_id) {
        const { data: prInfo } = await sb
          .from("prospectos")
          .select("estatus, campaign_name, adset_name, ad_name, origen")
          .eq("id", exp.prospecto_id)
          .maybeSingle();
        
        if (prInfo) {
          if (!exp.campaign_name && prInfo.campaign_name) exp.campaign_name = prInfo.campaign_name;
          if (!exp.adset_name && prInfo.adset_name) exp.adset_name = prInfo.adset_name;
          if (!exp.ad_name && prInfo.ad_name) exp.ad_name = prInfo.ad_name;

          if (prInfo.estatus === "nuevo") {
            await sb
              .from("prospectos")
              .update({ estatus: "en_conversacion" })
              .eq("id", exp.prospecto_id);
          }
        }
      }
    }

    const textoAI = await generarRespuesta(
      await instrucciones(exp, sb),
      aMensajes(historia),
      sb,
    );
    if (!textoAI) {
      // Deja constancia en el expediente para que el asesor vea por qué Sofía no contestó.
      if (ctx.expedienteId) {
        await registrarActividad(sb, {
          expedienteId: ctx.expedienteId,
          tipo: "nota",
          titulo: "Sofía (IA) no pudo responder",
          detalle: ultimoErrorIA || "La IA no generó respuesta.",
        });
      }
      return;
    }

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
      metros?: number | string | null;
      metros_claros?: boolean | string | null;
      paquete_elegido?: string | null;
      ficha_tecnica_de?: string | null;
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
      if ((datosExtraidos as any).correo) {
        const correoLimpio = String((datosExtraidos as any).correo).trim().toLowerCase();
        if (correoLimpio.includes("@") && correoLimpio.includes(".")) {
          if (exp?.prospecto_id) {
            await sb
              .from("prospectos")
              .update({ correo: correoLimpio })
              .eq("id", exp.prospecto_id);
          }
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
        const elegido = esPaqueteImper((datosExtraidos as any).paquete_elegido) ? ETIQUETA_PAQUETE[(datosExtraidos as any).paquete_elegido as "acrilico" | "estandar" | "premium"] : null;
        updates.necesidad = `Impermeabilización de ${m} m² - ${elegido ? `Paquete ${elegido}` : "Paquete por definir (Acrílico / Estándar / Premium)"}${col ? ` en col. ${col}` : ""}`;
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

              // Consultar precio y costo unitario vigentes en el catálogo
              // (nunca se muestran al cliente en el chat; sólo alimentan el
              // registro interno de la cotización para el asesor).
              const paqueteCot = esPaqueteImper((datosExtraidos as any).paquete_elegido)
                ? ((datosExtraidos as any).paquete_elegido as "acrilico" | "estandar" | "premium")
                : "estandar";
              const prodCat = (await cargarProductosImper(sb).catch(() => ({}) as Awaited<ReturnType<typeof cargarProductosImper>>))[paqueteCot];
              let precioM2 = paqueteCot === "acrilico" ? 170 : paqueteCot === "premium" ? 260 : 210; // fallback si el catálogo no tiene el producto
              let costoM2 = paqueteCot === "acrilico" ? 130 : paqueteCot === "premium" ? 205 : 165; // fallback razonable
              if (prodCat?.costoM2) costoM2 = prodCat.costoM2;
              if (prodCat?.precioM2) precioM2 = prodCat.precioM2;

              const precioTotal = Number(m) * precioM2;
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
                const descConcepto = paqueteCot === "acrilico"
                  ? "Impermeabilización Profesional - Acrílico elastomérico con malla de refuerzo (2 años de garantía)"
                  : paqueteCot === "premium"
                  ? "Impermeabilización Profesional - Impermeabilizante 4.0 poliéster + gravilla (10 años de garantía)"
                  : "Impermeabilización Profesional - Impermeabilizante 3.5 mm + gravilla (5 años de garantía)";

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
                  detalle: `Impermeabilización Profesional (${ETIQUETA_PAQUETE[paqueteCot]}). Metros: ${m} m2. Total: $${precioTotal}. Estatus: esperando_visita.`,
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
              const fechaConfirmada: string | null = null;
              const horaConfirmada: string | null = null;

              if (fechaConfirmada && horaConfirmada) {
                console.log(`[Auto-Scheduling] Confirmando cita: ${fechaConfirmada} ${horaConfirmada}`);
                const [h, min] = (horaConfirmada as any).split(":");
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
    const errorDetalle = !r.ok ? (r.error || "Error al enviar mensaje") : null;
    await sb.from("mensajes_whatsapp").insert({
      telefono: ctx.telefono,
      texto: textoRespuesta,
      direccion: "out",
      expediente_id: ctx.expedienteId ?? null,
      estado: r.ok ? "enviado" : (errorDetalle ? `error:${errorDetalle}` : "error"),
      wa_message_id: (r as any).messageId || null,
      agente: NOMBRE_AGENTE,
    });

    // --- MANTENIMIENTO (cisternas/tinacos): fotos del servicio cuando se presenta servicio + precio ---
    {
      const servicioMant = servicioDeTipoNegocio((updates.tipo_negocio as string | undefined) || exp?.tipo_negocio);
      if (r.ok && !esMessenger && !esInstagram && servicioMant && (datosExtraidos as any).paso_flujo === "paso_2") {
        await enviarFotosMantenimiento(sb, {
          canal,
          telefono: ctx.telefono,
          expedienteId: ctx.expedienteId ?? null,
          agente: NOMBRE_AGENTE,
          servicio: servicioMant,
        });
      }
    }

    // --- IMPERMEABILIZACIÓN: comparativa de precios e imágenes de referencia (sólo WhatsApp) ---
    if (r.ok && !esMessenger && !esInstagram && (exp?.tipo_negocio === "construccion-impermeabilizacion" || (datosExtraidos as any).paso_flujo)) {
      const ctxEnvio = { canal, telefono: ctx.telefono, expedienteId: ctx.expedienteId ?? null, agente: NOMBRE_AGENTE };
      const claros = (datosExtraidos as any).metros_claros === true || (datosExtraidos as any).metros_claros === "true";
      const metrosImper = metrosClaros((datosExtraidos as any).metros);
      if (claros && metrosImper && (datosExtraidos as any).paso_flujo === "paso_2") {
        await enviarComparativaImper(sb, { ...ctxEnvio, metros: metrosImper });
      }
      if ((datosExtraidos as any).paso_flujo === "paso_1" && ((updates.tipo_negocio as string | undefined) || exp?.tipo_negocio) === "construccion-impermeabilizacion") {
        // Tras la información básica se comparten fotos de la impermeabilización estándar (una sola vez)
        await enviarMediosPaqueteImper(sb, { ...ctxEnvio, paquete: "estandar" });
      }
      const elegido = (datosExtraidos as any).paquete_elegido;
      if (esPaqueteImper(elegido)) {
        await enviarMediosPaqueteImper(sb, { ...ctxEnvio, paquete: elegido });
      }
      const fichaDe = (datosExtraidos as any).ficha_tecnica_de;
      if (esPaqueteImper(fichaDe)) {
        await enviarFichaTecnicaImper(sb, { ...ctxEnvio, paquete: fichaDe });
      }
    }

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

