"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";

export interface PublicacionProgramada {
  id?: string;
  titulo: string;
  contenido: string;
  plataforma: "facebook" | "instagram" | "tiktok" | "whatsapp";
  tipo_formato: "imagen" | "carrusel" | "video" | "reel";
  sugerencia_visual?: string;
  guion_video?: string;
  url_imagen?: string;
  inversion_ads?: number;
  impresiones?: number;
  clics?: number;
  leads_generados?: number;
  cpl?: number;
  roi_score?: number;
  meta_ad_id?: string;
  fecha_programacion: string;
  estado: "pendiente_revision" | "aprobado" | "rechazado" | "publicado";
  notas_revision?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Obtiene todas las publicaciones de la base de datos con filtros opcionales.
 */
export async function obtenerPublicaciones(filtros?: {
  estado?: string;
  plataforma?: string;
  tipo_formato?: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<PublicacionProgramada[]> {
  await requireAdministrador();
  const sb = supabaseServidor();

  try {
    let query = sb.from("publicaciones_programadas").select("*");

    if (filtros?.estado && filtros.estado !== "todos") {
      query = query.eq("estado", filtros.estado);
    }
    if (filtros?.plataforma && filtros.plataforma !== "todos") {
      query = query.eq("plataforma", filtros.plataforma);
    }
    if (filtros?.tipo_formato && filtros.tipo_formato !== "todos") {
      query = query.eq("tipo_formato", filtros.tipo_formato);
    }
    if (filtros?.fechaInicio) {
      query = query.gte("fecha_programacion", filtros.fechaInicio);
    }
    if (filtros?.fechaFin) {
      query = query.lte("fecha_programacion", filtros.fechaFin);
    }

    query = query.order("fecha_programacion", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error al obtener publicaciones:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    return (data || []) as PublicacionProgramada[];
  } catch (err: any) {
    console.error("Error en obtenerPublicaciones:", err);
    throw err;
  }
}

/**
 * Dispara el webhook de n8n para publicar.
 */
async function dispararWebhookN8N(pub: PublicacionProgramada, accion: "aprobar" | "publicar") {
  const webhookUrl = process.env.N8N_MARKETING_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("n8n Webhook: No configurado (N8N_MARKETING_WEBHOOK_URL vacía). Operando en modo manual.");
    return;
  }

  console.log(`n8n Webhook: Disparando para post ${pub.id} (${accion}) a ${webhookUrl}`);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...pub,
        accion_evento: accion,
        fuente: "CRM Sauceda IA"
      })
    });
    if (!res.ok) {
      console.error(`n8n Webhook: Retornó código de estado inválido ${res.status}`);
    } else {
      console.log("n8n Webhook: Enviado exitosamente.");
    }
  } catch (err) {
    console.error("n8n Webhook: Falló el envío de red:", err);
  }
}

/**
 * Guarda (crea o edita) una publicación en la base de datos de forma segura.
 */
