-- ============================================================
-- Separar el nombre: nombre / primer_apellido / segundo_apellido
-- en prospectos y expedientes. El "nombre completo" se arma en la app.
-- ============================================================

alter table public.prospectos
  add column if not exists primer_apellido text not null default '';
alter table public.prospectos
  add column if not exists segundo_apellido text not null default '';

alter table public.expedientes
  add column if not exists primer_apellido text not null default '';
alter table public.expedientes
  add column if not exists segundo_apellido text not null default '';

-- Separación best-effort de los datos existentes (solo filas sin apellidos):
-- toma el último token como segundo apellido, el penúltimo como primero, y
-- el resto como nombre(s). El asesor puede corregir luego.
do $$
declare
  r record;
  w text[];
  n int;
begin
  for r in
    select id, nombre from public.prospectos
    where primer_apellido = '' and position(' ' in btrim(nombre)) > 0
  loop
    w := regexp_split_to_array(btrim(r.nombre), '\s+');
    n := array_length(w, 1);
    if n >= 3 then
      update public.prospectos set
        nombre = array_to_string(w[1:n-2], ' '),
        primer_apellido = w[n-1],
        segundo_apellido = w[n]
      where id = r.id;
    elsif n = 2 then
      update public.prospectos set nombre = w[1], primer_apellido = w[2]
      where id = r.id;
    end if;
  end loop;

  for r in
    select id, cliente from public.expedientes
    where primer_apellido = '' and position(' ' in btrim(cliente)) > 0
  loop
    w := regexp_split_to_array(btrim(r.cliente), '\s+');
    n := array_length(w, 1);
    if n >= 3 then
      update public.expedientes set
        cliente = array_to_string(w[1:n-2], ' '),
        primer_apellido = w[n-1],
        segundo_apellido = w[n]
      where id = r.id;
    elsif n = 2 then
      update public.expedientes set cliente = w[1], primer_apellido = w[2]
      where id = r.id;
    end if;
  end loop;
end $$;
