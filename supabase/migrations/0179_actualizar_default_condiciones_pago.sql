-- Migration 0179: Actualizar valor predeterminado de condiciones_pago en cotizaciones
-- Cambia la leyenda por defecto a: Anticipo del 50% al iniciar la obra y 50% al término a entera satisfacción.

ALTER TABLE public.cotizaciones 
ALTER COLUMN condiciones_pago SET DEFAULT 'Anticipo del 50% al iniciar la obra y 50% al término a entera satisfacción.';

UPDATE public.cotizaciones
SET condiciones_pago = 'Anticipo del 50% al iniciar la obra y 50% al término a entera satisfacción.'
WHERE condiciones_pago = 'Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción.';