export async function guardarPublicacion(
  pub: PublicacionProgramada
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const payload = {
      titulo: pub.titulo,
      contenido: pub.contenido,
      plataforma: pub.plataforma,
      tipo_formato: pub.tipo_formato,
      sugerencia_visual: pub.sugerencia_visual || "",
      guion_video: pub.guion_video || "",
      fecha_programacion: pub.fecha_programacion,
      estado: pub.estado,
      notas_revision: pub.notas_revision || "",
      updated_at: new Date().toISOString(),
    };

    let result: PublicacionProgramada;
    if (pub.id) {
      const { data, error } = await sb
        .from("publicaciones_programadas")
        .update(payload)
        .eq("id", pub.id)
        .select()
        .single();

      if (error) throw error;
      result = data as PublicacionProgramada;
    } else {
      const { data, error } = await sb
        .from("publicaciones_programadas")
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      result = data as PublicacionProgramada;
    }

    if (result.estado === "aprobado") {
      dispararWebhookN8N(result, "aprobar");
    } else if (result.estado === "publicado") {
      dispararWebhookN8N(result, "publicar");
    }

    return { success: true, data: result };
  } catch (err: any) {
    console.error("Error en guardarPublicacion:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Cambia el estado de una publicación y registra notas de revisión de forma segura.
 */
export async function cambiarEstadoPublicacion(
  id: string,
  estado: "pendiente_revision" | "aprobado" | "rechazado" | "publicado",
  notas_revision?: string
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        estado,
        notas_revision: notas_revision || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const result = data as PublicacionProgramada;

    if (estado === "aprobado") {
      dispararWebhookN8N(result, "aprobar");
    } else if (estado === "publicado") {
      dispararWebhookN8N(result, "publicar");
    }

    return { success: true, data: result };
  } catch (err: any) {
    console.error("Error en cambiarEstadoPublicacion:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Limpia la URL de la imagen previa y vuelve a disparar n8n para regenerar el creativo con IA.
 */
export async function regenerarCreativoPublicacion(
  id: string
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: null,
        estado: "aprobado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const result = data as PublicacionProgramada;
    dispararWebhookN8N(result, "aprobar");

    return { success: true, data: result };
  } catch (err: any) {
    console.error("Error en regenerarCreativoPublicacion:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Elimina una publicación por su ID.
 */
export async function eliminarPublicacion(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { error } = await sb
      .from("publicaciones_programadas")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return { success: true, data: true };
  } catch (err: any) {
    console.error("Error en eliminarPublicacion:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Elimina un lote de publicaciones masivamente por sus IDs.
 */
export async function eliminarPublicacionesMasivo(
  ids: string[]
): Promise<ActionResult<boolean>> {
  try {
    await requireAdministrador();
    if (!ids || ids.length === 0) return { success: true, data: true };
    const sb = supabaseServidor();

    const { error } = await sb
      .from("publicaciones_programadas")
      .delete()
      .in("id", ids);

    if (error) throw error;

    return { success: true, data: true };
  } catch (err: any) {
    console.error("Error en eliminarPublicacionesMasivo:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Cambia el estado de un lote de publicaciones masivamente.
 */
export async function cambiarEstadoPublicacionesMasivo(
  ids: string[],
  estado: "pendiente_revision" | "aprobado" | "rechazado" | "publicado"
): Promise<ActionResult<boolean>> {
  try {
    await requireAdministrador();
    if (!ids || ids.length === 0) return { success: true, data: true };
    const sb = supabaseServidor();

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        estado,
        updated_at: new Date().toISOString()
      })
      .in("id", ids)
      .select();

    if (error) throw error;

    // Si se aprueban, disparar webhooks n8n para cada una
    if (estado === "aprobado" && data) {
      for (const pub of data as PublicacionProgramada[]) {
        dispararWebhookN8N(pub, "aprobar");
      }
    }

    return { success: true, data: true };
  } catch (err: any) {
    console.error("Error en cambiarEstadoPublicacionesMasivo:", err);
    return { success: false, error: err.message || String(err) };
  }
}


/**
 * Invoca a la IA (Claude o Kimi según configuración) para generar propuestas de publicaciones de forma segura.
 */
export async function generarPublicacionesAutomaticas(
  cantidad: number = 3,
  fechaInicio?: string,
  tema: string = "todos"
): Promise<ActionResult<PublicacionProgramada[]>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const proveedor = process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic");
    let rawText = "";
    const fechaBaseStr = fechaInicio || new Date().toISOString().split("T")[0];
    
    const systemPrompt = `Eres el Director Creativo de Marketing Inmobiliario y de Construcción de SAUCEDA en León, Guanajuato, México.
Tu misión principal es generar ANUNCIOS VENDEDORES DE ALTA CONVERSIÓN (Direct Response Ads) diseñados para generar prospectos calificados al WhatsApp (477 465 4700) y llamadas directas.

ESTRATEGIA DE ANUNCIOS VENDEDORES (DIRECT RESPONSE MARKETING):
1. GANCHOS DE ALTO IMPACTO (Hooks):
   - Inicia siempre con preguntas o declaraciones de dolor directo que detengan el scroll del cliente en León, Gto.
   - Ejemplos: "¿Tienes una casa abandonada o con deudas en León?", "¿Quieres traspasar tu casa INFONAVIT sin vueltas?", "Agosto de lluvias: ¡Protege tu hogar antes de la gotera!".
2. ESTRUCTURA DE COPY VENDEDOR (PAS / AIDA):
   - Problema: Identifica la frustración del cliente (deudas INFONAVIT, agiotistas, humedad en techo, burocracia).
   - Agitación: Muestra el riesgo de no actuar (retrasos de meses, goteras que dañan muebles, pérdidas de dinero).
   - Solución SAUCEDA: Presenta la solución inmediata con datos claros (Traspaso rápido, Pago de contado, $210/m2 impermeabilizado, Instalación en 1 día, Garantía de 5 a 10 años por escrito).
   - Llamado a la Acción (CTA) agresivo e inconfundible al WhatsApp 477 465 4700.

INFORMACIÓN CLAVE DE LA MARCA SAUCEDA:
1. SAUCEDA Bienes Raíces:
   - Especialistas en Traspasos INFONAVIT en León, Gto.
   - Compra rápida de contado de casas con deudas, vandalizadas, abandonadas o deshabitadas (solucionamos problemas legales y financieros).
   - Gestión de armado de expediente INFONAVIT cuando ya tienen un comprador/vendedor directo.
   - Advertimos sobre el riesgo de agiotistas/prestamistas particulares.
2. SAUCEDA Construye (Construcción):
   - Especialistas en impermeabilización profesional en León, Gto. Costo: $210 pesos por metro cuadrado (Estándar 3.5mm con gravilla roja o gris). Instalación en 1 día y garantía de 5 a 10 años por escrito.
   - Remodelaciones, ampliaciones (cocheras, cocinas, baños) bajo diseño arquitectónico. Visitas técnicas y presupuestos gratuitos a domicilio en León.
   - Suministro de Concreto Premezclado certificado para losas y firmes.

INSTRUCCIONES VISUALES PARA GENERACIÓN EN FLUX:
- En 'sugerencia_visual' describe escénicamente fotografías fotorrealistas publicitarias de alto impacto en León, Gto, con la paleta de colores de SAUCEDA: Azul Marino (#0A192F / #002855), acentos en Dorado elegante (#D4AF37) y Blanco puro.
- Describe escenas realistas que transmitan VENTA E IMPACTO: parejas firmando escrituras con felicidad, entrega de llaves de casa, trabajadora aplicando impermeabilización blanca profesional en azotea con rodillo, o inspección técnica con acabado moderno. NUNCA pidas texto, letras o infografías dentro de la imagen.

RESPONDE EXCLUSIVAMENTE CON UN ARREGLO JSON VÁLIDO. No agregues explicaciones antes ni después del JSON.
Formato esperado:
[
  {
    "titulo": "Título vendedor y corto de la publicación",
    "plataforma": "facebook | instagram | tiktok | whatsapp",
    "tipo_formato": "imagen | carrusel | video | reel",
    "contenido": "Texto/Copy completo con gancho, oferta, viñetas de valor, llamada a la acción al 477 465 4700 y hashtags.",
    "sugerencia_visual": "Descripción escénica de fotografía fotorrealista de alto impacto visual.",
    "guion_video": "Si es video o reel, proporciona el guion estructurado paso a paso con tomas y diálogos."
  }
]`;

    let prompt = `Genera exactamente ${cantidad} propuestas de publicaciones de marketing para el día ${fechaBaseStr}.
Usa diferentes plataformas (Facebook, Instagram, TikTok).`;

    // Consultar memoria de publicaciones ganadoras históricas (Top ROI / CPL)
    const { data: ganadores } = await sb
      .from("publicaciones_programadas")
      .select("titulo, contenido, sugerencia_visual, cpl, leads_generados, roi_score")
      .eq("estado", "publicado")
      .gt("leads_generados", 0)
      .order("cpl", { ascending: true })
      .limit(3);

    if (ganadores && ganadores.length > 0) {
      prompt += "\n\nMEMORIA DE APRENDIZAJE ACUMULADO (PUBLICACIONES CON MAYOR RENDIMIENTO FINANCIERO Y CONVERSIÓN EN LEÓN GTO):\n" +
        ganadores.map((g, i) => `#${i + 1} Título: "${g.titulo}" | Prospectos Reales: ${g.leads_generados} | CPL: $${g.cpl} MXN | Fotografía Sugerida: ${g.sugerencia_visual}`).join("\n") +
        "\nUsa esta experiencia acumulada para formular las nuevas propuestas replicando los enfoques de mayor retorno de inversión.";
    }

    if (tema && tema !== "todos") {
      prompt += `\n\nENFOQUE OBLIGATORIO DE TEMA:
Todas las publicaciones generadas deben centrarse estrictamente en la siguiente campaña o tema de negocio: "${tema}".
Adapta este mismo tema a las diferentes plataformas y formatos de forma inteligente para que actúen como una campaña unificada. Por ejemplo, en Facebook haz un post informativo sobre "${tema}", en Instagram un Reel interactivo enfocado en "${tema}" y en TikTok un video dinámico con gancho sobre "${tema}".`;
    } else {
      prompt += `\nAlterna entre temas de Bienes Raíces (Traspasos, Compra Directa) e Impermeabilización/Remodelación de Construcción de forma variada en cada publicación.`;
    }

    if (proveedor === "kimi") {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) throw new Error("Falta la API Key de Kimi (KIMI_API_KEY) en las variables de entorno.");
      const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
      const model = process.env.KIMI_MODEL || "kimi-k3";

      console.log(`Llamando a Kimi (${model}) para generar ${cantidad} publicaciones...`);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: 1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kimi API respondió error ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      rawText = (json.choices?.[0]?.message?.content || "").trim();

    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en las variables de entorno.");
      }
      const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

      console.log(`Llamando a Claude (${model}) para generar ${cantidad} publicaciones...`);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: prompt
          }],
          system: systemPrompt
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic respondió error ${response.status}: ${errorText}`);
      }

      const resultJson = await response.json();
      rawText = (resultJson.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text ?? "")
        .join("")
        .trim();
    }

    let jsonLimpio = rawText;
    if (jsonLimpio.startsWith("```")) {
      jsonLimpio = jsonLimpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    jsonLimpio = jsonLimpio.trim();

    if (!jsonLimpio.startsWith("[")) {
      const startIdx = jsonLimpio.indexOf("[");
      const endIdx = jsonLimpio.lastIndexOf("]");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonLimpio = jsonLimpio.slice(startIdx, endIdx + 1);
      }
    }

    const propuestas = JSON.parse(jsonLimpio);
    if (!Array.isArray(propuestas)) {
      throw new Error("La respuesta no es un arreglo de publicaciones.");
    }

    const publicacionesCreadas: PublicacionProgramada[] = [];
    const horarios = ["09:00:00", "14:00:00", "19:00:00"];

    for (let i = 0; i < propuestas.length; i++) {
      const prop = propuestas[i];
      const horarioStr = horarios[i % horarios.length];
      const fechaProg = `${fechaBaseStr}T${horarioStr}-06:00`;

      const payload = {
        titulo: prop.titulo,
        contenido: prop.contenido,
        plataforma: prop.plataforma,
        tipo_formato: prop.tipo_formato,
        sugerencia_visual: prop.sugerencia_visual || "",
        guion_video: prop.guion_video || "",
        fecha_programacion: fechaProg,
        estado: "pendiente_revision" as const,
        notas_revision: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from("publicaciones_programadas")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      publicacionesCreadas.push(data as PublicacionProgramada);
    }

    return { success: true, data: publicacionesCreadas };
  } catch (err: any) {
    console.error("Error en generarPublicacionesAutomaticas:", err);
    return { success: false, error: err.message || String(err) };
  }
}
