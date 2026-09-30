-- ============================================================
-- Migración 0106: Módulo de Gestión de Compraventa INFONAVIT
-- ============================================================
-- Servicio integral de gestión y acompañamiento en compraventa
-- con crédito INFONAVIT ($15,000 MXN: 50% anticipo, 50% liquidación).
-- Incluye: etapas configurables, partes involucradas (comprador/vendedor),
-- datos del inmueble, catálogo de documentos con reglas, expediente
-- documental con validación, trazabilidad de historial y cola de eventos para n8n.

-- ------------------------------------------------------------
-- 1. Catálogo configurable de Etapas de la OT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_etapas_catalogo (
  id                      TEXT PRIMARY KEY,
  orden                   INTEGER NOT NULL,
  nombre                  TEXT NOT NULL,
  descripcion             TEXT,
  requiere_docs_validados BOOLEAN NOT NULL DEFAULT false,
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_etapas_orden ON public.ot_infonavit_etapas_catalogo(orden);

-- Semilla de las 10 etapas del flujo de compraventa INFONAVIT
INSERT INTO public.ot_infonavit_etapas_catalogo (id, orden, nombre, descripcion, requiere_docs_validados)
VALUES
  ('1_cotizacion_enviada', 1, 'Cotización enviada', 'Propuesta comercial enviada al cliente con desglose de alcances y exclusiones.', false),
  ('2_aceptada_anticipo', 2, 'Aceptada + anticipo 50%', 'Cotización aceptada por el cliente y pago de anticipo ($7,500 MXN) registrado.', false),
  ('3_integracion_expediente', 3, 'Integración de expediente', 'Comprador y vendedor suben su documentación requerida mediante formularios protegidos.', false),
  ('4_validacion_documental', 4, 'Validación documental', 'Revisión y cotejo técnico del expediente en CRM. No se puede avanzar sin validar obligatorios.', true),
  ('5_avaluo_certificados', 5, 'Avalúo y certificados', 'Emisión del dictamen de avalúo, certificado de libertad de gravamen y constancias oficiales.', false),
  ('6_inscripcion_credito', 6, 'Inscripción del crédito', 'Ingreso formal del expediente del crédito y paquete documental ante la delegación INFONAVIT.', false),
  ('7_notaria_proyecto', 7, 'Notaría (proyecto de escritura)', 'Asignación de notaría, revisión del proyecto de escritura y fijación de fecha de firma.', false),
  ('8_firma_liquidacion', 8, 'Firma + liquidación 50%', 'Firma presencial de la escritura ante notario público y liquidación final del servicio ($7,500 MXN).', false),
  ('9_entrega_servicios', 9, 'Entrega de casa y cambio de servicios', 'Entrega física del inmueble y gestión de cambio de titular en predial, SAPAL y CFE.', false),
  ('10_escritura_cierre', 10, 'Escritura inscrita / Cierre', 'Inscripción de escritura en el Registro Público de la Propiedad y cierre formal de la orden.', false)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden = EXCLUDED.orden,
  descripcion = EXCLUDED.descripcion,
  requiere_docs_validados = EXCLUDED.requiere_docs_validados;

-- ------------------------------------------------------------
-- 2. Ampliación de ordenes_trabajo para soporte de INFONAVIT
-- ------------------------------------------------------------
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS etapa_infonavit_id TEXT REFERENCES public.ot_infonavit_etapas_catalogo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_detencion TEXT,
  ADD COLUMN IF NOT EXISTS anticipo_pagado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anticipo_pagado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liquidacion_pagada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liquidacion_pagada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_firma_escritura DATE,
  ADD COLUMN IF NOT EXISTS notaria_numero TEXT,
  ADD COLUMN IF NOT EXISTS notaria_nombre TEXT,
  ADD COLUMN IF NOT EXISTS notaria_titular TEXT,
  ADD COLUMN IF NOT EXISTS politica_cancelacion TEXT DEFAULT 'El anticipo de $7,500 MXN cubre costos ya devengados de gestoría técnica, avalúo y certificados oficiales. Los reembolsos por cancelación se determinan según la etapa procesal alcanzada.';

-- Ampliar check de estatus en ordenes_trabajo si existe para permitir estados requeridos
ALTER TABLE public.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_estatus_check;

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_estatus_check
  CHECK (estatus IN ('pendiente', 'en_proceso', 'activa', 'detenida', 'completada', 'cerrada', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_etapa_infonavit ON public.ordenes_trabajo(etapa_infonavit_id);

-- ------------------------------------------------------------
-- 3. Partes involucradas en la compraventa (Comprador, Vendedor, Cónyuges)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_partes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id            UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  rol                         TEXT NOT NULL CHECK (rol IN ('comprador', 'vendedor', 'conyuge_vendedor', 'conyuge_comprador')),
  nombre                      TEXT NOT NULL,
  telefono                    TEXT NOT NULL,
  email                       TEXT,
  curp                        TEXT,
  rfc                         TEXT,
  estado_civil                TEXT CHECK (estado_civil IN ('soltero', 'casado', 'union_libre', 'divorciado', 'viudo')),
  regimen_matrimonial         TEXT CHECK (regimen_matrimonial IN ('separacion_bienes', 'sociedad_conyugal', 'no_aplica')),
  token_formulario            TEXT UNIQUE NOT NULL,
  token_expira_at             TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  formulario_completado       BOOLEAN NOT NULL DEFAULT false,
  formulario_completado_at    TIMESTAMPTZ,
  aviso_privacidad_aceptado   BOOLEAN NOT NULL DEFAULT false,
  aviso_privacidad_aceptado_at TIMESTAMPTZ,
  notas                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_partes_ot ON public.ot_infonavit_partes(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_ot_partes_token ON public.ot_infonavit_partes(token_formulario);
CREATE INDEX IF NOT EXISTS idx_ot_partes_rol ON public.ot_infonavit_partes(rol);

-- ------------------------------------------------------------
-- 4. Datos del inmueble objeto de la compraventa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_inmueble (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id      UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE UNIQUE,
  direccion             TEXT,
  fraccionamiento       TEXT,
  ciudad                TEXT DEFAULT 'León, Gto.',
  cuenta_predial        TEXT,
  tiene_credito_vigente BOOLEAN NOT NULL DEFAULT false,
  institucion_acreedora TEXT,
  saldo_credito_aprox   NUMERIC(12, 2) DEFAULT 0.00,
  es_regimen_condominio BOOLEAN NOT NULL DEFAULT false,
  esta_habitada         BOOLEAN NOT NULL DEFAULT false,
  nombre_contacto_visita TEXT,
  telefono_contacto_visita TEXT,
  notas_acceso          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_inmueble_ot ON public.ot_infonavit_inmueble(orden_trabajo_id);

-- ------------------------------------------------------------
-- 5. Catálogo de Documentos Requeridos y Reglas Condicionales
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_catalogo_documentos (
  id                    TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  rol_aplicable         TEXT NOT NULL CHECK (rol_aplicable IN ('comprador', 'vendedor', 'inmueble', 'conyuge_vendedor', 'conyuge_comprador')),
  obligatorio           BOOLEAN NOT NULL DEFAULT true,
  tiene_vigencia        BOOLEAN NOT NULL DEFAULT false,
  dias_vigencia_default INTEGER,
  condicion_regla       TEXT, -- 'si_casado', 'si_mancomunados', 'si_credito_vigente', 'si_condominio'
  orden                 INTEGER NOT NULL DEFAULT 1,
  activo                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_cat_docs_rol ON public.ot_catalogo_documentos(rol_aplicable);

INSERT INTO public.ot_catalogo_documentos (id, nombre, descripcion, rol_aplicable, obligatorio, tiene_vigencia, dias_vigencia_default, condicion_regla, orden)
VALUES
  -- Comprador
  ('comp_ine', 'Identificación oficial (INE o Pasaporte)', 'Credencial para votar vigente por ambos lados legible.', 'comprador', true, false, null, null, 1),
  ('comp_curp', 'CURP certificada', 'Constancia oficial de CURP reciente verificada ante RENAPO.', 'comprador', true, false, null, null, 2),
  ('comp_rfc', 'Constancia de Situación Fiscal (RFC)', 'Constancia emitida por el SAT con homoclave actualizada.', 'comprador', true, true, 90, null, 3),
  ('comp_acta_nacimiento', 'Acta de nacimiento', 'Copia certificada legible sin tachaduras ni enmendaduras.', 'comprador', true, false, null, null, 4),
  ('comp_acta_matrimonio', 'Acta de matrimonio', 'En caso de estar casado por lo civil.', 'comprador', false, false, null, 'si_casado', 5),
  ('comp_comprobante_domicilio', 'Comprobante de domicilio', 'Recibo de CFE, agua o telefonía no mayor a 3 meses.', 'comprador', true, true, 90, null, 6),
  ('comp_precalificacion', 'Precalificación INFONAVIT', 'Documento de precalificación y puntos vigente del portal Mi Cuenta INFONAVIT.', 'comprador', true, true, 60, null, 7),
  ('comp_taller_infonavit', 'Constancia del taller "Saber más para decidir mejor"', 'Constancia emitida por INFONAVIT al concluir el taller en línea.', 'comprador', true, true, 365, null, 8),

  -- Vendedor
  ('vend_ine', 'Identificación oficial (INE o Pasaporte)', 'Credencial para votar vigente del propietario.', 'vendedor', true, false, null, null, 10),
  ('vend_curp', 'CURP certificada', 'Constancia oficial de CURP verificada ante RENAPO.', 'vendedor', true, false, null, null, 11),
  ('vend_rfc', 'Constancia de Situación Fiscal (RFC)', 'Constancia oficial del SAT para efectos del cálculo de retención de ISR.', 'vendedor', true, true, 90, null, 12),
  ('vend_acta_matrimonio', 'Acta de matrimonio', 'En caso de haber adquirido el inmueble estando casado.', 'vendedor', false, false, null, 'si_casado', 13),
  ('vend_ine_conyuge', 'INE del cónyuge', 'Identificación oficial del cónyuge en caso de sociedad conyugal.', 'vendedor', false, false, null, 'si_mancomunados', 14),
  ('vend_cuenta_clabe', 'Estado de cuenta bancario con CLABE', 'Carátula de estado de cuenta a nombre del vendedor con CLABE interbancaria de 18 dígitos.', 'vendedor', true, true, 90, null, 15),
  ('vend_titulo_propiedad', 'Escritura o título de propiedad', 'Escritura pública completa con sello de inscripción en el Registro Público de la Propiedad.', 'vendedor', true, false, null, null, 16),

  -- Inmueble
  ('inm_predial', 'Recibo predial al corriente', 'Comprobante de pago del impuesto predial del año en curso.', 'inmueble', true, true, 180, null, 20),
  ('inm_agua_sapal', 'Constancia de no adeudo de agua (SAPAL)', 'Recibo y constancia de no adeudo de agua y alcantarillado.', 'inmueble', true, true, 60, null, 21),
  ('inm_cuotas_condominio', 'Constancia de no adeudo de cuotas de condominio', 'Carta emitida por la administración del fraccionamiento/condominio privado.', 'inmueble', false, true, 60, 'si_condominio', 22),
  ('inm_carta_saldo_hipoteca', 'Carta saldo de liquidación / hipoteca previa', 'Estado de cuenta o carta de saldo si el vendedor aún tiene hipoteca activa con banco o INFONAVIT.', 'inmueble', false, true, 30, 'si_credito_vigente', 23),
  ('inm_avaluo', 'Dictamen técnico de avalúo comercial INFONAVIT', 'Avalúo realizado por unidad de valuación autorizada por INFONAVIT.', 'inmueble', true, true, 180, null, 24),
  ('inm_clg', 'Certificado de Libertad de Gravamen (CLG)', 'Expedido por el Registro Público de la Propiedad.', 'inmueble', true, true, 90, null, 25),
  ('inm_alineamiento_numero', 'Alineamiento y número oficial', 'Constancia oficial emitida por la Dirección de Desarrollo Urbano municipal.', 'inmueble', true, false, null, null, 26)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  rol_aplicable = EXCLUDED.rol_aplicable,
  obligatorio = EXCLUDED.obligatorio,
  tiene_vigencia = EXCLUDED.tiene_vigencia,
  dias_vigencia_default = EXCLUDED.dias_vigencia_default,
  condicion_regla = EXCLUDED.condicion_regla,
  orden = EXCLUDED.orden;

-- ------------------------------------------------------------
-- 6. Expediente Documental de la Orden de Trabajo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_documentos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id        UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  parte_id                UUID REFERENCES public.ot_infonavit_partes(id) ON DELETE SET NULL,
  tipo_documento_id       TEXT NOT NULL REFERENCES public.ot_catalogo_documentos(id) ON DELETE RESTRICT,
  archivo_path            TEXT NOT NULL,
  archivo_nombre_original TEXT,
  archivo_tipo            TEXT,
  tamano_bytes            BIGINT,
  estatus                 TEXT NOT NULL DEFAULT 'recibido'
                          CHECK (estatus IN ('pendiente', 'recibido', 'validado', 'rechazado')),
  motivo_rechazo          TEXT,
  fecha_vigencia          DATE,
  validado_por            UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  validado_at             TIMESTAMPTZ,
  notas                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_docs_ot ON public.ot_infonavit_documentos(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_ot_docs_parte ON public.ot_infonavit_documentos(parte_id);
CREATE INDEX IF NOT EXISTS idx_ot_docs_estatus ON public.ot_infonavit_documentos(estatus);
CREATE INDEX IF NOT EXISTS idx_ot_docs_tipo ON public.ot_infonavit_documentos(tipo_documento_id);

-- ------------------------------------------------------------
-- 7. Historial y Auditoría de Etapas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_historial (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id  UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  etapa_anterior    TEXT,
  etapa_nueva       TEXT NOT NULL,
  motivo            TEXT,
  usuario_id        UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_historial_ot ON public.ot_infonavit_historial(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_ot_historial_created ON public.ot_infonavit_historial(created_at DESC);

-- ------------------------------------------------------------
-- 8. Cola de Eventos para Automatizaciones n8n (Outbox Pattern)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_infonavit_eventos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo_id  UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  evento            TEXT NOT NULL, -- 'etapa_cambiada', 'documento_rechazado', 'formulario_completado', 'ot_detenida'
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  procesado         BOOLEAN NOT NULL DEFAULT false,
  procesado_at      TIMESTAMPTZ,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_eventos_pendientes ON public.ot_infonavit_eventos(procesado) WHERE procesado = false;
CREATE INDEX IF NOT EXISTS idx_ot_eventos_ot ON public.ot_infonavit_eventos(orden_trabajo_id);

-- ------------------------------------------------------------
-- 9. Storage Privado para Expedientes Documentales
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedientes_infonavit', 'expedientes_infonavit', false)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 10. Seguridad y Políticas RLS
-- ------------------------------------------------------------
ALTER TABLE public.ot_infonavit_etapas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_infonavit_partes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_infonavit_inmueble ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_catalogo_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_infonavit_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_infonavit_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_infonavit_eventos ENABLE ROW LEVEL SECURITY;

-- Acceso completo para usuarios autenticados del CRM (personal SAUCEDA)
DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_etapas_catalogo" ON public.ot_infonavit_etapas_catalogo;
CREATE POLICY "Acceso authenticated ot_infonavit_etapas_catalogo" ON public.ot_infonavit_etapas_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_partes" ON public.ot_infonavit_partes;
CREATE POLICY "Acceso authenticated ot_infonavit_partes" ON public.ot_infonavit_partes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_inmueble" ON public.ot_infonavit_inmueble;
CREATE POLICY "Acceso authenticated ot_infonavit_inmueble" ON public.ot_infonavit_inmueble FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_catalogo_documentos" ON public.ot_catalogo_documentos;
CREATE POLICY "Acceso authenticated ot_catalogo_documentos" ON public.ot_catalogo_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_documentos" ON public.ot_infonavit_documentos;
CREATE POLICY "Acceso authenticated ot_infonavit_documentos" ON public.ot_infonavit_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_historial" ON public.ot_infonavit_historial;
CREATE POLICY "Acceso authenticated ot_infonavit_historial" ON public.ot_infonavit_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso authenticated ot_infonavit_eventos" ON public.ot_infonavit_eventos;
CREATE POLICY "Acceso authenticated ot_infonavit_eventos" ON public.ot_infonavit_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notificar recarga de schema cache
NOTIFY pgrst, 'reload schema';
