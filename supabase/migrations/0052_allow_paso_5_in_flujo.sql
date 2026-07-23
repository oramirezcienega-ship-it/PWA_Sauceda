-- Migration 0052: Permitir paso_5 en la restricción check de ultimo_paso_flujo en la tabla de expedientes
ALTER TABLE public.expedientes DROP CONSTRAINT IF EXISTS expedientes_ultimo_paso_flujo_check;
ALTER TABLE public.expedientes ADD CONSTRAINT expedientes_ultimo_paso_flujo_check CHECK (ultimo_paso_flujo IN ('paso_1', 'paso_2', 'paso_3', 'paso_4', 'paso_5'));
