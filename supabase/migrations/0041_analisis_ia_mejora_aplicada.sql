-- Agregar columna mejora_aplicada a la tabla analisis_ia
alter table public.analisis_ia add column if not exists mejora_aplicada boolean not null default false;
