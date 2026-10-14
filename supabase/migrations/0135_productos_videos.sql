-- Videos de trabajos realizados por producto/servicio del catálogo.
-- Se guardan ya optimizados para WhatsApp (MP4 H.264/AAC, máx. 16 MB) en el bucket
-- público expedientes-fotos; Sofía los envía por link cuando el cliente pide videos.
-- Formato: [{ "url": "...", "titulo": "...", "descripcion": "...", "duracion_seg": 42, "peso_bytes": 12345 }]
alter table productos_servicios
  add column if not exists videos jsonb not null default '[]'::jsonb;
