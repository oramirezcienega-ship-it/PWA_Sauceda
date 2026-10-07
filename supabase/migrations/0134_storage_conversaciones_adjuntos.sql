-- Bucket privado para adjuntos que se envían desde Conversaciones.
-- El navegador sube el archivo directo aquí (URL firmada) para no pasar por el
-- límite de ~6 MB de las funciones de Netlify; el servidor lo baja, lo sube a
-- WhatsApp y lo borra.
insert into storage.buckets (id, name, public, file_size_limit)
values ('conversaciones-adjuntos', 'conversaciones-adjuntos', false, 16777216)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
