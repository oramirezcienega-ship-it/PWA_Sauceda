-- ============================================================
-- Migración 0101: Forma de Cobro y Comisión Bancaria en Orden de Trabajo
-- ============================================================
-- La forma en que se cobrará el saldo (terminal, transferencia, efectivo,
-- meses sin intereses) se captura al Programar Instalación & Detonar OT,
-- pero antes solo quedaba como texto libre dentro de las notas/descripción
-- de la orden — no era un dato estructurado que otros módulos pudieran
-- leer. Ahora se guarda en su propia columna para que la remisión/factura
-- generada a partir de la orden herede automáticamente su costo
-- financiero (comisión bancaria/pasarela), en vez de tener que capturarse
-- de nuevo manualmente en cada remisión.
--
-- El porcentaje de comisión bancaria para Meses Sin Intereses NO se fija
-- aquí: las tasas de las pasarelas de pago (Mercado Pago, Clip, etc.)
-- cambian con el tiempo, así que queda como un campo editable que se
-- captura una sola vez por orden de trabajo, al momento de programar la
-- instalación.

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS metodo_pago_saldo    TEXT,
  ADD COLUMN IF NOT EXISTS meses_sin_intereses  INTEGER,
  ADD COLUMN IF NOT EXISTS comision_bancaria_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
