-- Migration 0151: Solicitudes de servicio a proveedores
-- ============================================================
-- Antes de comprometer fecha con el cliente, SAUCEDA pregunta a sus proveedores
-- si pueden tomar el servicio. El proveedor ve solo los datos del servicio
-- (producto, descripción, cantidad, zona, fotos, fechas posibles y su costo de
-- referencia), NUNCA el nombre, teléfono ni dirección exacta del cliente.
--
-- Modos:
--   cascada → se envía a un proveedor a la vez (preferido primero, luego el más
--             barato); si no responde a tiempo o no puede, pasa al siguiente.
--   urgente → se envía a todos a la vez; gana el primero que acepta.
-- El precio al cliente lo fija SAUCEDA desde el catálogo; el proveedor no lo ve.
--
-- El proveedor responde desde su link /precios-proveedor/{token_precios}
-- (server actions que validan el token; sin acceso anon a las tablas).

CREATE TABLE IF NOT EXISTS public.solicitudes_proveedor (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                  TEXT NOT NULL UNIQUE,
  cotizacion_id          TEXT REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  expediente_id          TEXT REFERENCES public.expedientes(id) ON DELETE SET NULL,
  orden_trabajo_id       UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  producto_id            TEXT REFERENCES public.productos_servicios(id) ON DELETE SET NULL,
  descripcion            TEXT NOT NULL DEFAULT '',
  cantidad               NUMERIC(12,2),
  unidad                 TEXT NOT NULL DEFAULT '',
  zona                   TEXT NOT NULL DEFAULT '',         -- colonia / zona, nunca la dirección exacta
  fotos                  JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ "url": "...", "titulo": "..." }]
  fechas_sugeridas       TEXT NOT NULL DEFAULT '',         -- ventana que conviene al cliente
  modo                   TEXT NOT NULL DEFAULT 'cascada' CHECK (modo IN ('cascada', 'urgente')),
  horas_respuesta        NUMERIC(6,2) NOT NULL DEFAULT 4,  -- plazo de cada proveedor para responder
  estado                 TEXT NOT NULL DEFAULT 'abierta'
                           CHECK (estado IN ('abierta', 'asignada', 'confirmada', 'sin_proveedor', 'cancelada')),
  proveedor_asignado_id  UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  costo_acordado         NUMERIC(12,2),
  fecha_acordada         TEXT,                             -- la opción que eligió el cliente
  notas_internas         TEXT NOT NULL DEFAULT '',
  creado_por             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_proveedor_cotizacion ON public.solicitudes_proveedor(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_proveedor_ot ON public.solicitudes_proveedor(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_proveedor_estado ON public.solicitudes_proveedor(estado);

-- Un envío por proveedor dentro de cada solicitud (orden = turno en la cascada).
CREATE TABLE IF NOT EXISTS public.solicitudes_proveedor_envios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id       UUID NOT NULL REFERENCES public.solicitudes_proveedor(id) ON DELETE CASCADE,
  proveedor_id       UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  orden              INT NOT NULL DEFAULT 0,
  estado             TEXT NOT NULL DEFAULT 'en_espera'
                       CHECK (estado IN ('en_espera', 'enviada', 'vista', 'aceptada', 'rechazada', 'requiere_visita', 'vencida', 'cancelada')),
  costo_referencia   NUMERIC(12,2),                         -- su costo según su oferta × cantidad
  fecha_limite       TIMESTAMPTZ,
  enviada_at         TIMESTAMPTZ,
  vista_at           TIMESTAMPTZ,
  respondida_at      TIMESTAMPTZ,
  fechas_propuestas  JSONB NOT NULL DEFAULT '[]'::jsonb,    -- ["2026-10-20 mañana", ...]
  comentario         TEXT NOT NULL DEFAULT '',
  notificado         BOOLEAN NOT NULL DEFAULT false,        -- se le avisó por WhatsApp
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_solicitud_proveedor UNIQUE (solicitud_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_envios_proveedor ON public.solicitudes_proveedor_envios(proveedor_id, estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_envios_limite ON public.solicitudes_proveedor_envios(estado, fecha_limite);

ALTER TABLE public.solicitudes_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_proveedor_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a solicitudes_proveedor para autenticados" ON public.solicitudes_proveedor;
CREATE POLICY "Acceso completo a solicitudes_proveedor para autenticados"
  ON public.solicitudes_proveedor FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a solicitudes_proveedor_envios para autenticados" ON public.solicitudes_proveedor_envios;
CREATE POLICY "Acceso completo a solicitudes_proveedor_envios para autenticados"
  ON public.solicitudes_proveedor_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);
