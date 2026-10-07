/** Envío de fotos a Telegram (complemento de enviarMensajeTelegram). */

/**
 * Envía hasta 10 fotos (URLs públicas http/https) como álbum. Si el álbum
 * falla, intenta una por una. Devuelve cuántas se enviaron.
 */
export async function enviarFotosTelegram(params: {
  botToken: string;
  chatId: string;
  urls: string[];
  caption?: string;
}): Promise<{ enviadas: number; error?: string }> {
  const urls = params.urls.filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);
  if (urls.length === 0) return { enviadas: 0 };

  const api = (metodo: string) => `https://api.telegram.org/bot${params.botToken}/${metodo}`;

  try {
    if (urls.length === 1) {
      const r = await fetch(api("sendPhoto"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: params.chatId, photo: urls[0], caption: params.caption }),
      });
      const d = await r.json();
      return d.ok ? { enviadas: 1 } : { enviadas: 0, error: d.description };
    }

    const r = await fetch(api("sendMediaGroup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        media: urls.map((u, i) => ({ type: "photo", media: u, ...(i === 0 && params.caption ? { caption: params.caption } : {}) })),
      }),
    });
    const d = await r.json();
    if (d.ok) return { enviadas: urls.length };

    // Alguna URL no es válida para Telegram: se intenta una por una
    let enviadas = 0;
    for (const u of urls) {
      const r1 = await fetch(api("sendPhoto"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: params.chatId, photo: u }),
      });
      const d1 = await r1.json();
      if (d1.ok) enviadas++;
    }
    return { enviadas, error: enviadas === 0 ? d.description : undefined };
  } catch (err: any) {
    return { enviadas: 0, error: err?.message };
  }
}

/**
 * Envía un documento (p. ej. un PDF generado en memoria) como archivo adjunto.
 * El caption admite HTML de Telegram (máx. 1024 caracteres).
 */
export async function enviarDocumentoTelegram(params: {
  botToken: string;
  chatId: string;
  contenido: Buffer;
  nombreArchivo: string;
  /** Tipo MIME del archivo (por defecto PDF). */
  mimeType?: string;
  caption?: string;
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  try {
    const form = new FormData();
    form.append("chat_id", params.chatId);
    form.append("document", new Blob([new Uint8Array(params.contenido)], { type: params.mimeType || "application/pdf" }), params.nombreArchivo);
    if (params.caption) {
      form.append("caption", params.caption);
      form.append("parse_mode", "HTML");
    }
    if (params.inlineKeyboard?.length) {
      form.append("reply_markup", JSON.stringify({ inline_keyboard: params.inlineKeyboard }));
    }
    const r = await fetch(`https://api.telegram.org/bot${params.botToken}/sendDocument`, { method: "POST", body: form });
    const d = await r.json();
    return d.ok ? { ok: true, messageId: d.result?.message_id } : { ok: false, error: d.description || "Error al enviar el documento." };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

/**
 * Envía hasta 10 fotos ya descargadas (en memoria) como álbum. Útil para
 * medios que Telegram no puede descargar por URL (p. ej. fotos de WhatsApp,
 * que requieren token). Si el álbum falla, intenta una por una.
 */
export async function enviarFotosBufferTelegram(params: {
  botToken: string;
  chatId: string;
  fotos: { contenido: Buffer; mimeType: string; nombre: string; caption?: string }[];
}): Promise<{ enviadas: number; error?: string }> {
  const fotos = params.fotos.slice(0, 10);
  if (fotos.length === 0) return { enviadas: 0 };
  const api = (metodo: string) => `https://api.telegram.org/bot${params.botToken}/${metodo}`;
  const blob = (f: (typeof fotos)[number]) => new Blob([new Uint8Array(f.contenido)], { type: f.mimeType });

  const unaPorUna = async (): Promise<number> => {
    let enviadas = 0;
    for (const f of fotos) {
      const form = new FormData();
      form.append("chat_id", params.chatId);
      form.append("photo", blob(f), f.nombre);
      if (f.caption) form.append("caption", f.caption.slice(0, 1024));
      const d = await (await fetch(api("sendPhoto"), { method: "POST", body: form })).json();
      if (d.ok) enviadas++;
    }
    return enviadas;
  };

  try {
    if (fotos.length === 1) {
      const n = await unaPorUna();
      return n ? { enviadas: n } : { enviadas: 0, error: "Telegram rechazó la foto." };
    }
    const form = new FormData();
    form.append("chat_id", params.chatId);
    form.append(
      "media",
      JSON.stringify(
        fotos.map((f, i) => ({
          type: "photo",
          media: `attach://f${i}`,
          ...(f.caption ? { caption: f.caption.slice(0, 1024) } : {}),
        }))
      )
    );
    fotos.forEach((f, i) => form.append(`f${i}`, blob(f), f.nombre));
    const d = await (await fetch(api("sendMediaGroup"), { method: "POST", body: form })).json();
    if (d.ok) return { enviadas: fotos.length };

    const n = await unaPorUna();
    return { enviadas: n, error: n === 0 ? d.description : undefined };
  } catch (err: any) {
    return { enviadas: 0, error: err?.message };
  }
}
