-- Remover el check constraint restrictivo de la columna segmento de la tabla automation_sequences
-- para permitir almacenar tipos de negocio / servicios de reactivación personalizados.
ALTER TABLE public.automation_sequences DROP CONSTRAINT IF EXISTS automation_sequences_segmento_check;
