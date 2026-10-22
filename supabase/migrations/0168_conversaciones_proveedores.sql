-- Conversaciones con proveedores por la línea oficial de WhatsApp.
-- Los mensajes de/para un proveedor llevan su proveedor_id: no aparecen en la
-- bandeja de clientes, no crean prospecto y Sofía no los contesta.
ALTER TABLE public.mensajes_whatsapp
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_proveedor
  ON public.mensajes_whatsapp (proveedor_id, created_at DESC)
  WHERE proveedor_id IS NOT NULL;
