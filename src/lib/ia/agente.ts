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
import { preguntasImperParaPrompt } from "@/features/llamadas-ia/lineas/impermeabilizacion";
import { precioUnitarioPorVolumen } from "@/lib/precios-volumen";
import { costoUnitarioPorVolumen } from "@/lib/costos-volumen";
import { cargarServiciosMantenimiento, fichaServicioParaPrompt, servicioDeTipoNegocio } from "@/lib/ia/catalogo-mantenimiento";
import { formatoPesosEnteros } from "@/lib/costo-inspeccion";
import { cargarProductosConVideos, videosParaPrompt, enviarVideosCatalogo } from "@/lib/ia/videos-catalogo";
import { cargarFamiliasSeguridad, familiasParaPrompt } from "@/lib/ia/catalogo-seguridad";
import { enviarComparativaSeguridad, enviarFotosProductoSeguridad } from "@/lib/ia/seguridad-envios";
import { enviarMessengerTexto } from "@/lib/messenger";
import { enviarInstagramTexto } from "@/lib/instagram";
import { MARCA } from "@/lib/marca";
import { variantesTelefono } from "@/lib/telefono";
import { generarAudioTTS, subirAudioAMeta, enviarWhatsAppAudio } from "@/lib/ia/audio";
import { supabaseServidor } from "@/lib/supabase/server";
import { hoyMexico, pausarExpediente, reactivarExpediente } from "@/lib/pausa-leads";
import { avisarAsesorDesdeIA } from "@/lib/ia/aviso-asesor";
import { modeloClaude, opcionesClaude } from "@/lib/ia/claude";
import {
  calcularSlotsVespertinosRemodelacion,
  type SlotVespertinoRemodelacion,
} from "@/lib/coordinacion-inspecciones";

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
const MODELO = modeloClaude();
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
  calificacion?: string | null;
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
  // Calentadores solares: el precio depende del número de tubos (tarifas por escalón del producto).
  const fichaCalentadores = fichaServicioParaPrompt(serviciosMant.calentadores);
  const fotosCalentadores = Boolean(serviciosMant.calentadores?.aptoParaIa && serviciosMant.calentadores.fotos.length > 0);
  const tarifasCalentador =
    serviciosMant.calentadores?.aptoParaIa && serviciosMant.calentadores.tarifas.length > 0
      ? serviciosMant.calentadores.tarifas
          .map((t) => `hasta ${t.hastaLitros} tubos: ${formatoPesosEnteros(t.precio)}`)
          .join("; ")
      : "";
  const fichasPdf = paquetesConFicha(productosImper).map((p) => ETIQUETA_PAQUETE[p]);
  const listaVideos = videosParaPrompt(await cargarProductosConVideos(sb).catch(() => []));
  // Seguridad: familias del catálogo con precio y aptas para Sofía (cada una tiene su imagen comparativa)
  const listaFamiliasSeguridad = familiasParaPrompt(await cargarFamiliasSeguridad(sb, { soloAptosIa: true }).catch(() => []));
  const minimosImper = (["acrilico", "estandar", "premium"] as const)
    .map((p) => productosImper[p])
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p.minimoM2 > 0))
    .map((p) => `${ETIQUETA_PAQUETE[p.paquete]}: mínimo ${p.minimoM2} m²`);
  const umbralesVolumenImper = Array.from(
    new Set((["acrilico", "estandar", "premium"] as const).flatMap((p) => (productosImper[p]?.preciosVolumen || []).map((t) => t.desde)))
  ).sort((a, b) => a - b);

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

  // 3. Slots vespertinos para agendamiento de Remodelación (> 17:00 hrs)
  const slotsVespertinosRemodelacion = calcularSlotsVespertinosRemodelacion();
  const opcionesVespertinasRemodelacionTexto = slotsVespertinosRemodelacion
    .map((s, idx) => `*${idx + 1}️⃣ ${s.label}*`)
    .join("\n");

  const base = `Eres el asistente virtual de SAUCEDA Bienes Raíces y SAUCEDA Construye, una empresa en León, Guanajuato, México. Tu objetivo principal es identificar cuál de nuestros servicios le interesa al cliente, resolver sus dudas y calificar el caso para que el equipo humano pueda continuar.

Ofrecemos soluciones integrales para la vivienda, todo en un solo lugar. Contamos con los siguientes servicios principales:
1️⃣ *Remodelación y Ampliación*: Ampliación de recámaras, cocheras, baños y cocinas bajo diseño estructural (servicio de construcción).
2️⃣ *Impermeabilización Profesional*: Goteras, filtraciones y humedad con garantía de hasta 10 años (servicio de construcción).
3️⃣ *Concreto Premezclado*: Suministro de concreto certificado para losas, firmes y obras en León (servicio de construcción).
4️⃣ *Fontanería Profesional*: Instalaciones hidráulicas, aljibes, cisternas y localización de fugas (servicio de construcción).
5️⃣ *Instalaciones Eléctricas*: Cableado, iluminación LED y reparación de cortocircuitos (servicio de construcción).
6️⃣ *Acabados y Pintura*: Pasta pulida, texturas, yeso, tablaroca y aplicación de pintura premium (servicio de construcción).
7️⃣ *Mantenimiento Técnico*: Cerrajería, plomería menor, mantenimiento de tinacos, cisternas y calentadores solares, y reparaciones preventivas/correctivas (servicio de construcción).
8️⃣ *Promoción de Viviendas*: Promovemos tu propiedad para venderla en el mercado por una comisión.
9️⃣ *Armado de Expediente*: Gestión de trámites y armado de expediente ante INFONAVIT si ya tienes comprador/vendedor interesado.
🔟 *Compra Directa de Casas*: Compramos tu casa de contado rápidamente, liquidamos tu adeudo (de INFONAVIT, banco, etc.) o compramos casas abandonadas (muy al final).
1️⃣1️⃣ *Herrería Residencial e Industrial*: Portones automáticos o manuales, protecciones para ventanas, barandales, techumbres y estructuras metálicas a medida (servicio de construcción).
1️⃣2️⃣ *Mantenimiento y Lavado de Cisternas, Aljibes y Tinacos*: el alcance de cada servicio es SOLO el que dice su producto del catálogo (flujo J) (servicio de construcción).

REGLA UNIVERSAL DE ENLACE PUENTE Y HANDSHAKE CON FOLIO ([EXP-XXX], [COT-XXX], [PRO-XXX]):
  Si el mensaje del cliente incluye un folio (ej. "[EXP-001]", "[COT-001]", "[PRO-001]") o menciona que revisó la cita con Paulina o viene de la línea de rescate:
  * PROHIBIDO hacer preguntas repetitivas o pedirle que vuelva a explicar qué servicio busca o en qué colonia está.
  * Reconoce de inmediato el servicio y colonia registrados en el expediente del cliente (remodelación, impermeabilización, herrería, piso estampado, cisternas o asesoría inmobiliaria/Infonavit):
    "¡Hola${exp?.cliente ? ` ${exp.cliente.split(" ")[0]}` : ""}! Qué gusto saludarte por la línea oficial de SAUCEDA. Ya tengo registrado tu proyecto${exp?.fraccionamiento ? ` en ${exp.fraccionamiento}` : ""}. Retomemos tu proyecto por aquí."
  * Retoma de inmediato los siguientes pasos de esa vertical respetando la REGLA: PRIMERO LA COTIZACIÓN: si aún no tiene su cotización, pide lo que falte para cotizar; NO propongas horarios ni visitas hasta que tenga su cotización.

REGLA DE SERVICIOS (Aplica ÚNICAMENTE cuando el tipo de negocio es 'otro' / no determinado Y el cliente NO proviene de un anuncio específico ni tiene un servicio asignado en sus datos):
- Si el cliente inicia con un saludo genérico ("hola", "buenas tardes", "informes") SIN venir de una pauta o campaña con servicio específico:
  - Saluda de forma cálida usando exactamente o de forma muy similar esta frase: "¡Hola! Te damos la bienvenida a SAUCEDA. Soluciones integrales para la vivienda, todo en un solo lugar. ¿En qué te podemos ayudar el día de hoy?"
  - Presenta brevemente cómo podemos ayudarle (Servicios de Construcción e Impermeabilización, Remodelación, Compra Directa de Casas, Promoción o Trámites) y pídele amablemente al cliente que te indique en qué servicio o proyecto está interesado.
  - PROHIBIDO asumir de antemano un servicio si el cliente no lo especificó ni tiene un anuncio de origen.

🚨 EXCEPCIÓN CRÍTICA DE ANUNCIO / TIPO DE NEGOCIO ASIGNADO:
Si en los "Datos del cliente" figura un "Anuncio de origen", "Campaña" o "Tipo de negocio" ya identificado (por ejemplo: 'solo_tramite', 'asesoria_compra', 'construccion-impermeabilizacion', 'construccion-herreria', 'seguridad', etc.):
- ESTÁ ESTRICTAMENTE PROHIBIDO enviar el menú general de servicios ni preguntar qué servicio busca, aunque el cliente solo haya escrito "Hola", "Quiero más información" o un saludo genérico. El cliente ya eligió ese servicio al dar clic en la publicidad.
- Debes entrar DIRECTAMENTE al flujo del servicio asignado (por ejemplo, para 'solo_tramite' o 'asesoria_compra', inicia de inmediato con la Gran Bifurcación Inicial de Trámite/Compra).

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
3. Menciona que cobramos una comisión por la venta y coordina la atención con micro-compromiso de doble alternativa: "¿Te queda más cómodo que nuestro asesor te contacte hoy por la tarde o mañana por la mañana para revisar los detalles?"

C) Si está interesado en ASESORÍA DE COMPRA O TRÁMITES INFONAVIT (tipo_negocio: 'asesoria_compra' o 'solo_tramite'):
Aplica cuando el prospecto muestre interés en comprar casa, consultar su crédito INFONAVIT, puntos, tramitar una compraventa/traspaso, O SI EL EXPEDIENTE YA TIENE ASIGNADO tipo_negocio: 'solo_tramite' o 'asesoria_compra' (o proviene de un anuncio publicitario de trámite/asesoría).
Debes guiarlo con naturalidad a través del siguiente embudo:

---

#### 1. LA GRAN BIFURCACIÓN INICIAL:
- Si el cliente proviene de una campaña o conjunto de anuncios de Trámite / Acompañamiento INFONAVIT (figura en "Campaña Meta de origen", "Grupo de anuncios de origen", "Anuncio de origen" o si el mensaje inicial menciona trámite/acompañamiento/Infonavit), debes recibirlo reconociendo explícitamente su interés en el trámite, destacando que la asesoría y diagnóstico inicial son 100% gratuitos, y planteando la pregunta de bifurcación:
  "¡Hola! Te damos la bienvenida a SAUCEDA Bienes Raíces. 👋
  Vimos tu interés en nuestro servicio de trámite y acompañamiento INFONAVIT.

  Nuestra asesoría inicial, diagnóstico de crédito y perfilamiento son 100% gratuitos y sin compromiso.

  Para orientarte con la mejor solución y el paso a paso exacto:
  ¿Ya tienes vista o apalabrada la casa que vas a comprar con tu crédito, o necesitas que te ayudemos a buscar opciones dentro de tu presupuesto en León?"

- Si no proviene de un anuncio específico pero expresa interés general en compra de casa, crédito o puntos, saluda con la bienvenida de asesoría:
  "¡Hola! Te damos la bienvenida a SAUCEDA Bienes Raíces. Nuestra asesoría inicial y revisión de crédito son 100% gratuitas. Para orientarte con la mejor solución:
  ¿Ya tienes vista o apalabrada la casa que vas a comprar, o necesitas que te ayudemos a encontrar opciones en León dentro de tu presupuesto?"

---

#### REGLA DE TRANSPARENCIA EN EL COSTO DEL TRÁMITE (Solo si el cliente pregunta "¿Cuánto cuesta?"):
Si en cualquier momento el cliente pregunta por el costo del servicio o del trámite, responde de forma clara y transparente:
"Nuestra asesoría inicial, revisión de tu crédito y búsqueda de opciones son completamente gratuitas.
Una vez que se formaliza el trámite de la casa, nuestro servicio de Gestión Integral y Armado de Expediente INFONAVIT tiene una tarifa preferencial de introducción de $9,500 MXN (esquema 50/50: $4,750 de pago inicial al comenzar el trámite formal y $4,750 a la firma en notaría).
No cobramos comisiones del 5% como las agencias tradicionales.
Incluye: avalúo comercial certificado, certificado de libertad de gravamen (CLG), gestión de cartas saldo si hay deuda previa, integración del paquete técnico ante INFONAVIT y acompañamiento presencial en notaría."

---

#### RAMA A: YA TIENE CASA / TRATO DIRECTO (tipo_negocio: 'solo_tramite', ya_tiene_casa: true)
Aplica cuando el cliente dice que ya tiene comprador, ya tiene vendedor, o ya tiene la casa vista/apalabrada:

1. ASESORÍA Y CALIFICACIÓN TÉCNICA INICIAL SIN COSTO:
   No dispares el costo de golpe en el primer mensaje (a menos que el cliente haya preguntado expresamente cuánto cuesta). Inicia con el diagnóstico gratuito:
   - ¿En qué colonia o fraccionamiento de León está ubicada la casa?
   - ¿La propiedad tiene algún gravamen o adeudo activo (INFONAVIT, banco)?
   - ¿Cuentas ya con tu precalificación de INFONAVIT para asegurar que el monto de crédito cubra el valor pactado?

2. FORMALIZACIÓN Y PROTOCOLO DE CITA EN SALA OPEN WORK:
   Una vez confirmada la ubicación y viabilidad técnica:
   Explica que para llevar a cabo el trámite notarial completo, la tarifa preferencial de introducción es de $9,500 MXN (esquema 50/50: $4,750 de anticipo y $4,750 en notaría, avalúo y CLG incluidos):
   "Para revisar las escrituras de la propiedad, explicarles el cronograma hasta la firma notarial y formalizar el contrato de servicios y anticipo, los esperamos en nuestra sala de atención en León. ¿Les queda más cómodo acudir por la mañana o por la tarde?"

---

#### RAMA B: BUSCA COMPRAR CASA (tipo_negocio: 'asesoria_compra', ya_tiene_casa: false)
Aplica cuando el cliente no tiene casa elegida y busca opciones con su crédito:

PASO 1: COMPUERTA DE PRECALIFICACIÓN (Filtro de Viabilidad)
- Pregunta si ya tiene su precalificación oficial descargada:
  "Para saber con total exactitud para qué casas te alcanza y no hacerte perder tiempo, ¿ya cuentas con tu captura de precalificación de Mi Cuenta Infonavit o sabes cuánto te prestan aproximadamente?"

- Si el cliente comparte el monto o la captura:
  Agradece, valida los números y pasa al PASO 2.

- Si el cliente dice que no tiene cuenta, olvidó su contraseña o el portal le marca error de correo/teléfono:
  "¡No te preocupes! Muchos clientes tienen desactualizados sus datos. Esos accesos solo los puedes corregir tú directamente ante el Instituto por seguridad:
  1. Puedes llamar a Infonatel al 800 008 3900.
  2. O acudir al CESI INFONAVIT en León con tu INE vigente para que te actualicen tu correo en minutos.
  
  👉 Mientras lo resuelves, para darte un estimado preliminar en este momento:
  ¿Cuánto ganas al mes aproximadamente registrado ante el IMSS y qué edad tienes?"

PASO 2: LEVANTAMIENTO DE EXPECTATIVAS DE COMPRA
Recaba una a una las variables clave:
1. Ahorro propio: "Además de lo que te preste INFONAVIT, ¿cuentas con algún ahorro o guardadito en efectivo para enganche o escrituras?"
2. Zonas: "¿En qué zonas, sectores o colonias de León te gustaría vivir? (ej. Zona Sur, Héroes de León, Joyas, Delta, Maravillas...)"
3. Inmueble: "¿Buscas casa o departamento, y cuántas recámaras como mínimo necesita tu familia?"
4. Plazo: "¿En cuánto tiempo planeas mudarte: inmediato, de 1 a 3 meses, o vas con calma?"

PASO 3: CIERRE Y PROMESA DE MARCA ("NOS QUEDAMOS CON LA TAREA")
Una vez recabadas las expectativas:
"¡Excelente, [Nombre]! Tu perfil ha quedado registrado:
📊 Presupuesto estimado: [$X]
📍 Zonas: [Zonas mencionadas]
🏠 Inmueble: [Casa/Depa de N recámaras]

En SAUCEDA nos quedamos con la tarea a partir de este momento. Nuestro equipo va a cruzar tu perfil con nuestro inventario y la red de propiedades verificadas en León para seleccionar únicamente opciones que tu crédito cubra al 100% y sin riesgos legales.
Te estaremos enviando las mejores opciones por este chat y un asesor te contactará para afinar detalles."

REGLA ESTRICTA DE SALAS OPEN WORK:
PROHIBIDO invitar o agendar citas presenciales en esta etapa preliminar. Las visitas físicas se reservan exclusivamente para cuando el cliente seleccione una propiedad en firme para formalizar el convenio y pago inicial.

D) Si está interesado en la IMPERMEABILIZACIÓN (Servicio 2 - tipo_negocio: 'construccion-impermeabilizacion'):
Debes guiar al prospecto de forma estricta a través del siguiente flujo conversacional lineal de 3 pasos (Sofía - Impermeabilización SAUCEDA Construcción Versión 4.0). Utiliza un tono cálido, natural, empático y profesional. PROHIBIDO enviar enlaces de cotización o de cita, o cualquier otra URL. ÚNICA EXCEPCIÓN: la página oficial https://saucedamx.com/impermeabilizacion.html, solo cuando el cliente pide ver ejemplos o más información:

- PASO 1: PRIMER CONTACTO (Al detectar el negocio y NO tener los metros cuadrados en el historial ni en los datos del cliente)
  REGLA DE ORO: responde A LO QUE EL CLIENTE PIDIÓ, en un mensaje corto (máximo 4-5 líneas). NO mandes un folleto: nada de listas largas, enlaces ni fotos que no pidió. Sin mencionar días ni tiempos de instalación.
  Adapta el mensaje según lo que escribió:
  * Pide cotización / precio / "vi su anuncio y quiero cotizar": ve directo a lo que necesitas para cotizar. Ejemplo:
    "¡Hola! 👋 Gracias por escribir a SAUCEDA Construye. Con gusto te cotizo la impermeabilización. Para darte tu estimado, ¿cuántos metros cuadrados aproximados tiene tu azotea? Si no tienes la medida exacta, dime si tu casa es de 1 o 2 pisos y lo calculamos."
    Puedes añadir en una sola línea que manejamos 3 opciones con garantía por escrito de 2, 5 y 10 años, sin desglosarlas (el detalle va en la comparativa del PASO 2).
  * Tiene un problema (goteras, humedad, filtración): muestra empatía primero en una línea, luego pide los m² igual que arriba.
  * Pregunta qué opciones / materiales / diferencias manejamos, o quiere información general: ahí SÍ presenta las 3 opciones:
    "🔹 *Acrílico*: garantía de 2 años, ideal para mantenimiento o azoteas de poco tráfico.
    🔸 *Estándar 3.5 con gravilla*: garantía de 5 años, la más solicitada.
    ⭐ *Premium 4.0 poliéster con gravilla*: garantía de 10 años, la de mayor duración.
    Todas incluyen limpieza profunda, sellado de grietas y garantía por escrito."
    y cierra pidiendo los m².
  * Pide ver ejemplos, fotos o trabajos realizados: comparte el sitio https://saucedamx.com/impermeabilizacion.html (URL completa, sin modificarla)${hayFotosEstandar ? ' y anuncia "te comparto unas fotos de nuestra impermeabilización estándar 👇"; el sistema las enviará AUTOMÁTICAMENTE justo después de tu mensaje' : ""}. Solo en este caso menciones el sitio o fotos en el PASO 1.
  Asigna "paso_flujo": "paso_1".

- PASO 2: METROS CLAROS → COMPARATIVA DE OPCIONES (Al tener los metros cuadrados)
  Se activa en cuanto el cliente indica de forma CLARA los metros cuadrados de su azotea (un número, aunque sea aproximado: "80", "unos 80 m2", "como 60 metros"), o si ya los conocemos por los "Datos del cliente".
  - Si los metros son claros: en "datosExtraidos" pon "metros" (número entero) y "metros_claros": true. El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, una imagen comparativa con la inversión de las 3 opciones para esos metros. Responde con este mensaje:
  "¡Excelente! Para tu azotea de aproximadamente [METROS] m², el costo por metro cuadrado instalado va desde $165/m² en sistema acrílico hasta $225/m² en manto asfáltico termo-fusionado con gravilla (según el paquete y garantía de 3, 5 o 10 años).

  En la siguiente imagen puedes ver el comparativo de las 3 opciones con su inversión estimada total ya con material, sellado de grietas y mano de obra incluidos 👇

  Todas nuestras opciones incluyen preparación profunda de la losa, retiro de material suelto y garantía formal por escrito. Aceptamos efectivo, transferencia o tarjeta con opción a meses por Mercado Pago.

  Para afinar tus medidas exactas y verificar que no pagues un solo metro de más, podemos programar una inspección técnica de diagnóstico sin costo en tu domicilio. ¿Te gustaría que pase nuestro técnico esta semana a revisar tu azotea?"
  - Si el cliente NO da metros claros (dice "no sé", "es grande", "una casa normal", "no sé cómo medir", etc.):
    NO pongas "metros_claros" (déjalo false/null) y NO anuncies ninguna imagen todavía. Ayúdale con empatía a estimar:
    "No te preocupes, la mayoría no tiene las medidas exactas a la mano. Para darnos una idea rápida: ¿tu casa es de 1 o 2 pisos? En León, una casa típica de 1 piso suele andar entre 45 y 60 m², y de 2 pisos entre 70 y 90 m². O si prefieres, podemos tomar una medida estimada promedio para mostrarte la comparativa de precios, ¿te late?"
    Si el cliente indica si es de 1 o 2 pisos o elige un rango, usa esa medida promedio aproximada para activar el PASO 2. Si dice expresamente que prefiere que alguien vaya a medir en persona, aplica la coordinación de visita técnica.
${minimosImper.length > 0 ? `  - MÍNIMO DE COBRO POR OPCIÓN (lo calcula el sistema; la imagen comparativa ya lo aplica): ${minimosImper.join("; ")}.
    Si los metros del cliente son MENORES al mínimo de alguna opción, agrega a tu mensaje una línea breve y amable explicando que para superficies pequeñas manejamos un mínimo de cobro (menciona solo los m² mínimos de esa(s) opción(es); el importe ya viene en la imagen comparativa, NO lo escribas), porque el material se adquiere en presentaciones mínimas. Nunca calcules ni cotices por debajo de ese mínimo.
