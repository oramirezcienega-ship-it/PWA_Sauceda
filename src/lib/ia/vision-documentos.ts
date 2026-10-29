import { descargarMediaMeta } from "./audio";
import { modeloClaude, opcionesClaude, textoDeRespuesta } from "./claude";

export interface ResultadoVisionImagen {
  es_documento: boolean;
  tipo_documento?: "avaluo" | "escritura" | "predial" | "infonavit" | "identificacion" | "otro" | null;
  es_foto_inmueble: boolean;
  espacio_inmueble?: string | null;
  monto_avaluo?: number | null;
  metros_construccion?: number | null;
  metros_terreno?: number | null;
  direccion_detectada?: string | null;
  emisor_o_institucion?: string | null;
  estado_suelo?: string | null;
  requiere_demolicion_o_preparacion?: boolean | null;
  resumen_descriptivo: string;
}

function llaveGemini(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

function llaveAnthropic(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

const PROMPT_VISION = `Eres el perito analista visual, técnico de obra y de OCR para SAUCEDA Bienes Raíces y Construcción en León, Guanajuato, México.
Analiza con precisión esta imagen enviada por un usuario por WhatsApp.

Determina si es:
1) Un DOCUMENTO (avalúo comercial, resumen ejecutivo de perito valuador, escritura pública, boleta predial, estado de cuenta Infonavit/Bancario, identificación o recibo).
2) Una FOTOGRAFÍA DE INMUEBLE O DE ÁREA DE OBRA/SERVICIO (banqueta, cochera, patio, jardín, azotea, fachada, piso, losa, muro, baño, tubería, tinaco, cisterna, calentador solar, etc.).
3) OTRA IMAGEN.

Si es una fotografía de obra o inmueble:
- Identifica el área o espacio (ej. "banqueta y acceso a cochera", "cochera", "azotea", "patio", "baño", "fachada").
- Analiza con criterio técnico de edificación el estado del suelo o superficie: ¿tiene firme de concreto existente (en buen estado, desgastado, agrietado?), ¿es tierra, pasto o terracería?, ¿requiere demolición, picado o nivelación previa?, ¿hay grietas, humedad, moho o daños visibles?
- En "resumen_descriptivo" redacta un resumen conciso y muy informativo en 2 a 3 frases de lo que contiene la imagen, las condiciones visibles del suelo/espacio y lo que técnicamente requerirá para que el agente de atención (Sofía) cotice y responda al cliente con total precisión sin hacer preguntas a ciegas.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura (sin bloques markdown ni explicaciones adicionales):
{
  "es_documento": true o false,
  "tipo_documento": "avaluo" | "escritura" | "predial" | "infonavit" | "identificacion" | "otro" | null,
  "es_foto_inmueble": true o false,
  "espacio_inmueble": "nombre del espacio o null",
  "monto_avaluo": numero en MXN o null (ejemplo: 1710000),
  "metros_construccion": numero o null (ejemplo: 127.24),
  "metros_terreno": numero o null (ejemplo: 68.62),
  "direccion_detectada": "texto de dirección legible o null",
  "emisor_o_institucion": "nombre del perito valuador, notaría o banco si está visible o null",
  "estado_suelo": "descripción breve del suelo o null",
  "requiere_demolicion_o_preparacion": true o false o null,
  "resumen_descriptivo": "Resumen conciso y técnico de lo que contiene la imagen"
}`;

function parsearResultadoVision(rawText: string | null | undefined): ResultadoVisionImagen | null {
  if (!rawText) return null;
  try {
    const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ResultadoVisionImagen;
    if (parsed && typeof parsed.resumen_descriptivo === "string") {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error("[Vision Multimodal] Error al parsear JSON de visión:", err, rawText);
    return null;
  }
}

/**
 * Analiza imagen usando Anthropic Claude (modelo nativo multimodal activo en producción).
 */
async function analizarConClaude(
  media: { buffer: Buffer; mimeType: string },
  apiKey: string
): Promise<ResultadoVisionImagen | null> {
  const model = modeloClaude();
  const mediaType = (media.mimeType.split(";")[0].trim() || "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...opcionesClaude(model, { maxTokens: 1000 }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: media.buffer.toString("base64"),
              },
            },
            { type: "text", text: PROMPT_VISION },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[Vision Multimodal Claude] Error: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as any;
  const rawText = textoDeRespuesta(data);
  return parsearResultadoVision(rawText);
}

/**
 * Analiza imagen usando Google Gemini (cuando GEMINI_API_KEY está configurada).
 */
async function analizarConGemini(
  media: { buffer: Buffer; mimeType: string },
  apiKey: string
): Promise<ResultadoVisionImagen | null> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT_VISION },
              {
                inline_data: {
                  mime_type: media.mimeType.split(";")[0].trim() || "image/jpeg",
                  data: media.buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    console.error(`[Vision Multimodal Gemini] Error: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as any;
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parsearResultadoVision(rawText);
}

/**
 * Analiza una imagen recibida por WhatsApp mediante IA Multimodal (Claude / Gemini).
 * Discrimina entre documentos formales (avalúos, escrituras, predial, infonavit) y fotografías de inmuebles y obras.
 */
export async function analizarImagenMeta(mediaId: string): Promise<ResultadoVisionImagen | null> {
  const anthropicKey = llaveAnthropic();
  const geminiKey = llaveGemini();

  if (!anthropicKey && !geminiKey) {
    console.warn("[Vision Multimodal] No hay llaves de IA configuradas (ANTHROPIC_API_KEY ni GEMINI_API_KEY).");
    return null;
  }

  try {
    const media = await descargarMediaMeta(mediaId);
    if (!media || !media.buffer || media.buffer.length === 0) {
      console.warn(`[Vision Multimodal] No se pudo descargar la imagen ${mediaId} de Meta.`);
      return null;
    }

    // 1. Intentar con Anthropic Claude (motor activo por defecto)
    if (anthropicKey) {
      try {
        const resultado = await analizarConClaude(media, anthropicKey);
        if (resultado) return resultado;
      } catch (errClaude) {
        console.warn("[Vision Multimodal] Claude falló, intentando Gemini de respaldo:", errClaude);
      }
    }

    // 2. Respaldo o primario con Google Gemini
    if (geminiKey) {
      try {
        const resultado = await analizarConGemini(media, geminiKey);
        if (resultado) return resultado;
      } catch (errGemini) {
        console.error("[Vision Multimodal] Gemini falló:", errGemini);
      }
    }

    return null;
  } catch (err) {
    console.error("[Vision Multimodal] Excepción al procesar imagen:", err);
    return null;
  }
}
