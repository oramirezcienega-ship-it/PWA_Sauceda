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