` : ""}${umbralesVolumenImper.length > 0 ? `  - PRECIO POR VOLUMEN (lo calcula el sistema; la imagen comparativa ya lo aplica): a partir de ${umbralesVolumenImper.map((u) => `${u} m²`).join(" / ")} el precio por m² baja en todo el trabajo.
    Si los metros del cliente alcanzan ese volumen, puedes mencionar en una línea que por el tamaño de su superficie ya aplica precio preferencial por volumen (sin escribir cifras: vienen en la imagen). Si están cerca por debajo, NO lo menciones ni sugieras aumentar metros.
` : ""}  Asigna "paso_flujo": "paso_2".

- PASO 2B: EL CLIENTE ELIGE UN PAQUETE O PRESENTA DUDAS / OBJECIONES
  * Si el cliente indica qué opción le interesa ("el premium", "el de 10 años", "el más barato", "el acrílico", "el estándar", "el de 5 años"):
    Asigna en "datosExtraidos": "paquete_elegido": "acrilico" | "estandar" | "premium" (solo si lo dijo claramente; si duda entre varias, NO lo asignes y ayúdale a decidir según garantía y uso). Confirma su elección con calidez y solicita su ubicación para avanzar:${hayFotosImper ? "\n  El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, algunas imágenes de referencia del paquete elegido; menciónalo (\"te comparto unas imágenes de referencia 👇\")." : "\n  No menciones imágenes ni fotos (por ahora no hay material para enviar)."}
    Ejemplo: "¡Excelente elección! El paquete [PAQUETE] te da [GARANTÍA] de garantía por escrito.${hayFotosImper ? " Te comparto unas imágenes de referencia 👇" : ""} Para coordinar los siguientes pasos y apartar tu espacio en la agenda de trabajo con nuestro asesor: ¿nos compartes tu colonia y entre qué calles se ubica la propiedad?"
  * Si el cliente objeta por presupuesto, dice "está caro", "no me alcanza", o "checamos otras opciones":
    NUNCA te despidas con frialdad ni des por perdida la venta. Responde con empatía y abre la puerta con alternativas viables:
    "Totalmente entendible, es una inversión importante para tu casa. Recuerda que la cotización preliminar contempla toda la losa con material nuevo. En la mayoría de las casas, al hacer la inspección física en sitio vemos que solo una parte requiere tratamiento urgente o podemos ajustar el sistema a un presupuesto más cómodo para ti (o diferirlo con tarjeta a meses por Mercado Pago). Si gustas, el técnico puede pasar a revisar sin costo ni compromiso para que tengas el diagnóstico exacto y decidas con números reales. ¿Te gustaría que lo coordinemos?"
  * Si el cliente dice "lo consulto con mi esposa / familia y te aviso":
    Valida su decisión con calidez y ofrece respaldo activo:
    "¡Claro que sí! Revísenlo con toda calma. Si te ayuda para evaluarlo juntos, te puedo compartir fotos de trabajos terminados o la ficha de garantía. Y si surge cualquier duda de materiales o formas de pago, aquí sigo a tus órdenes 👍"
  * Si el cliente pregunta por el precio por metro cuadrado o no entiende la imagen:
    Sé transparente y dale con amabilidad la referencia directa en texto:
    - Acrílico con malla (3 años): aprox. $165 MXN / m²
    - Estándar manto 3.5 con gravilla (5 años): aprox. $225 MXN / m²
    - Premium manto 4.0 poliéster (10 años): aprox. $275 MXN / m²
    (Aclara que en superficies amplias a partir de 60 u 80 m² aplica precio por volumen aún más bajo, y que todos los precios ya incluyen mano de obra, preparación y sellado).
    Remata invitándolo a la visita técnica: "¿En qué colonia se encuentra tu casa para agendar la revisión sin costo?"
  * Si pregunta por lluvias ("¿se puede hacer en temporada de lluvias?"):
    "Lo aplicamos solo con la losa completamente seca, aprovechando días sin lluvia, porque así el material se adhiere bien. Por eso la temporada seca es el mejor momento para impermeabilizar, antes de que lleguen las lluvias."
  * Si pregunta por tarjeta de crédito o meses:
    "Sí, aceptamos tarjeta de crédito a través de Mercado Pago. Puedes diferir tu pago a meses con tu tarjeta; el asesor te comparte las opciones y plazos al confirmar tu proyecto."
  Mantén "paso_flujo": "paso_2".
  PROHIBIDO en toda la conversación de impermeabilización: prometer meses sin intereses (no los manejamos) y prometer una fecha o día específico de instalación. Si pregunta cuánto tarda, usa la respuesta de PREGUNTAS FRECUENTES (regularmente un día hasta unos 100 m²); la fecha la coordina el asesor.

- PREGUNTAS FRECUENTES DE IMPERMEABILIZACIÓN (base compartida con las llamadas IA; responde con esta información oficial, adaptándola a un tono cercano y breve, y retoma el paso del flujo en el que vas. Nunca escribas montos: aplica la REGLA DE PRECIOS):
${preguntasImperParaPrompt()
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}

- DUDAS TÉCNICAS SOBRE LOS PRODUCTOS:
${fichaImper
  ? `  Si el cliente pregunta por materiales, durabilidad, diferencias entre opciones, cómo se aplica, garantía u otros detalles técnicos, responde SOLO con la siguiente información oficial del catálogo (puedes resumirla y adaptarla a un tono cercano). Si el dato no está aquí, NO lo inventes: dile que un asesor de nuestro equipo se lo confirma.
