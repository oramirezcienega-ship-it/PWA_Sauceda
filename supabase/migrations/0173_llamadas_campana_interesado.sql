-- Llamadas IA: resultado 'interesado' (tiene intención pero aún no quiere visita;
-- el asesor le da seguimiento por WhatsApp).
ALTER TABLE public.llamadas_campana DROP CONSTRAINT IF EXISTS llamadas_campana_resultado_check;
ALTER TABLE public.llamadas_campana ADD CONSTRAINT llamadas_campana_resultado_check
  CHECK (resultado IS NULL OR resultado IN (
    'visita_agendada','interesado','transferido','duda','no_interesado',
    'llamar_despues','no_contesta','buzon','no_llamar','error'
  ));
