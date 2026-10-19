-- Migration 0135: Reclasificar leads de la campaña "Casa a Punto" (Mantenimiento del Hogar)
-- ============================================================
-- detectarTipoNegocio no reconocía "Casa a Punto" en campaign/adset/ad, por lo que esos
-- expedientes quedaron como 'otro'. Se reclasifican a Mantenimiento Postventa.

UPDATE public.expedientes
SET tipo_negocio = 'construccion-mantenimiento-postventa'
WHERE (tipo_negocio = 'otro' OR tipo_negocio IS NULL)
  AND (
    LOWER(COALESCE(campaign_name, '')) ~ 'casa\s*a\s*punto'
    OR LOWER(COALESCE(adset_name, '')) ~ 'casa\s*a\s*punto'
    OR LOWER(COALESCE(ad_name, '')) ~ 'casa\s*a\s*punto'
  );