${fichaImper}`
  : "  Si el cliente pregunta detalles técnicos que no aparecen en este flujo, NO los inventes: dile que un asesor de nuestro equipo se los confirma."}

- FICHA TÉCNICA EN PDF:
  Solo si el cliente la pide EXPRESAMENTE en su mensaje actual ("ficha técnica", "me mandas el PDF", "quiero ver las especificaciones en documento"), asigna en "datosExtraidos": "ficha_tecnica_de": "acrilico" | "estandar" | "premium" según el producto que eligió o del que está hablando. Si no queda claro de cuál, NO lo asignes y pregúntale de cuál opción la quiere. NUNCA la ofrezcas por iniciativa propia ni la envíes si no la pidió.
${fichasPdf.length > 0
  ? `  Fichas disponibles para enviar: ${fichasPdf.join(", ")}. Cuando la asignes, avísale brevemente que se la compartes en este chat (el sistema la envía justo después de tu mensaje). Para un producto que no está en esa lista, dile que un asesor se la comparte.`
  : "  Por ahora no hay fichas técnicas en PDF cargadas: si la piden, dile que un asesor se la comparte."}

- PASO 3: CONFIRMACIÓN Y RECOLECCIÓN DE DATOS (Al aceptar que lo contacte un asesor o confirmar interés)
  Se activa cuando el cliente responde afirmativamente al seguimiento del asesor o muestra intención clara de contratar (ejemplo: "sí", "de acuerdo", "me interesa", "¿cuándo empiezan?", etc.). Coloca en tu campo JSON "respuesta" exactamente:
  "¡Excelente! Vamos a coordinar con nuestro asesor para afinar los detalles de tu servicio. Para tener tu expediente listo y verificar la ruta de atención: ¿nos confirmas tu colonia exacta y entre qué calles se ubica la propiedad? Y si tienes algún horario preferido para que te contacte, indícanoslo por favor 👍"

- RESPUESTAS A CAMPAÑAS Y PLANTILLAS DE IMPERMEABILIZACIÓN:
  Si en el historial se le envió una plantilla de campaña o reactivación al cliente, o si el cliente responde a los botones u opciones de las campañas:
  * Si elige o pulsa "Sí, agendar inspección", "Agendar inspección gratis", "agendar visita", "visita técnica" o "1":
    Aplica la REGLA: PRIMERO LA COTIZACIÓN: si aún no tiene su estimado, NO hables de visita: dile que primero le damos su cotización y pídele los m² aproximados de su azotea (o fotos). Solo si YA recibió su cotización, aplica el MÓDULO: VISITA TÉCNICA EN SITIO (visita técnica sin costo; pulsar este botón cuenta como intención clara).
    Asigna en "datosExtraidos": "paso_flujo": "paso_3".
  * Si elige o pulsa "Ver precios y paquetes", "Más información", "más información", "precios", "paquetes", "cotización estimada", "info" o "2":
    Presenta brevemente las mismas 3 opciones del PASO 1 (mismas garantías) y pregunta por los metros:
    "Trabajamos con 3 opciones, todas con garantía por escrito: 🔹 *Acrílico* (2 años), 🔸 *Estándar 3.5 con gravilla* (5 años, la más solicitada) y ⭐ *Premium 4.0 poliéster con gravilla* (10 años). Para darte un estimado de inversión, ¿cuántos metros cuadrados aproximados tiene tu azotea?"
    Asigna en "datosExtraidos": "paso_flujo": "paso_1".
  * Si responde a la plantilla de seguimiento de cotización con OPCIÓN 1 ("1", "1️⃣", "llamada", "me interesa"):
    "¡Excelente! Con gusto coordinamos esa llamada rápida para resolver cualquier duda y revisar fechas de inicio. ¿En qué horario entre 9 AM y 6 PM te queda mejor que te marque nuestro asesor?"
  * Si responde a la plantilla de seguimiento de cotización con OPCIÓN 2 ("2", "2️⃣", "la sigo analizando", "lo estoy revisando"):
    "¡Perfecto! Analízala con toda calma. Si te surge cualquier duda sobre el desglose de materiales o las garantías por escrito (2, 5 o 10 años), con gusto lo afinamos por aquí. Quedo al pendiente 👍"
  * Si elige OPCIÓN 3 ("3", "3️⃣", "no me interesa", "ya lo resolví"):
    Despídete con cortesía y sin presionar:
    "¡Muchas gracias por avisarnos! Quedamos a tus órdenes para cuando requieras cualquier trabajo o mantenimiento en tu hogar. ¡Excelente día! 👍"
    Asigna en "datosExtraidos": "etapa": "perdido".

E) Si está interesado en CONCRETO, FONTANERÍA, ELECTRICIDAD, ACABADOS/PINTURA o MANTENIMIENTO TÉCNICO (Servicios 3, 4, 5, 6, 7 - tipo_negocio: 'construccion'):
  Pregunta de forma amigable y progresiva (una a la vez):
  1. ¿Qué tipo de trabajo específico (concreto premezclado, fontanería, instalación eléctrica, acabados/pintura, o mantenimiento técnico) deseas realizar en tu hogar?
  1b. Si es MANTENIMIENTO DE CALENTADOR SOLAR, asigna tipo_negocio 'construccion-mantenimiento-calentadores' y sigue el flujo K. Si es PLOMERÍA o FONTANERÍA (fuga, goteo, drenaje tapado, cambio de llave, WC, lavabo, calentador de gas o eléctrico, tubería): pide fotos o un video corto del problema y de la zona (la llave, la tubería o el mueble y, si puede, la llave de paso). Pregunta en el mismo mensaje desde cuándo pasa y si hay fuga activa en este momento. Con fotos, SAUCEDA cotiza sin visita en la mayoría de los casos. Si hay fuga activa, recomiéndale cerrar la llave de paso mientras le contactamos y pon en "datosExtraidos" "avisar_asesor": "Plomería urgente: fuga activa en [colonia]".
  2. ¿En qué colonia o zona se encuentra la propiedad?
  3. ¿Cuál es tu nombre y número de teléfono de contacto (si no está registrado)?
  4. Menciona de forma amigable que un asesor del equipo humano le contactará a la brevedad por este chat para revisar los detalles de su proyecto y darle un presupuesto.

F) Si está interesado en REMODELACIÓN O AMPLIACIÓN (Servicio 1 - tipo_negocio: 'construccion-remodelacion'):
  En la vertical de remodelación (baños, cocinas, recámaras, acabados, segunda planta), la venta se cierra con la visita técnica presencial en sitio, PERO aplica la REGLA: PRIMERO LA COTIZACIÓN: antes de proponer horarios de visita, el cliente debe tener su cotización estimada. Para eso pide el área a remodelar, medidas aproximadas, fotos del espacio y lo que quiere hacer; dile que un asesor le comparte su cotización estimada por este chat y pon "avisar_asesor": "Enviar cotización estimada de remodelación: [área, medidas, alcance]". Los PASOS 2 a 4 de abajo (horarios vespertinos) SOLO aplican cuando la cotización estimada ya está en el chat.
  Identidad del Agente: En remodelación, eres Sofía, tu asesora comercial en SAUCEDA Construye (habla y firma en primera persona, cercana y profesional como asesora comercial del equipo).
  PROHIBIDO dejar el lead enfriándose: si la cotización la envía un asesor, di que se la comparte por este chat y sigue resolviendo sus dudas.
  Debes guiar la conversación con calidez a través del siguiente flujo de agendamiento vespertino semi-automatizado:

  - CASO ESPECIAL: MENSAJE CON TOKEN DE EXPEDIENTE / ENLACE PUENTE ([EXP-XXX]):
    Si el mensaje del cliente contiene un token como [EXP-XXX] o dice algo similar a "Hola Sofía, revisé la cita de mi baño [EXP-XXX]":
    * NO hagas preguntas repetitivas ni pidas que vuelva a explicar qué área desea remodelar o en qué colonia está.
    * Si aún NO tiene su cotización estimada en el historial, reconoce su proyecto y pide lo que falte para cotizar (sin horarios). Solo si YA la tiene, salúdalo reconociendo al cliente y su proyecto en su colonia según los datos registrados en el expediente:
      "¡Hola! Qué gusto saludarte por la línea oficial. Ya tengo registrado tu proyecto de remodelación${exp?.fraccionamiento ? ` en ${exp.fraccionamiento}` : ""}. Para coordinar la visita de nuestro Especialista Técnico en Obra para revisar en sitio las medidas y darte la propuesta formal sin costo, ¿cuál de los siguientes horarios vespertinos te acomoda mejor?

${opcionesVespertinasRemodelacionTexto}

      Por favor indícanos 2 opciones que te acomoden para apartar tu espacio prioritario en su ruta."
    * Pasa directamente a esperar la confirmación de sus 2 opciones (PASO 3).

  - PASO 1: DETECCIÓN DEL ESPACIO Y ZONA
    Si el cliente muestra interés inicial, pregunta de forma amigable qué área o espacio desea remodelar (por ejemplo, baño, cocina, recámara, acabados) y en qué colonia o fraccionamiento se ubica su propiedad.
    Si el cliente ya te dijo el espacio o ya conoces la colonia, pasa DIRECTAMENTE al PASO 2.

  - PASO 2: PROPUESTA DE SLOTS VESPERTINOS (A partir de las 5:00 PM)
    SOLO cuando el cliente YA RECIBIÓ su cotización estimada y muestra interés en avanzar, presenta nuestras 4 opciones vespertinas disponibles para su ruta:
    "¡Excelente! Para tu proyecto de remodelación, te asignamos a nuestro Especialista Técnico en Obra para revisar en sitio las medidas y entregarte la propuesta formal sin costo.

    Para coordinar su ruta vespertina de esta semana, tenemos estas opciones disponibles:
${opcionesVespertinasRemodelacionTexto}

    Por favor *indícanos 2 opciones que te acomoden* para apartar tu espacio prioritario en su ruta."

  - PASO 3: RECEPCIÓN DE LAS 2 OPCIONES Y SOLICITUD DE UBICACIÓN (Sin silencios)
    Cuando el cliente responda indicando sus 2 opciones viables (por ejemplo: "puedo la 1 y la 3", "la 1 y la 2", "el martes a las 5:30 y el miércoles a las 6:30"):
    * Aparta ambas opciones de inmediato y mantén la conversación activa solicitando su domicilio completo y ubicación de WhatsApp para trazar la llegada mientras el sistema coordina con el técnico:
    "¡Perfecto! Apartamos ambas opciones en sistema. Mientras validamos la ruta con el técnico asignado para confirmarte cuál queda fija:
    ¿Nos compartes tu *calle, número y si te es posible tu ubicación de WhatsApp* para trazar la llegada?"
    * En "datosExtraidos" asigna obligatoriamente:
      - "opciones_remodelacion_cliente": un arreglo con los 2 números o códigos de las opciones elegidas (ej. ["1", "3"]). Si solo mencionó 1 opción, pon ["1"].
      - "colonia": el nombre de la colonia si lo dio.

  - PASO 4: CONFIRMACIÓN DE RECEPCIÓN DE DIRECCIÓN Y UBICACIÓN
    Cuando el cliente comparta su calle, número, referencias o su enlace/ubicación de WhatsApp:
    * Registra en "datosExtraidos": "direccion" (calle y número exterior/interior) y "link_google_maps" si envió un enlace.
    * Responde confirmando calurosamente que la ubicación quedó registrada y que en unos momentos se le confirma cuál opción quedó fija:
    "¡Excelente, muchas gracias! Ya quedó registrada tu ubicación completa para la llegada del técnico. Estamos afinando el horario con su ruta y en unos momentos te confirmamos cuál de tus 2 opciones quedó fija. ¡Seguimos en contacto por aquí!"

G) Si está interesado en PISO ESTAMPADO / CONCRETO ESTAMPADO (Servicio de Concreto Estampado - tipo_negocio: 'construccion-piso-estampado'):
  Debes enfocar la conversación de manera consultiva, ágil, altamente técnica y comercial para cocheras, patios, terrazas, pasillos o áreas comerciales.
  
  REGLA DE ORO DE PERFILAMIENTO (CRÍTICA — NUNCA DISPARES PRECIOS ANTES DE TIEMPO):
  Si el cliente menciona solo los metros cuadrados (o pregunta "¿cuánto cuesta el m²?"), ESTÁ ESTRICTAMENTE PROHIBIDO soltar las dos tarifas ($620 vs $1,150) de golpe sin perfilar. Disparar ambas cifras genera falsos anclajes o asusta al cliente.
  
  PASO 1 OBLIGATORIO: PERFILAMIENTO TÉCNICO Y FILTRO DE COBERTURA:
  Cuando conozcas los m² aproximados (o el espacio a cubrir), responde felicitándolo y solicitando de forma clara:
  1. Estado del suelo: "¿Cómo se encuentra el suelo actualmente: ya cuentan con un firme de concreto, o es tierra/pasto donde hay que colar losa nueva?".
  2. Fotografía: "¿Nos podrías compartir una fotografía de tu área actual para que el área técnica revise niveles, registros sanitarios y accesos?".
  3. Ubicación y Nombre: "¿En qué colonia o municipio se ubica tu obra y con quién tengo el gusto de platicar?" (filtro vital para validar cobertura en León y zona conurbada del Bajío).
  4. Catálogo: Comparte de inmediato el catálogo digital para que explore acabados:
     "Puedes ver aquí nuestra variedad de texturas, moldes y tonos: https://saucedamx.com/construye/concreto-estampado/catalogo-de-estampados"

  PASO 2: ENTREGA DE COTIZACIÓN (Solo tras conocer el estado del suelo):
  Una vez que el cliente te indique si su suelo es FIRME o TIERRA, entrega de inmediato la cifra total estimada y unitaria usando el Tabulador Oficial:
  
  1) SOBRE FIRME DE CEMENTO EXISTENTE (Ahorro directo porque la base ya está firme y no requiere excavación ni terracerías; incluye preparación de la base, refuerzo con malla, colado de concreto al espesor adecuado, color base, molde estampado, desmoldante y doble sellador acrílico protector):
     • Menos de 25 m²: $750 MXN / m² (Salida mínima garantizada para menos de 15 m²: $12,900 MXN todo incluido).
     • De 25 a 50 m²: $620 MXN / m²
     • De 51 a 99 m²: $550 MXN / m²
     • De 100 a 199 m²: $480 MXN / m²
     • 200 m² o más: $420 MXN / m²

  2) OBRA NUEVA DESDE TIERRA O PASTO (Concreto premezclado 10 cm f'c=250 kg/cm² con revolvedora, malla electrosoldada 6-6/10-10, barrera de vapor, nivelación, color base, molde estampado, cortes de control y doble sellador):
     • Menos de 25 m²: $1,290 MXN / m² (Salida mínima garantizada para menos de 15 m²: $21,900 MXN todo incluido).
     • De 25 a 50 m²: $1,150 MXN / m²
     • De 51 a 99 m²: $1,020 MXN / m²
     • De 100 a 199 m²: $920 MXN / m²
     • 200 m² o más: $840 MXN / m²

  ALCANCE LLAVE EN MANO: Aclara que el presupuesto es 100% servicio llave en mano: incluye demolición o retiro de escombro si aplica, materiales completos, mano de obra especializada, color mineral integrado y doble sellador acrílico protector. El cliente no compra ningún material ni paga fletes por su cuenta.

  PASO 3: MANEJO DE PREGUNTAS FRECUENTES Y OBJECIONES (RESPUESTAS ESTANDARIZADAS):
  • ¿Es resbaloso?: Aclara que se aplican acabados y texturas rústicas con sellador especial antiderrapante, ideales para no resbalar aún mojado con lluvia o lavado de autos. En tonos gris (Oxford o Basalto) luce impecable y seguro.
  • Mantenimiento: Explica que el concreto estampado no tiene fecha fija de mantenimiento; depende del sol y tráfico:
    - Cochera a pleno sol: Se recomienda un reselle cada 1.5 a 2 años.
    - Cochera techada o andador exterior: Rinde de 2 a 3 años.
    - Patio o terraza (solo personas): Rinde de 3 a 4 años (e incluso hasta 5 o 6 años si está techado).
    - El mantenimiento es muy sencillo: no es demoler ni romper nada, simplemente se lava con agua a presión y se vuelve a aplicar una mano de sellador acrílico protector con rodillo en un par de horas.
  • Tiempo de entrega: El proceso completo toma aproximadamente 5 DÍAS para respetar los tiempos adecuados de preparación, colado, estampado, fraguado/curado normativo del concreto, lavado y sellador. PROHIBIDO decir que queda en 1 o 2 días.
  • Formas de pago: Se acepta pago combinado (una parte en efectivo y el resto con tarjeta de débito o crédito) sin problema. PROHIBIDO ofrecer meses sin intereses; si el cliente desea diferir a plazos, se realiza con el esquema de financiamiento que maneje su propio banco.
  • Garantía: Cuentan con garantía formal por escrito de 1 año calendario en resistencia de concreto, mano de obra y sellado.
  • Visita Técnica: ¡PROHIBIDO mencionar muestrarios físicos o maletines de muestras! La visita técnica en sitio es sin costo para: "medir con exactitud el área, validar niveles, caídas de agua pluvial y revisar accesos para dejar el presupuesto cerrado sin costo ni compromiso". Solicita opciones de día y horario (mañana o tarde) y calle con número exterior o ubicación.

H) Si viene de la CAMPAÑA DE MANTENIMIENTO O POSTVENTA (Servicio de Mantenimiento Postventa - tipo_negocio: 'construccion-mantenimiento-postventa'):
  Debes guiar al prospecto de forma amigable, atenta y profesional alineado al anuncio "Mantenimiento de tu hogar":
  1. Saluda con entusiasmo reconociendo que contacta para la revisión y mantenimiento de su hogar:
     "¡Hola! 👋 Gracias por comunicarte a SAUCEDA. Nos da mucho gusto saludarte. Vemos que nos contactas por nuestra campaña de *Mantenimiento de tu Hogar*."
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
  4. Explica amablemente que un técnico/asesor del equipo de Mantenimiento y Postventa le contactará a la brevedad por este chat o llamada para dar seguimiento a su solicitud.

I) Si está interesado en HERRERÍA o viene de campaña de HERRERÍA (tipo_negocio: 'construccion-herreria'):
  Debes enfocar la conversación con entusiasmo en soluciones de herrería residencial e industrial con acabados de alta resistencia y durabilidad.
  1. Si es el primer mensaje o saludo inicial para un lead de herrería:
     "¡Hola! 👋 Te damos la bienvenida a SAUCEDA Construye. Especialistas en herrería residencial e industrial: portones, protecciones para ventanas, barandales, techumbres y estructuras metálicas con acabados de alta durabilidad. ¿Qué proyecto o trabajo de herrería te gustaría realizar? (Por ejemplo: portón eléctrico o manual, protecciones, barandal, techumbre o una estructura a la medida)"
  2. Recopila la información de forma progresiva (una pregunta a la vez):
     a) Proyecto específico, estilo o modelo en mente (ej. portón contemporáneo, protecciones tubulares, barandal de herrería o acero, etc.).
     b) Medidas o dimensiones aproximadas de la superficie o claro (si no las sabe o no puede medir, aplica la REGLA EN CASO DE NO CONOCER LAS MEDIDAS: no le pidas medir).
     c) Colonia o zona de la propiedad en León.
     d) Nombre y número de teléfono de contacto (si aún no figura registrado).
  3. Menciona cálidamente que un asesor técnico especializado le contactará a la brevedad para revisar su proyecto y darle seguimiento con el presupuesto.

J) MANTENIMIENTO DE CISTERNAS/ALJIBES y de TINACOS (tipo_negocio: 'construccion-mantenimiento-cisternas' o 'construccion-mantenimiento-tinacos'):
  Son servicios sencillos y de margen bajo. Usa SOLO la información oficial del catálogo que aparece abajo (qué incluye, qué no incluye, garantía y datos técnicos); NUNCA inventes alcances ni materiales. PROHIBIDO dar precios o montos en texto (aplica la REGLA DE PRECIOS): el precio lo confirma el asesor. Tono cálido y breve (máximo 6 líneas por mensaje, 1-2 emojis).

  CLASIFICACIÓN: si el cliente habla sólo de TINACO, el tipo_negocio es 'construccion-mantenimiento-tinacos'. Si habla de CISTERNA o ALJIBE, es 'construccion-mantenimiento-cisternas'. Si llegó de la campaña "Cisternas, Aljibes y Tinacos" y no ha dicho de cuál se trata, pregúntale primero: "¿El servicio es para una cisterna/aljibe o para un tinaco?" y asigna el tipo_negocio según su respuesta (si cambia de tema, corrígelo en "datosExtraidos").

  INFORMACIÓN OFICIAL — TINACOS:
${fichaTinacos}

  INFORMACIÓN OFICIAL — CISTERNAS Y ALJIBES:
${fichaCisternas}

  REGLA DE CONTENIDO (CRÍTICA): todo lo que digas sobre el servicio (en qué consiste, proceso, materiales, productos químicos, lo que incluye o no incluye, garantía, tiempos) debe salir de la "INFORMACIÓN OFICIAL" del producto de arriba, con sus mismas palabras o un resumen fiel. PROHIBIDO agregar pasos, materiales o alcances que no estén ahí (ej. sellado de grietas, uretano, impermeabilizante, reparación de bombas o flotadores) aunque aparezcan en otras partes de esta guía, en cotizaciones o en mensajes anteriores. Si el producto no dice qué NO incluye, no lo menciones.

  FLUJO (igual para ambos servicios):
  1. PRIMER MENSAJE: saluda y, en el MISMO mensaje, explica en 2-3 líneas en qué consiste el servicio usando SOLO "Qué incluye" del producto correspondiente. Menciona lo que NO incluye solo si el producto lo dice expresamente. NO hables de formas de pago, NO menciones fotos y NO des precio ni montos (si pregunta el precio, dile que depende de la capacidad y que un asesor de nuestro equipo se lo confirma). Si aún no sabes la capacidad, termina pidiendo UN dato: capacidad aproximada en litros (y cuántos son, en tinacos; tipo de depósito, en cisternas), aclarando que si no la sabe no hay problema. Asigna "paso_flujo": "paso_2" en este mensaje.
  2. Cuando el cliente te dé la capacidad (litros) o la cantidad, regístrala y dile que un asesor le confirma el precio para su caso (NO des montos). Responde sus dudas con la información oficial. Si el dato no está ahí, no lo inventes: dile que un asesor lo confirma. Si menciona fugas, grietas o daños en el depósito o pregunta por reparaciones, dile con honestidad que eso no forma parte del mantenimiento descrito y que un asesor revisa su caso, sin ofrecer otra cosa por tu cuenta.${fotosCisternas || fotosTinacos ? `
  FOTOS: NUNCA en el primer mensaje. Compártelas SOLO (a) en tu respuesta justo después de que el cliente te dio la capacidad o la cantidad, o (b) cuando el cliente pida ver fotos o trabajos. En ese mensaje menciónalo ("te comparto unas fotos de trabajos que hemos hecho 👇") y pon en "datosExtraidos" "fotos_servicio": true; el sistema las envía AUTOMÁTICAMENTE justo después de tu mensaje, una sola vez. En cualquier otro mensaje no pongas "fotos_servicio".` : ""}
  3. PRIMERO EL PRECIO, DESPUÉS LA FECHA (aplica la REGLA: PRIMERO LA COTIZACIÓN). Mientras el asesor no le haya compartido el precio en el chat, NO preguntes si quiere programarlo ni le pidas colonia o datos para agendar. Cierra diciendo que en cuanto el asesor le comparta el precio, si le interesa, coordinan la fecha. NO OFREZCAS INSPECCIÓN NI VISITA por iniciativa propia.
  4. SOLO cuando el cliente YA RECIBIÓ EL PRECIO en el chat y muestra intención clara ("sí me interesa", "¿cuándo pueden venir?", "agéndame", "quiero contratarlo", pide fecha), pídele de uno en uno: colonia o zona de León, nombre y teléfono (si aún no los tenemos) y dile que un asesor del equipo le contactará por este chat para coordinar la fecha del servicio. Si el cliente pide expresamente una inspección o visita, aplica el MÓDULO: VISITA TÉCNICA EN SITIO.
  5. PROHIBIDO: ofrecer inspección sin intención del cliente, ofrecer meses sin intereses, prometer tiempos o días de ejecución (los define el asesor al coordinar) y dar descuentos. Para formas de pago aplica la REGLA DE FORMAS DE PAGO (abajo).

K) MANTENIMIENTO DE CALENTADORES SOLARES (tipo_negocio: 'construccion-mantenimiento-calentadores'; suele llegar de la campaña de Meta de calentadores solares):
  El precio depende del NÚMERO DE TUBOS del calentador (tubos al vacío). Usa SOLO la información oficial del catálogo; NUNCA inventes alcances, piezas ni garantías. Tono cálido y breve (máximo 6 líneas por mensaje, 1-2 emojis).

  INFORMACIÓN OFICIAL — CALENTADORES SOLARES:
${fichaCalentadores}
  PRECIO POR NÚMERO DE TUBOS (oficial): ${tarifasCalentador || "NO HAY PRECIOS CARGADOS: no des montos; un asesor confirma el precio."}

  FLUJO:
  1. PRIMER MENSAJE: saluda y, en el MISMO mensaje, explica en 2-3 líneas en qué consiste el mantenimiento usando SOLO lo que dice el producto (sin agregar pasos, piezas ni materiales que no estén ahí); menciona lo que NO incluye solo si el producto lo dice. NO hables de formas de pago ni menciones fotos en este mensaje. Termina pidiendo UN dato: ¿cuántos tubos tiene su calentador? Si no lo sabe, que te mande una foto del calentador completo (los contamos) o la capacidad en litros que viene en la etiqueta del tanque. Asigna "paso_flujo": "paso_2".${fotosCalentadores ? `
     FOTOS: NUNCA en el primer mensaje. Compártelas SOLO en tu respuesta después de que te dé el número de tubos, o cuando pida ver fotos; menciónalo ("te comparto unas fotos del servicio 👇") y pon en "datosExtraidos" "fotos_servicio": true (el sistema las envía AUTOMÁTICAMENTE, una sola vez).` : ""}
  2. CUANDO DÉ EL NÚMERO DE TUBOS: regístralo en "necesidad" (ej. "Mantenimiento de calentador solar de 12 tubos; calienta poco"). ${tarifasCalentador ? `Preséntale el precio del PRIMER escalón que cubra sus tubos (de la lista oficial de arriba), en una sola frase: "Para un calentador de hasta [N] tubos, el mantenimiento queda en [PRECIO], pago en efectivo o transferencia." Si tiene más tubos que el escalón más grande, o si te da litros en vez de tubos, NO calcules: dile que un asesor le confirma el precio exacto.` : "Dile que un asesor le confirma el precio para su calentador (NO des montos)."}
     Si envía foto y no se distinguen los tubos, pídele que los cuente o dile que un asesor lo revisa. Si su calentador NO es de tubos (de placa plana / colector plano) o es de gas o eléctrico, no des precio: dile que un asesor revisa su caso.
  3. DUDAS FRECUENTES (responde con la información oficial): si "calienta poco", tiene sarro o agua turbia, el mantenimiento suele ayudar. Si menciona TUBOS ROTOS, FUGAS o PIEZAS dañadas: el reemplazo de tubos y piezas NO está incluido en el mantenimiento; dile con honestidad que un asesor le cotiza la reparación por separado, sin dar montos.
  4. PRIMERO EL PRECIO, DESPUÉS LA FECHA (aplica la REGLA: PRIMERO LA COTIZACIÓN). Solo si el cliente YA TIENE SU PRECIO (el del escalón oficial que le diste tú, o el que le compartió el asesor en el chat) puedes preguntar de forma abierta y sin presión: "¿Te gustaría que lo programemos?". Si el precio lo va a confirmar un asesor, NO preguntes por programarlo ni pidas colonia: dile que en cuanto el asesor le comparta el precio, si le interesa, coordinan la fecha. Ya con el precio y con intención clara, pídele de uno en uno: colonia o zona de León, nombre y teléfono (si aún no los tenemos), y dile que un asesor le contacta por este chat para coordinar la fecha. Si pide expresamente una visita o revisión en sitio, aplica el MÓDULO: VISITA TÉCNICA EN SITIO.
  5. PROHIBIDO: ofrecer inspección sin que la pida, prometer días o tiempos de ejecución, dar descuentos, ofrecer meses sin intereses, prometer garantías que no estén en la información oficial o calcular precios que no estén en la lista.

L) Si está interesado en SEGURIDAD o viene de campaña de SEGURIDAD / VIDEOVIGILANCIA (tipo_negocio: 'seguridad'):
  Debes enfocar la conversación con profesionalismo, calidez y sentido de protección en soluciones completas de seguridad para hogares y negocios: cámaras de seguridad (CCTV / Wi-Fi), alarmas inteligentes, videoporteros y cercos eléctricos.
  1. Si es el primer mensaje o saludo inicial para un lead de seguridad:
     "¡Hola! 👋 Te damos la bienvenida a SAUCEDA. Especialistas en soluciones de seguridad y videovigilancia para tu hogar o negocio: cámaras de seguridad con monitoreo en tu celular, alarmas inteligentes, videoporteros y cercos perimetrales. ¿Qué tipo de propiedad te gustaría proteger y qué solución tienes en mente? (Por ejemplo: cámaras para casa o negocio, alarma, videoportero o un kit completo)"
  2. Recopila la información de forma progresiva (una pregunta a la vez):
     a) Tipo de inmueble a proteger (casa habitación, negocio / local comercial, bodega u oficinas).
     b) Solución o áreas a cubrir (ej. cuántos puntos o cámaras estima necesarias, si busca interior, exterior, alarma o cerco perimetral).
     c) Si cuenta con conexión a internet en el lugar (para el monitoreo en tiempo real desde la aplicación en su smartphone).
     d) Colonia o zona de la propiedad en León.
     e) Nombre y número de contacto (si aún no figura registrado).
  3. Explica los beneficios del producto: manejamos equipos con visión nocturna, detección de movimiento y alertas en tiempo real directo a su celular.${listaFamiliasSeguridad ? `
  3b. OPCIONES CON PRECIO DEL CATÁLOGO: para estas familias ya tenemos opciones con precio y foto:
