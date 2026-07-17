-- Migration 0046: Agregar condiciones_pago y garantia a cotizaciones
ALTER TABLE public.cotizaciones 
ADD COLUMN IF NOT EXISTS condiciones_pago TEXT NOT NULL DEFAULT 'Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción.',
ADD COLUMN IF NOT EXISTS garantia TEXT NOT NULL DEFAULT 'Todos los trabajos cuentan con garantía técnica contra vicios ocultos de acuerdo al servicio contratado.';
