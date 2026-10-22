-- Precio de venta por volumen: tramos [{desde, precio}]. Al alcanzar `desde`
-- (en la unidad del producto) el precio unitario aplica a toda la cantidad.
-- Lo usan la calculadora de impermeabilización, Sofía y las cotizaciones.
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS precios_volumen JSONB NOT NULL DEFAULT '[]'::jsonb;
