"use server";

import { headers } from "next/headers";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdministrador } from "@/lib/supabase/cliente-sesion";
import {
  publicarEnFacebook,
  publicarEnInstagram,
  probarConexionMeta,
  obtenerCredencialesMeta,
  esArchivoVideoReal,
  type EstadoConexionMeta,
} from "@/lib/meta-publicador";

export interface SelloBanner {
  texto_top: string;
  texto_bottom: string;
  color_fondo?: string;
}

export interface DisenoBannerParams {
  titulo_ad?: string;
  subtitulo_ad?: string;
  sellos?: SelloBanner[];
  cta_texto?: string;
  telefono_contacto?: string;
  color_destacado?: string;
  prompt_imagen_flux?: string;
}

export interface PublicacionProgramada {
  id?: string;
  titulo: string;
  contenido: string;
  plataforma: "facebook" | "instagram" | "tiktok" | "whatsapp" | "email" | "mautic";
  tipo_formato: "imagen" | "carrusel" | "video" | "reel";
  sugerencia_visual?: string;
  prompt_imagen_flux?: string;
  guion_video?: string;
  url_imagen?: string;
  diseno_banner?: DisenoBannerParams;
  inversion_ads?: number;
  impresiones?: number;
  clics?: number;
  leads_generados?: number;
  cpl?: number;
  roi_score?: number;
  meta_ad_id?: string;
  meta_post_id?: string;
  url_publicacion?: string;
  publicado_en?: string;
  error_publicacion?: string;
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
  aviso?: string;
}

function formatearErrorBDMarketing(err: any): string {
  const msg = err?.message || String(err || "");
  if (msg.includes("publicaciones_programadas") || msg.includes("schema cache")) {
    return "La tabla 'publicaciones_programadas' no existe en la base de datos de este entorno. Es necesario ejecutar la migración consolidada de marketing en el SQL Editor de tu Supabase.";
  }
  return msg;
}

/**
 * Cierra comillas, llaves y corchetes abiertos cuando un JSON de LLM queda truncado por límite de tokens.
 */
function autoCerrarJson(str: string): string {
  let s = str.trim();
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; }
  }
  if (inString) {
    s += '"';
  }

  // Quitar trailing comas o dos puntos sueltos
  s = s.replace(/[,:\s]+$/, "");

  // Balancear llaves y corchetes
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === "{" || c === "[") {
        stack.push(c);
      } else if (c === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === "{") stack.pop();
      } else if (c === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === "[") stack.pop();
      }
    }
  }

  while (stack.length > 0) {
    const ultimo = stack.pop();
    if (ultimo === "{") s += "}";
    else if (ultimo === "[") s += "]";
  }

  return s;
}

/**
 * Parsea respuestas JSON de IA de forma ultra-resiliente ante truncamientos o formato imperfecto.
 */
