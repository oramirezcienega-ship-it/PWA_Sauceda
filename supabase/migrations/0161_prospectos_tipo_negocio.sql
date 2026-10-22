-- Clasificación (tipo de negocio) también en prospectos.
-- La app ya la leía y escribía en `prospectos` (bandeja de conversaciones, CRM),
-- pero la columna sólo existía en `expedientes`: al clasificar desde
-- Conversaciones un prospecto sin expediente salía el error
-- "Could not find the 'tipo_negocio' column of 'prospectos'".

alter table public.prospectos
  add column if not exists tipo_negocio text;

-- Rellenar con la clasificación del expediente más reciente del prospecto.
update public.prospectos p
set tipo_negocio = e.tipo_negocio
from (
  select distinct on (prospecto_id) prospecto_id, tipo_negocio
  from public.expedientes
  where prospecto_id is not null and tipo_negocio is not null
  order by prospecto_id, created_at desc
) e
where e.prospecto_id = p.id
  and p.tipo_negocio is null;

notify pgrst, 'reload schema';
