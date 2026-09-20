-- Migración 0079: Control de Pausa y Encendido de Sofía (IA) por conversación
-- Agrega la columna ia_pausada en expedientes y prospectos para permitir copilotaje humano

ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS ia_pausada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS ia_pausada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.expedientes.ia_pausada IS 'Indica si las respuestas automáticas de la IA Sofía están temporalmente pausadas para este expediente.';
COMMENT ON COLUMN public.prospectos.ia_pausada IS 'Indica si las respuestas automáticas de la IA Sofía están temporalmente pausadas para este prospecto.';
