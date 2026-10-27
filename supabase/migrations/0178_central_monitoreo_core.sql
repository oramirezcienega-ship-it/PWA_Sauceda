-- Migration 0178: Central de Monitoreo Inteligente 2.0 (Sauceda Seguridad)
-- ==============================================================================
-- Tablas y estructura para recepción de eventos de alarma (SIA DC-09 / Webhooks),
-- filtrado pericial de video con Inteligencia Artificial y consola de despacho.

BEGIN;

-- 1. Tabla de Cuentas de Monitoreo
CREATE TABLE IF NOT EXISTS public.monitoreo_cuentas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_cuenta TEXT UNIQUE NOT NULL, -- Ej: 'CTA-1001', 'MR-2026'
    nombre_titular TEXT NOT NULL,
    tipo_inmueble TEXT NOT NULL DEFAULT 'residencial' CHECK (tipo_inmueble IN ('residencial', 'comercio', 'fraccionamiento', 'bodega', 'oficina')),
    direccion TEXT NOT NULL,
    telefono_principal TEXT NOT NULL,
    telefono_secundario TEXT,
    contacto_emergencia_nombre TEXT,
    contacto_emergencia_telefono TEXT,
    plan_monitoreo TEXT NOT NULL DEFAULT 'inteligente_ia' CHECK (plan_monitoreo IN ('basico', 'inteligente_ia', 'premium_patrulla')),
    cuota_mensual NUMERIC(10, 2) NOT NULL DEFAULT 490.00,
    estatus_servicio TEXT NOT NULL DEFAULT 'activo' CHECK (estatus_servicio IN ('activo', 'suspendido', 'prueba', 'baja')),
    panel_marca_modelo TEXT DEFAULT 'Hikvision AX PRO / NVR IP',
    clave_particion TEXT DEFAULT '1',
    ip_o_host TEXT,
    notas_acceso TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Zonas de Sensores y Cámaras Asociadas
CREATE TABLE IF NOT EXISTS public.monitoreo_zonas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_id UUID NOT NULL REFERENCES public.monitoreo_cuentas(id) ON DELETE CASCADE,
    zona_numero INTEGER NOT NULL,
    nombre_zona TEXT NOT NULL, -- Ej: 'Puerta Principal', 'Barda Perimetral Norte'
    tipo_sensor TEXT NOT NULL DEFAULT 'pir' CHECK (tipo_sensor IN ('pir', 'magnetico', 'humo', 'camara_cctv', 'panico', 'cerco_electrico', 'barrera_vehicular')),
    camara_stream_url TEXT,
    camara_snapshot_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT monitoreo_zonas_cuenta_zona_unique UNIQUE (cuenta_id, zona_numero)
);

-- 3. Tabla de Eventos de Alarma y Despacho
CREATE TABLE IF NOT EXISTS public.monitoreo_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_id UUID NOT NULL REFERENCES public.monitoreo_cuentas(id) ON DELETE CASCADE,
    zona_id UUID REFERENCES public.monitoreo_zonas(id) ON DELETE SET NULL,
    zona_numero INTEGER,
    codigo_evento TEXT NOT NULL, -- SIA: 'BA' (Robo), 'PA' (Pánico), 'FA' (Fuego), 'IV' (Intrusión Video IA), 'CL' (Armado), 'OP' (Desarmado)
    descripcion TEXT NOT NULL,
    prioridad TEXT NOT NULL DEFAULT 'alta' CHECK (prioridad IN ('critica', 'alta', 'media', 'baja', 'informativa')),
    origen TEXT NOT NULL DEFAULT 'panel_sia' CHECK (origen IN ('panel_sia', 'camara_ia', 'boton_panico', 'simulador')),
    veredicto_ia TEXT,
    confianza_ia NUMERIC(5, 2) DEFAULT 0.00,
    es_falsa_alarma BOOLEAN NOT NULL DEFAULT false,
    snapshot_url TEXT,
    video_url TEXT,
    estatus_despacho TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus_despacho IN ('pendiente', 'en_atencion', 'despachado', 'descartado', 'resuelto')),
    atendido_por TEXT,
    notas_operador TEXT,
    disuasion_activada BOOLEAN NOT NULL DEFAULT false,
    notificacion_whatsapp_enviada BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    atendido_at TIMESTAMPTZ
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_monitoreo_eventos_estatus ON public.monitoreo_eventos(estatus_despacho);
CREATE INDEX IF NOT EXISTS idx_monitoreo_eventos_created_at ON public.monitoreo_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoreo_eventos_cuenta ON public.monitoreo_eventos(cuenta_id);

