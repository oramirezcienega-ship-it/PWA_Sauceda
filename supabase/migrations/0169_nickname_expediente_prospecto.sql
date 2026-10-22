-- Nickname (apodo / nombre corto) del negocio y del prospecto. Se mantiene igual
-- en ambos: al editar uno, la app actualiza el otro enlazado.
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT '';

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT '';
