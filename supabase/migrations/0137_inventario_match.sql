-- Migration 0137: Asesoría de compra — Fase 2 (inventario y match)
-- ============================================================
-- 1. `inmuebles`: inventario de casas (propio, de aliados o de portales).
-- 2. `propuestas_inmuebles`: opciones de inmuebles para un expediente comprador.
-- 3. Bucket privado `inmuebles` para las fotos (el cliente y el aliado nunca
--    acceden directo: todo pasa por server actions que firman las URLs).
-- RLS en ambas tablas con el patrón de 0096 (solo usuarios autenticados);
-- el portal del cliente y el link de carga de aliados usan server actions.
-- ============================================================

-- 1. Inventario ---------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.inmuebles_folio_seq;

CREATE TABLE IF NOT EXISTS public.inmuebles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                text UNIQUE NOT NULL
                         DEFAULT ('INM-' || lpad(nextval('public.inmuebles_folio_seq')::text, 4, '0')),
  origen               text NOT NULL CHECK (origen IN ('propio', 'aliado', 'portal')),
  expediente_origen_id text REFERENCES public.expedientes(id) ON DELETE SET NULL,
  aliado_id            uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  url_fuente           text,
  precio               numeric NOT NULL CHECK (precio > 0),
  acepta_credito       text[],
  zona                 text,
  fraccionamiento      text,
  colonia              text,
  ciudad               text DEFAULT 'León',
  direccion_privada    text,
  lat                  numeric,
  lng                  numeric,
  metros_construccion  numeric,
  metros_terreno       numeric,
  recamaras            int,
  banos                numeric,
  estacionamientos     int,
  niveles              int,
  anio_construccion    int,
  estado_conservacion  text,
  tiene_escritura      boolean,
  tiene_adeudos        boolean,
  tiene_litigios       boolean,
  descripcion_publica  text,
  notas_internas       text,
  fotos                text[] NOT NULL DEFAULT '{}',
  estatus              text NOT NULL DEFAULT 'por_validar'
                         CHECK (estatus IN ('por_validar', 'disponible', 'apartado', 'vendido', 'descartado')),
  validado_por         uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  validado_en          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz
);

ALTER SEQUENCE public.inmuebles_folio_seq OWNED BY public.inmuebles.folio;

COMMENT ON COLUMN public.inmuebles.direccion_privada IS 'Nunca se muestra al cliente antes de que la propuesta pase a visita_agendada.';
COMMENT ON COLUMN public.inmuebles.fotos IS 'Rutas en el bucket privado `inmuebles` (o URLs completas para el inventario propio que ya vive en expedientes-fotos).';

-- Un expediente vendedor solo genera un inmueble propio.
CREATE UNIQUE INDEX IF NOT EXISTS inmuebles_expediente_origen_uq
  ON public.inmuebles(expediente_origen_id) WHERE expediente_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inmuebles_estatus_idx ON public.inmuebles(estatus);
CREATE INDEX IF NOT EXISTS inmuebles_aliado_idx ON public.inmuebles(aliado_id);

CREATE OR REPLACE FUNCTION public.inmuebles_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER inmuebles_updated_at BEFORE UPDATE ON public.inmuebles
  FOR EACH ROW EXECUTE FUNCTION public.inmuebles_touch_updated_at();

-- 2. Propuestas (inmueble ↔ expediente comprador) -----------------------------
CREATE TABLE IF NOT EXISTS public.propuestas_inmuebles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id      text NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  inmueble_id        uuid NOT NULL REFERENCES public.inmuebles(id) ON DELETE CASCADE,
  -- FK a busquedas_aliados se agrega en la fase de aliados (null = inventario propio o portal)
  busqueda_id        uuid,
  ronda              int NOT NULL DEFAULT 1,
  score_match        numeric CHECK (score_match IS NULL OR (score_match >= 0 AND score_match <= 100)),
  razones_match      text[],
  estatus            text NOT NULL DEFAULT 'sugerida' CHECK (estatus IN (
                       'sugerida', 'publicada', 'vista', 'me_interesa', 'descartada',
                       'visita_agendada', 'visitada', 'ofertada', 'elegida')),
  motivo_descarte    text CHECK (motivo_descarte IS NULL OR motivo_descarte IN ('precio', 'zona', 'tamano', 'estado', 'otro')),
  comentario_cliente text,
  publicada_en       timestamptz,
  vista_en           timestamptz,
  respondida_en      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expediente_id, inmueble_id)
);

CREATE INDEX IF NOT EXISTS propuestas_inmuebles_expediente_idx ON public.propuestas_inmuebles(expediente_id);
CREATE INDEX IF NOT EXISTS propuestas_inmuebles_inmueble_idx ON public.propuestas_inmuebles(inmueble_id);

-- 3. RLS (patrón 0096) ---------------------------------------------------------
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuestas_inmuebles ENABLE ROW LEVEL SECURITY;

DO $pol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inmuebles'
                 AND policyname = 'Admins full access inmuebles') THEN
    CREATE POLICY "Admins full access inmuebles" ON public.inmuebles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'propuestas_inmuebles'
                 AND policyname = 'Admins full access propuestas_inmuebles') THEN
    CREATE POLICY "Admins full access propuestas_inmuebles" ON public.propuestas_inmuebles
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$pol$;

-- 4. Bucket privado para fotos de inmuebles (15 MB por foto) -------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inmuebles', 'inmuebles', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
