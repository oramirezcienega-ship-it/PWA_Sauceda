-- Correo electrónico del expediente. Se mantiene igual que el del prospecto
-- enlazado: al editar uno, la app actualiza el otro.
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS correo TEXT NOT NULL DEFAULT '';

-- Rellena con el correo que ya tenía el prospecto enlazado.
UPDATE public.expedientes e SET correo = p.correo
  FROM public.prospectos p
  WHERE e.prospecto_id = p.id AND coalesce(p.correo, '') <> '' AND e.correo = '';