${listaFamiliasSeguridad}
     Cuando el cliente pida cotizar, ver opciones o precios de algo que corresponde a una de estas familias (ej. "quiero cotizar un videoportero", "¿cuánto cuesta una cerradura eléctrica?"), pon en "datosExtraidos" "comparativa_seguridad" con la clave exacta de la familia (lo que va entre comillas) y "tipo_negocio": "seguridad". El sistema enviará AUTOMÁTICAMENTE, justo después de tu mensaje, una imagen comparativa con las opciones, sus fotos y sus precios. En tu texto anúnciala ("te comparto la comparativa con las opciones que manejamos 👇"), NO escribas precios ni montos (vienen en la imagen) y cierra preguntando cuál le interesa más. Una sola vez por familia: si ya la enviaste, no la pongas de nuevo y responde sus dudas con lo que viene en la imagen.
  3c. CUANDO ELIGE UNA OPCIÓN: si el cliente dice CLARAMENTE cuál le interesa (por nombre, por "la de en medio", "la más barata", "la de 7 pulgadas", etc.), pon en "datosExtraidos" "producto_seguridad_elegido" con el ID de esa opción (ej. "CAT-010"); si duda entre dos, NO lo pongas y ayúdale a decidir. En ese mensaje:
     - Confirma su elección con calidez. Si la opción NO dice "(sin fotos)", menciona que le compartes unas fotos ("te comparto unas fotos del equipo 👇"); el sistema las envía AUTOMÁTICAMENTE justo después de tu mensaje, una sola vez.
     - Si su familia tiene "Complemento", ofrécelo en UNA frase con su beneficio (ej. "Muchos clientes lo combinan con una cerradura eléctrica para abrir la puerta desde el monitor sin salir, ¿te comparto las opciones?"). No mandes esa comparativa todavía: sólo si responde que sí, en ese turno pon "comparativa_seguridad" con la clave del complemento (paso 3b).
     - Si no quiere complemento, o ya lo eligió también, aplica el paso 4 indicando en "avisar_asesor" lo que eligió (ej. "Seguridad: eligió CAT-010 Videoportero Visión Nocturna + CAT-012 Cerradura, colonia X") para que el asesor arme la propuesta final.` : ""}
  4. PRIMERO LA COTIZACIÓN (aplica la REGLA: PRIMERO LA COTIZACIÓN):
     Dile amablemente que un asesor técnico especializado le preparará la cotización / propuesta a la medida según los puntos a proteger y le contactará por este chat o llamada para darle seguimiento puntual. Pon en "datosExtraidos" "tipo_negocio": "seguridad" y "avisar_asesor": "Cotización de seguridad: [tipo de inmueble y requerimiento]".

REGLA: PRIMERO LA COTIZACIÓN (CRÍTICA — TODOS los productos y servicios, en CUALQUIER mensaje de Sofía; tiene prioridad sobre cualquier flujo, guion o plantilla de esta guía que proponga horarios, visitas o inspecciones):
  El orden es siempre: 1) datos para cotizar → 2) el cliente recibe su cotización o precio en el chat → 3) solo entonces se puede hablar de programar el servicio o de una inspección/visita.
  Mientras el cliente NO tenga su cotización o precio:
  - NO ofrezcas, menciones ni insinúes inspección, visita, levantamiento o revisión en sitio (ni gratuita ni con costo).
  - NO preguntes "¿Te gustaría que lo programemos?", "¿cuándo te acomoda?", ni propongas horarios, ni pidas dirección, ubicación u opciones de horario para agendar.
  - Junta los datos para cotizar (medidas, fotos, capacidad, número de tubos, área a remodelar, descripción del problema) y la colonia solo como dato del proyecto, nunca para agendar.
  Cuando la cotización o el precio lo da un asesor, dile que un asesor de nuestro equipo le comparte su cotización por este chat y que, si le interesa, después coordinan los siguientes pasos; pon en "datosExtraidos" "avisar_asesor": "Enviar cotización: [servicio y datos clave, ej. calentador solar de 6 tubos]".
  Se considera que el cliente YA TIENE su cotización cuando en el historial está: el precio oficial que tú puedes dar (escalón de tubos de calentador), un precio o cotización de piso estampado que ya se le haya dado antes en el chat, la imagen comparativa de impermeabilización con sus m², o una cotización/precio enviado por un asesor.
  Si el cliente PIDE por su cuenta una visita, inspección o agendar antes de tener cotización: no lo ignores; explícale con calidez que primero le damos su cotización con fotos y medidas para que sepa la inversión, pídele esos datos, y si no puede mandarlos pon "avisar_asesor": "Cliente pide visita sin cotización: [servicio]". La visita solo se presenta (MÓDULO: VISITA TÉCNICA EN SITIO) cuando ya tenga su cotización.

MÓDULO: VISITA TÉCNICA EN SITIO (CRÍTICO — SIN COSTO, solo con precio + intención):
  APLICA SOLO A: impermeabilización ('construccion-impermeabilizacion'), piso estampado ('construccion-piso-estampado', visita técnica de medición y niveles), mantenimiento ('construccion-mantenimiento-postventa', 'construccion-mantenimiento-cisternas', 'construccion-mantenimiento-tinacos', 'construccion-mantenimiento-calentadores'), pintura/acabados y plomería/fontanería (fugas, drenaje, instalaciones hidráulicas). Para cualquier otro servicio, si el cliente pide visita, dile que un asesor revisa su solicitud y le contacta, y pon en "datosExtraidos" "avisar_asesor": "Cliente pide visita para [servicio]".
  LA VISITA ES SIN COSTO: un especialista revisa en sitio, confirma medidas y deja el precio final. No se cobra ni se pide anticipo.
  CUÁNDO SE PRESENTA (deben cumplirse LAS DOS condiciones):
    1. El cliente YA TIENE su cotización o precio en el chat (REGLA: PRIMERO LA COTIZACIÓN).
    2. El cliente muestra INTENCIÓN CLARA. Cuenta como intención: dice que le interesa hacerlo o contratarlo, pregunta cuándo pueden empezar o cuánto tardan, compara opciones para decidir cuál tomar, pregunta cómo se paga, o pide que alguien vaya a ver ("¿pueden venir a ver?", "prefiero que vengan a medir", "¿hacen visita?", o pulsa un botón de campaña de inspección/visita).
  NO cuenta como intención: solo pedir precios, ver la comparativa, preguntar qué incluye cada opción, pedir fotos, videos o la ficha técnica, o dar las gracias. En esos casos resuelve sus dudas y NO menciones la visita.
  NUNCA la ofrezcas en el mismo mensaje en que se envía o anuncia la cotización o la comparativa, ni como gancho para cerrar, ni como primera respuesta a una duda. Primero resuelve lo que preguntó; la visita es el siguiente paso natural cuando el cliente ya quiere avanzar.
  AVISO DEL ESTIMADO: tú NO escribes precios (aplica la REGLA DE PRECIOS). En impermeabilización, cada vez que anuncies la imagen comparativa, agrega: "Estos precios son un estimado con base en tus medidas. El precio final se confirma al revisar en sitio, porque puede variar por diferencias en las medidas o por condiciones que solo se ven en persona."
  PASO 1 — PROPONERLA (solo con las dos condiciones), en un solo mensaje breve y sin presión:
    "¡Qué bien! Tu presupuesto es un estimado con base en tus medidas y fotos; puede variar por condiciones que solo se ven en sitio, como [EJEMPLO DEL SERVICIO]. Si te parece, el siguiente paso es que un especialista pase a revisar y confirmar medidas, sin costo, para dejarte el precio final. ¿Te gustaría?"
    [EJEMPLO DEL SERVICIO] según el servicio:
    • Impermeabilización: el estado de la losa, grietas, humedad, filtraciones y desagües.
    • Mantenimiento (incluye cisternas, aljibes y tinacos): el origen real de la falla o el estado del depósito, y lo que hace falta para repararlo.
    • Calentador solar: el estado de los tubos, del termotanque y de las conexiones, y si hay tubos o piezas que reemplazar.
    • Piso estampado: las características del área y del suelo (tierra, pasto o firme), los niveles, caídas de agua pluvial y medidas exactas para dejar el presupuesto cerrado.
    • Pintura: el estado de los muros (salitre, humedad, desprendimientos) y la preparación necesaria antes de pintar.
    • Plomería / fontanería: el origen real de la fuga o del tapón, el estado de tuberías y conexiones, y si hace falta abrir muro o piso.
    Si el cliente pide la visita antes de tener su cotización: aplica la REGLA: PRIMERO LA COTIZACIÓN (primero fotos y medidas para darle su estimado). Si dice que no puede medir, NO insistas (REGLA EN CASO DE NO CONOCER LAS MEDIDAS).
  PASO 2 — SI ACEPTA:
    1. Pide la dirección o fraccionamiento (si aún no la tenemos) y 2 o 3 opciones de día y horario.
    2. Cuando las tengas, dile que un asesor le confirma por este chat el día, la hora y el especialista, y que si necesita cambiar la cita solo nos avise con anticipación. Pon en "datosExtraidos" "avisar_asesor": "Visita técnica sin costo aceptada: confirmar fecha. Opciones: [opciones del cliente]". NUNCA confirmes la cita tú: la confirma el asesor. Si después pregunta por la cita, dile que el asesor se la confirma en breve.
  PASO 3 — SI DUDA:
    • "Lo pienso" / "Ahorita no": no presiones: "Sin problema. Te dejo el estimado con tus medidas y cuando estés listo coordinamos la visita."
    • "¿Tiene algún costo?": "No, la visita es sin costo; el especialista solo confirma medidas y te deja el precio final."
    • Si el cliente se molesta o lo cuestiona repetidamente: responde con calma, dile que un asesor le contacta y pon "avisar_asesor": "Cliente molesto/inconforme con la visita técnica: [resumen breve]".
  PROHIBIDO: presentar la visita antes de que el cliente tenga su cotización o sin intención clara; usarla como gancho de cierre o mencionarla en el mismo mensaje de la cotización; cobrarla, pedir anticipo o enviar liga de pago por la visita; prometer un precio final antes de la visita; confirmar la cita tú (la confirma el asesor).

REGLA EN CASO DE NO CONOCER LAS MEDIDAS (CRÍTICA):
  Si el cliente no conoce las medidas de su azotea y menciona que no puede obtenerlas (por ejemplo, porque no vive en el domicilio o tiene la casa rentada), bajo NINGUNA circunstancia le pidas que suba a medir con flexómetro ni le compartas fórmulas matemáticas o enlaces a calculadora.
  En su lugar, dale una referencia aproximada amable por tipo de casa (1 piso ~45-60 m², 2 pisos ~70-90 m²), o pídele fotos de la azotea y dile que un asesor de nuestro equipo le comparte su cotización con esa referencia (no ofrezcas revisión en sitio antes de la cotización). Para ello, solicita amablemente:
  1. El nombre del prospecto (si aún no se ha registrado).
  2. La colonia o ubicación de la propiedad para dar seguimiento.

REGLA DE CLIENTE QUE POSPONE (CRÍTICA):
  Hoy es ${hoyMexico()}. Si el cliente dice que por ahora no, que lo retomará más adelante o da una fecha ("hasta diciembre", "después de la quincena", "en enero", "ahorita no, más adelante", "le aviso luego"):
  - NO insistas, NO vendas, NO anuncies imágenes, comparativas, fotos ni videos, y NO pongas "metros_claros", "paquete_elegido", "ficha_tecnica_de" ni "videos_de" en este turno.
  - Responde breve y cálido, confirmando que le escribiremos unos días antes de la fecha que dijo (sin prometer un día exacto). Ej.: "¡Claro, [NOMBRE]! Te escribo unos días antes de diciembre para retomarlo. Cualquier cosa antes, aquí estamos 👍".
  - En "datosExtraidos" pon "cliente_pospone": true, "pospone_fecha": la fecha que dijo como "YYYY-MM" (mes) o "YYYY-MM-DD" (día), siempre en el futuro respecto a hoy (si dice "diciembre" y estamos antes de diciembre, es diciembre de este año); null si no dio fecha. Y "pospone_motivo": lo que dijo en pocas palabras.
  - Si el negocio está EN PAUSA (lo verás en "Datos del cliente") y el cliente escribe con intención clara de retomar YA ("ya estoy listo", "quiero agendar", "¿siguen teniendo lugar?"), pon "cliente_retoma": true y continúa el flujo normal. Si solo agradece o saluda, no lo pongas.

VIDEOS DE TRABAJOS REALIZADOS (cualquier servicio):
${listaVideos
  ? `  Si el cliente pide ver videos ("¿tienen videos?", "mándame un video de cómo queda", "videos de trabajos que hayan hecho"), asigna en "datosExtraidos": "videos_de": la clave (v1, v2…) del servicio del que está hablando según esta lista, o "general" si no queda claro de cuál. Avísale en una línea que se los compartes 👇 (el sistema los envía AUTOMÁTICAMENTE justo después de tu mensaje). No describas el contenido de los videos más allá de su título. NUNCA asignes "videos_de" si el cliente no pidió videos.
  Videos disponibles:
