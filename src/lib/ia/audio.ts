import { normalizarTelefono } from "@/lib/telefono";

/**
 * Módulo de utilidades de voz y audio para Sofía IA.
 * Permite:
 * 1. Transcribir audios de WhatsApp (Gemini, con OpenAI Whisper de respaldo).
 * 2. Sintetizar respuestas escritas a audio usando OpenAI TTS o ElevenLabs.
 * 3. Gestionar archivos multimedia de WhatsApp (descargar, subir y enviar a clientes).
 */

/** Llave de Gemini (misma convención que el estimador de visión). */
function llaveGemini(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

/** ¿Hay algún motor de transcripción configurado? */
export function transcripcionDisponible(): boolean {
  return !!(llaveGemini() || process.env.OPENAI_API_KEY);
}

/** Descarga un archivo multimedia de WhatsApp (audio) desde Meta. */
export async function descargarMediaMeta(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    console.error("[Audio STT] Falta WHATSAPP_TOKEN.");
    return null;
  }
  const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!infoRes.ok) {
    console.error(`[Audio STT] No se pudo obtener la información del audio de Meta: ${infoRes.status} ${await infoRes.text()}`);
    return null;
  }
  const info = await infoRes.json() as { url?: string; mime_type?: string };
  if (!info.url) {
    console.error("[Audio STT] La respuesta de Meta no contiene una URL de descarga.");
    return null;
  }
  const fileRes = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) {
    console.error(`[Audio STT] Falló la descarga del archivo multimedia: ${fileRes.status}`);
    return null;
  }
  // "audio/ogg; codecs=opus" → "audio/ogg"
  const mimeType = (info.mime_type || "audio/ogg").split(";")[0].trim();
  return { buffer: Buffer.from(await fileRes.arrayBuffer()), mimeType };
}

