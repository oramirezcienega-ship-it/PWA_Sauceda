-- Migration 0152: Las inspecciones ya no generan comisión en automático
-- ============================================================
-- El trigger trg_comision_inspeccion creaba una comisión cada vez que una cita
-- de inspección quedaba "completada" (o sus notas decían Finalizada/Retro/
-- ejecutada), sin respetar si el asesor genera comisiones ni si el admin ya la
-- había descartado, y si la cita no tenía asesor se la daba al primer asesor
-- activo por orden alfabético.
--
-- Política actual: la inspección se cobra al cliente y se le descuenta de la
-- instalación; la comisión de visita solo se registra cuando un humano marca la
-- inspección como ejecutada y comisionable (Comisiones → marcar inspección).
-- Las comisiones ya creadas NO se tocan.

DROP TRIGGER IF EXISTS trg_comision_inspeccion ON public.agenda_citas;
DROP FUNCTION IF EXISTS public.fn_trg_comision_inspeccion();
