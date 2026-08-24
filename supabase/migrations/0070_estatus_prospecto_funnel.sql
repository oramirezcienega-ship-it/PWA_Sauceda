-- Migration 0070: Actualizar restricción y backfill de estatus de prospecto al modelo de embudo (Lead, MQL, SQL, Cliente)

-- 1. Actualizar restricción CHECK en public.prospectos si existe
ALTER TABLE public.prospectos DROP CONSTRAINT IF EXISTS check_prospectos_estatus;

ALTER TABLE public.prospectos ADD CONSTRAINT check_prospectos_estatus
  CHECK (estatus IN ('lead', 'mql', 'sql', 'cliente', 'nuevo', 'en_conversacion', 'no_viable', 'sin_contacto', 'expediente_abierto'));

-- 2. Migrar registros existentes en public.prospectos a los nuevos códigos del embudo
UPDATE public.prospectos
SET estatus = 'lead'
WHERE estatus = 'nuevo';

UPDATE public.prospectos
SET estatus = 'mql'
WHERE estatus = 'en_conversacion';

UPDATE public.prospectos
SET estatus = 'sql'
WHERE estatus = 'expediente_abierto';
