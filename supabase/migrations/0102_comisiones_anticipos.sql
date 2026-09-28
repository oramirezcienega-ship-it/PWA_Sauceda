-- ============================================================
-- Migración 0102: Anticipos / Préstamos a Asesores
-- ============================================================
-- Cuando se registra un pago de comisiones mayor al saldo pendiente
-- del asesor (por ejemplo, el asesor solicita un préstamo o anticipo),
-- el excedente ya no se rechaza: se registra como un anticipo a favor
-- de SAUCEDA, que queda pendiente de descontarse de las comisiones
-- futuras del mismo asesor.

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

-- Registrar de qué anticipo se descontó cada comisión nueva, para trazabilidad.
ALTER TABLE public.comisiones
  ADD COLUMN IF NOT EXISTS anticipo_aplicado_id UUID REFERENCES public.comisiones_anticipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_neteado_anticipo NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
