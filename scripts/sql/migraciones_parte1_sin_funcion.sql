-- ============================================================
-- SCRIPT MAESTRO: TODAS las migraciones pendientes (0099 a 0102)
-- Pegar completo en Supabase -> SQL Editor -> Run
-- Idempotente: se puede correr más de una vez sin causar daño.
-- Actualizado: incluye la migración de comisiones por inspección
-- técnica, que es la causa de que ahora mismo no se vea nada en el
-- listado de Comisiones (la consulta ya pide columnas que aún no
-- existen en la base de datos real).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Eliminar comisiones duplicadas u originadas en recibos_pago
--    (de 0099_comisiones_solo_remisiones_facturas)
-- ------------------------------------------------------------
DELETE FROM public.comisiones
WHERE remision_factura_id IS NULL;

-- ------------------------------------------------------------
-- 2. Columnas nuevas en comisiones (base gravable)
--    (de 0099_comisiones_base_comisionable)
-- ------------------------------------------------------------
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS costo_proveedor    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS comision_bancaria  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS base_comisionable  NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

UPDATE public.comisiones
SET base_comisionable = monto_venta
WHERE base_comisionable = 0.00;

-- ------------------------------------------------------------
-- 3. Columna nueva en remisiones_facturas
--    (de 0100_remisiones_costos_proveedor_financiero)
-- ------------------------------------------------------------
ALTER TABLE public.remisiones_facturas
  ADD COLUMN IF NOT EXISTS costo_proveedor NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------------------
-- 4. Función de sincronización de comisiones (versión que
--    descuenta pasarela y proveedor de la base gravable)
--    (de 0100_remisiones_costos_proveedor_financiero)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5. Columnas nuevas en ordenes_trabajo (forma de cobro / MSI)
--    (de 0101_ordenes_trabajo_metodo_pago)
-- ------------------------------------------------------------
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS metodo_pago_saldo    TEXT,
  ADD COLUMN IF NOT EXISTS meses_sin_intereses  INTEGER,
  ADD COLUMN IF NOT EXISTS comision_bancaria_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------------------
-- 6. Comisiones por inspección técnica ejecutada
--    (de 0101_comisiones_por_inspeccion)
-- ------------------------------------------------------------
ALTER TABLE public.comisiones_reglas
  ADD COLUMN IF NOT EXISTS monto_fijo NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.comisiones_reglas
  DROP CONSTRAINT IF EXISTS comisiones_reglas_tipo_check;

ALTER TABLE public.comisiones_reglas
  ADD CONSTRAINT comisiones_reglas_tipo_check
  CHECK (tipo IN ('global', 'servicio', 'producto', 'asesor', 'inspeccion'));

INSERT INTO public.comisiones_reglas (tipo, clave, etiqueta, monto_fijo, porcentaje, activo, notas)
SELECT 'inspeccion', 'general', 'Comisión Fija por Inspección Técnica', 150.00, 0.00, true, 'Tarifa fija asignada al asesor técnico por cada inspección técnica ejecutada en sitio de un expediente'
WHERE NOT EXISTS (
  SELECT 1 FROM public.comisiones_reglas WHERE tipo = 'inspeccion' AND clave = 'general'
);

ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS tipo_comision TEXT NOT NULL DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS cita_id UUID REFERENCES public.agenda_citas(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comisiones_tipo_comision_check'
  ) THEN
    ALTER TABLE public.comisiones
      ADD CONSTRAINT comisiones_tipo_comision_check
      CHECK (tipo_comision IN ('venta', 'inspeccion', 'bono', 'otro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comisiones_cita_id ON public.comisiones(cita_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_tipo_comision ON public.comisiones(tipo_comision);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_cita_asesor ON public.comisiones (cita_id, asesor_id) WHERE cita_id IS NOT NULL;

ALTER TABLE public.agenda_citas
  DROP CONSTRAINT IF EXISTS agenda_citas_estado_check;

ALTER TABLE public.agenda_citas
  ADD CONSTRAINT agenda_citas_estado_check
  CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada', 'reagendada'));

-- ------------------------------------------------------------
-- 7. Anticipos / Préstamos a Asesores
--    (de 0102_comisiones_anticipos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comisiones_anticipos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  pago_id         UUID REFERENCES public.comisiones_pagos(id) ON DELETE SET NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  monto           NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  saldo_restante  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  motivo          TEXT NOT NULL DEFAULT '',
  estatus         TEXT NOT NULL DEFAULT 'activo' CHECK (estatus IN ('activo', 'liquidado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_anticipos_asesor ON public.comisiones_anticipos(asesor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_anticipos_estatus ON public.comisiones_anticipos(estatus);

ALTER TABLE public.comisiones_anticipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a comisiones_anticipos para autenticados" ON public.comisiones_anticipos;
CREATE POLICY "Acceso completo a comisiones_anticipos para autenticados"
  ON public.comisiones_anticipos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS anticipo_aplicado_id UUID REFERENCES public.comisiones_anticipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_neteado_anticipo NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
