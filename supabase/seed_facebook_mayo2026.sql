-- ============================================================
-- Carga de leads de Facebook (mayo 2026): prospectos + expedientes.
-- 1) Inserta 9 prospectos (PRO-###).
-- 2) Inserta 9 expedientes (EXP-###) ENLAZADOS a su prospecto por teléfono.
-- Requiere migraciones 0002–0009 ya aplicadas.
-- Excluye la fila de ejemplo (Juan Pérez) y la Alexa duplicada.
-- ============================================================

-- 1) PROSPECTOS
do $$
declare n int; r record;
begin
  select coalesce(max(cast(regexp_replace(id,'\D','','g') as int)),0)
    into n from public.prospectos;
  for r in select * from (values
    ('Alexa','Maurer','','477 240 9208','alexanutres@gmail.com'),
    ('Benjamin','Reyes','','429 145 8966',''),
    ('Martinez Andrade','De','Jesus Reyna','477 389 0114',''),
    ('Valery','Ruiz','','429 131 0787',''),
    ('Pepe','Olivares','','555 434 8293','pepeolivi@hotmail.com'),
    ('Carlos','Mendez','','477 594 9686',''),
    ('Lino','Contreras','','566 856 9612','rochalin47@gmail.com'),
    ('Norma','Lucia','Silva Hernandez','493 153 0615','silvanorma697@gmail.com'),
    ('Delia','Jusaino','','644 126 3708','jusainoarachely@gmail.com')
  ) as t(nombre,primer_apellido,segundo_apellido,telefono,correo)
  loop
    -- Evita duplicar si ya existe un prospecto con ese teléfono.
    if not exists (select 1 from public.prospectos where telefono = r.telefono) then
      n := n + 1;
      insert into public.prospectos
        (id,nombre,primer_apellido,segundo_apellido,telefono,correo,origen,
         ad_name,adset_name,campaign_name)
      values
        ('PRO-'||lpad(n::text,3,'0'), r.nombre, r.primer_apellido,
         r.segundo_apellido, r.telefono, r.correo, 'facebook',
         'Ad2_Compramos_Tu_Casa_Rápido','Sauceda Leads May2026',
         'Sauceda Campaña leads 05.2026');
    end if;
  end loop;
end $$;

-- 2) EXPEDIENTES (enlazados al prospecto por teléfono)
do $$
declare n int; r record; pid text;
begin
  select coalesce(max(cast(regexp_replace(id,'\D','','g') as int)),0)
    into n from public.expedientes;
  for r in select * from (values
    ('Alexa','Maurer','','477 240 9208','nuevo-lead','Creado: 05/27/2026 11:59am | Canal: Teléfono | Formulario: Sauceda Leads 05.206-copy'),
    ('Benjamin','Reyes','','429 145 8966','nuevo-lead','Creado: 05/27/2026 9:23am | Canal: Teléfono | Formulario: Sauceda Leads 05.206-copy'),
    ('Martinez Andrade','De','Jesus Reyna','477 389 0114','nuevo-lead','Creado: 05/26/2026 11:14pm | Canal: Teléfono | Formulario: Sauceda Leads 05.206-copy'),
    ('Valery','Ruiz','','429 131 0787','nuevo-lead','Creado: 05/26/2026 7:43pm | Canal: Teléfono | Formulario: Sauceda Leads 05.206-copy'),
    ('Pepe','Olivares','','555 434 8293','nuevo-lead','Creado: 05/23/2026 6:36pm | Email: pepeolivi@hotmail.com | Canal: Correo electrónico | Formulario: Sauceda Leads 05.206'),
    ('Carlos','Mendez','','477 594 9686','perdido','Creado: 05/28/2026 11:57pm | Canal: Teléfono | Formulario: Sauceda Leads 05.206-copy'),
    ('Lino','Contreras','','566 856 9612','perdido','Creado: 05/23/2026 4:44pm | Email: rochalin47@gmail.com | Canal: Correo electrónico | Formulario: Sauceda Leads 05.206'),
    ('Norma','Lucia','Silva Hernandez','493 153 0615','perdido','Creado: 05/23/2026 4:10pm | Email: silvanorma697@gmail.com | Canal: Correo electrónico | Formulario: Sauceda Leads 05.206'),
    ('Delia','Jusaino','','644 126 3708','perdido','Creado: 05/23/2026 3:17pm | Email: jusainoarachely@gmail.com | Canal: Correo electrónico | Formulario: Sauceda Leads 05.206')
  ) as t(nombre,primer_apellido,segundo_apellido,telefono,etapa,notas)
  loop
    n := n + 1;
    select id into pid from public.prospectos where telefono = r.telefono limit 1;
    insert into public.expedientes
      (id,cliente,primer_apellido,segundo_apellido,fraccionamiento,telefono,
       etapa,situacion,valor_estimado,saldo_deuda,notas,
       ad_name,adset_name,campaign_name,prospecto_id)
    values
      ('EXP-'||lpad(n::text,3,'0'), r.nombre, r.primer_apellido,
       r.segundo_apellido, 'Por definir', r.telefono, r.etapa, '', 0, 0,
       r.notas, 'Ad2_Compramos_Tu_Casa_Rápido','Sauceda Leads May2026',
       'Sauceda Campaña leads 05.2026', pid);
  end loop;
end $$;
