-- ============================================================
-- Storage para archivos de formularios (PDF / fotos)
-- ------------------------------------------------------------
-- Bucket privado. La subida y la lectura pasan por el servidor con la
-- service role key (que ignora las políticas de Storage). El admin ve los
-- archivos mediante URLs firmadas temporales.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('formularios', 'formularios', false)
on conflict (id) do nothing;
