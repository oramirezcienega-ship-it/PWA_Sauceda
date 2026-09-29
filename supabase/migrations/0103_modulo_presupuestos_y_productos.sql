-- ============================================================
-- Migración 0103: Módulo de Presupuestos de Obra (APU) y Catálogo Maestro de Productos y Servicios
-- ============================================================

-- 1. Ampliar y Robustecer Catálogo de Productos y Servicios
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'servicio' 
    CHECK (tipo IN ('servicio', 'producto', 'concepto_obra', 'insumo')),
  ADD COLUMN IF NOT EXISTS centro_costo_id UUID REFERENCES public.business_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS descripcion_valor TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS especificaciones TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS gama TEXT DEFAULT 'estandar' 
    CHECK (gama IN ('economica', 'media', 'premium', 'estandar')),
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS apto_para_ia BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_productos_servicios_centro_costo ON public.productos_servicios(centro_costo_id);
CREATE INDEX IF NOT EXISTS idx_productos_servicios_tipo ON public.productos_servicios(tipo);
CREATE INDEX IF NOT EXISTS idx_productos_servicios_categoria ON public.productos_servicios(categoria);

-- 2. Catálogo de Insumos Base para Análisis de Precios Unitarios (APU)
CREATE TABLE IF NOT EXISTS public.insumos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              TEXT UNIQUE,
  nombre              TEXT NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('material', 'mano_obra', 'herramienta_equipo', 'flete', 'subcontrato')),
  unidad              TEXT NOT NULL DEFAULT 'pza', -- 'bulto', 'm3', 'kg', 'jornada', 'hora', 'dia', 'lote', 'm2', 'ml', 'pza'
  costo_proveedor     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  precio_interno      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  proveedor_id        UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  proveedor_nombre    TEXT,
  oficio              TEXT, -- 'albañil', 'plomero', 'electricista', 'yesero', 'carpintero', 'herrero', 'pintor', 'ayudante', 'otro'
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insumos_tipo ON public.insumos(tipo);
CREATE INDEX IF NOT EXISTS idx_insumos_codigo ON public.insumos(codigo);
CREATE INDEX IF NOT EXISTS idx_insumos_proveedor ON public.insumos(proveedor_id);

-- 3. Historial de Variaciones de Precios de Insumos
CREATE TABLE IF NOT EXISTS public.insumos_historial_precios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id               UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  costo_anterior          NUMERIC(12,2) NOT NULL,
  costo_nuevo             NUMERIC(12,2) NOT NULL,
  precio_interno_anterior NUMERIC(12,2) NOT NULL,
  precio_interno_nuevo    NUMERIC(12,2) NOT NULL,
  fecha                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id              UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  motivo                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_insumos_historial_insumo ON public.insumos_historial_precios(insumo_id);

