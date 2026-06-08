-- Agregar nuevos campos al expediente para captación web
ALTER TABLE expedientes
ADD COLUMN tipo_credito TEXT,
ADD COLUMN direccion_propiedad TEXT,
ADD COLUMN link_google_maps TEXT,
ADD COLUMN necesidad TEXT;
