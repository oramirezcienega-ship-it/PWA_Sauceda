-- Migration 0058: Preconfiguración del Flujo Operativo BPM de Impermeabilización
-- ============================================================

DO $$
DECLARE
    v_flujo_id UUID;
BEGIN
    -- 1. Eliminar duplicado viejo si existiera
    DELETE FROM public.bpm_flujos WHERE tipo_negocio = 'impermeabilizacion';

    -- 2. Insertar o actualizar el flujo de 'construccion-impermeabilizacion'
    INSERT INTO public.bpm_flujos (tipo_negocio, activo)
    VALUES ('construccion-impermeabilizacion', true)
    ON CONFLICT (tipo_negocio) DO UPDATE SET activo = true
    RETURNING id INTO v_flujo_id;

    -- 3. Si ya existía, obtener su ID real
    IF v_flujo_id IS NULL THEN
        SELECT id INTO v_flujo_id FROM public.bpm_flujos WHERE tipo_negocio = 'construccion-impermeabilizacion' LIMIT 1;
    END IF;

    -- 4. Limpiar pasos previos
    DELETE FROM public.bpm_pasos WHERE flujo_id = v_flujo_id;

    -- 5. Insertar las 12 Tareas del Flujo Operativo Canónico 'construccion-impermeabilizacion'
    INSERT INTO public.bpm_pasos (flujo_id, etapa, orden, titulo_tarea, descripcion, rol_responsable, dias_vencimiento, condicion_activacion)
    VALUES
      (v_flujo_id, 'captacion', 1, 'Contactar y validar necesidades de impermeabilizacion', 'Verificar m2 aproximados, tipo de azotea y agendar inspeccion tecnica.', 'asesor', 1, 'inmediato'),
      (v_flujo_id, 'visita', 2, 'Realizar inspeccion tecnica en azotea', 'Medir area real, tomar fotos de grietas y bajantes pluviales.', 'tecnico', 2, 'inmediato'),
      (v_flujo_id, 'visita', 3, 'Subir reporte tecnico y levantamiento', 'Cargar fotos de evidencia y metraje tecnico en el expediente.', 'tecnico', 1, 'Realizar inspeccion tecnica en azotea'),
      (v_flujo_id, 'cotizacion', 4, 'Elaborar y enviar propuesta comercial', 'Crear cotizacion con especificaciones del material y garantia.', 'asesor', 2, 'Subir reporte tecnico y levantamiento'),
      (v_flujo_id, 'cotizacion', 5, 'Seguimiento a cotizacion enviada', 'Llamar al prospecto para aclarar dudas sobre la propuesta comercial.', 'asesor', 2, 'Elaborar y enviar propuesta comercial'),
      (v_flujo_id, 'anticipo', 6, 'Registrar anticipo recibido y confirmar fecha de inicio', 'Verificar comprobante de pago del anticipo y coordinar cuadrilla.', 'asesor', 1, 'Seguimiento a cotizacion enviada'),
      (v_flujo_id, 'obra', 7, 'Programar cuadrilla y suministro de materiales', 'Asegurar impermeabilizante, sellador y herramientas en sitio.', 'operaciones', 1, 'Registrar anticipo recibido y confirmar fecha de inicio'),
      (v_flujo_id, 'obra', 8, 'Ejecucion de trabajos de impermeabilizacion', 'Realizar limpieza, calafateo de grietas y capas impermeabilizantes.', 'operaciones', 3, 'Programar cuadrilla y suministro de materiales'),
      (v_flujo_id, 'obra', 9, 'Inspeccion final de calidad', 'Verificar acabado uniforme y bajantes pluviales libres.', 'tecnico', 1, 'Ejecucion de trabajos de impermeabilizacion'),
      (v_flujo_id, 'finiquito', 10, 'Cobro de finiquito y entrega de remision', 'Cerrar saldo pendiente con el cliente y emitir remision.', 'asesor', 1, 'Inspeccion final de calidad'),
      (v_flujo_id, 'finiquito', 11, 'Generar y entregar Carta de Garantia', 'Emitir certificado de garantia oficial por los anos acordados.', 'asesor', 1, 'Cobro de finiquito y entrega de remision'),
      (v_flujo_id, 'cierre', 12, 'Encuesta de satisfaccion y solicitar resena', 'Confirmar conformidad del cliente y solicitar evaluacion del servicio.', 'asesor', 2, 'Generar y entregar Carta de Garantia');
END $$;
