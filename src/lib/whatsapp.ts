/**
 * Envío SALIENTE de mensajes por WhatsApp (Meta Cloud API). Best-effort:
 * si no hay credenciales configuradas o falla el envío, no interrumpe la
 * operación principal.
 *
 * Variables de entorno necesarias:
 *  - WHATSAPP_TOKEN            (token de acceso de la app de WhatsApp)
 *  - WHATSAPP_PHONE_NUMBER_ID  (ID del número emisor)
 *
 * Nota de Meta: el texto libre solo se entrega dentro de la ventana de 24 h
 * (cuando el cliente escribió primero). Para contactos fuera de esa ventana
 * se requiere una plantilla aprobada.
 */

const API_VERSION = "v21.0";

/** Normaliza un teléfono mexicano a formato internacional (52 + 10 dígitos). */
function normalizarTelefono(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d;
  if (d.length === 10) return "52" + d;
  return d;
}

/** Envía un mensaje de texto por WhatsApp. Devuelve el resultado. */
export async function enviarWhatsAppTexto(
  telefono: string,
  texto: string,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);
    if (!token || !phoneId) {
      return {
        ok: false,
        error: "WhatsApp no está configurado (faltan credenciales).",
      };
    }
    if (!to || to.length < 10) {
      return {
        ok: false,
        error: `Teléfono inválido o demasiado corto (${to || "vacío"}). Debe tener al menos 10 dígitos.`,
      };
    }

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body: texto },
        }),
      },
    );
    const bodyText = await res.text();
    if (!res.ok) {
      console.error("WhatsApp no enviado:", res.status, bodyText);
      // Extrae el mensaje/código reales de Meta para poder diagnosticar.
      let metaMsg = "";
      let metaCode: number | undefined;
      try {
        const j = JSON.parse(bodyText);
        metaMsg = j?.error?.message ?? "";
        metaCode = j?.error?.code;
      } catch {
        // respuesta no-JSON; se usa el genérico
      }
      const detalleTxt = metaMsg
        ? `Meta: ${metaMsg}${metaCode ? ` (código ${metaCode})` : ""}`
        : `Meta respondió con error ${res.status}.`;
      return { ok: false, error: detalleTxt };
    }
    let messageId: string | undefined;
    try {
      const j = JSON.parse(bodyText);
      messageId = j?.messages?.[0]?.id;
    } catch {
      // Ignorar
    }
    return { ok: true, messageId };
  } catch (err) {
    console.error("Error al enviar WhatsApp:", err);
    return { ok: false, error: "Error de red al enviar el WhatsApp." };
  }
}

/**
 * Envía un mensaje por WhatsApp usando una PLANTILLA aprobada (best-effort).
 * Sirve para el primer contacto "en frío" (fuera de la ventana de 24 h).
 *
 *  - parametrosCuerpo: valores para los {{1}}, {{2}}, … del cuerpo.
 *  - urlBotonParam: si la plantilla tiene un botón de URL dinámica, este es
 *    el valor de su parámetro (p. ej. el token del portal). Opcional.
 */
export async function enviarWhatsAppPlantilla(
  telefono: string,
  plantilla: string,
  idioma: string,
  parametrosCuerpo: string[] = [],
  urlBotonParam?: string,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);
    if (!token || !phoneId) {
      return {
        ok: false,
        error: "WhatsApp no está configurado (faltan credenciales).",
      };
    }
    if (!to || to.length < 10) {
      return {
        ok: false,
        error: `Teléfono inválido o demasiado corto (${to || "vacío"}). Debe tener al menos 10 dígitos.`,
      };
    }
    if (!plantilla) return { ok: false, error: "Falta el nombre de la plantilla." };

    const components: Record<string, unknown>[] = [];
    if (parametrosCuerpo.length > 0) {
      components.push({
        type: "body",
        parameters: parametrosCuerpo.map((text) => ({ type: "text", text })),
      });
    }
    if (urlBotonParam) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: urlBotonParam }],
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: plantilla,
            language: { code: idioma },
            ...(components.length ? { components } : {}),
          },
        }),
      },
    );
    const bodyText = await res.text();
    if (!res.ok) {
      let errorDetalle = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        errorDetalle = parsed?.error ? JSON.stringify(parsed.error) : bodyText;
      } catch {
        // respuesta no-JSON
      }
      return {
        ok: false,
        error: errorDetalle,
      };
    }
    let messageId: string | undefined;
    try {
      const j = JSON.parse(bodyText);
      messageId = j?.messages?.[0]?.id;
    } catch {
      // Ignorar
    }
    return { ok: true, messageId };
  } catch (err) {
    console.error("Error al enviar WhatsApp (plantilla):", err);
    return { ok: false, error: "Error de red al enviar el WhatsApp." };
  }
}

