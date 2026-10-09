-- Migration 0138: Asesoría de compra — Fase 3 (aliados inmobiliarios)
-- ============================================================
-- 1. Campos de aliado y convenio en `proveedores`.
-- 2. `busquedas_aliados`: una solicitud por expediente × aliado (ronda).
-- 3. FK de `propuestas_inmuebles.busqueda_id` → `busquedas_aliados`.
-- RLS con el patrón de 0096. El link público de carga del aliado usa server
-- actions que validan `proveedores.token_carga` (nunca acceso anon directo).
-- Sin DROP: todo es idempotente con IF NOT EXISTS / pg_constraint.
-- ============================================================

-- 1. Aliados -------------------------------------------------------------------
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS es_aliado_inmobiliario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zonas_cobertura text[],
  ADD COLUMN IF NOT EXISTS convenio_estatus text NOT NULL DEFAULT 'sin_convenio',
  ADD COLUMN IF NOT EXISTS convenio_contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comision_compartida_pct numeric,
  ADD COLUMN IF NOT EXISTS token_carga text,
  ADD COLUMN IF NOT EXISTS calificacion numeric,
  ADD COLUMN IF NOT EXISTS whatsapp text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_convenio_estatus_check') THEN
    ALTER TABLE public.proveedores ADD CONSTRAINT proveedores_convenio_estatus_check
      CHECK (convenio_estatus IN ('sin_convenio', 'enviado', 'firmado', 'suspendido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_comision_compartida_pct_check') THEN
    ALTER TABLE public.proveedores ADD CONSTRAINT proveedores_comision_compartida_pct_check
      CHECK (comision_compartida_pct IS NULL OR (comision_compartida_pct >= 0 AND comision_compartida_pct <= 100));
  END IF;
END
$c$;

CREATE UNIQUE INDEX IF NOT EXISTS proveedores_token_carga_uq
  ON public.proveedores(token_carga) WHERE token_carga IS NOT NULL;
CREATE INDEX IF NOT EXISTS proveedores_aliado_idx
  ON public.proveedores(es_aliado_inmobiliario) WHERE es_aliado_inmobiliario;

COMMENT ON COLUMN public.proveedores.comision_compartida_pct IS '% del lado comprador que recibe el aliado.';
COMMENT ON COLUMN public.proveedores.token_carga IS 'Token del link permanente /aliados/carga/{token} para subir inmuebles sin sesión.';
COMMENT ON COLUMN public.proveedores.calificacion IS '0–100: 60% tasa de respuesta a búsquedas + 40% tasa de propuestas aceptadas por clientes.';

-- 2. Solicitudes de búsqueda a aliados ----------------------------------------
CREATE TABLE IF NOT EXISTS public.busquedas_aliados (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id       text NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  aliado_id           uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  ronda               int NOT NULL DEFAULT 1,
  criterios_snapshot  jsonb NOT NULL DEFAULT '{}'::jsonb,
  canal               text CHECK (canal IN ('telegram', 'whatsapp', 'manual')),
  telegram_message_id text,
  fecha_limite        timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  estado              text NOT NULL DEFAULT 'enviada'
                        CHECK (estado IN ('enviada', 'vista', 'respondida', 'sin_resultados', 'vencida')),
  inmuebles_recibidos int NOT NULL DEFAULT 0,
  enviada_por         uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  respondida_at       timestamptz
);

COMMENT ON COLUMN public.busquedas_aliados.criterios_snapshot IS
  'Zonas, rango, recámaras y tipo de crédito al momento del envío. Nunca incluye nombre ni teléfono del cliente.';

CREATE INDEX IF NOT EXISTS busquedas_aliados_expediente_idx ON public.busquedas_aliados(expediente_id);
CREATE INDEX IF NOT EXISTS busquedas_aliados_aliado_idx ON public.busquedas_aliados(aliado_id);
CREATE INDEX IF NOT EXISTS busquedas_aliados_abiertas_idx
  ON public.busquedas_aliados(fecha_limite) WHERE estado IN ('enviada', 'vista');

ALTER TABLE public.busquedas_aliados ENABLE ROW LEVEL SECURITY;

DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'busquedas_aliados'
                 AND policyname = 'Admins full access busquedas_aliados') THEN
    CREATE POLICY "Admins full access busquedas_aliados" ON public.busquedas_aliados
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$p$;

-- 3. Propuestas ligadas a la búsqueda que las originó -------------------------
DO $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'propuestas_inmuebles_busqueda_id_fkey') THEN
    ALTER TABLE public.propuestas_inmuebles ADD CONSTRAINT propuestas_inmuebles_busqueda_id_fkey
      FOREIGN KEY (busqueda_id) REFERENCES public.busquedas_aliados(id) ON DELETE SET NULL;
  END IF;
END
$f$;
