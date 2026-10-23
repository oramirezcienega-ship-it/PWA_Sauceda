-- ============================================================
-- LLAMADAS IA: fuente "prospectos sin cotización"
-- ------------------------------------------------------------
-- Prospectos de Sauceda Construye que escribieron por WhatsApp,
-- no tienen cotización y llevan 2+ días sin mensajes. La bandeja
-- los trae como sugerencias (segmento sin_respuesta / sin_cotizar,
-- o cotizado si ya se les dio precio en el chat).
-- ============================================================

create or replace function public.prospectos_sin_cotizacion_para_llamar(
  p_tipo text default null,
  p_dias integer default 150
)
returns table (
  id text,
  nombre text,
  telefono text,
  direccion text,
  ciudad text,
  tipo_negocio text,
  ultimo_mensaje timestamptz
)
language sql
stable
set search_path = public
as $$
  select p.id, p.nombre, p.telefono, p.direccion, p.ciudad, p.tipo_negocio, m.ultimo
  from prospectos p
  join lateral (
    select max(w.created_at) as ultimo, count(*) filter (where w.direccion = 'in') as entrantes
    from mensajes_whatsapp w
    where w.prospecto_id = p.id
  ) m on true
  where p.tipo_negocio like 'construccion%'
    and (p_tipo is null or p.tipo_negocio = p_tipo)
    and coalesce(p.no_viable, false) = false
    and coalesce(p.estatus, '') not in ('no_viable', 'cliente')
    and p.created_at > now() - make_interval(days => p_dias)
    and m.entrantes > 0
    and m.ultimo < now() - interval '2 days'
    and not exists (select 1 from cotizaciones c where c.prospecto_id = p.id)
  order by m.ultimo desc
$$;

revoke execute on function public.prospectos_sin_cotizacion_para_llamar(text, integer) from public, anon, authenticated;
