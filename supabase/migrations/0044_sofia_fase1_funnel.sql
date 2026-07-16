-- ============================================================
-- MÓDULO: SOFÍA IA - TRACKING DE FUNNEL Y ANTI-REPETICIÓN (FASE 1)
-- ------------------------------------------------------------
-- Agregar columnas a la tabla de expedientes para llevar el control
-- del último paso ejecutado del flujo y el paso más avanzado alcanzado
-- por el lead para el experimento de impermeabilización.
-- Además, se amplía el check de etapa para admitir 'fuera_de_zona'.
-- ============================================================

-- 1. Modificar la restricción check de etapa en expedientes para admitir 'fuera_de_zona' junto a las de construcción y tradicionales
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_etapa_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_etapa_check CHECK (etapa IN (
  'nuevo-lead', 'contactado', 'valuacion', 'oferta', 'documentos', 'notaria', 'cerrado', 'perdido',
  'interes', 'cotizacion', 'visita', 'propuesta-aceptada', 'venta',
  'fuera_de_zona'
));

-- 2. Agregar nuevas columnas de tracking
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS ultimo_paso_flujo TEXT CHECK (ultimo_paso_flujo IN ('paso_1', 'paso_2', 'paso_3', 'paso_4')),
  ADD COLUMN IF NOT EXISTS ultimo_paso_alcanzado TEXT DEFAULT 'lead_entro' CHECK (ultimo_paso_alcanzado IN ('lead_entro', 'respondio_paso1', 'vio_precios', 'eligio_paquete', 'dio_contacto', 'recibio_link', 'agendo_inspeccion'));