function parsearJsonResiliente<T = any>(rawText: string): T {
  let limpio = rawText.trim();
  if (limpio.startsWith("```")) {
    limpio = limpio.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  const primerCorchete = limpio.indexOf("[");
  if (primerCorchete !== -1) {
    const ultimoCorchete = limpio.lastIndexOf("]");
    if (ultimoCorchete !== -1 && ultimoCorchete > primerCorchete) {
      limpio = limpio.slice(primerCorchete, ultimoCorchete + 1);
    } else {
      limpio = limpio.slice(primerCorchete);
    }
  }

  // 1. Intento parseo directo
  try {
    return JSON.parse(limpio);
  } catch {
    // Si falla, proceder a las estrategias de rescate
  }

  // 2. Intento: buscar el último objeto cerrado } antes del truncamiento y cerrar array
  const ultimoCierreObjeto = limpio.lastIndexOf("}");
  if (ultimoCierreObjeto !== -1) {
    const reparado = limpio.slice(0, ultimoCierreObjeto + 1) + "\n]";
    try {
      const res = JSON.parse(reparado);
      if (Array.isArray(res) && res.length > 0) {
        return res as T;
      }
    } catch {}
  }

  // 3. Intento: balanceo inteligente de comillas y llaves
  try {
    const autoCerrado = autoCerrarJson(limpio);
    const res = JSON.parse(autoCerrado);
    if (Array.isArray(res) && res.length > 0) {
      return res as T;
    }
  } catch {}

  throw new Error("La respuesta del modelo de IA se interrumpió por exceso de longitud. Por favor genera 1 o 2 publicaciones a la vez.");
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
}): Promise<ActionResult<PublicacionProgramada[]>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

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
      return { success: false, error: formatearErrorBDMarketing(error) };
    }

    const lista = (data || []).map((p: any) => ({
      ...p,
      prompt_imagen_flux: p.prompt_imagen_flux || p.diseno_banner?.prompt_imagen_flux || undefined,
    })) as PublicacionProgramada[];

    return { success: true, data: lista };
  } catch (err: any) {
    console.error("Error en obtenerPublicaciones:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Obtiene una publicación específica por su ID directamente desde la BD para refrescar estados en tiempo real.
 */
export async function obtenerPublicacionPorId(
  id: string
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: "Publicación no encontrada" };

    const pub: PublicacionProgramada = {
      ...data,
      prompt_imagen_flux: data.prompt_imagen_flux || data.diseno_banner?.prompt_imagen_flux || undefined,
    };

    return { success: true, data: pub };
  } catch (err: any) {
    console.error("Error en obtenerPublicacionPorId:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Construye un prompt fotográfico profesional en inglés altamente detallado y optimizado
 * para el modelo Flux de Replicate, con exactitud técnica para construcción y bienes raíces en México.
 */
function construirPromptFluxRobusto(pub: PublicacionProgramada): string {
  const texto = `${pub.titulo || ""} ${pub.contenido || ""} ${pub.sugerencia_visual || ""}`.toLowerCase();
  const esVertical =
    pub.tipo_formato === "video" ||
    pub.tipo_formato === "reel" ||
    pub.plataforma === "tiktok";

  const promptExistente = (
    pub.prompt_imagen_flux ||
    (pub.diseno_banner as any)?.prompt_imagen_flux ||
    ""
  ).trim();

  // Si ya tiene un prompt en inglés limpio y sólido, verificar que no contenga artefactos obsoletos (rodillos, botellas, etc.)
  if (
    promptExistente.length > 40 &&
    !promptExistente.match(/antes|despu[eé]s|transici[oó]n|gotera|reel|roller|rodillo|machine|lawn|pool|alberca|botella|bottle/i)
  ) {
    const esImpermeabilizacion =
      texto.includes("impermea") ||
      texto.includes("gotera") ||
      texto.includes("filtraci") ||
      texto.includes("azotea") ||
      texto.includes("techo") ||
      texto.includes("lluvia");

    // Para impermeabilización, solo aceptar prompt existente si describe soplete/blowtorch y gravilla/membrane
    if (esImpermeabilizacion) {
      const tieneSopleteYGravilla =
        promptExistente.match(/torch|blowtorch|flame/i) &&
        promptExistente.match(/granule|gravilla|membrane|mineral/i);

      if (tieneSopleteYGravilla) {
        return promptExistente;
      }
    } else {
      return promptExistente;
    }
  }

  // 1. Impermeabilización / Goteras / Azotea / Techos / Filtraciones / Lluvias
  // Técnica mexicana profesional: rollo de membrana asfáltica prefabricada con acabado de gravilla mineral blanca
  // termo-fusionada con soplete de gas propano con flama controlada, sin rodillos.
  if (
    texto.includes("impermea") ||
    texto.includes("gotera") ||
    texto.includes("filtraci") ||
    texto.includes("azotea") ||
    texto.includes("techo") ||
    texto.includes("lluvia")
  ) {
    const prefijoCamara = esVertical
      ? "Award-winning 9:16 vertical commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato"
      : "Award-winning commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato";

    return `${prefijoCamara}. A skilled Mexican roofing technician in clean navy blue workwear, protective heat-resistant gloves, and safety helmet, precisely applying a heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules. He operates a long propane gas blowtorch wand with a bright controlled orange and blue flame, heating and melting the bottom asphalt layer as the roll unrolls seamlessly onto the primed flat concrete roof deck. Visible red propane cylinder tank with hose nearby. In the background, the pristine finished roof surface is covered in clean, neat parallel sheets of white mineral granules reflecting bright natural sunlight. Clear blue sky, crisp architectural lines, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, crisp realistic textures, 8k resolution.`;
  }

  // 2. Infonavit / Bienes Raíces / Traspasos / Venta de Casa / Expediente / Deudas
  if (
    texto.includes("infonavit") ||
    texto.includes("traspaso") ||
    texto.includes("inmobiliari") ||
    texto.includes("bienes ra") ||
    texto.includes("comprar casa") ||
    texto.includes("expediente") ||
    texto.includes("venta") ||
    texto.includes("asesor") ||
    texto.includes("deuda")
  ) {
    const prefijoCamara = esVertical
      ? "High-end 9:16 vertical interior architectural photography of a sunny, contemporary Mexican residential living room in León Guanajuato"
      : "High-end interior architectural photography of a sunny, contemporary Mexican residential living room in León Guanajuato";

    return `${prefijoCamara}. A professional Mexican real estate advisor in clean business casual attire warmly consulting with a smiling young couple over an executive property folder on a polished wood table. Natural daylight streaming through floor-to-ceiling glass windows, minimalist modern Mexican decor, lush courtyard in background, shot on Sony A7R V, 35mm f/2.8, magazine editorial quality.`;
  }

  // 3. Concreto Premezclado / Losas / Firmes
  if (
    texto.includes("concreto") ||
    texto.includes("premezclado") ||
    texto.includes("losa") ||
    texto.includes("cemento")
  ) {
    const prefijoCamara = esVertical
      ? "Dynamic 9:16 vertical crisp industrial architectural photography of a modern residential construction site in sunny León Guanajuato"
      : "Dynamic, crisp industrial architectural photography of a modern residential construction site in sunny León Guanajuato";

    return `${prefijoCamara}. A clean concrete mixer truck chute delivering smooth, high-quality pre-mixed concrete onto a reinforced foundation slab, Mexican builders in high-vis vests and helmets leveling the surface smoothly. Bright daylight, sharp textures of aggregate and wet concrete, shot on 35mm lens, f/4, authentic craftsmanship.`;
  }

  // 4. Remodelaciones / Ampliaciones / Fachadas / Cocheras
  if (
    texto.includes("remodela") ||
    texto.includes("amplia") ||
    texto.includes("cochera") ||
    texto.includes("fachada") ||
    texto.includes("baño") ||
    texto.includes("cocina")
  ) {
    const prefijoCamara = esVertical
      ? "Cinematic 9:16 vertical architectural photography of a newly remodeled modern Mexican residential facade in León Guanajuato"
      : "Cinematic architectural photography of a newly remodeled modern Mexican residential facade in León Guanajuato";

    return `${prefijoCamara}. Clean geometric architecture, warm sand-colored stucco, natural wood accents, contemporary steel beams, sunny day, clear blue sky, sharp realistic textures of stone and smooth concrete, shot on 35mm lens, f/4, pristine luxury home editorial.`;
  }

  // Fallback por defecto: Arquitectura residencial moderna mexicana limpia
  const prefijoCamara = esVertical
    ? "Award-winning 9:16 vertical commercial architectural editorial photography of a modern Mexican residential home in sunny León Guanajuato"
    : "Award-winning commercial architectural editorial photography of a modern Mexican residential home in sunny León Guanajuato";

  return `${prefijoCamara}, warm natural sunlight, clear blue sky, Hasselblad H6D-100c, 35mm lens, f/4, crisp realistic composition, 8k resolution.`;
}

/**
 * Dispara el webhook de n8n para publicar o solicitar generación de creativos.
 */
async function dispararWebhookN8N(
  pub: PublicacionProgramada,
  accion: "aprobar" | "publicar"
): Promise<{ enviado: boolean; aviso?: string }> {
  // URL por defecto para n8n staging si no está configurada en el entorno
  const defaultWebhookUrl = "https://n8n-staging.saucedamx.com/webhook/publicar-contenido";
  const webhookUrl = process.env.N8N_MARKETING_WEBHOOK_URL || defaultWebhookUrl;

  // Prevenir error común: pegar la URL del editor de n8n (/workflow/...) en lugar de la del Webhook (/webhook/...)
  let effectiveUrl = webhookUrl;
  if (effectiveUrl.includes("/workflow/")) {
    console.warn(`[Marketing Webhook] URL configurada '${effectiveUrl}' es del editor. Corrigiendo automáticamente a la URL del webhook.`);
    effectiveUrl = defaultWebhookUrl;
  }

  // Resolver la URL base del CRM actual para que n8n pueda enviar el creativo de vuelta
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.URL ? process.env.URL : null) ||
    "https://crm.saucedamx.com";
  const callbackUrl = `${baseUrl.replace(/\/$/, "")}/api/marketing/actualizar-media`;

  const promptFluxOptimizado = construirPromptFluxRobusto(pub);
  console.log(`[Marketing Webhook] Disparando para post ${pub.id} (${accion}) a ${effectiveUrl} (Callback: ${callbackUrl})`);
  console.log(`[Marketing Webhook] Prompt Flux optimizado: ${promptFluxOptimizado.substring(0, 90)}...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const esVertical =
      pub.tipo_formato === "reel" ||
      pub.tipo_formato === "video" ||
      pub.plataforma === "tiktok";
    const aspectRatio = esVertical ? "9:16" : "1:1";

    const res = await fetch(effectiveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...pub,
        aspect_ratio: aspectRatio,
        prompt_imagen_flux: promptFluxOptimizado,
        accion_evento: accion,
        fuente: "CRM Sauceda IA",
        callback_url: callbackUrl,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const msg = `n8n retornó código HTTP ${res.status} (${res.statusText}). Verifica que el flujo esté Activo ('Active') en n8n.`;
      console.error(`[Marketing Webhook] ${msg}`);
      return { enviado: false, aviso: msg };
    }

    console.log("[Marketing Webhook] Enviado exitosamente a n8n.");
    return { enviado: true, aviso: "Evento enviado a n8n con éxito. n8n está procesando el creativo." };
  } catch (err: any) {
    const errorMsg =
      err?.name === "AbortError"
        ? "Tiempo de espera agotado al conectar con n8n (timeout 10s)."
        : `Error al conectar con n8n: ${err?.message || String(err)}`;
    console.error(`[Marketing Webhook] ${errorMsg}`);
    return { enviado: false, aviso: errorMsg };
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

    const disenoBannerFinal = {
      ...(pub.diseno_banner || {}),
      prompt_imagen_flux:
        pub.prompt_imagen_flux ||
        (pub.diseno_banner as any)?.prompt_imagen_flux ||
        construirPromptFluxRobusto(pub),
    };

    const payload: any = {
      titulo: pub.titulo,
      contenido: pub.contenido,
      plataforma: pub.plataforma,
      tipo_formato: pub.tipo_formato,
      sugerencia_visual: pub.sugerencia_visual || "",
      guion_video: pub.guion_video || "",
      diseno_banner: disenoBannerFinal,
      fecha_programacion: pub.fecha_programacion
        ? new Date(pub.fecha_programacion).toISOString()
        : pub.fecha_programacion,
      estado: pub.estado,
      notas_revision: pub.notas_revision || "",
      updated_at: new Date().toISOString(),
    };

    if (pub.url_imagen !== undefined) {
      payload.url_imagen = pub.url_imagen;
    }

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

    let avisoWebhook: string | undefined;
    if (result.estado === "aprobado") {
      // Solo llamar a n8n si la publicación no tiene imagen previa cargada o heredada
      if (!result.url_imagen || result.url_imagen.length <= 5) {
        const wh = await dispararWebhookN8N(result, "aprobar");
        if (wh.aviso) avisoWebhook = wh.aviso;
      }
    } else if (result.estado === "publicado") {
      const wh = await dispararWebhookN8N(result, "publicar");
      if (wh.aviso) avisoWebhook = wh.aviso;
    }

    return { success: true, data: result, aviso: avisoWebhook };
  } catch (err: any) {
    console.error("Error en guardarPublicacion:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
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

    const ahoraIso = new Date().toISOString();
    const updatePayload: any = {
      estado,
      notas_revision: notas_revision || "",
      updated_at: ahoraIso,
    };
    if (estado === "publicado") {
      updatePayload.publicado_en = ahoraIso;
      updatePayload.fecha_programacion = ahoraIso;
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const result = data as PublicacionProgramada;

    let avisoWebhook: string | undefined;
    if (estado === "aprobado") {
      // Solo solicitar generación de imagen a n8n si la publicación carece de imagen previa
      if (!result.url_imagen || result.url_imagen.length <= 5) {
        const wh = await dispararWebhookN8N(result, "aprobar");
        if (wh.aviso) avisoWebhook = wh.aviso;
      }
    } else if (estado === "publicado") {
      const wh = await dispararWebhookN8N(result, "publicar");
      if (wh.aviso) avisoWebhook = wh.aviso;
    }

    return { success: true, data: result, aviso: avisoWebhook };
  } catch (err: any) {
    console.error("Error en cambiarEstadoPublicacion:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Reprograma la fecha y hora de una publicación, con opción de actualizar su estado.
 */
export async function reprogramarPublicacion(
  id: string,
  fecha_programacion: string,
  estado?: "pendiente_revision" | "aprobado" | "rechazado" | "publicado"
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const updatePayload: any = {
      fecha_programacion,
      updated_at: new Date().toISOString(),
    };
    if (estado) {
      updatePayload.estado = estado;
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const result = data as PublicacionProgramada;
    let avisoWebhook: string | undefined;
    if (estado === "aprobado") {
      if (!result.url_imagen || result.url_imagen.length <= 5) {
        const wh = await dispararWebhookN8N(result, "aprobar");
        if (wh.aviso) avisoWebhook = wh.aviso;
      }
    }

    return { success: true, data: result, aviso: avisoWebhook };
  } catch (err: any) {
    console.error("Error en reprogramarPublicacion:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
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

    // Obtener la publicación actual para regenerar su prompt si contenía términos obsoletos
    const { data: pubActual } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("id", id)
      .single();

    let nuevoPrompt: string | undefined;
    let nuevoDisenoBanner = (pubActual?.diseno_banner as any) || {};

    if (pubActual) {
      nuevoPrompt = construirPromptFluxRobusto(pubActual as PublicacionProgramada);
      nuevoDisenoBanner = {
        ...nuevoDisenoBanner,
        prompt_imagen_flux: nuevoPrompt,
      };
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: null,
        estado: "aprobado",
        diseno_banner: nuevoDisenoBanner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const result: PublicacionProgramada = {
      ...(data as PublicacionProgramada),
      prompt_imagen_flux: nuevoPrompt,
    };
    const wh = await dispararWebhookN8N(result, "aprobar");

    return { success: true, data: result, aviso: wh.aviso };
  } catch (err: any) {
    console.error("Error en regenerarCreativoPublicacion:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
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
    return { success: false, error: formatearErrorBDMarketing(err) };
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
    return { success: false, error: formatearErrorBDMarketing(err) };
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

    // Si se aprueban, disparar webhooks n8n solo para aquellas que NO tengan imagen aún
    let avisoWebhook: string | undefined;
    if (estado === "aprobado" && data) {
      for (const pub of data as PublicacionProgramada[]) {
        if (!pub.url_imagen || pub.url_imagen.length <= 5) {
          const wh = await dispararWebhookN8N(pub, "aprobar");
          if (!wh.enviado && wh.aviso) avisoWebhook = wh.aviso;
        }
      }
    }

    return { success: true, data: true, aviso: avisoWebhook };
  } catch (err: any) {
    console.error("Error en cambiarEstadoPublicacionesMasivo:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}


export interface ParametrosGeneracionOmnicanal {
  tema: string;
  canales: Array<"facebook" | "instagram" | "tiktok" | "whatsapp" | "mautic">;
  fechaInicio?: string;
  detallesAdicionales?: string;
}

/**
 * Invoca a la IA (Claude o Kimi según configuración) para generar propuestas de publicaciones de forma segura.
 * Soporta tanto el modo legado como el modo de Campaña Omnicanal Unificada (mismo concepto visual, copys adaptados por canal).
 */
export async function generarPublicacionesAutomaticas(
  paramsOCantidad: number | ParametrosGeneracionOmnicanal = 3,
  fechaInicio?: string,
  tema: string = "todos",
  canalDestino: string = "todas"
): Promise<ActionResult<PublicacionProgramada[]>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const esOmnicanal = typeof paramsOCantidad === "object";
    const canalesOmnicanal = esOmnicanal
      ? (paramsOCantidad.canales?.length > 0 ? paramsOCantidad.canales : ["instagram", "facebook", "tiktok"])
      : [];
    const temaFinal = esOmnicanal ? paramsOCantidad.tema : tema;
    const fechaBaseStr = (esOmnicanal ? paramsOCantidad.fechaInicio : fechaInicio) ||
      new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const detallesExtra = esOmnicanal ? (paramsOCantidad.detallesAdicionales || "") : "";
    const cantidadFinal = esOmnicanal ? canalesOmnicanal.length : (typeof paramsOCantidad === "number" ? paramsOCantidad : 3);

    const proveedor = process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic");
    let rawText = "";
    
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
   - Especialistas en impermeabilización profesional en León, Gto. Aplicación con rollo de membrana asfáltica prefabricada con gravilla blanca reflectiva termo-fusionada con soplete de gas propano con flama controlada. Costo: $210 pesos por metro cuadrado. Instalación en 1 día y garantía de 5 a 10 años por escrito.
   - Remodelaciones, ampliaciones (cocheras, cocinas, baños) bajo diseño arquitectónico. Visitas técnicas y presupuestos gratuitos a domicilio en León.
   - Suministro de Concreto Premezclado certificado para losas y firmes.

INSTRUCCIONES VISUALES DE ALTA CALIDAD FOTOGRÁFICA PARA 'sugerencia_visual' Y 'prompt_imagen_flux':
- Describe EXCLUSIVAMENTE escenas de fotografía comercial y editorial arquitectónica limpia (estilo revista Dwell o Architectural Digest), con luz natural de día, cielo despejado, tomas de plano medio o general en casas residenciales modernas en León, Gto.
- 'sugerencia_visual': Explicación breve en español para el usuario del CRM.
- 'prompt_imagen_flux' (OBLIGATORIO): Prompt en INGLÉS optimizado para el motor fotográfico Flux.
  * Debe describir UNA SOLA ESCENA FOTOGRÁFICA ESTÁTICA Y NÍTIDA (nunca secuencias temporales, nunca "before and after", nunca transiciones).
  * NUNCA pongas códigos de color HEX (#...), NUNCA pidas palabras negativas como "no bottles" o "no water", NUNCA incluyas albercas ni sábanas en publicaciones de techos/impermeabilización.
  * Para impermeabilización y techos: El prompt en inglés DEBE describir un técnico mexicano con uniforme azul marino limpio, guantes térmicos y casco, aplicando un rollo de membrana asfáltica prefabricada con gravilla blanca reflectiva ("white mineral granule-finished asphalt waterproofing membrane roll") utilizando un soplete de gas propano con flama visible ("propane gas blowtorch wand with a bright controlled orange and blue flame") derritiendo la base asfáltica mientras se desenrolla sobre la losa plana de concreto. Tanque de gas propano rojo con manguera cercano. Fondo con azotea terminada en gravilla blanca limpia reflejando el sol de León Gto.
  * PROHIBICIÓN ESTRICTA: NUNCA menciones rodillos (NO ROLLERS, no heavy rollers, no paint rollers, no lawn rollers), nunca cubetas con pintura ni escobas ni albercas. NUNCA menciones botellas, botes de spray, latas, envases con etiquetas, cubetas con texto ni logotipos en la fotografía. La foto debe ser 100% fotográfica, limpia y realista.
  * Estructura requerida: "Award-winning commercial architectural editorial photography of a modern Mexican residential [rooftop/living room/facade] in sunny León Guanajuato. [Descripción creíble de artesano o asesor mexicano con uniforme limpio realizando su labor]. Warm natural golden sunlight, clear blue sky, sharp realistic textures, shot on Hasselblad H6D-100c, 35mm lens, f/4, crisp realistic composition, 8k resolution."

REGLAS TÉCNICAS ESTRICTAS:
- RESPONDE EXCLUSIVAMENTE CON UN ARREGLO JSON VÁLIDO. No agregues explicaciones antes ni después del JSON.
- Sé potente, vendedor y conciso en cada publicación (copy de 150 a 250 palabras con viñetas y emojis). Evita textos excesivamente largos para asegurar que el arreglo JSON cierre de forma íntegra e impecable.
Formato esperado:
[
  {
    "titulo": "Título vendedor y corto de la publicación",
    "plataforma": "facebook | instagram | tiktok | whatsapp | mautic",
    "tipo_formato": "imagen | carrusel | video | reel",
    "contenido": "Texto/Copy completo con gancho, oferta, viñetas de valor, llamada a la acción al 477 465 4700 y hashtags.",
    "sugerencia_visual": "Descripción escénica en español.",
    "prompt_imagen_flux": "Award-winning commercial architectural editorial photography of a modern Mexican residential flat rooftop in sunny León Guanajuato. A skilled Mexican roofing technician in clean navy blue workwear, protective heat-resistant gloves, and safety helmet, applying a heavy roll of torch-on prefabricated waterproofing membrane finished with reflective white mineral granules. He precisely operates a long propane gas blowtorch wand with a bright controlled orange and blue flame, heating and melting the bottom asphalt layer as the roll unrolls seamlessly onto the primed flat concrete roof deck. Visible red propane cylinder tank with hose nearby. In the background, the pristine finished roof surface is covered in clean, neat parallel sheets of white mineral granules reflecting bright natural sunlight. Clear blue sky, crisp architectural lines, shot on Hasselblad H6D-100c, 35mm lens, f/4, authentic craftsmanship, crisp realistic textures, 8k resolution.",
    "guion_video": "Si es video o reel, proporciona el guion estructurado paso a paso con tomas y diálogos.",
    "diseno_banner": {
      "titulo_ad": "IMPERMEABILIZACIÓN PROFESIONAL $210/M² | TRASPASO DIRECTO INFONAVIT",
      "subtitulo_ad": "Instalación en 1 día • Garantía 10 años por escrito • WhatsApp 477 465 4700",
      "sellos": [
        { "texto_top": "GARANTÍA", "texto_bottom": "10 AÑOS", "color_fondo": "#2D4A2B" },
        { "texto_top": "MARCA", "texto_bottom": "GTO", "color_fondo": "#5C7A52" },
        { "texto_top": "CALIDAD", "texto_bottom": "PRO 100%", "color_fondo": "#C9A961" }
      ],
      "cta_texto": "WhatsApp Directo:",
      "telefono_contacto": "477 465 4700",
      "color_destacado": "#2D4A2B"
    }
  }
]`;

    let prompt = "";

    if (esOmnicanal) {
      const listaCanalesTexto = canalesOmnicanal.join(", ");
      prompt = `Genera una CAMPAÑA OMNICANAL UNIFICADA para SAUCEDA con fecha base de programación ${fechaBaseStr}.
TEMA O CAMPAÑA CENTRAL: "${temaFinal}".
${detallesExtra ? `DETALLES / OFERTA ADICIONAL DEL USUARIO: "${detallesExtra}"\n` : ""}
CANALES DESTINO SOLICITADOS: ${listaCanalesTexto}.

Debes generar EXACTAMENTE ${canalesOmnicanal.length} publicaciones en el arreglo JSON, UNA PARA CADA UNO de los siguientes canales: ${listaCanalesTexto}.

REGLAS DE CAMPAÑA OMNICANAL OBLIGATORIAS:
1. MISMO CONCEPTO VISUAL Y PROMPT DE FOTO COMPARTIDO:
   - Todas las publicaciones de la campaña deben tener EXACTAMENTE la misma 'sugerencia_visual' y el mismo 'prompt_imagen_flux' (fotografía comercial y arquitectónica realista en León Gto con luz natural, sin rodillos, sin botellas). De este modo, la misma fotografía profesional representará a la campaña en todas las redes.
2. ADAPTACIÓN AL LENGUAJE ESPECÍFICO DE CADA RED:
   - Para cada canal seleccionado, adapta el formato y copy nativo:
   * 'facebook': Post para el Feed de Facebook. Copy conversacional, persuasivo, historia/dolor/solución (PAS), viñetas de beneficios, llamado al WhatsApp 477 465 4700 y enlace. 'tipo_formato': 'imagen'.
   * 'instagram': Post para el Feed de Instagram. Gancho potente en primera línea, copy visual y dinámico, viñetas, llamado a comentar o enviar DM/WhatsApp en bio, bloque de hashtags estratégicos (#LeonGto #SaucedaMx). 'tipo_formato': 'imagen'.
   * 'tiktok': Video corto para TikTok. Título provocador, 'contenido' corto para el pie, y el campo 'guion_video' con estructura paso a paso: [00:00-00:03 Gancho visual], [00:03-00:15 Demostración del problema], [00:15-00:25 Solución Sauceda], [00:25-00:30 CTA a WhatsApp]. 'tipo_formato': 'video'.
   * 'whatsapp': Mensaje de difusión directa para WhatsApp. Redacción cercana y profesional, con formato de negritas (*texto*), viñetas claras y enlace directo https://wa.me/524774654700. 'tipo_formato': 'imagen'.
   * 'mautic': Correo electrónico o boletín. Asunto llamativo y cuerpo persuasivo. 'tipo_formato': 'imagen'.

3. FORMATO DE RESPUESTA:
   - Responde ÚNICAMENTE con el arreglo JSON de ${canalesOmnicanal.length} objetos, uno por cada canal solicitado (${listaCanalesTexto}).`;
    } else {
      let instruccionCanal = "Usa diferentes plataformas (Facebook, Instagram, TikTok).";
      let reglaComposicionFlux = "Para publicaciones de muro (Facebook e Instagram Post), la composición de imagen debe ser cuadrada 1:1 centrada. Para Reels y TikTok, la composición debe ser vertical 9:16 cinematográfica.";

      if (canalDestino === "facebook") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'facebook' y formato 'imagen' (post clásico de muro/feed).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE especificar una composición cuadrada 1:1 ('square 1:1 centered commercial editorial composition, perfectly framed for Facebook Feed').";
      } else if (canalDestino === "instagram_post") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'instagram' y formato 'imagen' (post de feed cuadrado).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE especificar una composición cuadrada 1:1 ('square 1:1 clean aesthetic composition, perfectly framed for Instagram Feed').";
      } else if (canalDestino === "instagram_reel") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'instagram' y formato 'reel' (Reel dinámico con guion de video estructurado).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE especificar una composición vertical 9:16 ('cinematic vertical 9:16 portrait composition, eye-level framing with safe overhead headroom for Instagram Reel').";
      } else if (canalDestino === "tiktok") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'tiktok' y formato 'reel' o 'video' (videos verticales con gancho viral en los primeros 3 segundos).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE especificar una composición vertical 9:16 ('cinematic vertical 9:16 composition, eye-level framing with safe overhead headroom for TikTok').";
      } else if (canalDestino === "whatsapp") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'whatsapp' y formato 'imagen' (mensaje de WhatsApp directo con viñetas y foto limpia).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE especificar una composición cuadrada 1:1 ('square 1:1 clean commercial composition').";
      } else if (canalDestino === "mautic") {
        instruccionCanal = "OBLIGATORIO: Todas las propuestas deben ser EXCLUSIVAMENTE para la plataforma 'mautic' (email marketing) con formato 'imagen' (estructura de boletín/correo electrónico con asunto atractivo).";
        reglaComposicionFlux = "OBLIGATORIO PARA FLUX: El campo 'prompt_imagen_flux' DEBE describir una imagen comercial nítida de alta definición.";
      }

      prompt = `Genera exactamente ${cantidadFinal} propuestas de publicaciones de marketing para el día ${fechaBaseStr}.\n${instruccionCanal}\n${reglaComposicionFlux}`;

      if (temaFinal && temaFinal !== "todos") {
        prompt += `\n\nENFOQUE OBLIGATORIO DE TEMA:
Todas las publicaciones generadas deben centrarse estrictamente en la siguiente campaña o tema de negocio: "${temaFinal}".
Adapta este mismo tema a las diferentes plataformas y formatos de forma inteligente para que actúen como una campaña unificada.`;
      } else {
        prompt += `\nAlterna entre temas de Bienes Raíces (Traspasos, Compra Directa) e Impermeabilización/Remodelación de Construcción de forma variada en cada publicación.`;
      }
    }

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

    if (proveedor === "kimi") {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) throw new Error("Falta la API Key de Kimi (KIMI_API_KEY) en las variables de entorno.");
      const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
      const model = process.env.KIMI_MODEL || "kimi-k3";

      console.log(`Llamando a Kimi (${model}) para generar ${cantidadFinal} publicaciones...`);

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
          temperature: 0.8,
          max_tokens: 8192
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

      console.log(`Llamando a Claude (${model}) para generar ${cantidadFinal} publicaciones...`);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 8192,
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

    const propuestas = parsearJsonResiliente<any[]>(rawText);
    if (!Array.isArray(propuestas) || propuestas.length === 0) {
      throw new Error("La respuesta no contiene propuestas de publicaciones válidas.");
    }

    const publicacionesCreadas: PublicacionProgramada[] = [];
    const horarios = ["09:00:00", "14:00:00", "19:00:00"];
    const campanaId = `campana_${Date.now()}`;
    const promptFluxUnificado = propuestas[0]?.prompt_imagen_flux || "";

    for (let i = 0; i < propuestas.length; i++) {
      const prop = propuestas[i];
      const horarioStr = horarios[i % horarios.length];
      const fechaProg = `${fechaBaseStr}T${horarioStr}-06:00`;

      let plataformaFinal = prop.plataforma;
      let formatoFinal = prop.tipo_formato || "imagen";

      if (prop.plataforma === "tiktok") {
        formatoFinal = "video";
      }

      if (!esOmnicanal) {
        if (canalDestino === "facebook") {
          plataformaFinal = "facebook";
          formatoFinal = "imagen";
        } else if (canalDestino === "instagram_post") {
          plataformaFinal = "instagram";
          formatoFinal = "imagen";
        } else if (canalDestino === "instagram_reel") {
          plataformaFinal = "instagram";
          formatoFinal = "reel";
        } else if (canalDestino === "tiktok") {
          plataformaFinal = "tiktok";
          formatoFinal = "reel";
        } else if (canalDestino === "whatsapp") {
          plataformaFinal = "whatsapp";
          formatoFinal = "imagen";
        } else if (canalDestino === "mautic") {
          plataformaFinal = "mautic";
          formatoFinal = "imagen";
        }
      }

      const esVertical =
        formatoFinal === "reel" ||
        formatoFinal === "video" ||
        plataformaFinal === "tiktok";
      const aspectRatio = esVertical ? "9:16" : "1:1";

      const propAjustada: PublicacionProgramada = {
        ...prop,
        plataforma: plataformaFinal,
        tipo_formato: formatoFinal,
      };

      const payload = {
        titulo: prop.titulo,
        contenido: prop.contenido,
        plataforma: plataformaFinal,
        tipo_formato: formatoFinal,
        sugerencia_visual: prop.sugerencia_visual || "",
        guion_video: prop.guion_video || "",
        diseno_banner: {
          ...(prop.diseno_banner || {}),
          aspect_ratio: aspectRatio,
          prompt_imagen_flux: (esOmnicanal && promptFluxUnificado)
            ? promptFluxUnificado
            : (prop.prompt_imagen_flux || construirPromptFluxRobusto(propAjustada)),
          ...(esOmnicanal ? { campana_id: campanaId, campana_nombre: temaFinal } : {}),
        },
        fecha_programacion: fechaProg,
        estado: "pendiente_revision" as const,
        notas_revision: esOmnicanal ? `Campaña Omnicanal: ${temaFinal}` : "",
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
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Adapta una publicación existente (con su imagen ya aprobada) a otros canales y formatos
 * manteniendo la coherencia de la campaña y el mismo arte visual.
 */
export async function adaptarPublicacionAOtrasRedes(params: {
  idPublicacionOriginal: string;
  canalesDestino: Array<"facebook" | "instagram" | "tiktok" | "whatsapp" | "mautic">;
  instruccionesExtra?: string;
}): Promise<ActionResult<PublicacionProgramada[]>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { data: pubOriginal, error: errPub } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("id", params.idPublicacionOriginal)
      .single();

    if (errPub || !pubOriginal) {
      return { success: false, error: "Publicación original no encontrada." };
    }

    const canales = (params.canalesDestino || []).filter((c) => c !== pubOriginal.plataforma);
    if (canales.length === 0) {
      return {
        success: false,
        error: "Por favor selecciona al menos un canal destino diferente al actual.",
      };
    }

    const proveedor = process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic");
    let rawText = "";

    const systemPrompt = `Eres el Director Creativo y Copywriter Senior de SAUCEDA en León, Guanajuato, México.
Tu tarea es tomar una publicación existente de Sauceda que ya fue creada y aprobada para la red '${pubOriginal.plataforma}' y ADAPTARLA al lenguaje, estilo y formato nativo de las siguientes redes: ${canales.join(", ")}.

REGLAS DE ADAPTACIÓN:
1. Mismo concepto y oferta: Mantén la propuesta de valor, precios, teléfono de contacto (477 465 4700) y beneficios de Sauceda.
2. Adaptación por canal:
   - 'facebook' (tipo_formato: 'imagen'): Copy narrativo, persuasivo, historia/dolor/solución (PAS), viñetas de valor, llamado claro al WhatsApp y enlace.
   - 'instagram' (tipo_formato: 'imagen'): Gancho potente en primera línea, copy visual y dinámico, espaciado limpio, llamado a comentar o enviar DM/WhatsApp en bio, hashtags relevantes (#LeonGto #SaucedaMx).
   - 'tiktok' (tipo_formato: 'video'): Título llamativo, 'contenido' corto para pie de video y 'guion_video' con tomas y tiempos estructurados (0-3s gancho, 3-20s desarrollo, 20-30s CTA).
   - 'whatsapp' (tipo_formato: 'imagen'): Mensaje directo con formato de negritas (*negrita*), viñetas y enlace directo https://wa.me/524774654700.
   - 'mautic' (tipo_formato: 'imagen'): Asunto atractivo y correo persuasivo.

3. RESPONDE EXCLUSIVAMENTE CON UN ARREGLO JSON DE ${canales.length} ELEMENTOS, exactamente uno por cada canal destino (${canales.join(", ")}).`;

    const promptUser = `PUBLICACIÓN ORIGINAL DE REFERENCIA:
- Plataforma origen: ${pubOriginal.plataforma}
- Título: ${pubOriginal.titulo}
- Contenido original:
${pubOriginal.contenido}
- Sugerencia visual: ${pubOriginal.sugerencia_visual || "No especificada"}
${params.instruccionesExtra ? `\nINSTRUCCIONES EXTRA DEL USUARIO: ${params.instruccionesExtra}` : ""}

CANALES DESTINO A GENERAR: ${canales.join(", ")}.

Genera el arreglo JSON con exactamente ${canales.length} publicaciones adaptadas (una para cada canal en ${canales.join(", ")}).
Formato esperado para cada objeto:
{
  "titulo": "Título adaptado a la red",
  "plataforma": "facebook | instagram | tiktok | whatsapp | mautic",
  "tipo_formato": "imagen | video | reel",
  "contenido": "Texto adaptado a la red",
  "sugerencia_visual": "${pubOriginal.sugerencia_visual || ""}",
  "guion_video": "Si es tiktok o video, guion estructurado; si no, cadena vacía"
}`;

    if (proveedor === "kimi") {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) throw new Error("Falta KIMI_API_KEY en variables de entorno.");
      const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
      const model = process.env.KIMI_MODEL || "kimi-k3";

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: promptUser },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });

      if (!res.ok) {
        throw new Error(`Kimi API error ${res.status}: ${await res.text()}`);
      }
      const json = await res.json();
      rawText = (json.choices?.[0]?.message?.content || "").trim();
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en variables de entorno.");
      const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [{ role: "user", content: promptUser }],
          system: systemPrompt,
        }),
      });

      if (!res.ok) {
        throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
      }
      const resultJson = await res.json();
      rawText = (resultJson.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text ?? "")
        .join("")
        .trim();
    }

    const propuestas = parsearJsonResiliente<any[]>(rawText);
    if (!Array.isArray(propuestas) || propuestas.length === 0) {
      throw new Error("No se obtuvieron adaptaciones válidas de la IA.");
    }

    const publicacionesCreadas: PublicacionProgramada[] = [];
    const ahoraIso = new Date().toISOString();

    for (const prop of propuestas) {
      const formatoFinal = prop.plataforma === "tiktok" ? "video" : (prop.tipo_formato || "imagen");
      const esVertical = formatoFinal === "video" || formatoFinal === "reel" || prop.plataforma === "tiktok";
      const aspectRatio = esVertical ? "9:16" : "1:1";

      const payload = {
        titulo: prop.titulo || pubOriginal.titulo,
        contenido: prop.contenido,
        plataforma: prop.plataforma,
        tipo_formato: formatoFinal,
        sugerencia_visual: pubOriginal.sugerencia_visual || prop.sugerencia_visual || "",
        guion_video: prop.guion_video || "",
        url_imagen: pubOriginal.url_imagen || null, // ¡Hereda la misma fotografía aprobada!
        diseno_banner: {
          ...(pubOriginal.diseno_banner || {}),
          aspect_ratio: aspectRatio,
          prompt_imagen_flux: pubOriginal.prompt_imagen_flux || pubOriginal.diseno_banner?.prompt_imagen_flux || "",
          campana_origen_id: pubOriginal.id,
        },
        fecha_programacion: pubOriginal.fecha_programacion || ahoraIso,
        // Al replicar desde una publicación existente, el creativo ya está producido y aprobado.
        // Pasa directamente a 'aprobado' (Listo para Publicar / Programar) para no re-entrar a n8n
        // ni sobreescribir la imagen aprobada.
        estado: "aprobado" as const,
        notas_revision: `Adaptado con IA para ${prop.plataforma} desde publicación original aprobada`,
        created_at: ahoraIso,
        updated_at: ahoraIso,
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
    console.error("Error en adaptarPublicacionAOtrasRedes:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Actualiza directamente la URL del creativo/imagen de una publicación (ej. tras editar en Canva).
 */
export async function actualizarImagenManual(
  id: string,
  urlImagen: string
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    // Limpiar si por alguna razón se intentara pasar una URL con banner SVG
    let urlLimpia = urlImagen.trim();
    if (urlLimpia.includes("/api/marketing/generar-banner?foto=")) {
      const match = urlLimpia.match(/foto=([^&]+)/);
      if (match && match[1]) {
        urlLimpia = decodeURIComponent(match[1]);
      }
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: urlLimpia,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PublicacionProgramada };
  } catch (err: any) {
    console.error("Error al actualizar imagen de publicación:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Restaura la fotografía original limpia generada por IA (Flux)
 * si la publicación tiene actualmente un banner SVG compuesto con textos pegados.
 */
export async function restaurarFotoLimpia(
  id: string
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const { data: post, error: fetchErr } = await sb
      .from("publicaciones_programadas")
      .select("url_imagen")
      .eq("id", id)
      .single();

    if (fetchErr || !post) throw fetchErr || new Error("Publicación no encontrada");

    let urlLimpia = post.url_imagen || "";
    if (urlLimpia.includes("generar-banner")) {
      const match = urlLimpia.match(/foto=([^&]+)/);
      if (match && match[1]) {
        urlLimpia = decodeURIComponent(match[1]);
      }
    }

    const { data, error } = await sb
      .from("publicaciones_programadas")
      .update({
        url_imagen: urlLimpia,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PublicacionProgramada };
  } catch (err: any) {
    console.error("Error al restaurar foto limpia:", err);
    return { success: false, error: formatearErrorBDMarketing(err) };
  }
}

/**
 * Consulta el estado y diagnóstico de la conexión con Meta (Página de Facebook e Instagram).
 */
export async function consultarEstadoConexionMeta(
  tokenManual?: string,
  pageIdManual?: string
): Promise<ActionResult<EstadoConexionMeta>> {
  try {
    await requireAdministrador();
    const estado = await probarConexionMeta(tokenManual, pageIdManual);
    return { success: estado.ok, data: estado, error: estado.error };
  } catch (err: any) {
    console.error("Error al consultar estado de conexión Meta:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Guarda las credenciales de Meta (Page ID, Instagram ID, Token de Acceso) en la BD.
 */
export async function guardarCredencialesMeta(config: {
  pageId?: string;
  pageAccessToken?: string;
  instagramId?: string;
}): Promise<ActionResult<boolean>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    const updates: { clave: string; valor: string; updated_at: string }[] = [];
    const ahora = new Date().toISOString();

    let pageIdToSave = config.pageId ? config.pageId.trim() : "";
    let pageTokenToSave = config.pageAccessToken ? config.pageAccessToken.trim() : "";
    let instagramIdToSave = config.instagramId ? config.instagramId.trim() : "";

    // Si nos pasaron un token, intentar auto-descubrir la Página y su Token específico via /me/accounts
    if (pageTokenToSave) {
      try {
        const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(pageTokenToSave)}`);
        const accountsData = await accountsRes.json();
        if (accountsRes.ok && accountsData?.data && accountsData.data.length > 0) {
          const pagina = pageIdToSave
            ? accountsData.data.find((p: any) => p.id === pageIdToSave) || accountsData.data[0]
            : accountsData.data[0];

          if (pagina) {
            if (!pageIdToSave || pageIdToSave === "61589957630232") {
              pageIdToSave = pagina.id;
            }
            // Guardar el System User Token original y el Page Token específico
            updates.push({ clave: "meta_system_user_token", valor: pageTokenToSave, updated_at: ahora });
            if (pagina.access_token) {
              pageTokenToSave = pagina.access_token;
            }

            // Consultar Instagram vinculado a la página si aún no lo tenemos
            if (!instagramIdToSave || instagramIdToSave === "17841427222951604") {
              try {
                const igRes = await fetch(`https://graph.facebook.com/v21.0/${pagina.id}?fields=instagram_business_account&access_token=${encodeURIComponent(pageTokenToSave)}`);
                const igData = await igRes.json();
                if (igData?.instagram_business_account?.id) {
                  instagramIdToSave = igData.instagram_business_account.id;
                }
              } catch (igErr) {
                console.warn("No se pudo auto-descubrir Instagram:", igErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("Fallo en auto-descubrimiento de cuentas:", e);
      }
    }

    if (pageIdToSave) {
      updates.push({ clave: "meta_page_id", valor: pageIdToSave, updated_at: ahora });
    }
    if (pageTokenToSave) {
      updates.push({ clave: "meta_page_access_token", valor: pageTokenToSave, updated_at: ahora });
    }
    if (instagramIdToSave) {
      updates.push({ clave: "meta_instagram_id", valor: instagramIdToSave, updated_at: ahora });
    }

    if (updates.length > 0) {
      const { error } = await sb
        .from("configuracion_agente")
        .upsert(updates, { onConflict: "clave" });

      if (error) throw error;
    }

    return { success: true, data: true };
  } catch (err: any) {
    console.error("Error al guardar credenciales Meta:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Ejecuta la publicación directa a Meta (Página de Facebook y/o Instagram) vía Graph API.
 * Actualiza el estado a 'publicado', almacena el permalink y notifica a n8n.
 */
export async function ejecutarPublicacionMeta(
  idPublicacion: string,
  forzarDestino?: "facebook" | "instagram" | "ambas"
): Promise<ActionResult<PublicacionProgramada>> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();

    // 1. Obtener la publicación
    const { data: pub, error: fetchErr } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("id", idPublicacion)
      .single();

    if (fetchErr || !pub) throw fetchErr || new Error("Publicación no encontrada");

    const plataforma = pub.plataforma;
    const destinoFinal =
      forzarDestino ||
      (plataforma === "instagram" ? "instagram" : "facebook");

    let resultadoMeta: any = null;
    const errores: string[] = [];

    // Resolver URLs de medios
    let urlImg = pub.url_imagen || "";
    let baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || "").replace(/\/$/, "");

    try {
      const headerList = await headers();
      const host = headerList.get("x-forwarded-host") || headerList.get("host");
      const proto = headerList.get("x-forwarded-proto") || "https";
      if (host && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("192.168.")) {
        baseUrl = `${proto}://${host}`;
      }
    } catch {
      // Ignorar si headers() no está disponible
    }

    if (!baseUrl) {
      baseUrl = "https://crm.saucedamx.com";
    }

    // Si la imagen es una URL relativa interna o contiene parámetros de render
    if (urlImg.startsWith("/")) {
      urlImg = `${baseUrl}${urlImg}`;
    }

    const esVideoReal = esArchivoVideoReal(urlImg);

    // Para Instagram: Instagram exige JPEG obligatorio y relación de aspecto 4:5 a 1.91:1 para imágenes.
    let urlImagenInstagram = urlImg;
    if (urlImg && !esVideoReal) {
      if (urlImg.includes("images.unsplash.com")) {
        // En Unsplash forzamos fm=jpg para entrega directa en JPEG a Meta
        try {
          const u = new URL(urlImg);
          u.searchParams.set("fm", "jpg");
          u.searchParams.delete("auto");
          urlImagenInstagram = u.toString();
        } catch {
          urlImagenInstagram = urlImg;
        }
      } else if (urlImg.startsWith("data:")) {
        // Si es un data URI en base64, enrutar por el proxy con el ID
        urlImagenInstagram = `${baseUrl}/api/marketing/imagen/${pub.id}.jpg`;
      } else {
        // Comprobar si es un archivo que termina directamente en .jpg o .jpeg (sin contar query params)
        let esJpgDirecto = false;
        try {
          const u = new URL(urlImg);
          const p = u.pathname.toLowerCase();
          if ((p.endsWith(".jpg") || p.endsWith(".jpeg")) && !urlImg.includes("generar-banner")) {
            esJpgDirecto = true;
          }
        } catch {}

        if (esJpgDirecto) {
          urlImagenInstagram = urlImg;
        } else {
          // Si es WebP (Replicate), banner compuesto SVG, o cualquier otro formato:
          // Pasar al proxy con ?url= para conversión instantánea a JPEG con sharp y auto-ajuste de aspecto
          urlImagenInstagram = `${baseUrl}/api/marketing/imagen/${pub.id}.jpg?url=${encodeURIComponent(urlImg)}`;
        }
      }
    }

    // Verificar si la URL de la imagen original está viva antes de detonar en Meta
    if (urlImg && urlImg.startsWith("http") && !urlImg.includes("/api/marketing/imagen/")) {
      try {
        const checkRes = await fetch(urlImg, { method: "HEAD" });
        if (checkRes.status === 404) {
          return {
            success: false,
            error: "La imagen de esta publicación ya expiró o no está disponible en el servidor (código 404). Por favor haz clic en '👁️ Previsualizar' -> '🎨 Regenerar Imagen' (o sube una foto nueva) para actualizar el arte antes de publicar en Instagram.",
          };
        }
      } catch (checkErr) {
        console.warn("Fallo en comprobación preliminar de imagen:", checkErr);
      }
    }

    const payloadPub = {
      contenido: pub.contenido,
      urlImagen: esVideoReal ? undefined : urlImg,
      urlVideo: esVideoReal ? urlImg : undefined,
      tipoFormato: (esVideoReal ? pub.tipo_formato : "imagen") as any,
    };

    // Publicar en Facebook si corresponde
    if (destinoFinal === "facebook" || destinoFinal === "ambas") {
      const resFb = await publicarEnFacebook(payloadPub);
      if (resFb.ok) {
        resultadoMeta = resFb;
      } else {
        errores.push(`Facebook: ${resFb.error}`);
      }
    }

    // Publicar en Instagram si corresponde (con URL garantizada en JPEG para imágenes)
    if (destinoFinal === "instagram" || destinoFinal === "ambas") {
      const resIg = await publicarEnInstagram({
        ...payloadPub,
        urlImagen: esVideoReal ? undefined : urlImagenInstagram,
      });
      if (resIg.ok) {
        resultadoMeta = resIg;
      } else {
        errores.push(`Instagram: ${resIg.error}`);
      }
    }

    if (!resultadoMeta && errores.length > 0) {
      const errorMsg = errores.join(" | ");
      try {
        const { error: errUpdate } = await sb
          .from("publicaciones_programadas")
          .update({
            error_publicacion: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", idPublicacion);

        if (errUpdate && errUpdate.message?.includes("schema cache")) {
          // Si la columna error_publicacion aún no existe en BD, guardar como notas_revision para no bloquear
          await sb
            .from("publicaciones_programadas")
            .update({
              notas_revision: `[Error Meta]: ${errorMsg}`.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", idPublicacion);
        }
      } catch (logErr) {
        console.warn("No se pudo registrar error_publicacion en BD:", logErr);
      }

      return {
        success: false,
        error: errorMsg,
      };
    }

    // 3. Actualizar la publicación como publicada en la base de datos
    const ahoraIso = new Date().toISOString();
    const updateData: any = {
      estado: "publicado",
      meta_post_id: resultadoMeta?.postId || resultadoMeta?.mediaId || null,
      url_publicacion: resultadoMeta?.permalink || null,
      publicado_en: ahoraIso,
      fecha_programacion: ahoraIso, // Actualizar para que el calendario posicione el post en la fecha exacta de publicación
      error_publicacion: null,
      updated_at: ahoraIso,
    };

    let pubActualizada: any = null;
    const { data: dataActualizada, error: updateErr } = await sb
      .from("publicaciones_programadas")
      .update(updateData)
      .eq("id", idPublicacion)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.warn("Aviso al actualizar con campos Meta extendidos en BD, aplicando fallback resiliente:", updateErr.message);
      
      // Intento 2: Sin error_publicacion (manteniendo tracking de URL y Post ID)
      const { data: fallbackTrack, error: errTrack } = await sb
        .from("publicaciones_programadas")
        .update({
          estado: "publicado",
          meta_post_id: resultadoMeta?.postId || resultadoMeta?.mediaId || null,
          url_publicacion: resultadoMeta?.permalink || null,
          publicado_en: ahoraIso,
          fecha_programacion: ahoraIso,
          updated_at: ahoraIso,
        })
        .eq("id", idPublicacion)
        .select()
        .maybeSingle();

      if (!errTrack && fallbackTrack) {
        pubActualizada = fallbackTrack;
      } else {
        // Intento 3: Actualizar campos mínimos garantizados
        const { data: pubFallback, error: errFallback } = await sb
          .from("publicaciones_programadas")
          .update({
            estado: "publicado",
            fecha_programacion: ahoraIso,
            updated_at: ahoraIso,
          })
          .eq("id", idPublicacion)
          .select()
          .maybeSingle();

        if (errFallback) {
          console.error("Error crítico al actualizar estado publicado en BD:", errFallback);
        }
        pubActualizada = pubFallback || { ...pub, estado: "publicado" };
      }
    } else {
      pubActualizada = dataActualizada || { ...pub, estado: "publicado" };
    }

    // Garantizar que el objeto retornado refleje siempre el estado publicado, fecha exacta y enlace
    pubActualizada = {
      ...(pubActualizada || pub),
      estado: "publicado",
      fecha_programacion: ahoraIso,
      url_publicacion: resultadoMeta?.permalink || pubActualizada?.url_publicacion || null,
      meta_post_id: resultadoMeta?.postId || resultadoMeta?.mediaId || pubActualizada?.meta_post_id || null,
      publicado_en: ahoraIso,
    };

    // 4. Disparar sincronización con n8n
    const wh = await dispararWebhookN8N(pubActualizada as PublicacionProgramada, "publicar");

    return {
      success: true,
      data: pubActualizada as PublicacionProgramada,
      aviso: wh.aviso || `Publicado exitosamente en Meta (${resultadoMeta?.plataforma}).`,
    };
  } catch (err: any) {
    console.error("Error en ejecutarPublicacionMeta:", err);
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Procesa y ejecuta automáticamente las publicaciones programadas cuya fecha y hora ya se cumplieron.
 * Puede ser ejecutado por un Cron Job (Vercel, Supabase pg_cron, n8n) o al cargar el dashboard de publicaciones.
 */
export async function procesarPublicacionesProgramadasVencidas(): Promise<ActionResult<{
  procesadas: number;
  exitosas: number;
  fallidas: number;
  detalles: Array<{ id: string; plataforma: string; status: "publicado" | "error" | "omitido"; mensaje?: string }>;
}>> {
  try {
    const sb = supabaseServidor();
    const ahoraIso = new Date().toISOString();

    // 1. Buscar publicaciones aprobadas cuya fecha de programación ya se haya cumplido (<= ahora)
    const { data: vencidas, error } = await sb
      .from("publicaciones_programadas")
      .select("*")
      .eq("estado", "aprobado")
      .lte("fecha_programacion", ahoraIso)
      .order("fecha_programacion", { ascending: true })
      .limit(10); // Lote de hasta 10 para evitar timeouts

    if (error) throw error;
    if (!vencidas || vencidas.length === 0) {
      return { success: true, data: { procesadas: 0, exitosas: 0, fallidas: 0, detalles: [] } };
    }

    const detalles: Array<{ id: string; plataforma: string; status: "publicado" | "error" | "omitido"; mensaje?: string }> = [];
    let exitosas = 0;
    let fallidas = 0;

    for (const pub of vencidas as PublicacionProgramada[]) {
      // Si es Facebook o Instagram, publicamos automáticamente mediante Meta Graph API
      if (pub.plataforma === "facebook" || pub.plataforma === "instagram") {
        try {
          const res = await ejecutarPublicacionMeta(pub.id!, pub.plataforma);
          if (res.success) {
            exitosas++;
            detalles.push({ id: pub.id!, plataforma: pub.plataforma, status: "publicado", mensaje: "Publicado automáticamente en Meta por agenda programada" });
          } else {
            fallidas++;
            detalles.push({ id: pub.id!, plataforma: pub.plataforma, status: "error", mensaje: res.error });
          }
        } catch (postErr: any) {
          fallidas++;
          detalles.push({ id: pub.id!, plataforma: pub.plataforma, status: "error", mensaje: postErr.message });
        }
      } else {
        // Redes como TikTok o WhatsApp requieren despacho asistido desde el dispositivo móvil o webhook
        detalles.push({
          id: pub.id!,
          plataforma: pub.plataforma,
          status: "omitido",
          mensaje: `Publicación programada para ${pub.plataforma} lista en agenda (requiere envío manual o webhook)`
        });
      }
    }

    return {
      success: true,
      data: {
        procesadas: vencidas.length,
        exitosas,
        fallidas,
        detalles,
      }
    };
  } catch (err: any) {
    console.error("Error en procesarPublicacionesProgramadasVencidas:", err);
    return { success: false, error: err?.message || String(err) };
  }
}


