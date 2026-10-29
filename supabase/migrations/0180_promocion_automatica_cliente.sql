-- Migration 0180: Promoción automática de prospecto a 'cliente' al crear orden de trabajo o aceptar cotización
-- Garantiza a nivel base de datos que cualquier contacto con venta cerrada tenga estatus permanente 'cliente'

CREATE OR REPLACE FUNCTION public.promover_prospecto_a_cliente_trg()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.prospecto_id IS NOT NULL THEN
    UPDATE public.prospectos
    SET estatus = 'cliente'
    WHERE id = NEW.prospecto_id AND estatus != 'cliente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger al insertar orden de trabajo
DROP TRIGGER IF EXISTS trg_promover_cliente_ot ON public.ordenes_trabajo;
CREATE TRIGGER trg_promover_cliente_ot
AFTER INSERT ON public.ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.promover_prospecto_a_cliente_trg();

-- Trigger al cambiar cotización a aceptada
CREATE OR REPLACE FUNCTION public.promover_prospecto_cotizacion_aceptada_trg()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estatus IN ('aceptada', 'aprobada') AND NEW.prospecto_id IS NOT NULL THEN
    UPDATE public.prospectos
    SET estatus = 'cliente'
    WHERE id = NEW.prospecto_id AND estatus != 'cliente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_promover_cliente_cot ON public.cotizaciones;
CREATE TRIGGER trg_promover_cliente_cot
AFTER INSERT OR UPDATE OF estatus ON public.cotizaciones
FOR EACH ROW
EXECUTE FUNCTION public.promover_prospecto_cotizacion_aceptada_trg();
