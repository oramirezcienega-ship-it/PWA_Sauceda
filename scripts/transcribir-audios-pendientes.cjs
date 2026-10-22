// Transcribe las notas de voz de WhatsApp que quedaron sin texto ("(mensaje de tipo audio)").
// Meta guarda los audios ~30 días; los más viejos ya no se pueden descargar y se saltan.
// Uso: node --env-file=.env.local scripts/transcribir-audios-pendientes.cjs
// Requiere SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_TOKEN y GEMINI_API_KEY (u OPENAI_API_KEY).
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const WA = process.env.WHATSAPP_TOKEN;
const GEMINI = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
const OPENAI = process.env.OPENAI_API_KEY;
const PENDIENTE = '(mensaje de tipo audio)';

async function descargar(mediaId) {
  const info = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${WA}` } });
  if (!info.ok) return null;
  const { url, mime_type } = await info.json();
  if (!url) return null;
  const f = await fetch(url, { headers: { Authorization: `Bearer ${WA}` } });
  if (!f.ok) return null;
  return { buffer: Buffer.from(await f.arrayBuffer()), mimeType: (mime_type || 'audio/ogg').split(';')[0].trim() };
}

async function transcribir({ buffer, mimeType }) {
  if (GEMINI) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Transcribe literalmente este audio de WhatsApp (español de México). Devuelve SOLO el texto dicho, sin comillas, etiquetas ni comentarios. Si no se entiende nada o no hay voz, devuelve exactamente: (audio sin voz entendible)' },
          { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (r.ok) {
      const d = await r.json();
      const t = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (t) return t;
    } else console.error('  Gemini:', r.status, await r.text());
  }
  if (OPENAI) {
    const fd = new FormData();
    fd.append('file', new Blob([buffer], { type: mimeType }), 'audio.ogg');
    fd.append('model', 'whisper-1');
    fd.append('language', 'es');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI}` }, body: fd });
    if (r.ok) return ((await r.json()).text || '').trim() || null;
    console.error('  Whisper:', r.status, await r.text());
  }
  return null;
}

(async () => {
  if (!GEMINI && !OPENAI) throw new Error('Falta GEMINI_API_KEY u OPENAI_API_KEY');
  const { data, error } = await sb
    .from('mensajes_whatsapp')
    .select('id, telefono, texto, created_at')
    .like('texto', `[audio:%${PENDIENTE}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  console.log(`${data.length} audios sin transcribir`);
  let ok = 0;
  for (const m of data) {
    const mediaId = m.texto.match(/^\[audio:([^\]]+)\]/)?.[1];
    if (!mediaId) continue;
    const media = await descargar(mediaId);
    if (!media) { console.log(`- ${m.created_at} ${m.telefono}: ya no está en Meta`); continue; }
    const texto = await transcribir(media);
    if (!texto) { console.log(`- ${m.created_at} ${m.telefono}: no se pudo transcribir`); continue; }
    await sb.from('mensajes_whatsapp').update({ texto: `[audio:${mediaId}] ${texto}` }).eq('id', m.id);
    ok++;
    console.log(`✓ ${m.created_at} ${m.telefono}: ${texto}`);
  }
  console.log(`Listo: ${ok}/${data.length} transcritos.`);
})().catch((e) => { console.error(e); process.exit(1); });