-- 4. Datos Iniciales de Prueba / Semilla (Cuentas y Zonas Reales de Demostración)
INSERT INTO public.monitoreo_cuentas (numero_cuenta, nombre_titular, tipo_inmueble, direccion, telefono_principal, contacto_emergencia_nombre, contacto_emergencia_telefono, plan_monitoreo, cuota_mensual, panel_marca_modelo, notas_acceso)
VALUES
    ('CTA-1001', 'Coto Residencial Monte Rosa', 'fraccionamiento', 'Blvd. Monte Rosa #120, León Gto', '4771234567', 'Vigilancia Caseta Principal', '4779876543', 'premium_patrulla', 3800.00, 'Frigate NVR + Hikvision LPR', 'Código de pluma #4412. Guardia en caseta 24/7.'),
    ('CTA-1002', 'Abarrotes Lía - Bodega Central', 'bodega', 'Av. De las Rosas #340, Col. San Miguel, León Gto', '4777654321', 'Óscar Ramírez', '4771122334', 'inteligente_ia', 950.00, 'DSC Neo PowerSeries + 4 Cámaras IP', 'Cortina metálica automatizada con chapa electromagnética.'),
    ('CTA-1003', 'Ing. Roberto Méndez', 'residencial', 'Paseo del Molino #412, León Gto', '4773344556', 'Sra. Elena Soto', '4775566778', 'inteligente_ia', 490.00, 'Hikvision AX PRO + ColorVu 4K', 'Perro bóxer en patio trasero. No activar sirena en patio sin verificar.'),
    ('CTA-1004', 'Oficinas Sauceda Consultores', 'oficina', 'Blvd. Campestre #1800, León Gto', '4778899001', 'Central Sauceda', '4770011223', 'inteligente_ia', 790.00, 'Dahua AI NVR WizSense', 'Acceso por huella y conmutador central.')
ON CONFLICT (numero_cuenta) DO NOTHING;

-- Insertar Zonas para las cuentas
DO $$
DECLARE
    cta_1001_id UUID;
    cta_1002_id UUID;
    cta_1003_id UUID;
BEGIN
    SELECT id INTO cta_1001_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1001';
    SELECT id INTO cta_1002_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1002';
    SELECT id INTO cta_1003_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1003';

    IF cta_1001_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_zonas (cuenta_id, zona_numero, nombre_zona, tipo_dispositivo, camara_stream_url)
        VALUES
            (cta_1001_id, 1, 'Pluma Vehicular Entrada', 'barrera_vehicular', 'rtsp://100.112.17.72:554/stream1'),
            (cta_1001_id, 2, 'Barda Perimetral Posterior', 'cerco_electrico', 'rtsp://100.112.17.72:554/stream2')
        ON CONFLICT DO NOTHING;
    END IF;

    IF cta_1002_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_zonas (cuenta_id, zona_numero, nombre_zona, tipo_dispositivo)
        VALUES
            (cta_1002_id, 1, 'Cortina Metálica Principal', 'magnetico'),
            (cta_1002_id, 2, 'Pasillo de Almacén', 'pir'),
            (cta_1002_id, 99, 'Botón de Asalto Mostrador', 'panico')
        ON CONFLICT DO NOTHING;
    END IF;

    IF cta_1003_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_zonas (cuenta_id, zona_numero, nombre_zona, tipo_dispositivo)
        VALUES
            (cta_1003_id, 1, 'Cochera Exterior', 'camara_cctv'),
            (cta_1003_id, 2, 'Jardín Trasero', 'pir')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5. Insertar Eventos Iniciales de Demostración
DO $$
DECLARE
    cta_1001_id UUID;
    cta_1002_id UUID;
    cta_1003_id UUID;
BEGIN
    SELECT id INTO cta_1001_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1001';
    SELECT id INTO cta_1002_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1002';
    SELECT id INTO cta_1003_id FROM public.monitoreo_cuentas WHERE numero_cuenta = 'CTA-1003';

    IF cta_1001_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_eventos (
            cuenta_id, zona_numero, codigo_evento, descripcion, prioridad, origen,
            veredicto_ia, confianza_ia, es_falsa_alarma, snapshot_url, estatus_despacho
        ) VALUES (
            cta_1001_id, 2, 'IV', 'Intrusión Perimetral Confirmada', 'critica', 'camara_ia',
            '🚨 Intruso detectado escalando barda perimetral posterior. Sujeto con vestimenta oscura.', 96.50, false,
            'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=800&q=80', 'pendiente'
        );
    END IF;

    IF cta_1002_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_eventos (
            cuenta_id, zona_numero, codigo_evento, descripcion, prioridad, origen,
            veredicto_ia, confianza_ia, es_falsa_alarma, estatus_despacho
        ) VALUES (
            cta_1002_id, 99, 'PA', 'Activación Botón de Pánico / Asalto', 'critica', 'boton_panico',
            '⚠️ Alerta manual de pánico disparada en mostrador. Activación silenciosa.', 100.00, false,
            'pendiente'
        );
    END IF;

    IF cta_1003_id IS NOT NULL THEN
        INSERT INTO public.monitoreo_eventos (
            cuenta_id, zona_numero, codigo_evento, descripcion, prioridad, origen,
            veredicto_ia, confianza_ia, es_falsa_alarma, snapshot_url, estatus_despacho
        ) VALUES (
            cta_1003_id, 2, 'BA', 'Detección de Movimiento en Patio', 'baja', 'panel_sia',
            '✅ Falsa alarma descartada: Mascota (canino bóxer) transitando en patio trasero. Cero presencia humana.', 98.20, true,
            'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80', 'descartado'
        );
    END IF;
END $$;

COMMIT;
