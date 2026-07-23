-- Migration 0053: Evolución de Cotizaciones a Remisiones/Facturas
-- ============================================================

-- 1. Modificar la restricción de estatus de cotizaciones para incluir 'instalacion'
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estatus_check;
ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_estatus_check CHECK (estatus IN (
  'borrador', 'esperando_visita', 'en_inspeccion', 'calculando_costo',
  'pendiente_aprobacion', 'aprobada', 'enviada', 'aceptada', 'instalacion', 'rechazada', 'archivada'
));

-- 2. Crear Tabla de Remisiones y Facturas
CREATE TABLE IF NOT EXISTS public.remisiones_facturas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id   TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  expediente_id   TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('remision', 'factura')),
  folio           TEXT NOT NULL UNIQUE,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Datos de tipo de cambio y detalles fiscales/entrega
  tipo_cambio     NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
  datos_documento JSONB NOT NULL DEFAULT '{}'::jsonb, -- Datos de remisión (entrega) o factura (RFC, razón social, etc.)
  
  -- Valores financieros detallados
  servicios_extra  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  costo_financiero NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  otros_gastos     NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  
  -- Montos Totales
  monto_subtotal   NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Precio base del cliente (cotizacion.precio_final)
  monto_total      NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- subtotal + servicios_extra
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexar para búsquedas rápidas
CREATE INDEX IF NOT EXISTS remisiones_facturas_cot_idx ON public.remisiones_facturas(cotizacion_id);
CREATE INDEX IF NOT EXISTS remisiones_facturas_exp_idx ON public.remisiones_facturas(expediente_id);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.remisiones_facturas ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.remisiones_facturas
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Permitir lectura pública de remisiones/facturas" ON public.remisiones_facturas
  FOR SELECT USING (true);
