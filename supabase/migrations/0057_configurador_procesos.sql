-- Migration 0057: Configurador de Procesos Parametrizable (Motor de Workflows)
-- ============================================================

-- 1. Tabla de Procesos Maestros (Líneas de Negocio / Workflows)
CREATE TABLE IF NOT EXISTS public.procesos_maestros (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  tipo_negocio TEXT NOT NULL UNIQUE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Configuración de Etapas por Proceso
CREATE TABLE IF NOT EXISTS public.etapas_configuracion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id        UUID NOT NULL REFERENCES public.procesos_maestros(id) ON DELETE CASCADE,
  clave_etapa       TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  orden             INTEGER NOT NULL DEFAULT 1,
  sla_dias          INTEGER NOT NULL DEFAULT 7,
  campos_requeridos JSONB NOT NULL DEFAULT '[]'::jsonb,
  validaciones_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_proceso_clave_etapa UNIQUE (proceso_id, clave_etapa)
);

-- 3. Tabla de Reglas de Escalación por SLA / Eventos
CREATE TABLE IF NOT EXISTS public.escalaciones_configuracion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id      UUID NOT NULL REFERENCES public.procesos_maestros(id) ON DELETE CASCADE,
  etapa_id        UUID REFERENCES public.etapas_configuracion(id) ON DELETE CASCADE,
  nombre_regla    TEXT NOT NULL,
  condicion_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  accion_tipo     TEXT NOT NULL CHECK (accion_tipo IN ('notificar_gerente', 'reasignar_operador', 'marcar_frio', 'webhook_n8n')),
  parametros_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabla de Automatizaciones e Integraciones Webhooks (n8n)
CREATE TABLE IF NOT EXISTS public.automatizaciones_configuracion (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id            UUID NOT NULL REFERENCES public.procesos_maestros(id) ON DELETE CASCADE,
  etapa_id              UUID REFERENCES public.etapas_configuracion(id) ON DELETE CASCADE,
  evento_tipo           TEXT NOT NULL CHECK (evento_tipo IN ('al_entrar_etapa', 'al_salir_etapa', 'al_vencer_sla', 'al_detectar_pago', 'al_cambiar_calificacion')),
  webhook_url_n8n       TEXT NOT NULL,
  payload_template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Índices para consultas de alto rendimiento
CREATE INDEX IF NOT EXISTS etapas_configuracion_proceso_id_idx ON public.etapas_configuracion(proceso_id);
CREATE INDEX IF NOT EXISTS etapas_configuracion_orden_idx ON public.etapas_configuracion(orden);
CREATE INDEX IF NOT EXISTS escalaciones_proceso_id_idx ON public.escalaciones_configuracion(proceso_id);
CREATE INDEX IF NOT EXISTS automatizaciones_proceso_id_idx ON public.automatizaciones_configuracion(proceso_id);

-- 6. Habilitar RLS
ALTER TABLE public.procesos_maestros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalaciones_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automatizaciones_configuracion ENABLE ROW LEVEL SECURITY;

-- 7. Políticas de RLS
DROP POLICY IF EXISTS "Permitir todo en procesos_maestros a autenticados" ON public.procesos_maestros;
CREATE POLICY "Permitir todo en procesos_maestros a autenticados" ON public.procesos_maestros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo en etapas_configuracion a autenticados" ON public.etapas_configuracion;
CREATE POLICY "Permitir todo en etapas_configuracion a autenticados" ON public.etapas_configuracion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo en escalaciones_configuracion a autenticados" ON public.escalaciones_configuracion;
CREATE POLICY "Permitir todo en escalaciones_configuracion a autenticados" ON public.escalaciones_configuracion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo en automatizaciones_configuracion a autenticados" ON public.automatizaciones_configuracion;
CREATE POLICY "Permitir todo en automatizaciones_configuracion a autenticados" ON public.automatizaciones_configuracion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Seed Inicial: Proceso Maestro de Traspaso / Compra de Casa
INSERT INTO public.procesos_maestros (id, nombre, descripcion, tipo_negocio, activo)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Traspaso y Compra de Casas',
  'Flujo principal de adquisición, trámite de traspasos y compras habientes',
  'traspaso_compra',
  true
) ON CONFLICT (tipo_negocio) DO NOTHING;

-- Seed Etapas de Traspaso
INSERT INTO public.etapas_configuracion (proceso_id, clave_etapa, nombre, orden, sla_dias, campos_requeridos)
VALUES 
  ('a1b2c3d4-0000-0000-0000-000000000001', 'nuevo-lead', 'Nuevo Lead', 1, 3, '["telefono"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'negociacion', 'Negociación', 2, 10, '["telefono", "fraccionamiento"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'expediente', 'Integración de Expediente', 3, 14, '["telefono", "fraccionamiento", "direccion_propiedad"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'promocion', 'Promoción de Venta', 4, 30, '[]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'avaluo', 'Avalúo / Dictamen', 5, 10, '[]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'firmado', 'Firma y Cierre', 6, 7, '[]'::jsonb)
ON CONFLICT (proceso_id, clave_etapa) DO NOTHING;

-- Seed Inicial: Proceso Maestro de Impermeabilización (Sauceda Construye - 7 Etapas)
INSERT INTO public.procesos_maestros (id, nombre, descripcion, tipo_negocio, activo)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000002',
  'Sauceda Construye - Impermeabilización',
  'Flujo completo de 7 etapas: inspección técnica, cotización, anticipo, obra, cobro y carta de garantía',
  'impermeabilizacion',
  true
) ON CONFLICT (tipo_negocio) DO NOTHING;

-- Seed 7 Etapas de Impermeabilización con SLAs y Campos Obligatorios
INSERT INTO public.etapas_configuracion (proceso_id, clave_etapa, nombre, orden, sla_dias, campos_requeridos)
VALUES 
  ('a1b2c3d4-0000-0000-0000-000000000002', 'nuevo-lead', '1. Prospecto Recibido', 1, 2, '["telefono"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'inspeccion', '2. Visita & Inspección Técnica', 2, 3, '["telefono", "direccion_propiedad"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'cotizacion', '3. Presupuesto & Cotización', 3, 3, '["telefono", "direccion_propiedad"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'anticipo', '4. Aceptación & Anticipo', 4, 3, '["telefono", "direccion_propiedad"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'obra', '5. Ejecución de Obra / Aplicación', 5, 7, '["direccion_propiedad"]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'cobro', '6. Liquidación / Cobro Final', 6, 3, '[]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'garantia', '7. Firma de Garantía & Cierre', 7, 3, '[]'::jsonb)
ON CONFLICT (proceso_id, clave_etapa) DO NOTHING;
