-- Migración 0082: Soporte para Cotizaciones Modulares y Dinámicas (con Opcionales)
-- Permite que las cotizaciones nazcan 'estatica' por defecto y puedan convertirse a 'modular' con configurador interactivo.

ALTER TABLE cotizaciones 
ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'estatica' 
CHECK (modalidad IN ('estatica', 'modular'));

ALTER TABLE cotizaciones 
ADD COLUMN IF NOT EXISTS datos_modulares jsonb DEFAULT NULL;

ALTER TABLE cotizaciones 
ADD COLUMN IF NOT EXISTS opciones_seleccionadas jsonb DEFAULT NULL;

COMMENT ON COLUMN cotizaciones.modalidad IS 'Modalidad de cotización: estatica (cerrada tradicional) o modular (dinámica con variantes y opcionales).';
COMMENT ON COLUMN cotizaciones.datos_modulares IS 'Configuración de opciones, variantes, estructura base y presets para cotizaciones modulares.';
COMMENT ON COLUMN cotizaciones.opciones_seleccionadas IS 'Opciones marcadas por el cliente al momento de interactuar y autorizar la cotización modular.';
