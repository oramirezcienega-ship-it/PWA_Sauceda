-- ============================================================
-- Migración 0093: Módulo de Órdenes de Trabajo y Documentos de Entrega
-- ============================================================

-- 1. Tabla de Órdenes de Trabajo
CREATE TABLE IF NOT EXISTS public.ordenes_trabajo (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                   TEXT NOT NULL UNIQUE,
  expediente_id           TEXT REFERENCES public.expedientes(id) ON DELETE CASCADE,
  cotizacion_id           TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  prospecto_id            TEXT REFERENCES public.prospectos(id) ON DELETE SET NULL,
  tipo_negocio            TEXT NOT NULL DEFAULT 'construccion',
  estatus                 TEXT NOT NULL DEFAULT 'pendiente' 
                          CHECK (estatus IN ('pendiente', 'en_proceso', 'completada', 'cancelada')),
  titulo                  TEXT NOT NULL,
  descripcion             TEXT,
  fecha_programada        DATE,
  fecha_inicio            DATE,
  fecha_conclusion        TIMESTAMPTZ,
  asesor_responsable_id   UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  asesor_ejecutor_id      UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  creado_por              UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  notas_conclusion        TEXT,
  fotos_evidencia         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_exp ON public.ordenes_trabajo(expediente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_cot ON public.ordenes_trabajo(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_estatus ON public.ordenes_trabajo(estatus);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_asesor_ejecutor ON public.ordenes_trabajo(asesor_ejecutor_id);

-- 2. Tabla de Recibos de Pago (Dinero recibido / liquidación de orden de trabajo)
CREATE TABLE IF NOT EXISTS public.recibos_pago (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio               TEXT NOT NULL UNIQUE,
  orden_trabajo_id    UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  expediente_id       TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  cotizacion_id       TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_nombre      TEXT NOT NULL,
  cliente_telefono    TEXT,
  cliente_direccion   TEXT,
  monto               NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  monto_letra         TEXT,
  metodo_pago         TEXT NOT NULL DEFAULT 'transferencia',
  referencia_pago     TEXT,
  concepto            TEXT NOT NULL,
  saldo_anterior      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  saldo_restante      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  recibido_por        UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  recibido_por_nombre TEXT,
  fecha_pago          DATE NOT NULL DEFAULT CURRENT_DATE,
  notas               TEXT,
  token               TEXT NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_pago_ot ON public.recibos_pago(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_recibos_pago_token ON public.recibos_pago(token);

-- 3. Ampliar tabla garantias_documentos si ya existe, para soportar órdenes de trabajo
ALTER TABLE public.garantias_documentos
  ADD COLUMN IF NOT EXISTS orden_trabajo_id UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS anos_garantia NUMERIC(4, 1) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

-- Permitir que cotizacion_id sea opcional si la garantía proviene directamente de una orden de trabajo
ALTER TABLE public.garantias_documentos
  ALTER COLUMN cotizacion_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_garantias_doc_ot ON public.garantias_documentos(orden_trabajo_id);

-- 4. Habilitar RLS
ALTER TABLE public.ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recibos_pago ENABLE ROW LEVEL SECURITY;

-- Políticas de ordenes_trabajo
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en ordenes_trabajo" ON public.ordenes_trabajo;
CREATE POLICY "Permitir todo a usuarios autenticados en ordenes_trabajo" ON public.ordenes_trabajo
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica de ordenes_trabajo" ON public.ordenes_trabajo;
CREATE POLICY "Permitir lectura publica de ordenes_trabajo" ON public.ordenes_trabajo
  FOR SELECT USING (true);

-- Políticas de recibos_pago
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en recibos_pago" ON public.recibos_pago;
CREATE POLICY "Permitir todo a usuarios autenticados en recibos_pago" ON public.recibos_pago
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica de recibos_pago con token" ON public.recibos_pago;
CREATE POLICY "Permitir lectura publica de recibos_pago con token" ON public.recibos_pago
  FOR SELECT USING (true);
