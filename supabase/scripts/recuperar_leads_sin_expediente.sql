-- ============================================================
-- Recuperar leads que quedaron como prospecto SIN expediente
-- ============================================================
-- Contexto: mientras expedientes_tipo_negocio_check estuvo desactualizada,
-- los leads de WhatsApp/Messenger con tipo "Sauceda Construye" guardaban el
-- prospecto pero no el expediente. Este script les crea su expediente con la
-- misma lógica que la app (tipo de negocio detectado por mensaje/campaña,
-- asesor por defecto, folio EXP-### correlativo).
--
-- USO (Supabase → SQL Editor):
--   1. Ajusta la fecha en `parametros` (desde cuándo buscar).
--   2. Ejecuta el script tal cual: solo MUESTRA la vista previa.
--   3. Si la lista es correcta, cambia `false` por `true` en
--      `ejecutar` y vuelve a ejecutarlo para crear los expedientes.
-- ============================================================

-- Réplica de detectarTipoNegocio() de src/lib/types.ts
create or replace function pg_temp.detectar_tipo_negocio(mensaje text, campana text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(campana,'')) ~ 'herreria|herrería'
      or t ~ 'herreria|herrería|porton|portón|protecciones|barandal|reja|techumbre|estructura metalica|estructura metálica|saguan|zaguán'
      then 'construccion-herreria'
    when t ~ 'estampado' then 'construccion-piso-estampado'
    when lower(coalesce(campana,'')) ~ 'mantenimiento|postventa'
      or t ~ 'postventa|post-venta|mantenimiento de tu hogar|mantenimiento del hogar|mantenimiento preventivo'
      then 'construccion-mantenimiento-postventa'
    when t ~ 'remodela|acabado|piso' then 'construccion-remodelacion'
    when t ~ 'impermeabili|gotera|humedad|impermeable|filtracion|filtración|azotea|techo|losa|concreto|reparacion|reparación|pintura|mantenimiento'
      then 'construccion-impermeabilizacion'
    when t ~ 'construye|construcción|construccion|amplia|ampliación|albañil|obra' then 'construccion'
    when t ~ 'traspaso|infonavit|fovissste|comprar casa|vender casa|compra de casa|deuda de casa' then 'traspaso_compra'
    when t ~ 'tramite|trámite|gesti|armado|expediente' then 'solo_tramite'
    when t ~ 'promocion|promoción|venda|comision|comisión|promover' then 'promocion_venta'
    else 'otro'
  end
  from (select lower(coalesce(mensaje,'') || ' ' || coalesce(campana,'')) as t) x
$$;

drop table if exists leads_a_recuperar;
create temp table leads_a_recuperar as
with parametros as (
  select
    date '2026-09-19' as desde,   -- <== AJUSTA: desde qué fecha buscar
    false             as ejecutar -- <== cambia a true para crear los expedientes
),
asesor_default as (
  -- Misma prioridad que obtenerIdAsesorDefault(): auto-asignación → Gerardo → asesor → cualquiera.
  select id from perfiles
  where activo
  order by
    (asignacion_automatica is true) desc,
    (nombre ilike '%gerardo%') desc,
    (rol = 'asesor') desc
  limit 1
),
huerfanos as (
  select p.*
  from prospectos p, parametros
  where p.created_at >= parametros.desde
    and p.origen in ('whatsapp', 'messenger', 'instagram', 'facebook') -- excluye pruebas manuales
    and coalesce(p.estatus, '') <> 'no_viable'
    and not exists (select 1 from expedientes e where e.prospecto_id = p.id)
),
primer_mensaje as (
  select distinct on (h.id) h.id as prospecto_id, m.texto
  from huerfanos h
  join mensajes_whatsapp m
    on m.direccion = 'in'
   and (m.prospecto_id = h.id
        or (h.telefono <> '' and right(regexp_replace(m.telefono, '\D', '', 'g'), 10)
                               = right(regexp_replace(h.telefono, '\D', '', 'g'), 10)))
  order by h.id, m.created_at asc
),
base as (
  select coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) as max_num
  from expedientes
)
select
  'EXP-' || lpad((base.max_num + row_number() over (order by h.created_at, h.id))::text, 3, '0') as nuevo_id,
  h.id as prospecto_id,
  h.nombre,
  coalesce(h.primer_apellido, '') as primer_apellido,
  coalesce(h.segundo_apellido, '') as segundo_apellido,
  coalesce(h.telefono, '') as telefono,
  h.origen,
  h.created_at,
  coalesce(h.campaign_name, '') as campaign_name,
  coalesce(h.adset_name, '') as adset_name,
  coalesce(h.ad_name, '') as ad_name,
  coalesce(h.canal_id, '') as canal_id,
  coalesce(h.asesor_id, (select id from asesor_default)) as asesor_id,
  pm.texto as primer_mensaje,
  pg_temp.detectar_tipo_negocio(
    pm.texto,
    concat_ws(' ', nullif(h.campaign_name, ''), nullif(h.adset_name, ''), nullif(h.ad_name, ''))
  ) as tipo_negocio,
  (select ejecutar from parametros) as ejecutar
from huerfanos h
cross join base
left join primer_mensaje pm on pm.prospecto_id = h.id;

-- Crea los expedientes solo si ejecutar = true.
insert into expedientes (
  id, cliente, primer_apellido, segundo_apellido, fraccionamiento, etapa,
  situacion, telefono, valor_estimado, saldo_deuda, notas, ultimo_movimiento,
  prospecto_id, campaign_name, adset_name, ad_name, canal_id, tipo_negocio, asesor_id
)
select
  nuevo_id,
  coalesce(nullif(nombre, ''), 'Lead ' || telefono),
  primer_apellido,
  segundo_apellido,
  'Por definir',
  'nuevo-lead',
  coalesce(left('Primer mensaje: ' || primer_mensaje, 300), 'Lead recuperado (prospecto sin expediente).'),
  telefono,
  0,
  0,
  'Expediente recuperado automáticamente: el alta original falló por la restricción de tipo de negocio.',
  current_date,
  prospecto_id,
  campaign_name,
  adset_name,
  ad_name,
  canal_id,
  tipo_negocio,
  asesor_id
from leads_a_recuperar
where ejecutar;

-- Vista previa / resultado.
select
  nuevo_id, prospecto_id, nombre, telefono, origen, created_at,
  tipo_negocio, left(primer_mensaje, 80) as primer_mensaje,
  case when ejecutar then 'CREADO' else 'vista previa' end as estado
from leads_a_recuperar
order by created_at;
