-- ============================================================
-- Etapa adicional: "perdido" (lead/traspaso que no prosperó)
-- ============================================================
alter table public.expedientes
  drop constraint if exists expedientes_etapa_check;

alter table public.expedientes
  add constraint expedientes_etapa_check check (etapa in (
    'nuevo-lead','contactado','valuacion','oferta',
    'documentos','notaria','cerrado','perdido'
  ));
