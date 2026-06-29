-- Migration 0027: Módulo Sauceda Construye - Cotizaciones y Aprobaciones
-- ============================================================

-- 1. Actualizar roles en perfiles
ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_rol_check CHECK (rol IN ('admin', 'asesor', 'operaciones'));

-- 2. Crear Tabla public.cotizaciones
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id               TEXT PRIMARY KEY,                   -- Folio legible (ej. COT-26-0001)
  prospecto_id     TEXT NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  servicio_tipo    TEXT NOT NULL CHECK (servicio_tipo IN ('pintura', 'impermeabilizacion', 'losa', 'remodelacion', 'otro')),
  estatus          TEXT NOT NULL DEFAULT 'borrador'
                     CHECK (estatus IN (
                       'borrador',
                       'esperando_visita',
                       'en_inspeccion',
                       'calculando_costo',
                       'pendiente_aprobacion',  -- Esperando firma de comercial y/u operaciones
                       'aprobada',              -- Con ambas aprobaciones firmadas
                       'enviada',               -- Compartida con el cliente
                       'aceptada',              -- Aceptada por el cliente (Orden de Trabajo)
                       'rechazada',
                       'archivada'
                     )),
  
  -- Detalles de Visita Técnica
  requiere_visita   BOOLEAN NOT NULL DEFAULT true,
  fecha_visita      TIMESTAMPTZ,
  inspector_id      UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,

  -- Resumen Financiero
  costo_estimado   NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Costo interno (materiales + mano de obra)
  precio_final     NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Precio de venta al cliente
  
  -- Aprobación Dual Obligatoria
  aprobado_comercial    BOOLEAN NOT NULL DEFAULT false,
  aprobado_comercial_by UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  aprobado_operativo    BOOLEAN NOT NULL DEFAULT false,
  aprobado_operativo_by UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,

  -- Enlace Público para Cliente
  token            UUID NOT NULL DEFAULT gen_random_uuid(),
  notas_internas   TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_token_idx ON public.cotizaciones(token);
CREATE INDEX IF NOT EXISTS cotizaciones_prospecto_idx ON public.cotizaciones(prospecto_id);

-- 3. Crear Tabla public.visitas_reportes
CREATE TABLE IF NOT EXISTS public.visitas_reportes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    TEXT NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  inspector_id      UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  fecha_inspeccion TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones_tecnicas TEXT NOT NULL DEFAULT '',
  condiciones_sitio      TEXT NOT NULL DEFAULT '',
  medidas          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Estructura de áreas y dimensiones
  fotos            TEXT[] NOT NULL DEFAULT '{}'::text[], -- URLs de fotos en Supabase Storage
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitas_reportes_cotizacion_idx ON public.visitas_reportes(cotizacion_id);

-- 4. Crear Tabla public.cotizacion_conceptos
CREATE TABLE IF NOT EXISTS public.cotizacion_conceptos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    TEXT NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
  unidad           TEXT NOT NULL DEFAULT 'm2',          -- 'm2', 'ml', 'pza', 'lote'
  costo_unitario   NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Costo interno unitario
  precio_unitario  NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Precio al cliente unitario
  importe          NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- cantidad * precio_unitario
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cotizacion_conceptos_cotizacion_idx ON public.cotizacion_conceptos(cotizacion_id);

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas_reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_conceptos ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS básicas
CREATE POLICY "Permitir lectura pública de cotización por token" ON public.cotizaciones
  FOR SELECT USING (true);

CREATE POLICY "Permitir lectura pública de conceptos" ON public.cotizacion_conceptos
  FOR SELECT USING (true);