/** Plantilla de mensaje aprobada (o en revisión) tal como vive en Meta. */
export interface PlantillaWhatsApp {
  nombre: string;
  idioma: string;
  /** APPROVED | PENDING | REJECTED | … */
  estado: string;
  /** MARKETING | UTILITY | AUTHENTICATION */
  categoria: string;
  /** Texto del componente BODY (con sus {{1}}, {{2}}…). */
  cuerpo: string;
  /** Cantidad de parámetros {{n}} distintos en el cuerpo. */
  parametros: number;
  /** Estructura completa de componentes devueltos por Meta (BODY, BUTTONS, etc.) */
  components?: any[];
}

interface FilaPlantillaMeta {
  name: string;
  language: string;
  status: string;
  category: string;
  components?: { type: string; text?: string }[];
}

/**
 * Trae las plantillas de mensajes de la cuenta de WhatsApp Business (WABA)
 * desde la Graph API de Meta. Solo lectura: las plantillas se crean y se
 * aprueban en Meta, aquí únicamente se consultan para poder elegirlas.
 *
 * Requiere WHATSAPP_TOKEN y WHATSAPP_WABA_ID (ID de la cuenta de WhatsApp
 * Business, en Meta Business Settings → Cuentas → WhatsApp).
 */
export async function listarPlantillasAprobadas(): Promise<{
  ok: boolean;
  error?: string;
  plantillas: PlantillaWhatsApp[];
}> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const waba = process.env.WHATSAPP_WABA_ID;
    if (!token || !waba) {
      return {
        ok: false,
        error: "Faltan WHATSAPP_TOKEN o WHATSAPP_WABA_ID en la configuración.",
        plantillas: [],
      };
    }
    const url =
      `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates` +
      `?fields=name,status,language,category,components&limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const detalle = await res.text();
      console.error("No se pudieron leer plantillas:", res.status, detalle);
      let metaMsg = "";
      try {
        metaMsg = JSON.parse(detalle)?.error?.message ?? "";
      } catch {
        // respuesta no-JSON
      }
      return {
        ok: false,
        error: metaMsg || `Meta respondió con error ${res.status}.`,
        plantillas: [],
      };
    }
    const json = (await res.json()) as { data?: FilaPlantillaMeta[] };
    const plantillas: PlantillaWhatsApp[] = (json.data ?? []).map((t) => {
      const body = (t.components ?? []).find((c) => c.type === "BODY");
      const cuerpo = body?.text ?? "";
      const matches = cuerpo.match(/\{\{\d+\}\}/g);
      return {
        nombre: t.name,
        idioma: t.language,
        estado: t.status,
        categoria: t.category,
        cuerpo,
        parametros: matches ? new Set(matches).size : 0,
        components: t.components,
      };
    });
    return { ok: true, plantillas };
  } catch (err) {
    console.error("Error al consultar plantillas de WhatsApp:", err);
    return { ok: false, error: "Error de red al consultar Meta.", plantillas: [] };
  }
}

// Caché ligero en memoria de las plantillas de Meta para no consultar la Graph API
// en cada envío del lote del orquestador. TTL corto: las plantillas cambian poco.
let _cachePlantillas: { ts: number; plantillas: PlantillaWhatsApp[] } | null = null;
const _TTL_PLANTILLAS_MS = 60_000;

async function obtenerPlantillasCacheadas(): Promise<PlantillaWhatsApp[] | null> {
  if (_cachePlantillas && Date.now() - _cachePlantillas.ts < _TTL_PLANTILLAS_MS) {
    return _cachePlantillas.plantillas;
  }
  const { ok, plantillas } = await listarPlantillasAprobadas();
  if (!ok) return null;
  _cachePlantillas = { ts: Date.now(), plantillas };
  return plantillas;
}

/**
 * Reconstruye el texto final de una plantilla tal como lo recibe el cliente:
 * toma el cuerpo aprobado en Meta y sustituye {{1}}, {{2}}… por los parámetros
 * enviados. Sirve para guardar en el historial exactamente lo que vio el lead,
 * en lugar de una etiqueta interna con corchetes.
 *
 * Regresa null si no se puede obtener el cuerpo (error de red, plantilla no
 * encontrada) para que quien lo llame use un texto de respaldo y nunca rompa
 * el envío.
 */
export async function renderizarPlantilla(
  nombre: string,
  idioma: string,
  parametros: string[],
): Promise<string | null> {
  const plantillas = await obtenerPlantillasCacheadas();
  if (!plantillas) return null;

  const plantilla =
    plantillas.find((p) => p.nombre === nombre && p.idioma === idioma) ??
    plantillas.find((p) => p.nombre === nombre);

  if (!plantilla || !plantilla.cuerpo) return null;

  let texto = plantilla.cuerpo;
  parametros.forEach((valor, i) => {
    texto = texto.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, "g"), valor);
  });
  return texto;
}