/** Transcribe con Gemini (acepta audio en línea: ogg/opus, mp3, m4a, wav...). */
async function transcribirConGemini(buffer: Buffer, mimeType: string, apiKey: string): Promise<string | null> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: "Transcribe literalmente este audio de WhatsApp (español de México). " +
                "Devuelve SOLO el texto dicho, sin comillas, etiquetas ni comentarios. " +
                "Si no se entiende nada o no hay voz, devuelve exactamente: (audio sin voz entendible)",
            },
            { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    }
  );
  if (!res.ok) {
    console.error(`[Audio STT] Gemini falló: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const texto = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  return texto || null;
}

/** Transcribe con OpenAI Whisper. */
async function transcribirConWhisper(buffer: Buffer, mimeType: string, apiKey: string): Promise<string | null> {
  const ext = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("mp4") || mimeType.includes("aac") ? "m4a"
    : mimeType.includes("wav") ? "wav" : "ogg";
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });
  if (!res.ok) {
    console.error(`[Audio STT] Whisper falló: ${res.status} ${await res.text()}`);
    return null;
  }
  const result = await res.json() as { text?: string };
  return result.text?.trim() || null;
}

/**
 * Descarga el audio desde Meta y lo transcribe a texto.
 * Usa Gemini (GEMINI_API_KEY) y, si no está o falla, OpenAI Whisper (OPENAI_API_KEY).
 */
export async function transcribirAudioMeta(audioId: string): Promise<string | null> {
  const gemini = llaveGemini();
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!gemini && !openAiKey) {
    console.warn("[Audio STT] Falta GEMINI_API_KEY u OPENAI_API_KEY. Saltando transcripción.");
    return null;
  }

  try {
    const media = await descargarMediaMeta(audioId);
    if (!media) return null;

    if (gemini) {
      try {
        const texto = await transcribirConGemini(media.buffer, media.mimeType, gemini);
        if (texto) {
          console.log(`[Audio STT] Transcripción (Gemini): "${texto}"`);
          return texto;
        }
      } catch (err) {
        console.error("[Audio STT] Excepción con Gemini:", err);
      }
    }
    if (openAiKey) {
      const texto = await transcribirConWhisper(media.buffer, media.mimeType, openAiKey);
      if (texto) {
        console.log(`[Audio STT] Transcripción (Whisper): "${texto}"`);
        return texto;
      }
    }
    return null;
  } catch (err) {
    console.error("[Audio STT] Error durante el proceso de transcripción:", err);
    return null;
  }
}

/**
 * Convierte texto a voz generando un Buffer de audio.
 * Primero intenta usar ElevenLabs (si está configurado), y de lo contrario
 * recurre a OpenAI TTS.
 */
export async function generarAudioTTS(texto: string): Promise<Buffer | null> {
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  const elevenlabsVoiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Voz por defecto (Rachel)
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Intentar ElevenLabs si está configurado
  if (elevenlabsKey) {
    try {
      console.log(`[Audio TTS] Generando voz con ElevenLabs (Voice ID: ${elevenlabsVoiceId})...`);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenlabsVoiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": elevenlabsKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: texto,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (res.ok) {
        const ab = await res.arrayBuffer();
        console.log("[Audio TTS] Voz generada exitosamente con ElevenLabs.");
        return Buffer.from(ab);
      }
      console.error(`[Audio TTS] Error en ElevenLabs: ${res.status} ${await res.text()}`);
    } catch (err) {
      console.error("[Audio TTS] Excepción al llamar a ElevenLabs:", err);
    }
  }

  // 2. Fallback a OpenAI TTS
  if (openAiKey) {
    try {
      console.log("[Audio TTS] Generando voz con OpenAI TTS (tts-1)...");
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "tts-1",
          input: texto,
          voice: "shimmer",
          response_format: "mp3"
        })
      });

      if (res.ok) {
        const ab = await res.arrayBuffer();
        console.log("[Audio TTS] Voz generada exitosamente con OpenAI TTS.");
        return Buffer.from(ab);
      }
      console.error(`[Audio TTS] Error en OpenAI TTS: ${res.status} ${await res.text()}`);
    } catch (err) {
      console.error("[Audio TTS] Excepción al llamar a OpenAI TTS:", err);
    }
  }

  console.warn("[Audio TTS] No se pudo generar audio porque no hay credenciales (OPENAI_API_KEY/ELEVENLABS_API_KEY) o las APIs fallaron.");
  return null;
}

/**
 * Sube un buffer de audio a Meta Cloud API para obtener un media_id utilizable.
 */
export async function subirAudioAMeta(buffer: Buffer, mimeType: string, filename: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.error("[Audio Upload] Credenciales de WhatsApp incompletas en variables de entorno.");
    return null;
  }

  try {
    console.log(`[Audio Upload] Subiendo archivo a Meta (${filename}, ${mimeType})...`);
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", "audio");
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, filename);

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      console.error(`[Audio Upload] Error subiendo media a Meta: ${res.status} ${await res.text()}`);
      return null;
    }

    const result = await res.json() as { id?: string };
    console.log(`[Audio Upload] Archivo subido con éxito. Media ID: ${result.id ?? ""}`);
    return result.id || null;
  } catch (err) {
    console.error("[Audio Upload] Excepción al subir media a Meta:", err);
    return null;
  }
}

/**
 * Envía un mensaje de tipo audio por WhatsApp usando un media_id de Meta.
 */
export async function enviarWhatsAppAudio(
  telefono: string,
  mediaId: string
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = normalizarTelefono(telefono);

    if (!token || !phoneId) {
      return {
        ok: false,
        error: "WhatsApp no está configurado (faltan credenciales)."
      };
    }

    if (!to || to.length < 10) {
      return {
        ok: false,
        error: `Teléfono inválido o demasiado corto (${to || "vacío"}).`
      };
    }

    console.log(`[Audio Send] Enviando audio (Media ID: ${mediaId}) a ${to}...`);
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "audio",
        audio: { id: mediaId }
      })
    });

    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[Audio Send] Audio WhatsApp no enviado:", res.status, bodyText);
      return { ok: false, error: `Meta respondió con error: ${bodyText}` };
    }

    let messageId: string | undefined;
    try {
      const j = JSON.parse(bodyText);
      messageId = j?.messages?.[0]?.id;
    } catch {
      // Ignorar
    }
    console.log(`[Audio Send] Audio enviado con éxito. Message ID: ${messageId ?? ""}`);
    return { ok: true, messageId };
  } catch (err) {
    console.error("[Audio Send] Error al enviar audio por WhatsApp:", err);
    return { ok: false, error: "Error de red al enviar el WhatsApp." };
  }
}
