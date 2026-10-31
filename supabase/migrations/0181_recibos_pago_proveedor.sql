-- Migración 0181: Soporte para que proveedores/contratistas puedan ser receptores de pago en recibos_pago

ALTER TABLE public.recibos_pago 
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recibos_pago_proveedor ON public.recibos_pago(proveedor_id);

COMMENT ON COLUMN public.recibos_pago.proveedor_id IS 'Proveedor o contratista externo que recibió el dinero del cliente.';
