-- ============================================================
-- Asegurar buckets de Storage para la aplicación
-- ------------------------------------------------------------
-- Buckets públicos: documentos-ventas, expedientes-fotos
-- Bucket privado: formularios
-- ============================================================

insert into storage.buckets (id, name, public)
values 
  ('documentos-ventas', 'documentos-ventas', true),
  ('expedientes-fotos', 'expedientes-fotos', true),
  ('formularios', 'formularios', false)
on conflict (id) do update set public = excluded.public;
