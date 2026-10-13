-- Migration 0150: Costo de la visita técnica / inspección configurable por línea de negocio
-- ============================================================
-- Antes el costo estaba fijo en el guion de Sofía ($500, anticipo $250).
-- Ahora vive en configuracion_agente 'costos_inspeccion':
--   JSON { "<tipo_negocio>": monto, "default": monto }
-- El anticipo para apartar la visita es la mitad; el resto se paga en sitio.
-- Siempre se descuenta completo si el cliente contrata.

-- Plomería, fontanería, electricidad y mantenimiento técnico (tipo_negocio 'construccion'): $200.
INSERT INTO public.configuracion_agente (clave, valor)
VALUES ('costos_inspeccion', '{"default": 500, "construccion": 200}')
ON CONFLICT (clave) DO NOTHING;