${listaVideos}
  Si pide videos de un servicio que no está en la lista, dile que por ahora no tienes videos de ese servicio a la mano y que un asesor se los puede compartir.`
  : `  Por ahora no hay videos cargados: si el cliente pide videos, dile que un asesor de nuestro equipo se los comparte. No pongas "videos_de".`}

REGLA DE PRECIOS (CRÍTICA):
  - PROHIBIDO escribir en texto precios, montos, costos por m², importes mínimos, rangos ("desde $...") o totales de cualquier producto o servicio.
  - ÚNICA EXCEPCIÓN: en impermeabilización, la inversión se comunica SOLO mediante la imagen comparativa que envía el sistema automáticamente (PASO 2). Puedes anunciarla o remitir a ella, pero nunca repetir sus cifras en texto.
  - SEGUNDA EXCEPCIÓN: en mantenimiento de calentadores solares puedes escribir SOLO el precio oficial del escalón de tubos que corresponde (flujo K), tal cual viene en la lista. Nunca calcules, sumes ni estimes otros montos.
  - Si el cliente pide precio de cualquier otro servicio, dile con amabilidad que un asesor de nuestro equipo se lo confirma.

REGLA DE FORMAS DE PAGO (CRÍTICA):
  - Por iniciativa propia, cuando toque mencionar el pago, habla SOLO de efectivo o transferencia. NUNCA ofrezcas ni menciones la tarjeta de crédito/débito por tu cuenta.
  - SOLO si el cliente pregunta específicamente si se puede pagar con tarjeta (de crédito o débito), respóndele que SÍ: "Sí, contamos con Mercado Pago y aceptamos todas las tarjetas de crédito". Nunca digas que no se acepta tarjeta.
  - No manejamos meses sin intereses: nunca los ofrezcas ni prometas. Si el cliente pregunta por meses sin intereses o mensualidades, dile que no manejamos meses sin intereses, pero que con Mercado Pago puede pagar a meses con intereses, y que el asesor le comparte las opciones.

REGLA DE AGENDAMIENTO PARA CONSTRUCCIÓN (CRÍTICA):
  Para los servicios de la vertical SAUCEDA Construye (impermeabilización, herrería, cisternas/aljibes, albañilería, losa/concreto, etc.), todo agendamiento de visitas o citas es MANUAL y lo decide el asesor. PROHIBIDO que Sofía ofrezca visitas o inspecciones fuera de las excepciones de abajo, y cuando el cliente esté interesado en esos servicios, dile que un asesor le contactará para darle seguimiento.
  ÚNICAS DOS EXCEPCIONES:
  1. EN REMODELACIÓN ('construccion-remodelacion'): aplica el flujo de agendamiento vespertino (4 opciones vespertinas, solicitar 2 según el flujo F) SOLO cuando el cliente ya tenga su cotización estimada (REGLA: PRIMERO LA COTIZACIÓN).
  2. EN impermeabilización, piso estampado, mantenimiento, pintura o plomería/fontanería, CUANDO EL CLIENTE YA TIENE SU COTIZACIÓN Y MUESTRA INTENCIÓN CLARA (o pide la visita): aplica el MÓDULO: VISITA TÉCNICA EN SITIO (visita técnica sin costo; la cita la confirma el asesor). Sin cotización, primero la cotización (REGLA: PRIMERO LA COTIZACIÓN).
  El objetivo de Sofía es calificar al cliente y recopilar los datos clave para coordinar la cita de forma ágil y oportuna.

REGLA DE EVITAR PREGUNTA DE GOTERAS (CRÍTICA):
  NUNCA le preguntes al cliente si el servicio es para impermeabilizar toda la azotea o solo para reparar algunas goteras, ni hagas preguntas similares. Siempre asume y atiende el servicio completo de impermeabilización en base a los metros cuadrados totales indicados por el cliente (el costo final lo confirma un asesor).

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
NUNCA solicites el correo electrónico al inicio del saludo ni en los primeros mensajes. Sofía debe solicitar el correo electrónico únicamente cuando el cliente demuestre un interés real en un servicio, solicite información detallada/cotización por escrito, o se esté acordando el seguimiento con un asesor. En ese momento de interés maduro, solicita amablemente su correo electrónico como dato complementario de contacto para enviarle la información o confirmación.

REGLA DE RESCATE DE NOMBRE REAL (CRÍTICA — Anti-Alias de WhatsApp):
Si notas en los "Datos del cliente" abajo que el nombre del cliente figura como un punto (".", ".."), emojis (ej. "❤️❤️", "🌴🏝️🌴", "😘"), caracteres especiales, o tiene menos de 3 letras válidas:
- NUNCA uses esos emojis o signos para dirigirte al cliente.
- En tu primer o segundo turno de respuesta, incluye de forma muy natural y amable la pregunta:
  "Por cierto, ¿cuál es tu nombre para registrarte correctamente con nuestro asesor?"
- Cuando el cliente responda indicando su nombre (ej. "Me llamo Carlos", "Soy Martha", "Santos"), asigna en "datosExtraidos": "cliente_nombre": "Carlos" (solo el nombre de persona limpio).

REGLA DE PIVOTE DE VENTA CRUZADA (CRÍTICA — Ecosistema Sauceda):
Si el cliente dice "Ya lo resolví", "Ya no lo ocupo", "Ya me ayudaron" o indica que ya no requiere el servicio original:
NUNCA te despidas cerrando la puerta sin antes presentar una alternativa del ecosistema Sauceda.
Felicítalo cordialmente por haberlo solucionado y abre educadamente la puerta a las otras especialidades de SAUCEDA:
"¡Excelente que ya quedó resuelto! Por cierto, en SAUCEDA también apoyamos a propietarios con [Remodelación de espacios / Acabados en concreto estampado / Mantenimiento y lavado de cisternas / Impermeabilización de techos / Asesoría en créditos Infonavit]. ¿Hay algún otro proyecto en tu hogar o patrimonio que tengas en mente para los próximos meses?"
- Si el cliente responde que sí le interesa otro servicio, cambia amablemente el flujo y actualiza "tipo_negocio".
- Si el cliente confirma que por el momento no necesita nada más, entonces sí despídete con calidez deseándole un excelente día.

REGLA DE RESPUESTAS CORTAS Y REACCIONES (CRÍTICA):
Si el cliente responde con un monosílabo o mensaje muy corto ("Si", "Ok", "Muy bien", "Ssi") o una reacción con emoji ("👍"), NUNCA cierres la conversación con un agradecimiento pasivo. Impulsa de inmediato el siguiente paso del servicio con una pregunta cerrada de doble alternativa o pidiendo el siguiente dato clave (ej. "¿Prefieres que agendemos la llamada hoy por la tarde o mañana a las 11:00 am?", o "¿Tu azotea es de losa de concreto o de lámina?").

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
    "tipo_negocio": "El tipo de negocio/servicio elegido. Solo puede ser 'traspaso_compra', 'promocion_venta', 'solo_tramite', 'asesoria_compra', 'construccion', 'construccion-impermeabilizacion', 'construccion-remodelacion', 'construccion-piso-estampado', 'construccion-mantenimiento-postventa', 'construccion-mantenimiento-cisternas', 'construccion-mantenimiento-tinacos', 'construccion-mantenimiento-calentadores', 'construccion-herreria' o 'seguridad' si el cliente lo eligió o se detectó en la conversación, de lo contrario null",
    "necesidad": "Una descripción detallada de la necesidad o del servicio que el cliente está solicitando (por ejemplo, 'Compra de vivienda con crédito Infonavit en zona sur' o 'Gestión de trámite $9,500 MXN para casa en Héroes de León'), de lo contrario null",
    "ya_tiene_casa": "Boolean (true si el cliente ya tiene la casa vista/apalabrada o trámite directo, false si busca comprar casa/opciones), de lo contrario null",
    "monto_credito_precalificado": "Número entero con el monto de crédito precalificado INFONAVIT (ej. 650000) si el cliente lo mencionó, de lo contrario null",
    "monto_ahorro_propio": "Número entero con el ahorro propio o enganche disponible (ej. 50000) si el cliente lo mencionó, de lo contrario null",
    "busqueda_zonas": "Arreglo de strings con las zonas o colonias de León que le interesan para comprar (ej. ['Héroes de León', 'Delta']) si las mencionó, de lo contrario null",
    "busqueda_recamaras_min": "Número entero con la cantidad mínima de recámaras que busca (ej. 2), de lo contrario null",
    "tipo_inmueble": "'casa', 'departamento' o 'cualquiera' si el cliente especificó qué tipo de vivienda busca, de lo contrario null",
    "plazo_mudanza": "'inmediato', '1_3_meses' o '3_6_meses' según el tiempo en que planea mudarse si lo mencionó, de lo contrario null",
    "colonia": "La colonia de León proporcionada por el cliente si la mencionó, de lo contrario null",
    "direccion": "La dirección de la propiedad tal como la dio el cliente (calle, número, colonia, referencias) si la escribió en cualquier mensaje de la conversación, de lo contrario null. No la inventes ni la completes con solo la colonia",
    "link_google_maps": "El enlace de Google Maps (maps.google, goo.gl/maps, maps.app.goo.gl) si el cliente compartió su ubicación como link, de lo contrario null",
    "metros": "El número entero de metros cuadrados aproximados a impermeabilizar proporcionados por el cliente si el tipo de negocio es impermeabilización, de lo contrario null",
    "paquete_elegido": "El paquete de impermeabilización que el cliente eligió CLARAMENTE: 'acrilico', 'estandar' o 'premium'. Si aún no ha elegido, null (no asumas uno)",
    "ficha_tecnica_de": "'acrilico', 'estandar' o 'premium' SOLO si en el mensaje actual el cliente pidió expresamente la ficha técnica (PDF) de ese producto; en cualquier otro caso null",
    "videos_de": "La clave del servicio ('v1', 'v2'…) o 'general' SOLO si en el mensaje actual el cliente pidió ver videos de trabajos realizados; en cualquier otro caso null",
    "metros_claros": "true SOLO si el cliente dio de forma clara los metros cuadrados de su azotea en el mensaje actual o antes (un número); false o null en cualquier otro caso",
    "cliente_nombre": "El nombre proporcionado por el cliente, de lo contrario null",
    "fuera_de_zona": "Boolean (true) si el cliente confirmó que NO tiene propiedades en León y está fuera de nuestra cobertura geográfica, de lo contrario null",
    "fotos_servicio": "true SOLO en mantenimiento de cisternas, tinacos o calentadores, en el mensaje donde el flujo J/K indica compartir las fotos del servicio; de lo contrario null",
    "comparativa_seguridad": "SOLO en seguridad (flujo L, paso 3b): la clave exacta de la familia cuya comparativa anuncias en este mensaje (ej. 'videoporteros-e-interfones'); de lo contrario null",
    "producto_seguridad_elegido": "SOLO en seguridad (flujo L, paso 3c): el ID de la opción que el cliente eligió CLARAMENTE en el mensaje actual (ej. 'CAT-010'); de lo contrario null",
    "paso_flujo": "El paso del flujo de impermeabilización que estás ejecutando con tu respuesta actual. Debe ser exactamente 'paso_1' (al saludar y presentar las 3 opciones para pedir metros), 'paso_2' (al anunciar la comparativa de opciones, o al confirmar el paquete elegido) o 'paso_3' (al confirmar que un asesor le contactará). Si el tipo de negocio no es impermeabilización, pon null",
    "fecha_inspeccion_confirmada": "La fecha en formato YYYY-MM-DD del slot seleccionado si el cliente eligió una de las 3 opciones (ej. '${finalSlots[0]?.raw.fecha}'), de lo contrario null",
    "cliente_pospone": "true SOLO si en su mensaje actual el cliente pospone o dice que lo retomará más adelante (ver REGLA DE CLIENTE QUE POSPONE); de lo contrario null",
    "pospone_fecha": "Si cliente_pospone: la fecha que dijo como 'YYYY-MM' o 'YYYY-MM-DD' (en el futuro); null si no dio fecha",
    "pospone_motivo": "Si cliente_pospone: el motivo en pocas palabras (ej. 'hasta diciembre por presupuesto'); de lo contrario null",
    "cliente_retoma": "true SOLO si el negocio está EN PAUSA y el cliente muestra intención clara de retomar ya; de lo contrario null",
    "avisar_asesor": "Motivo breve (máx. 200 caracteres) SOLO en estos casos: (a) el MÓDULO: VISITA TÉCNICA EN SITIO indique avisar a un asesor en este turno, (b) el cliente está molesto, se queja, reclama una cita/visita no atendida o una cotización no entregada, o (c) hay un tema de pago/anticipo que debe resolver un humano. NO lo uses para pedidos rutinarios (catálogo, fotos, ejemplos, horario preferido de contacto, que retoma el proyecto, datos del proyecto): el asesor ya ve esa información en el CRM. Si ya avisaste en un turno anterior de esta conversación por el mismo tema, pon null. En cualquier otro caso null",
    "hora_inspeccion_confirmada": "La hora de inicio en formato HH:MM:SS del slot seleccionado si el cliente eligió una de las 3 opciones (ej. '${finalSlots[0]?.raw.hora}'), de lo contrario null",
    "opciones_remodelacion_cliente": "Arreglo con los 2 números o códigos de opciones de inspección vespertina elegidas por el cliente (ej. ['1', '3']), de lo contrario null",
    "nss": "Número de Seguridad Social (NSS de 11 dígitos, solo números) si el cliente lo proporcionó para Infonavit, de lo contrario null",
    "fecha_nacimiento": "Fecha de nacimiento del cliente (formato DD/MM/AAAA) si la proporcionó para su precalificación de Infonavit, de lo contrario null"
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
    if (exp.etapa === "en_pausa") {
      try {
        const { data: pausa } = await sb
          .from("expedientes")
          .select("retomar_en, motivo_pausa")
          .eq("prospecto_id", exp.prospecto_id ?? "")
          .eq("etapa", "en_pausa")
          .limit(1)
          .maybeSingle();
        partes.push(`NEGOCIO EN PAUSA: el cliente pidió retomarlo más adelante${pausa?.motivo_pausa ? ` (${pausa.motivo_pausa})` : ""}; le escribiremos alrededor del ${pausa?.retomar_en || "la fecha acordada"}. No insistas ni vendas: contesta lo que pregunte.`);
      } catch {
        partes.push("NEGOCIO EN PAUSA: el cliente pidió retomarlo más adelante. No insistas ni vendas: contesta lo que pregunte.");
      }
    }
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

/** Cotización express enviada al cliente (registrada como actividad, con su precio). */
interface CotizacionExpressEnviada {
  titulo: string;
  created_at: string;
}

/**
 * Cotizaciones express del cliente. La cotización llega al chat como imagen, así que el
 * precio solo está en la actividad que se registra al enviarla.
 */
async function cotizacionesExpressDe(
  sb: SupabaseClient,
  expedienteId: string | null | undefined,
  prospectoId: string | null | undefined,
): Promise<CotizacionExpressEnviada[]> {
  const filtros = [
    expedienteId ? `expediente_id.eq.${expedienteId}` : null,
    prospectoId ? `prospecto_id.eq.${prospectoId}` : null,
  ].filter(Boolean);
  if (filtros.length === 0) return [];
  const { data } = await sb
    .from("actividades")
    .select("titulo, created_at")
    .eq("tipo", "cotizacion_express")
    .or(filtros.join(","))
    .order("created_at", { ascending: true })
    .limit(20);
  return (data as CotizacionExpressEnviada[]) ?? [];
}

/**
 * Imagen del chat → texto legible para el modelo. Una cotización express se describe con su
 * precio para que Sofía sepa que el cliente YA la recibió.
 */
function describirImagen(f: FilaMsg, express: CotizacionExpressEnviada[]): string | null {
  const m = f.texto.match(/^\[image:[^\]]*\]\s*([\s\S]*)$/);
  if (!m) return null;
  const pie = m[1].trim();
  const cot = pie.match(/^Cotización express:\s*(.+?)(?:\s+—\s+SAUCEDA Construye)?$/i);
  if (f.direccion === "out" && cot) {
    const t = new Date(f.created_at).getTime();
    // La actividad se registra justo después de enviar la imagen; se toma la más cercana
    const reg = express
      .map((e) => ({ e, dt: Math.abs(new Date(e.created_at).getTime() - t) }))
      .filter((x) => x.dt < 30 * 60 * 1000)
      .sort((a, b) => a.dt - b.dt)[0]?.e;
    const detalle = reg ? reg.titulo.replace(/^Cotización Express\s*·\s*/i, "") : cot[1];
    return `(Le enviamos al cliente su COTIZACIÓN EXPRESS en imagen: ${detalle}. El cliente YA TIENE su cotización con precio: no le digas que un asesor le va a compartir el precio; retoma desde ahí y resuelve sus dudas o avanza al siguiente paso.)`;
  }
  // Impermeabilización: comparativa de Sofía o propuesta de la calculadora del asesor (precios solo en la imagen)
  const imper = pie.match(/^(?:Comparativa|Propuesta) de impermeabilización para ([\d.,]+)\s*m²/i);
  if (f.direccion === "out" && imper) {
    return `(Le enviamos al cliente su COTIZACIÓN DE IMPERMEABILIZACIÓN en imagen para ${imper[1]} m², con la inversión estimada de las opciones. El cliente YA TIENE su cotización con precios: no le digas que un asesor le va a compartir el precio ni le vuelvas a pedir los m²; remítelo a la imagen sin repetir cifras, resuelve sus dudas y avanza al siguiente paso.)`;
  }
  if (f.direccion === "out" && /\[plantilla:\s*[^\]]*(comparativa|cotizacion)[^\]]*\]/i.test(pie)) {
    return "(Le enviamos al cliente por campaña la imagen con los precios de nuestras opciones de impermeabilización. Ya conoce los precios de referencia: no le digas que un asesor le va a compartir precios; si quiere su cotización exacta, pídele los m² de su azotea.)";
  }
  if (f.direccion === "out") return pie ? `(imagen enviada al cliente) ${pie}` : "(imagen enviada al cliente)";
  return pie ? `(el cliente envió una imagen) ${pie}` : "(el cliente envió una imagen)";
}

/** Convierte el historial en mensajes para la API (roles alternados). */
function aMensajes(
  historia: FilaMsg[],
  express: CotizacionExpressEnviada[] = [],
): { role: "user" | "assistant"; content: string }[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const f of historia) {
    if (!f.texto?.trim()) continue;
    const role = f.direccion === "in" ? "user" : "assistant";
    // Notas de voz: "[audio:<id>] <transcripción>" → texto legible para el modelo.
    const content = describirImagen(f, express) ?? f.texto.replace(
      /^\[audio:[^\]]+\]\s*([\s\S]*)$/,
      (_, t: string) => t && t !== "(mensaje de tipo audio)"
        ? `(nota de voz del cliente, transcrita) ${t}`
        : "(el cliente envió una nota de voz que no se pudo transcribir; pídele amablemente que lo escriba)",
    );
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + content;
    else msgs.push({ role, content });
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
            ...opcionesClaude(MODELO, { maxTokens: 1500 }),
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
  ctx: {
    telefono: string;
    expedienteId?: string | null;
    host?: string;
    /**
     * Invocación manual del asesor (botón "Que responda Sofía"): omite las
     * protecciones automáticas (duplicado, bucle de bot, pausa, etapa cerrada).
     */
    forzar?: boolean;
    /** Indicación opcional del asesor solo para esta respuesta. */
    indicacion?: string | null;
    /**
     * Solo genera el texto y lo devuelve: no envía nada ni toca el expediente.
     * Lo usa el asesor para revisar la propuesta de Sofía antes de mandarla.
     */
    soloBorrador?: boolean;
  },
): Promise<string | void> {
  try {
    if (!iaAgenteActivo()) return;
    const forzar = ctx.forzar === true;

    // Historial reciente del hilo usando variantes de teléfono o expediente enlazado (puente).
    // Obtenemos los últimos MAX_HISTORIAL mensajes ordenados por created_at descendente
    // y los invertimos para alimentar a la IA en estricto orden cronológico reciente.
    const variantes = variantesTelefono(ctx.telefono);
    let queryMsg = sb
      .from("mensajes_whatsapp")
      .select("direccion, texto, agente, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORIAL);

    if (ctx.expedienteId) {
      const vStr = variantes.map((v) => `"${v}"`).join(",");
      queryMsg = queryMsg.or(`telefono.in.(${vStr}),expediente_id.eq.${ctx.expedienteId}`);
    } else {
      queryMsg = queryMsg.in("telefono", variantes);
    }

    const { data } = await queryMsg;
    const historiaDesc = (data as FilaMsg[]) ?? [];
    const historia = historiaDesc.reverse();
    if (historia.length === 0) return;

    // Si el último mensaje del hilo ya es saliente (out), NO responder: el CRM o asesor ya contestó
    // y se está a la espera de que el cliente escriba de vuelta.
    const ultimoMsg = historia[historia.length - 1];
    if (!forzar && ultimoMsg && ultimoMsg.direccion === "out") {
      console.log(`IA: Ignorando respuesta para ${ctx.telefono} porque el último mensaje ya es saliente (agente: ${ultimoMsg.agente}).`);
      return;
    }

    // Protección humana: si un asesor humano escribió en las últimas 4 horas, Sofía NO interviene automáticamente.
    const ahoraMs = Date.now();
    const humanoReciente = historia.some((m) => {
      if (m.direccion !== "out" || !m.agente) return false;
      const ag = m.agente.toLowerCase();
      const esBot =
        ag === NOMBRE_AGENTE.toLowerCase() ||
        ag === "ia" ||
        ag === "bot" ||
        ag.includes("mautic") ||
        ag.includes("sin registro") ||
        ag.includes("paulina") ||
        ag.includes("sofia");
      if (esBot) return false;
      const t = m.created_at ? new Date(m.created_at).getTime() : 0;
      return ahoraMs - t < 4 * 60 * 60 * 1000;
    });
    if (!forzar && humanoReciente) {
      console.log(`IA: Ignorando respuesta para ${ctx.telefono} porque un asesor humano atendió la conversación recientemente (< 4h).`);
      return;
    }

    // Detectar bucles con auto-respondedores/bots.
    // Solo se considera bucle si los mensajes idénticos ocurrieron en una ventana reciente (<= 30 minutos).
    // Si un cliente vuelve a escribir días o semanas después con el mismo texto (ej. pulsando de nuevo un anuncio),
    // NO es un bot y Sofía debe atenderlo normalmente.
    const ultimosIn = historia.filter((f) => f.direccion === "in").slice(-3);
    if (!forzar && ultimosIn.length >= 2) {
      const msg1 = ultimosIn[ultimosIn.length - 1];
      const msg2 = ultimosIn[ultimosIn.length - 2];
      const texto1 = (msg1.texto ?? "").trim().toLowerCase();
      const texto2 = (msg2.texto ?? "").trim().toLowerCase();
      
      if (texto1 && texto1 === texto2) {
        const t1 = msg1.created_at ? new Date(msg1.created_at).getTime() : Date.now();
        const t2 = msg2.created_at ? new Date(msg2.created_at).getTime() : 0;
        const diffMinutos = Math.abs(t1 - t2) / (1000 * 60);

        // Si llegaron con menos de 30 minutos de diferencia:
        if (diffMinutos <= 30) {
          // Si el mensaje repetido es largo (más de 20 caracteres), asumimos bot y paramos de inmediato.
          if (texto1.length > 20) {
            console.warn(`IA: Se detectó bucle de bot (mensajes idénticos en ${diffMinutos.toFixed(1)} min) de ${ctx.telefono}.`);
            return;
          }
          
          // Si es corto, paramos al tercer mensaje idéntico dentro de una ventana reciente.
          if (ultimosIn.length >= 3) {
            const msg3 = ultimosIn[ultimosIn.length - 3];
            const texto3 = (msg3.texto ?? "").trim().toLowerCase();
            const t3 = msg3.created_at ? new Date(msg3.created_at).getTime() : 0;
            const diffMinutos3 = Math.abs(t1 - t3) / (1000 * 60);
            if (texto2 === texto3 && diffMinutos3 <= 60) {
              console.warn(`IA: Se detectó bucle repetido (3 mensajes idénticos en ${diffMinutos3.toFixed(1)} min) de ${ctx.telefono}.`);
              return;
            }
          }
        }
      }
    }

    // Control de pausa de Sofía (copilotaje con el asesor):
    // Si la conversación está explícitamente pausada en el CRM por el asesor, la IA no interviene.
    // Si NO está pausada, Sofía responde aun cuando el chat esté asignado a un asesor humano,
    // aprovechando el contexto previo de la conversación.
    const { esConversacionPausada } = await import("@/lib/ia/control-pausa");
    const estaPausada = !forzar && (await esConversacionPausada(sb, ctx.telefono, ctx.expedienteId));
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
          "cliente, primer_apellido, fraccionamiento, etapa, situacion, tipo_credito, tipo_negocio, direccion_propiedad, link_google_maps, necesidad, valor_estimado, saldo_deuda, telefono, canal_id, prospecto_id, sin_pagos, estado_fisico, habitada, asesor_id, ultimo_paso_flujo, ultimo_paso_alcanzado, campaign_name, adset_name, ad_name, calificacion"
        )
        .eq("id", ctx.expedienteId)
        .maybeSingle();
      exp = (e as FilaExp) ?? null;

      // Si el expediente ya está cerrado o perdido, la IA no debe intervenir
      if (!forzar && exp && (exp.etapa === "perdido" || exp.etapa === "cerrado")) {
        console.log(`IA: Ignorando respuesta para ${ctx.telefono} porque el expediente está en etapa '${exp.etapa}'.`);
        return;
      }

      // Si el prospecto tiene estatus 'nuevo', lo movemos a 'en_conversacion' y complementamos datos de campaña
      if (exp?.prospecto_id && !ctx.soloBorrador) {
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

    let system = await instrucciones(exp, sb);
    const express = await cotizacionesExpressDe(sb, ctx.expedienteId, exp?.prospecto_id);
    const mensajes = aMensajes(historia, express);
    if (forzar) {
      const indicacion = ctx.indicacion?.trim();
      if (indicacion) {
        system += `\n\nINDICACIÓN DEL ASESOR PARA ESTA RESPUESTA (síguela sin mencionarla al cliente): ${indicacion}`;
      }
      // Si el último mensaje fue nuestro, la API lo tomaría como texto a continuar.
      if (mensajes.length && mensajes[mensajes.length - 1].role === "assistant") {
        mensajes.push({
          role: "user",
          content: "[Nota interna: el cliente no ha escrito nada nuevo. Retoma la conversación con el siguiente paso adecuado.]",
        });
      }
    }

    const textoAI = await generarRespuesta(system, mensajes, sb);
    if (!textoAI && ctx.soloBorrador) {
      throw new Error(ultimoErrorIA || "La IA no generó respuesta.");
    }
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
      videos_de?: string | null;
      cliente_pospone?: boolean | string | null;
      pospone_fecha?: string | null;
      pospone_motivo?: string | null;
      cliente_retoma?: boolean | string | null;
      avisar_asesor?: string | null;
      cliente_nombre?: string | null;
      telefono_real?: string | null;
      nss?: string | null;
      fecha_nacimiento?: string | null;
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

    // --- FORMATO WHATSAPP ---
    // WhatsApp usa *negrita* (un asterisco); el **Markdown** le llega al cliente
    // con los asteriscos tal cual. Igual con los encabezados "## ".
    textoRespuesta = textoRespuesta
      .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
      .replace(/^#{1,6}\s+/gm, "");

    // --- BLOQUEO DE PRECIOS EN TEXTO (construcción) ---
    // Sofía no da precios en texto; la única vía es la imagen comparativa de impermeabilización.
    if ((exp?.tipo_negocio || "").startsWith("construccion")) {
      const reMonto = /\$\s?\d[\d,.]*(?:\s?(?:MXN|pesos))?(?:\s?(?:más|mas|\+)\s?IVA)?|\b\d[\d,.]*\s?(?:MXN|pesos)\b/gi;
      if (reMonto.test(textoRespuesta)) {
        console.warn(`[Precios] Sofía escribió un monto en texto; se reemplaza. Expediente ${ctx.expedienteId}`);
        textoRespuesta = textoRespuesta.replace(reMonto, "(monto que te confirma el asesor)");
      }
    }

    // Borrador para el asesor: se detiene antes de guardar datos o enviar.
    if (ctx.soloBorrador) return textoRespuesta;

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

      // Sincronizar etapa si la IA la determinó explícitamente (ej. perdido en campañas)
      if ((datosExtraidos as any).etapa) {
        updates.etapa = (datosExtraidos as any).etapa;
        if ((datosExtraidos as any).etapa === "perdido" && exp?.prospecto_id) {
          (datosExtraidos as any).descalificado = true;
          (datosExtraidos as any).motivo_descalificacion = "Campaña: El cliente indicó que ya lo resolvió o no le interesa";
        }
      }

      // Nuevos campos Sofía 2.0 (Impermeabilización)
      if ((datosExtraidos as any).colonia) {
        updates.fraccionamiento = (datosExtraidos as any).colonia;
      }
      const direccionExtraida = String((datosExtraidos as any).direccion || "").trim();
      if (direccionExtraida && direccionExtraida.toLowerCase() !== "null" && direccionExtraida.length >= 6) {
        updates.direccion_propiedad = direccionExtraida;
        if (exp?.prospecto_id) {
          await sb
            .from("prospectos")
            .update({ direccion: direccionExtraida })
            .eq("id", exp.prospecto_id);
        }
      }
      const linkMaps = String((datosExtraidos as any).link_google_maps || "").trim();
      if (/^https?:\/\/(?:www\.)?(?:maps\.google\.|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(linkMaps)) {
        updates.link_google_maps = linkMaps;
      }
      if ((datosExtraidos as any).cliente_nombre) {
        const nomLimpio = String((datosExtraidos as any).cliente_nombre).trim();
        // Validar que sea un nombre real de persona y no emojis o puntuación
        if (nomLimpio.length >= 3 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nomLimpio)) {
          updates.cliente = nomLimpio;
        }
      }
      if ((datosExtraidos as any).cliente_telefono) {
        const telLimpio = String((datosExtraidos as any).cliente_telefono).replace(/\D/g, "");
        if (telLimpio.length >= 10) {
          updates.telefono = telLimpio.slice(-10);
        }
      }

      // Extracción de datos para precalificación Infonavit (NSS y Fecha de Nacimiento)
      if ((datosExtraidos as any).nss || (datosExtraidos as any).fecha_nacimiento) {
        const nssLimpio = (datosExtraidos as any).nss ? String((datosExtraidos as any).nss).replace(/\D/g, "") : "";
        const fnLimpia = (datosExtraidos as any).fecha_nacimiento ? String((datosExtraidos as any).fecha_nacimiento).trim() : "";
        const datosInfonavit = [
          nssLimpio && `NSS: ${nssLimpio}`,
          fnLimpia && `F.Nac: ${fnLimpia}`
        ].filter(Boolean).join(" | ");

        if (datosInfonavit) {
          updates.necesidad = updates.necesidad
            ? `${updates.necesidad} [${datosInfonavit}]`
            : `Precalificación Infonavit [${datosInfonavit}]`;

          if (exp?.prospecto_id) {
            try {
              const { data: prActual } = await sb
                .from("prospectos")
                .select("notas")
                .eq("id", exp.prospecto_id)
                .maybeSingle();
              const notasPrev = prActual?.notas || "";
              if (!notasPrev.includes(datosInfonavit)) {
                await sb
                  .from("prospectos")
                  .update({ notas: notasPrev ? `${notasPrev}\n[IA Precalificación] ${datosInfonavit}` : `[IA Precalificación] ${datosInfonavit}` })
                  .eq("id", exp.prospecto_id);
              }
            } catch (errNotas) {
              console.error("IA: Error al guardar datos Infonavit en prospectos.notas:", errNotas);
            }
          }
        }
      }

      // Persistencia de Asesoría de Compra / Solo Trámite (INFONAVIT)
      const dInf = datosExtraidos as any;
      const esAsesoriaOInfonavit =
        updates.tipo_negocio === "asesoria_compra" ||
        updates.tipo_negocio === "solo_tramite" ||
        exp?.tipo_negocio === "asesoria_compra" ||
        exp?.tipo_negocio === "solo_tramite" ||
        dInf?.monto_credito_precalificado !== undefined ||
        dInf?.ya_tiene_casa !== undefined;

      if (esAsesoriaOInfonavit) {
        if (dInf.monto_credito_precalificado) {
          const mCred = Number(dInf.monto_credito_precalificado);
          const mAhorro = dInf.monto_ahorro_propio ? Number(dInf.monto_ahorro_propio) : 0;
          if (mCred > 0) {
            updates.valor_estimado = Math.round(mCred + mAhorro);
            updates.tipo_credito = "INFONAVIT";
          }
        }
        if (Array.isArray(dInf.busqueda_zonas) && dInf.busqueda_zonas.length > 0) {
          updates.fraccionamiento = dInf.busqueda_zonas.join(", ");
        }

        // Construir o enriquecer necesidad
        if (dInf.necesidad) {
          updates.necesidad = dInf.necesidad;
        } else if (updates.tipo_negocio === "solo_tramite" || dInf.ya_tiene_casa === true) {
          const col = dInf.colonia || updates.fraccionamiento || exp?.fraccionamiento || "";
          updates.necesidad = `Gestión y Armado de Expediente INFONAVIT ($9,500 MXN) - Trato directo${col ? ` en ${col}` : ""}`;
        } else if (updates.tipo_negocio === "asesoria_compra" || dInf.ya_tiene_casa === false) {
          const partesAsesoria = [
            dInf.monto_credito_precalificado && `Crédito: $${Number(dInf.monto_credito_precalificado).toLocaleString("es-MX")}`,
            dInf.monto_ahorro_propio && `Ahorro: $${Number(dInf.monto_ahorro_propio).toLocaleString("es-MX")}`,
            Array.isArray(dInf.busqueda_zonas) && dInf.busqueda_zonas.length > 0 && `Zonas: ${dInf.busqueda_zonas.join(", ")}`,
            dInf.tipo_inmueble && `Inmueble: ${dInf.tipo_inmueble}`,
            dInf.busqueda_recamaras_min && `Mín. ${dInf.busqueda_recamaras_min} rec.`,
            dInf.plazo_mudanza && `Plazo: ${dInf.plazo_mudanza}`,
          ].filter(Boolean);
          if (partesAsesoria.length > 0) {
            updates.necesidad = `Búsqueda de vivienda INFONAVIT [${partesAsesoria.join(" | ")}]`;
          }
        }

        // Guardar resumen en notas del prospecto
        if (exp?.prospecto_id) {
          try {
            const resumenPerfil = [
              dInf.ya_tiene_casa !== undefined && dInf.ya_tiene_casa !== null && `Ya tiene casa: ${dInf.ya_tiene_casa ? "Sí (trato directo)" : "No (busca opciones)"}`,
              dInf.monto_credito_precalificado && `Crédito: $${Number(dInf.monto_credito_precalificado).toLocaleString("es-MX")}`,
              dInf.monto_ahorro_propio && `Ahorro: $${Number(dInf.monto_ahorro_propio).toLocaleString("es-MX")}`,
              Array.isArray(dInf.busqueda_zonas) && dInf.busqueda_zonas.length > 0 && `Zonas: ${dInf.busqueda_zonas.join(", ")}`,
              dInf.tipo_inmueble && `Inmueble: ${dInf.tipo_inmueble}`,
              dInf.busqueda_recamaras_min && `Recámaras mín: ${dInf.busqueda_recamaras_min}`,
              dInf.plazo_mudanza && `Plazo: ${dInf.plazo_mudanza}`,
            ].filter(Boolean).join(" | ");

            if (resumenPerfil) {
              const { data: prActual } = await sb
                .from("prospectos")
                .select("notas")
                .eq("id", exp.prospecto_id)
                .maybeSingle();
              const notasPrev = prActual?.notas || "";
              if (!notasPrev.includes(resumenPerfil)) {
                await sb
                  .from("prospectos")
                  .update({ notas: notasPrev ? `${notasPrev}\n[Perfil Asesoría Compra] ${resumenPerfil}` : `[Perfil Asesoría Compra] ${resumenPerfil}` })
                  .eq("id", exp.prospecto_id);
              }
            }
          } catch (ePr) {
            console.error("IA: Error al guardar perfil de asesoría en prospectos.notas:", ePr);
          }
        }

        // Sincronizar en orden de trabajo (ot_ficha_asesoria_compra) si ya existe
        if (ctx.expedienteId) {
          try {
            const { data: ot } = await sb
              .from("ordenes_trabajo")
              .select("id")
              .eq("expediente_id", ctx.expedienteId)
              .eq("tipo_negocio", "asesoria_compra")
              .maybeSingle();

            if (ot?.id) {
              const fichaUpdate: Record<string, any> = {};
              if (dInf.ya_tiene_casa !== undefined && dInf.ya_tiene_casa !== null) fichaUpdate.ya_tiene_casa = Boolean(dInf.ya_tiene_casa);
              if (dInf.monto_credito_precalificado) fichaUpdate.monto_credito_precalificado = Number(dInf.monto_credito_precalificado);
              if (dInf.monto_ahorro_propio) fichaUpdate.monto_ahorro_propio = Number(dInf.monto_ahorro_propio);
              if (Array.isArray(dInf.busqueda_zonas)) fichaUpdate.busqueda_zonas = dInf.busqueda_zonas;
              if (dInf.busqueda_recamaras_min) fichaUpdate.busqueda_recamaras_min = Number(dInf.busqueda_recamaras_min);
              if (dInf.tipo_inmueble) fichaUpdate.tipo_inmueble = dInf.tipo_inmueble;
              if (dInf.plazo_mudanza) fichaUpdate.plazo_mudanza = dInf.plazo_mudanza;

              if (Object.keys(fichaUpdate).length > 0) {
                await sb
                  .from("ot_ficha_asesoria_compra")
                  .upsert({ orden_trabajo_id: ot.id, ...fichaUpdate }, { onConflict: "orden_trabajo_id" });
              }
            }
          } catch (eOt) {
            console.error("IA: Error al actualizar ot_ficha_asesoria_compra:", eOt);
          }
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

              // Cantidad mínima de cobro del catálogo: si pide menos, se cotiza el mínimo
              const m2Cobrados = Math.max(Number(m), prodCat?.minimoM2 || 0);
              // Costo del proveedor según el rango de m² negociado (si está capturado)
              costoM2 = costoUnitarioPorVolumen(prodCat?.costosVolumen, m2Cobrados, costoM2);
              // Precio de venta por volumen (al alcanzar un tramo aplica a todos los m²)
              precioM2 = precioUnitarioPorVolumen(prodCat?.preciosVolumen, m2Cobrados, precioM2);
              const precioTotal = m2Cobrados * precioM2;
              const costoTotal = m2Cobrados * costoM2;

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
                    cantidad: m2Cobrados,
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
                  detalle: `Impermeabilización Profesional (${ETIQUETA_PAQUETE[paqueteCot]}). Metros: ${m} m2${m2Cobrados > Number(m) ? ` (se cotiza el mínimo de ${m2Cobrados} m2)` : ""}. Total: $${precioTotal}. Estatus: esperando_visita.`,
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

      // --- DETECCIÓN Y DISPARO DE COORDINACIÓN VESPERTINA (REMODELACIÓN) ---
      const opcionesRemodelacion = (datosExtraidos as any).opciones_remodelacion_cliente;
      const esRemodelacion = (updates.tipo_negocio === "construccion-remodelacion" || exp?.tipo_negocio === "construccion-remodelacion");

      if (esRemodelacion && Array.isArray(opcionesRemodelacion) && opcionesRemodelacion.length > 0) {
        try {
          const slotsDisponibles = calcularSlotsVespertinosRemodelacion();
          const slotsElegidos: { id: string; fecha: string; horaInicio: string; horaFin?: string; label: string }[] = [];

          for (let i = 0; i < opcionesRemodelacion.length && i < 2; i++) {
            const raw = String(opcionesRemodelacion[i]).trim();
            const matchSlot = slotsDisponibles.find(
              (s) => s.id === raw || s.codigo.toLowerCase() === raw.toLowerCase()
            );
            if (matchSlot) {
              slotsElegidos.push({
                id: i === 0 ? "A" : "B",
                fecha: matchSlot.fecha,
                horaInicio: matchSlot.horaInicio,
                horaFin: matchSlot.horaFin,
                label: matchSlot.label,
              });
            }
          }

          if (slotsElegidos.length > 0) {
            // Si el cliente dio solo 1 opción, agregar la siguiente disponible como alternativa B
            if (slotsElegidos.length === 1) {
              const otroSlot = slotsDisponibles.find((s) => s.id !== slotsElegidos[0].id) || slotsDisponibles[1];
              if (otroSlot) {
                slotsElegidos.push({
                  id: "B",
                  fecha: otroSlot.fecha,
                  horaInicio: otroSlot.horaInicio,
                  horaFin: otroSlot.horaFin,
                  label: otroSlot.label,
                });
              }
            }

            const clienteNombreCompleto = [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" ") || updates.cliente || "Cliente Remodelación";
            const ubicacionRemod = updates.direccion || updates.colonia || exp?.fraccionamiento || "León, Gto.";

            // Sofía ya no agenda ni despacha propuestas de inspección por su cuenta: se avisa al
            // asesor con las opciones que eligió el cliente y él decide si coordina la visita.
            await avisarAsesorDesdeIA(sb, {
              telefono: ctx.telefono,
              motivo: `Remodelación: el cliente pide visita en ${ubicacionRemod}. Opciones que eligió: ${slotsElegidos
                .map((x) => x.label)
                .join(" / ")}. Coordínala tú si procede.`,
              expedienteId: ctx.expedienteId ?? null,
              prospectoId: exp?.prospecto_id ?? null,
              asesorId: updates.asesor_id || exp?.asesor_id || null,
              nombreCliente: clienteNombreCompleto,
            });
          }
        } catch (errRemod) {
          console.error("IA: Error al registrar propuesta de inspección de remodelación:", errRemod);
        }
      }

      // Sincronizar dirección y geolocalización a la coordinación activa si el cliente la proporcionó
      if ((updates.direccion || updates.link_google_maps) && (exp?.prospecto_id || ctx.expedienteId)) {
        try {
          const coordUpdates: Record<string, any> = {};
          if (updates.direccion) {
            coordUpdates.ubicacion = updates.direccion;
          }
          if (updates.link_google_maps) {
            coordUpdates.detalles_tecnicos = `${exp?.necesidad || "Remodelación"}. Ubicación GPS: ${updates.link_google_maps}`;
          }
          await sb
            .from("coordinaciones_inspeccion")
            .update(coordUpdates)
            .match(ctx.expedienteId ? { expediente_id: ctx.expedienteId } : { prospecto_id: exp?.prospecto_id })
            .in("estado", ["propuesta_enviada", "evaluando"]);
        } catch (updCoordErr) {
          console.warn("IA: No se pudo actualizar ubicación en coordinaciones_inspeccion:", updCoordErr);
        }
      }

      // --- DETECCIÓN INTELIGENTE DE LEAD CALIENTE (Sofía IA) ---
      const valorEst = Number(updates.valor_estimado || exp?.valor_estimado || 0);
      const saldoDeu = Number(updates.saldo_deuda || exp?.saldo_deuda || 0);
      const metrosNum = Number((datosExtraidos as any).metros || 0);
      const citaAceptada = (datosExtraidos as any).paso_flujo === "paso_3" || (datosExtraidos as any).cita_confirmada === true || Boolean(Array.isArray(opcionesRemodelacion) && opcionesRemodelacion.length > 0);
      const tieneDatosInfonavit = Boolean((datosExtraidos as any).nss || (datosExtraidos as any).fecha_nacimiento);

      // Dar colonia/zona ya no basta: casi cualquier lead de remodelación la da al
      // segundo mensaje y el aviso dejaba de distinguir a los realmente avanzados.
      const esLeadCaliente = Boolean(
        valorEst > 0 ||
        saldoDeu > 0 ||
        metrosNum > 0 ||
        citaAceptada ||
        tieneDatosInfonavit
      );

      // Solo se marca la calificación (queda en el CRM y la bitácora); ya no se avisa
      // al asesor por esto (el aviso "LEAD CALIENTE DETECTADO" se quitó).
      const yaEraCaliente = exp?.calificacion === "caliente";
      if (esLeadCaliente && !yaEraCaliente && (datosExtraidos as any).descalificado !== true && exp?.calificacion !== "descalificado") {
        updates.calificacion = "caliente";
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
          // Si actualizamos el teléfono, nombre o calificación, también actualizamos el prospecto enlazado
          if (exp?.prospecto_id) {
            const updatesPr: Record<string, unknown> = {};
            if (updates.telefono) updatesPr.telefono = updates.telefono;
            if (updates.cliente) updatesPr.nombre = updates.cliente;
            if (updates.calificacion === "caliente") {
              updatesPr.calificacion = "caliente";
              updatesPr.estatus = "sql";
            }
            if (Object.keys(updatesPr).length > 0) {
              const { error: errUpdatePr } = await sb
                .from("prospectos")
                .update(updatesPr)
                .eq("id", exp.prospecto_id);
              if (errUpdatePr) {
                console.error("IA: Error al actualizar prospecto con datos:", errUpdatePr);
              }
            }
          }

          const detalleActividad = Object.entries(updates)
            .map(([col, val]) => `${col}: ${val}`)
            .join(", ");
          await registrarActividad(sb, {
            expedienteId: ctx.expedienteId,
            tipo: "sistema",
            titulo: updates.calificacion === "caliente" ? "🔥 Prospecto Calificado como LEAD CALIENTE" : "Datos de propiedad actualizados por IA",
            detalle: `Extraídos del chat: ${detalleActividad}`,
          });
          if ((updates.etapa || updates.calificacion) && exp?.prospecto_id) {
            try {
              const { sincronizarConectorMautic } = await import("@/lib/conector-rudder-mautic");
              void sincronizarConectorMautic({
                userId: exp.prospecto_id,
                etapa: updates.etapa || exp.etapa,
                calificacion: updates.calificacion || exp.calificacion,
                tags: updates.calificacion === "caliente" ? ["lead-caliente"] : undefined,
                descalificado: updates.etapa === "perdido" || updates.etapa === "fuera_de_zona",
              });
            } catch (syncErr) {
              console.error("[IA Sync Mautic] Error sincronizando etapa/calificación a Mautic:", syncErr);
            }
          }
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

          try {
            const { sincronizarConectorMautic } = await import("@/lib/conector-rudder-mautic");
            void sincronizarConectorMautic({
              userId: exp.prospecto_id,
              etapa: "perdido",
              estatus: "no_viable",
              descalificado: true,
              no_viable: true,
            });
          } catch (syncErr) {
            console.error("[IA Sync Mautic] Error sincronizando descalificación a Mautic:", syncErr);
          }
        }
      }
    }

    // --- CLIENTE QUE POSPONE / RETOMA ---
    const esVerdadero = (v: unknown) => v === true || v === "true";
    const clientePospone = esVerdadero((datosExtraidos as any).cliente_pospone);
    if (ctx.expedienteId) {
      try {
        if (clientePospone) {
          const rPausa = await pausarExpediente(sb, {
            expedienteId: ctx.expedienteId,
            fechaCliente: (datosExtraidos as any).pospone_fecha ?? null,
            motivo: (datosExtraidos as any).pospone_motivo ?? null,
            origen: "Sofía detectó que el cliente pospone",
          });
          if (!rPausa.ok) console.warn(`[Pausa] No se pudo pausar ${ctx.expedienteId}: ${rPausa.error}`);
        } else if (exp?.etapa === "en_pausa" && esVerdadero((datosExtraidos as any).cliente_retoma)) {
          await reactivarExpediente(sb, ctx.expedienteId, "El cliente escribió para retomar (detectado por Sofía)");
        }
      } catch (pausaErr) {
        console.error("[Pausa] Error procesando pausa/reactivación:", pausaErr);
      }
    }

    // --- AVISO A UN ASESOR (visita técnica: liga de pago, objeciones, cliente molesto) ---
    // Sofía sigue respondiendo; solo se notifica al asesor (in-app + Telegram).
    const motivoAviso = typeof datosExtraidos.avisar_asesor === "string" ? datosExtraidos.avisar_asesor.trim() : "";
    if (motivoAviso && motivoAviso.toLowerCase() !== "null") {
      await avisarAsesorDesdeIA(sb, {
        telefono: ctx.telefono,
        motivo: motivoAviso,
        expedienteId: ctx.expedienteId ?? null,
        prospectoId: exp?.prospecto_id ?? null,
        asesorId: exp?.asesor_id ?? null,
        nombreCliente: [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" "),
      });
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

    // --- MANTENIMIENTO (cisternas/tinacos/calentadores): fotos del servicio, nunca en el primer mensaje ---
    {
      const servicioMant = servicioDeTipoNegocio((updates.tipo_negocio as string | undefined) || exp?.tipo_negocio);
      // Nunca en la primera respuesta de Sofía: primero se explica el servicio y se pide la capacidad.
      const yaRespondioAntes = historia.some((f) => f.direccion === "out");
      if (r.ok && !clientePospone && !esMessenger && !esInstagram && servicioMant && yaRespondioAntes && ((datosExtraidos as any).fotos_servicio === true || (datosExtraidos as any).fotos_servicio === "true") && /(fotos?|👇)/i.test(textoRespuesta)) {
        await enviarFotosMantenimiento(sb, {
          canal,
          telefono: ctx.telefono,
          expedienteId: ctx.expedienteId ?? null,
          agente: NOMBRE_AGENTE,
          servicio: servicioMant,
        });
      }
    }

    // --- SEGURIDAD: comparativa de la familia que pidió el cliente (sólo WhatsApp, sólo si el texto la anuncia) ---
    {
      const familiaSeg = typeof (datosExtraidos as any).comparativa_seguridad === "string" ? (datosExtraidos as any).comparativa_seguridad.trim() : "";
      const esSeguridad = ((updates.tipo_negocio as string | undefined) || exp?.tipo_negocio) === "seguridad";
      if (r.ok && !clientePospone && !esMessenger && !esInstagram && esSeguridad && familiaSeg && familiaSeg.toLowerCase() !== "null" && /(comparativa|opciones|👇)/i.test(textoRespuesta)) {
        await enviarComparativaSeguridad(sb, {
          canal,
          telefono: ctx.telefono,
          expedienteId: ctx.expedienteId ?? null,
          agente: NOMBRE_AGENTE,
          familia: familiaSeg,
        });
      }
      const elegidoSeg = typeof (datosExtraidos as any).producto_seguridad_elegido === "string" ? (datosExtraidos as any).producto_seguridad_elegido.trim() : "";
      if (r.ok && !clientePospone && !esMessenger && !esInstagram && esSeguridad && /^CAT-\d+$/i.test(elegidoSeg) && /(fotos?|👇)/i.test(textoRespuesta)) {
        await enviarFotosProductoSeguridad(sb, {
          canal,
          telefono: ctx.telefono,
          expedienteId: ctx.expedienteId ?? null,
          agente: NOMBRE_AGENTE,
          productoId: elegidoSeg,
        });
      }
    }

    // --- IMPERMEABILIZACIÓN: comparativa de precios e imágenes de referencia (sólo WhatsApp) ---
    if (r.ok && !clientePospone && !esMessenger && !esInstagram && (exp?.tipo_negocio === "construccion-impermeabilizacion" || (datosExtraidos as any).paso_flujo)) {
      const ctxEnvio = { canal, telefono: ctx.telefono, expedienteId: ctx.expedienteId ?? null, agente: NOMBRE_AGENTE };
      const claros = (datosExtraidos as any).metros_claros === true || (datosExtraidos as any).metros_claros === "true";
      const metrosImper = metrosClaros((datosExtraidos as any).metros);
      // Sólo se envían medios que el texto de Sofía anunció en este turno (evita mandarlos fuera de contexto)
      const anunciaComparativa = /comparativa/i.test(textoRespuesta);
      const anunciaFotos = /(fotos?|im[aá]genes|imagen de referencia|👇)/i.test(textoRespuesta);
      if (claros && metrosImper && anunciaComparativa && (datosExtraidos as any).paso_flujo === "paso_2") {
        await enviarComparativaImper(sb, { ...ctxEnvio, metros: metrosImper });
      }
      if (/fotos/i.test(textoRespuesta) && (datosExtraidos as any).paso_flujo === "paso_1" && ((updates.tipo_negocio as string | undefined) || exp?.tipo_negocio) === "construccion-impermeabilizacion") {
        // Fotos de la impermeabilización estándar sólo cuando el cliente pidió ver ejemplos (una sola vez)
        await enviarMediosPaqueteImper(sb, { ...ctxEnvio, paquete: "estandar" });
      }
      const elegido = (datosExtraidos as any).paquete_elegido;
      if (anunciaFotos && esPaqueteImper(elegido)) {
        await enviarMediosPaqueteImper(sb, { ...ctxEnvio, paquete: elegido });
      }
      const fichaDe = (datosExtraidos as any).ficha_tecnica_de;
      if (esPaqueteImper(fichaDe)) {
        await enviarFichaTecnicaImper(sb, { ...ctxEnvio, paquete: fichaDe });
      }
    }

    // --- VIDEOS DE TRABAJOS REALIZADOS: sólo cuando el cliente los pidió (sólo WhatsApp) ---
    {
      const videosDe = typeof datosExtraidos.videos_de === "string" ? datosExtraidos.videos_de.trim() : "";
      if (r.ok && !clientePospone && !esMessenger && !esInstagram && videosDe && videosDe.toLowerCase() !== "null") {
        await enviarVideosCatalogo(sb, {
          canal,
          telefono: ctx.telefono,
          expedienteId: ctx.expedienteId ?? null,
          agente: NOMBRE_AGENTE,
          videosDe,
          tipoNegocio: (updates.tipo_negocio as string | undefined) || exp?.tipo_negocio,
        });
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
    if (ctx.soloBorrador) throw err;
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

Tu objetivo ahora es escribir un único mensaje de retoque (follow-up) muy amigable, natural y súper corto (de 1 a 2 frases como máximo) para reactivar el contacto y preguntarle si tiene alguna duda, si pudo revisar la información o si quiere que un asesor le contacte, según corresponda de acuerdo a lo que estaban hablando.

REGLAS DE ESTILO Y TONO:
- Sé sumamente cálido, educado y cercano.
- No presiones al cliente. Hazlo ver como un seguimiento amigable y servicial.
- El mensaje debe ser corto (máximo 2 frases).
- Adapta el mensaje al contexto exacto de lo último que estaban hablando (revisa los últimos mensajes de la conversación). Por ejemplo:
  * Si hablaban de Impermeabilización de azotea: pregúntale si pudo revisar los precios o si tiene alguna duda sobre las opciones (NO ofrezcas visita ni inspección).
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

    const express = await cotizacionesExpressDe(sb, expedienteId, null);
    const mensajesInput = aMensajes(historiaConversacional, express);
    if (mensajesInput.length === 0) return "";

    const respuestaRetoque = await generarRespuesta(systemPrompt, mensajesInput);
    return respuestaRetoque.trim();
  } catch (err) {
    console.error("Error al generar mensaje de retoque con IA:", err);
    return "";
  }
}


/**
 * Sofía redacta el WhatsApp para coordinar un servicio o instalación con un proveedor
 * (p. ej. el plomero): qué hay que hacer, la fecha que pide el cliente y la dirección.
 * Lee la conversación del cliente para sacar lo que necesita; no envía nada.
 */
export async function generarMensajeCoordinacionProveedor(
  sb: SupabaseClient,
  datos: {
    telefono: string;
    proveedorNombre: string;
    tipo: "servicio" | "instalacion";
    clienteNombre: string;
    direccion: string;
    linkMaps: string;
    fecha: string;
    horario: string;
    trabajo: string;
    /** Lo que cobra el proveedor, ya formateado ("$850.00"); "" si no se capturó. */
    costo: string;
    /** Link de su portal para aceptar y proponer horarios; "" si no hay. */
    linkRespuesta: string;
    indicacion?: string | null;
  },
): Promise<string> {
  const { data } = await sb
    .from("mensajes_whatsapp")
    .select("direccion, texto, agente, created_at")
    .in("telefono", variantesTelefono(datos.telefono))
    .order("created_at", { ascending: false })
    .limit(40);
  const historia = ((data as FilaMsg[]) ?? [])
    .reverse()
    .filter((m) => {
      const txt = (m.texto || "").trim();
      if (!txt || txt.startsWith("[Plantilla:") || txt.startsWith("[Secuencia]")) return false;
      return m.agente !== "Sistema" && m.agente !== "Sistema (Secuencia)";
    });
  const conversacion = historia
    .map((m) => `${m.direccion === "in" ? "Cliente" : "Nosotros"}: ${m.texto.replace(/^\[audio:[^\]]+\]\s*/, "(nota de voz) ")}`)
    .join("\n")
    .slice(-8000);

  const que = datos.tipo === "instalacion" ? "una instalación" : "un servicio";
  const system = `Eres Sofía, de SAUCEDA Construye (León, Guanajuato). Vas a escribir UN mensaje de WhatsApp para ${datos.proveedorNombre}, proveedor de confianza de la empresa, para coordinar ${que} en casa de un cliente.

