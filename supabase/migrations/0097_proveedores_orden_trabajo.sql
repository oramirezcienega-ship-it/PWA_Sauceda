-- ============================================================
-- MIGRACIÓN 0097: AUTOMATIZAR COSTOS DE PROVEEDOR DESDE ÓRDENES DE TRABAJO
-- ------------------------------------------------------------
-- Permite asignar el proveedor y el costo pactado directamente en la
-- Orden de Trabajo. Al concluir la orden, se genera automáticamente la
-- remisión del proveedor (folio interno consecutivo), jalando producto,
-- cantidades, cliente y referencia de la orden/cotización. Cuando el
-- proveedor entrega su factura formal, se captura su folio real además
-- del consecutivo interno.
-- ============================================================

-- 1. Proveedor y costo pactado en la Orden de Trabajo
alter table public.ordenes_trabajo
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null,
  add column if not exists costo_proveedor numeric(12, 2),
  add column if not exists proveedor_concepto text;

create index if not exists idx_ordenes_trabajo_proveedor on public.ordenes_trabajo(proveedor_id);

-- 2. Trazabilidad del documento de proveedor generado automáticamente
alter table public.documentos_proveedores
  add column if not exists orden_trabajo_id uuid references public.ordenes_trabajo(id) on delete set null,
  add column if not exists folio_proveedor text,
  add column if not exists origen text not null default 'manual' check (origen in ('manual', 'automatico'));

create index if not exists idx_documentos_proveedores_ot on public.documentos_proveedores(orden_trabajo_id);

-- Evita generar más de un documento automático por orden de trabajo
create unique index if not exists idx_documentos_proveedores_ot_automatico
  on public.documentos_proveedores(orden_trabajo_id)
  where origen = 'automatico';
