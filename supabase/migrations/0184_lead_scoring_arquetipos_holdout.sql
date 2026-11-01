-- Migración 0184: Lead Scoring Maestro, Arquetipos y Segmentación por Zonas (Experimento Holdout 90/10)

ALTER TABLE expedientes 
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS arquetipo TEXT,
ADD COLUMN IF NOT EXISTS zona_tier TEXT,
ADD COLUMN IF NOT EXISTS experimento_flujo TEXT DEFAULT 'variante_v2';

ALTER TABLE prospectos 
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS arquetipo TEXT,
ADD COLUMN IF NOT EXISTS zona_tier TEXT,
ADD COLUMN IF NOT EXISTS experimento_flujo TEXT DEFAULT 'variante_v2';

COMMENT ON COLUMN expedientes.lead_score IS 'Puntaje de calificación comercial omnicanal de 0 a 100 puntos';
COMMENT ON COLUMN expedientes.arquetipo IS 'Arquetipo de comprador detectado: urgente_dano, residencial_premium, cuidadoso_infonavit, curioso_general';
COMMENT ON COLUMN expedientes.zona_tier IS 'Nivel socioeconómico/inmobiliario en León: tier_1_premium, tier_2_medio, tier_3_popular';
COMMENT ON COLUMN expedientes.experimento_flujo IS 'Asignación de cohorte en pruebas A/B: variante_v2 (90%) o control_v1 (10%)';