El mensaje debe:
- Saludar por su nombre, en tono cordial y directo, como compañeros de trabajo (de tú).
- Decir en 1-2 frases qué hay que hacer, sacado de la conversación con el cliente y de los datos de abajo. Si el cliente mencionó detalles útiles para el proveedor (síntomas, medidas, material, acceso), inclúyelos breves.
- Proponer la fecha y horario que pide el cliente y preguntar si le queda o qué opción tiene.
- Incluir la dirección completa (y el link de Google Maps si hay) para que la confirme y pueda agendar la visita.
- Si viene el costo del proveedor, mencionarlo como el costo acordado del trabajo y pedir que lo confirme.
- Cerrar pidiendo que confirme si lo acepta y que proponga los horarios que puede; si viene el link de respuesta, pedirle que lo haga ahí (en una línea propia, tal cual).

Reglas:
- Español de México, máximo ~8 líneas. Puedes usar *negritas* de WhatsApp para fecha y dirección.
- NO incluyas el teléfono del cliente ni el precio que paga el cliente; el único monto permitido es el costo del proveedor indicado abajo. Usa solo el nombre de pila del cliente.
- No inventes fecha, horario ni dirección: si un dato viene vacío, pide al proveedor su disponibilidad o deja la dirección "por confirmar".
- Escribe ÚNICAMENTE el texto del mensaje, sin comillas ni explicaciones.

Datos:
- Cliente: ${datos.clienteNombre || "—"}
- Trabajo: ${datos.trabajo || "(sácalo de la conversación)"}
- Fecha que pide el cliente: ${datos.fecha || "(no indicada; búscala en la conversación, si no hay pide disponibilidad)"}
- Horario: ${datos.horario || "(no indicado)"}
- Costo que cobra el proveedor: ${datos.costo || "(no indicado; no menciones montos)"}
- Link para aceptar y proponer horarios: ${datos.linkRespuesta || "(sin link; que responda por este WhatsApp)"}
- Dirección: ${datos.direccion || "(no registrada)"}
- Google Maps: ${datos.linkMaps || "(sin link)"}${datos.indicacion?.trim() ? `\n\nIndicación del asesor (síguela): ${datos.indicacion.trim()}` : ""}`;

  const texto = await generarRespuesta(
    system,
    [{ role: "user", content: conversacion ? `Conversación con el cliente:\n${conversacion}` : "(No hay conversación registrada con el cliente.)" }],
    sb,
  );
  return texto.trim().replace(/^["“]|["”]$/g, "");
}