-- 4. Composición APU (Receta de Insumos que integran un Producto / Concepto de Obra)
CREATE TABLE IF NOT EXISTS public.conceptos_apu_composicion (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto_id             TEXT NOT NULL REFERENCES public.productos_servicios(id) ON DELETE CASCADE,
  insumo_id               UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  cantidad                NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
  desperdicio_pct         NUMERIC(6,2) NOT NULL DEFAULT 0.00, -- Ej. 5.00 para 5%
  rendimiento             NUMERIC(12,4) NOT NULL DEFAULT 1.0000, -- Unidades producidas por jornada
  costo_unitario_insumo   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  importe_costo           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notas                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_concepto_insumo UNIQUE (concepto_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_apu_concepto ON public.conceptos_apu_composicion(concepto_id);
CREATE INDEX IF NOT EXISTS idx_apu_insumo ON public.conceptos_apu_composicion(insumo_id);

-- 5. Partidas de Obra por Presupuesto / Cotización
CREATE TABLE IF NOT EXISTS public.cotizacion_partidas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id           TEXT NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  nombre                  TEXT NOT NULL,
  orden                   INT NOT NULL DEFAULT 0,
  subtotal_costo_directo  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  subtotal_precio_cliente NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_partidas_cot ON public.cotizacion_partidas(cotizacion_id);

-- 6. Espacios Paramétricos Levantados en Obra
CREATE TABLE IF NOT EXISTS public.cotizacion_espacios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id           TEXT NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  nombre                  TEXT NOT NULL, -- 'Baño Principal', 'Cocina', etc.
  tipo_espacio            TEXT NOT NULL DEFAULT 'otro', -- 'bano_completo', 'medio_bano', 'cocina', 'cochera', 'recamara', 'ampliacion', 'azotea', 'otro'
  largo                   NUMERIC(8,2) DEFAULT 0.00,
  ancho                   NUMERIC(8,2) DEFAULT 0.00,
  alto                    NUMERIC(8,2) DEFAULT 2.40,
  m2_piso                 NUMERIC(8,2) DEFAULT 0.00,
  m2_muros                NUMERIC(8,2) DEFAULT 0.00,
  parametros              JSONB NOT NULL DEFAULT '{}'::jsonb,
  gama_seleccionada       TEXT NOT NULL DEFAULT 'media' CHECK (gama_seleccionada IN ('economica', 'media', 'premium')),
  fotos                   TEXT[] DEFAULT '{}',
  notas                   TEXT,
  orden                   INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_espacios_cot ON public.cotizacion_espacios(cotizacion_id);

-- 7. Ampliación de Conceptos de Cotización (Trazabilidad con Catálogo, Partida y Espacio)
ALTER TABLE public.cotizacion_conceptos
  ADD COLUMN IF NOT EXISTS producto_servicio_id TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partida_id UUID REFERENCES public.cotizacion_partidas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS espacio_id UUID REFERENCES public.cotizacion_espacios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gama TEXT DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS orden INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apu_detallado JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cotizacion_conceptos_prod ON public.cotizacion_conceptos(producto_servicio_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_conceptos_partida ON public.cotizacion_conceptos(partida_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_conceptos_espacio ON public.cotizacion_conceptos(espacio_id);

-- 8. Cascada de Precios, Esquema de Pagos y Versiones en Cotizaciones
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS modalidad TEXT DEFAULT 'estatica',
  ADD COLUMN IF NOT EXISTS costo_directo NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS indirectos_pct NUMERIC(6,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS indirectos_monto NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS imprevistos_pct NUMERIC(6,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS imprevistos_monto NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS utilidad_pct NUMERIC(6,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS utilidad_monto NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS iva_pct NUMERIC(6,2) DEFAULT 16.00,
  ADD COLUMN IF NOT EXISTS iva_monto NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS incluye_iva BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS alcances TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS exclusiones TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS esquema_pagos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS version_numero INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_padre_id TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_modalidad ON public.cotizaciones(modalidad);

-- 9. Plantillas Paramétricas Maestras por Tipo de Espacio
CREATE TABLE IF NOT EXISTS public.plantillas_espacios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  nombre            TEXT NOT NULL,
  descripcion       TEXT,
  parametros_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  orden             INT NOT NULL DEFAULT 0,
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plantillas_espacios_conceptos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id          UUID NOT NULL REFERENCES public.plantillas_espacios(id) ON DELETE CASCADE,
  partida_nombre        TEXT NOT NULL,
  producto_servicio_id  TEXT REFERENCES public.productos_servicios(id) ON DELETE CASCADE,
  formula_cantidad      TEXT NOT NULL DEFAULT '1', -- 'm2_piso', 'm2_muros', '1', 'perimetro'
  gama                  TEXT NOT NULL DEFAULT 'media' CHECK (gama IN ('economica', 'media', 'premium', 'todas')),
  condicion             TEXT, -- ej: 'parametros.cancel === true'
  orden                 INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plantillas_conceptos_plantilla ON public.plantillas_espacios_conceptos(plantilla_id);

-- 10. Habilitar RLS y Políticas de Seguridad
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_historial_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conceptos_apu_composicion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_espacios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_espacios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_espacios_conceptos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados en insumos" ON public.insumos;
CREATE POLICY "Permitir todo a usuarios autenticados en insumos" ON public.insumos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura publica de insumos" ON public.insumos;
CREATE POLICY "Permitir lectura publica de insumos" ON public.insumos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo en apu composicion" ON public.conceptos_apu_composicion;
CREATE POLICY "Permitir todo en apu composicion" ON public.conceptos_apu_composicion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura en apu composicion" ON public.conceptos_apu_composicion;
CREATE POLICY "Permitir lectura en apu composicion" ON public.conceptos_apu_composicion
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo en cotizacion partidas" ON public.cotizacion_partidas;
CREATE POLICY "Permitir todo en cotizacion partidas" ON public.cotizacion_partidas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura publica en cotizacion partidas" ON public.cotizacion_partidas;
CREATE POLICY "Permitir lectura publica en cotizacion partidas" ON public.cotizacion_partidas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo en cotizacion espacios" ON public.cotizacion_espacios;
CREATE POLICY "Permitir todo en cotizacion espacios" ON public.cotizacion_espacios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura publica en cotizacion espacios" ON public.cotizacion_espacios;
CREATE POLICY "Permitir lectura publica en cotizacion espacios" ON public.cotizacion_espacios
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo en plantillas espacios" ON public.plantillas_espacios;
CREATE POLICY "Permitir todo en plantillas espacios" ON public.plantillas_espacios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura en plantillas espacios" ON public.plantillas_espacios;
CREATE POLICY "Permitir lectura en plantillas espacios" ON public.plantillas_espacios
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir todo en plantillas conceptos" ON public.plantillas_espacios_conceptos;
CREATE POLICY "Permitir todo en plantillas conceptos" ON public.plantillas_espacios_conceptos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura en plantillas conceptos" ON public.plantillas_espacios_conceptos;
CREATE POLICY "Permitir lectura en plantillas conceptos" ON public.plantillas_espacios_conceptos
  FOR SELECT USING (true);

-- 11. Datos Iniciales (Seed): Centros de Costo en Finanzas y Plantillas
INSERT INTO public.business_units (nombre, descripcion)
VALUES 
  ('Impermeabilización', 'Centro de costo y línea de negocio para servicios de impermeabilización acrílica y prefabricada'),
  ('Construcción y Remodelación', 'Centro de costo para obras de remodelación de baños, cocinas, cocheras y ampliaciones'),
  ('Herrería y Cancelería', 'Centro de costo para techados, portones, protecciones y canceles de baño')
ON CONFLICT (nombre) DO NOTHING;

-- Plantillas Iniciales de Espacios
INSERT INTO public.plantillas_espacios (slug, nombre, descripcion, orden, parametros_schema)
VALUES
  (
    'bano_completo',
    'Baño Completo',
    'Remodelación integral de baño: demolición, azulejo, piso, regadera, sanitario, lavabo y accesorios.',
    1,
    '[
      {"key": "altura_azulejo", "label": "Altura de azulejo (m)", "tipo": "number", "default": 2.40},
      {"key": "tipo_bano", "label": "¿Regadera o Tina?", "tipo": "select", "opciones": ["regadera", "tina"], "default": "regadera"},
      {"key": "mover_instalaciones", "label": "¿Mover tuberías / instalaciones?", "tipo": "boolean", "default": false},
      {"key": "incluir_cancel", "label": "¿Incluye cancel de baño?", "tipo": "boolean", "default": true}
    ]'::jsonb
  ),
  (
    'cocina',
    'Cocina Integral',
    'Remodelación de cocina: retiro de muebles, piso, salpicadero, salidas hidrosanitarias/gas y gabinetes.',
    2,
    '[
      {"key": "metros_lineales_muebles", "label": "Metros lineales de cocina", "tipo": "number", "default": 3.00},
      {"key": "incluye_cubierta", "label": "¿Incluye cubierta de granito / cuarzo?", "tipo": "boolean", "default": true},
      {"key": "mover_gas_agua", "label": "¿Reubicar salidas de gas y agua?", "tipo": "boolean", "default": false}
    ]'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;
