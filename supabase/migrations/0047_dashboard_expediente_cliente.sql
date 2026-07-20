-- Migración 0047: Dashboard de Expediente para el Cliente
-- Agrega campos de status del proceso, token del cliente y datos de sesión de fotos

ALTER TABLE expedientes
  ADD COLUMN IF NOT EXISTS status_proceso TEXT NOT NULL DEFAULT 'formulario_recibido'
    CHECK (status_proceso IN (
      'formulario_recibido',
      'informacion_confirmada',
      'fotos_agendadas',
      'fotos_completadas',
      'en_catalogo',
      'primer_interesado',
      'visita_agendada',
      'loi_firmada',
      'en_tramite_legal',
      'en_notaria',
      'operacion_cerrada'
    )),
  ADD COLUMN IF NOT EXISTS fecha_confirmacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fotos_agendadas TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_cierre_estimada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_token_client TEXT,
  ADD COLUMN IF NOT EXISTS token_expiration TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hay_litigios BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS litigios_bloqueado BOOLEAN NOT NULL DEFAULT FALSE;

-- Tabla para guardar los campos del formulario de promoción del cliente vendedor
CREATE TABLE IF NOT EXISTS promociones_expedientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id TEXT NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
  -- Sección A: Legal
  nombre_titular TEXT,
  telefono_titular TEXT,
  email_titular TEXT,
  tipo_identificacion TEXT,
  tiene_escritura BOOLEAN,
  tiene_comprobante_domicilio BOOLEAN,
  -- Sección B: Crédito
  tipo_credito TEXT,
  expediente_infonavit TEXT,
  saldo_credito NUMERIC,
  tasa_credito NUMERIC,
  -- Sección C: Propiedad
  calle TEXT,
  numero_exterior TEXT,
  colonia TEXT,
  ciudad TEXT,
  estado TEXT,
  metros_construccion NUMERIC,
  metros_terreno NUMERIC,
  anio_construccion INTEGER,
  num_recamaras INTEGER,
  num_banos NUMERIC,
  estado_conservacion TEXT,
  servicios JSONB DEFAULT '[]',
  -- Sección D: Situación
  propiedad_ocupada BOOLEAN,
  nombre_ocupante TEXT,
  tiene_adeudos BOOLEAN,
  descripcion_adeudos TEXT,
  tiene_litigios BOOLEAN,
  descripcion_litigios TEXT,
  -- Sección E: Disponibilidad
  horario_fotos TEXT,
  disponible_firma BOOLEAN,
  comentarios TEXT,
  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para buscar por expediente
CREATE INDEX IF NOT EXISTS idx_promo_exp_expediente_id ON promociones_expedientes(expediente_id);

-- Índice único: un expediente → una promoción
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_exp_unique ON promociones_expedientes(expediente_id);
