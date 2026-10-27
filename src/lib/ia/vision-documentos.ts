import { descargarMediaMeta } from "./audio";

export interface ResultadoVisionImagen {
  es_documento: boolean;
  tipo_documento?: "avaluo" | "escritura" | "predial" | "infonavit" | "identificacion" | "otro" | null;
  es_foto_inmueble: boolean;
  espacio_inmueble?: "fachada" | "sala" | "comedor" | "cocina" | "recamara" | "bano" | "cochera" | "patio" | "azotea" | "otro" | null;
  monto_avaluo?: number | null;
  metros_construccion?: number | null;
  metros_terreno?: number | null;
  direccion_detectada?: string | null;
  emisor_o_institucion?: string | null;
  resumen_descriptivo: string;
}

function llaveGemini(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

/**
 * Analiza una imagen recibida por WhatsApp mediante IA Multimodal (Gemini 2.5 Flash).
 * Discrimina entre documentos formales (avalúos, escrituras, predial, infonavit) y fotografías de inmuebles.
 */
export async function analizarImagenMeta(mediaId: string): Promise<ResultadoVisionImagen | null> {
  const apiKey = llaveGemini();
  if (!apiKey) {
    console.warn("[Vision Multimodal] No hay llave de Gemini configurada.");
    return null;
  }

  try {
    const media = await descargarMediaMeta(mediaId);
    if (!media || !media.buffer || media.buffer.length === 0) {
      console.warn(`[Vision Multimodal] No se pudo descargar la imagen ${mediaId} de Meta.`);
      return null;
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt = `Eres el perito analista visual y de OCR para SAUCEDA Bienes Raíces y Construcción en México.
Analiza con precisión esta imagen enviada por un usuario por WhatsApp.

Determina si es:
1) Un DOCUMENTO (avalúo comercial, resumen ejecutivo de perito valuador, escritura pública, boleta predial, estado de cuenta Infonavit/Bancario, identificación o recibo).
2) Una FOTOGRAFÍA DE INMUEBLE (fachada de casa, sala, comedor, cocina, recámara, baño, cochera, patio, jardín, azotea).
3) OTRA IMAGEN.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura (sin bloques markdown ni explicaciones adicionales):
{
  "es_documento": true o false,
  "tipo_documento": "avaluo" | "escritura" | "predial" | "infonavit" | "identificacion" | "otro" | null,
  "es_foto_inmueble": true o false,
  "espacio_inmueble": "fachada" | "sala" | "comedor" | "cocina" | "recamara" | "bano" | "cochera" | "patio" | "azotea" | "otro" | null,
  "monto_avaluo": numero en MXN o null (ejemplo: 1710000),
  "metros_construccion": numero o null (ejemplo: 127.24),
  "metros_terreno": numero o null (ejemplo: 68.62),
  "direccion_detectada": "texto de dirección legible o null",
  "emisor_o_institucion": "nombre del perito valuador, notaría o banco si está visible o null",
  "resumen_descriptivo": "Resumen conciso y profesional en 1 frase de lo que contiene la imagen"
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: media.mimeType, data: media.buffer.toString("base64") } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      console.error(`[Vision Multimodal] Error en API de Gemini: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    // Limpieza de formato json si viniera envuelto
    const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ResultadoVisionImagen;
    return parsed;
  } catch (err) {
    console.error("[Vision Multimodal] Excepción al procesar imagen:", err);
    return null;
  }
}
