-- Migration 0144: Asesoría de compra — búsqueda de casas en internet
-- ============================================================
-- Cada búsqueda (con IA en portales, o la lectura de un link / texto pegado)
-- se procesa en segundo plano y deja aquí sus candidatas. El asesor elige
-- cuáles pasan al inventario (origen 'portal', por validar) como opción de la OT.
-- Solo agrega.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.busquedas_web (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('portales','link','texto')),
  estado           text NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso','lista','error')),
  -- Criterios de búsqueda (sin datos del cliente), URL o texto pegado.
  entrada          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{url, titulo, precio, colonia, ..., anunciante, verificada, inmuebleId?}]
  candidatas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  mensaje          text,
  creado_por       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  terminado_en     timestamptz
);

CREATE INDEX IF NOT EXISTS busquedas_web_orden_idx ON public.busquedas_web(orden_trabajo_id, created_at DESC);

COMMENT ON TABLE public.busquedas_web IS
  'Búsquedas de casas en internet de una OT de asesoría de compra (IA en portales, link o texto pegado) y sus candidatas.';

ALTER TABLE public.busquedas_web ENABLE ROW LEVEL SECURITY;
DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'busquedas_web'
                 AND policyname = 'Admins full access busquedas_web') THEN
    CREATE POLICY "Admins full access busquedas_web" ON public.busquedas_web
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$p$;

-- Evita duplicar en el inventario la misma publicación de portal.
CREATE INDEX IF NOT EXISTS inmuebles_url_fuente_idx ON public.inmuebles(url_fuente) WHERE url_fuente IS NOT NULL;
