-- Migration 0058: Preconfiguración del Flujo Operativo BPM de Impermeabilización
-- ============================================================

-- 1. Eliminar duplicado viejo si existiera
DELETE FROM public.bpm_flujos WHERE tipo_negocio = 'impermeabilizacion';

-- 2. Crear o Asegurar Flujo BPM Canónico para 'construccion-impermeabilizacion'
INSERT INTO public.bpm_flujos (id, tipo_negocio, activo)
VALUES ('b1b2c3d4-0000-0000-0000-000000000001', 'construccion-impermeabilizacion', true)
ON CONFLICT (tipo_negocio) DO UPDATE SET activo = true;

-- 3. Limpiar pasos previos
DELETE FROM public.bpm_pasos WHERE flujo_id = 'b1b2c3d4-0000-0000-0000-000000000001';

-- 4. Insertar las 12 Tareas del Flujo Operativo Canónico 'construccion-impermeabilizacion'
INSERT INTO public.bpm_pasos (flujo_id, etapa, orden, titulo_tarea, descripcion, rol_responsable, dias_vencimiento, condicion_activacion)
VALUES
  -- Etapa 1: Prospecto / Captación
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'captacion',
    1,
    'Contactar y validar necesidades de impermeabilización',
    'Verificar m2 aproximados, tipo de azotea y agendar inspección técnica.',
    'asesor',
    1,
    'inmediato'
  ),

  -- Etapa 2: Visita & Inspección Técnica
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'visita',
    2,
    'Realizar inspección técnica en azotea',
    'Medir área real, tomar fotos de grietas/pretiles, identificar bajantes pluviales y tipo de impermeabilizante.',
    'tecnico',
    2,
    'inmediato'
  ),
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'visita',
    3,
    'Subir reporte técnico y levantamiento',
    'Cargar fotos de evidencia y metraje técnico en el expediente del cliente.',
    'tecnico',
    1,
    'Realizar inspección técnica en azotea'
  ),

  -- Etapa 3: Presupuesto & Cotización
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'cotizacion',
    4,
    'Elaborar y enviar propuesta comercial de impermeabilización',
    'Crear cotización con especificaciones del material, garantía (3, 5 o 10 años) y mano de obra.',
    'asesor',
    2,
    'inmediato'
  ),
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'cotizacion',
    5,
    'Dar seguimiento a la cotización con el cliente',
    'Resolver dudas sobre la propuesta comercial y acordar fecha de inicio.',
    'asesor',
    2,
    'Elaborar y enviar propuesta comercial de impermeabilización'
  ),

  -- Etapa 4: Propuesta Aceptada & Anticipo
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'propuesta-aceptada',
    6,
    'Confirmar pago de anticipo y firmar contrato de obra',
    'Validar recibo/transferencia del anticipo (mínimo 50%) y emitir remisión.',
    'operaciones',
    2,
    'inmediato'
  ),

  -- Etapa 5: Firma & Ejecución de Obra
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'firma',
    7,
    'Programar cuadrilla y suministro de materiales',
    'Coordinar entrega de primario, malla de refuerzo e impermeabilizante asfáltico/acrílico y asignar cuadrilla.',
    'operaciones',
    1,
    'inmediato'
  ),
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'firma',
    8,
    'Limpieza de azotea y resane de grietas (Fase 1)',
    'Retiro de impermeabilizante dañado, cepillado de superficie, sellado de chaflanes y resane con primario.',
    'tecnico',
    2,
    'Programar cuadrilla y suministro de materiales'
  ),
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'firma',
    9,
    'Aplicación de capas impermeabilizantes (Fase 2)',
    'Aplicación de primera capa, tendido de malla de refuerzo y segunda capa de acabado reflectivo.',
    'tecnico',
    3,
    'Limpieza de azotea y resane de grietas (Fase 1)'
  ),
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'firma',
    10,
    'Inspección final de calidad de obra',
    'Revisión de terminaciones en pretiles, bajantes pluviales y toma de fotos del trabajo concluido.',
    'operaciones',
    1,
    'Aplicación de capas impermeabilizantes (Fase 2)'
  ),

  -- Etapa 6: Liquidación / Pago
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'pago',
    11,
    'Cobro de saldo restante de obra',
    'Presentar estimación final al cliente y recopilar el finiquito de obra.',
    'asesor',
    2,
    'inmediato'
  ),

  -- Etapa 7: Entregado / Garantía
  (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'entregado',
    12,
    'Entregar Carta de Garantía y solicitar reseña',
    'Generar y entregar el certificado de garantía por escrito (3, 5 o 10 años) y solicitar encuesta de satisfacción.',
    'operaciones',
    2,
    'inmediato'
  );

