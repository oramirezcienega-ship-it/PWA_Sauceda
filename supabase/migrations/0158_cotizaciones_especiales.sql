-- Migration 0158: Cotizaciones especiales (peticiones fuera de catálogo)
-- ============================================================
-- Cuando el cliente pide algo que no está en el catálogo, SAUCEDA arma un brief
-- (qué es, características, zona y fotos) y lo concursa con los proveedores de esa
-- línea de negocio por Telegram. Cada proveedor responde precio, tiempo y qué incluye.
-- Con la respuesta elegida + el margen objetivo del "Servicio especial" de esa línea
-- se prepara una estimación (rango) que el asesor aprueba y envía desde Conversaciones.
-- El proveedor nunca ve nombre, teléfono ni dirección exacta del cliente.

BEGIN;

-- "Servicio especial" parametrizable por línea de negocio: su margen objetivo
ALTER TABLE public.productos_servicios
  ADD COLUMN IF NOT EXISTS es_servicio_especial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margen_objetivo_pct NUMERIC(5,2)
    CHECK (margen_objetivo_pct IS NULL OR (margen_objetivo_pct >= 0 AND margen_objetivo_pct < 100));

CREATE TABLE IF NOT EXISTS public.cotizaciones_especiales (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                 TEXT NOT NULL UNIQUE,
  telefono_cliente      TEXT NOT NULL,                       -- conversación de origen
  prospecto_id          TEXT,
  expediente_id         TEXT,
  tipo_negocio          TEXT,
  titulo                TEXT NOT NULL,
  descripcion           TEXT NOT NULL DEFAULT '',
  zona                  TEXT NOT NULL DEFAULT '',            -- colonia / municipio, nunca la dirección exacta
  fotos                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ "url": "..." }]
  horas_respuesta       NUMERIC(6,2) NOT NULL DEFAULT 24,
  estado                TEXT NOT NULL DEFAULT 'enviada'
                          CHECK (estado IN ('enviada', 'estimacion_lista', 'enviada_cliente', 'cerrada', 'cancelada')),
  margen_pct            NUMERIC(5,2),
  respuesta_elegida_id  UUID,
  precio_sugerido       NUMERIC(14,2),
  rango_min             NUMERIC(14,2),
  rango_max             NUMERIC(14,2),
  estimacion_texto      TEXT NOT NULL DEFAULT '',
  estimacion_enviada_at TIMESTAMPTZ,
  creado_por            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotizaciones_especiales_respuestas (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_especial_id   UUID NOT NULL REFERENCES public.cotizaciones_especiales(id) ON DELETE CASCADE,
  proveedor_id             UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  estado                   TEXT NOT NULL DEFAULT 'enviada'
                             CHECK (estado IN ('enviada', 'cotizando', 'cotizada', 'requiere_visita', 'rechazada', 'vencida', 'sin_telegram')),
  precio                   NUMERIC(14,2),
  tiempo                   TEXT NOT NULL DEFAULT '',
  incluye                  TEXT NOT NULL DEFAULT '',
  tg_paso                  TEXT,                              -- precio | tiempo | incluye | confirmar
  fecha_limite             TIMESTAMPTZ,
  enviada_at               TIMESTAMPTZ,
  respondida_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cotizacion_especial_id, proveedor_id)
);

ALTER TABLE public.cotizaciones_especiales
  DROP CONSTRAINT IF EXISTS cotizaciones_especiales_respuesta_fk;
ALTER TABLE public.cotizaciones_especiales
  ADD CONSTRAINT cotizaciones_especiales_respuesta_fk
  FOREIGN KEY (respuesta_elegida_id) REFERENCES public.cotizaciones_especiales_respuestas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cot_esp_telefono ON public.cotizaciones_especiales(telefono_cliente, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cot_esp_resp_proveedor ON public.cotizaciones_especiales_respuestas(proveedor_id, estado);

ALTER TABLE public.cotizaciones_especiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones_especiales_respuestas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a cotizaciones_especiales para autenticados" ON public.cotizaciones_especiales;
CREATE POLICY "Acceso completo a cotizaciones_especiales para autenticados"
  ON public.cotizaciones_especiales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a cotizaciones_especiales_respuestas para autenticados" ON public.cotizaciones_especiales_respuestas;
CREATE POLICY "Acceso completo a cotizaciones_especiales_respuestas para autenticados"
  ON public.cotizaciones_especiales_respuestas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- "Servicio especial" general (respaldo cuando la línea de negocio no tiene uno propio): 35%
INSERT INTO public.productos_servicios (id, nombre, descripcion, unidad, costo_unitario, precio_unitario, tipo, categoria, es_servicio_especial, margen_objetivo_pct, apto_para_ia)
SELECT 'ESP-GENERAL', 'Servicio especial — General', 'Peticiones fuera de catálogo. El margen objetivo se usa para preparar estimaciones.', 'servicio', 0, 0, 'servicio', 'Servicios especiales', true, 35, false
WHERE NOT EXISTS (SELECT 1 FROM public.productos_servicios WHERE id = 'ESP-GENERAL');

COMMIT;
