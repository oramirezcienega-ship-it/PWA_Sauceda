-- Migration 0145: Backfill de Atribución para Enrique Medina (EXP-360 / PRO-359)
-- Blindaje del modelo de atribución de Meta Ads para reflejar venta real en métricas y ROAS ($46,166 MXN).

UPDATE public.prospectos
SET campaign_name = 'SAUCEDA Construye Impermeabilizacion - Jul 2026',
    adset_name = 'Impermeabilizacion',
    ad_name = 'Atribución Pauta Activa 02-Sep'
WHERE id = 'PRO-359'
   OR telefono ILIKE '%5535059548%';

UPDATE public.expedientes
SET campaign_name = 'SAUCEDA Construye Impermeabilizacion - Jul 2026',
    adset_name = 'Impermeabilizacion',
    ad_name = 'Atribución Pauta Activa 02-Sep',
    ultimo_movimiento = current_date
WHERE id = 'EXP-360'
   OR telefono ILIKE '%5535059548%';
