-- Migración 0182: Soporte para recordatorios automáticos del día de servicio / inspección
-- Banderas anti-duplicados y auditoría de envíos con plantillas oficiales de Meta (UTILITY)

ALTER TABLE public.agenda_citas 
  ADD COLUMN IF NOT EXISTS recordatorio_cliente_enviado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recordatorio_proveedor_enviado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_2h_enviada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_1h_enviada_at TIMESTAMPTZ;

COMMENT ON COLUMN public.agenda_citas.recordatorio_cliente_enviado_at IS 'Fecha y hora en que se envió el recordatorio del día al cliente vía plantilla oficial de Meta UTILITY';
COMMENT ON COLUMN public.agenda_citas.recordatorio_proveedor_enviado_at IS 'Fecha y hora en que se envió el recordatorio del día al proveedor asignado vía aviso Meta / Evolution API';
