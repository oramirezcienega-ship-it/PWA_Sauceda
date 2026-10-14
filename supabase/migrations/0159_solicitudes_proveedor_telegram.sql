-- Migration 0159: Solicitudes a proveedor por Telegram (coordinar fecha de instalación)
-- ============================================================
-- El proveedor recibe la solicitud por Telegram y responde con botones:
-- Lo tomo → marca días → elige mañana/tarde por día (mínimo 2 opciones) → Enviar.
-- tg_paso / tg_dias / tg_opciones guardan el avance del diálogo; tg_opciones guarda
-- los códigos (YYYYMMDD + M|T) en el mismo orden que fechas_propuestas (texto legible).

ALTER TABLE public.solicitudes_proveedor_envios
  ADD COLUMN IF NOT EXISTS tg_paso TEXT,
  ADD COLUMN IF NOT EXISTS tg_dias JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tg_opciones JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.solicitudes_proveedor
  ADD COLUMN IF NOT EXISTS opciones_ofrecidas_at TIMESTAMPTZ;
