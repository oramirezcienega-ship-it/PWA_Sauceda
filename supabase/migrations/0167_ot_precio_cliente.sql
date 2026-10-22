-- Precio que paga el cliente en órdenes de trabajo sin cotización formal (servicios
-- coordinados desde la conversación con una Cotización Express). Si la OT tiene
-- cotización, manda su precio_final; este campo es el respaldo.
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS precio_cliente NUMERIC(14, 2);
