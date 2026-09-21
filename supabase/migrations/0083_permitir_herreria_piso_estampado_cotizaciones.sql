-- Migration 0083: Actualizar restricción check de servicio_tipo en cotizaciones para permitir 'herreria' y 'piso_estampado'
-- ============================================================

ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_servicio_tipo_check;

ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_servicio_tipo_check CHECK (servicio_tipo IN (
  'pintura',
  'impermeabilizacion',
  'losa',
  'remodelacion',
  'plomeria',
  'electricidad',
  'albanileria',
  'acabados',
  'herreria',
  'piso_estampado',
  'otro'
)) NOT VALID;
