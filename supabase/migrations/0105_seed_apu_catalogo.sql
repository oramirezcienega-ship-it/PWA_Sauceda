-- Seed Insumos y Conceptos Base APU

DO $$
DECLARE
  v_bu_imp UUID;
  v_bu_con UUID;
  v_bu_her UUID;
  v_c_cem UUID;
  v_c_are UUID;
  v_c_gra UUID;
  v_c_peg UUID;
  v_c_boq UUID;
  v_c_pismed UUID;
  v_mo_alb UUID;
  v_mo_ayu UUID;
  v_mo_plo UUID;
  v_mo_ele UUID;
  v_mo_pin UUID;
  v_her_men UUID;
  v_her_rot UUID;
  v_sub_can UUID;
  v_sub_gra UUID;
  v_sub_ret UUID;
BEGIN
  -- Obtener IDs de centros de costo
  SELECT id INTO v_bu_imp FROM public.business_units WHERE nombre = 'Impermeabilización' LIMIT 1;
  SELECT id INTO v_bu_con FROM public.business_units WHERE nombre = 'Construcción y Remodelación' LIMIT 1;
  SELECT id INTO v_bu_her FROM public.business_units WHERE nombre = 'Herrería y Cancelería' LIMIT 1;

  -- 1. Insumos Materiales
  INSERT INTO public.insumos (codigo, nombre, tipo, unidad, costo_proveedor, precio_interno, notas)
  VALUES
    ('MAT-CEM-01', 'Cemento Gris Tolteca 50kg', 'material', 'bulto', 220.00, 260.00, 'Material básico para morteros y firmes'),
    ('MAT-ARE-01', 'Arena de río cribada', 'material', 'm3', 450.00, 520.00, 'Arena limpia para pegado y aplanado'),
    ('MAT-GRA-01', 'Grava triturada 3/4"', 'material', 'm3', 480.00, 550.00, 'Para concretos estructurales y firmes'),
    ('MAT-BLO-01', 'Block de concreto 15x20x40 cm', 'material', 'pza', 16.50, 19.50, 'Block pesado estructurado'),
    ('MAT-PEG-01', 'Pegazulejo adhesivo cerámico 20kg', 'material', 'bulto', 110.00, 135.00, 'Adhesivo en polvo para pisos y azulejos'),
    ('MAT-BOQ-01', 'Boquilla con sellador antihongos 5kg', 'material', 'bulto', 75.00, 95.00, 'Para juntas de azulejo y piso'),
    ('MAT-PIS-ECO', 'Piso cerámico 45x45 cm mod. Toscana', 'material', 'm2', 150.00, 190.00, 'Gama Económica'),
    ('MAT-PIS-MED', 'Porcelanato 60x60 cm rectificado Marfil', 'material', 'm2', 260.00, 330.00, 'Gama Media'),
    ('MAT-PIS-PRE', 'Porcelanato 60x120 cm Calacatta pulido', 'material', 'm2', 460.00, 590.00, 'Gama Premium'),
    ('MAT-IMP-ACR', 'Impermeabilizante Acrílico Fibratado 5A 19L', 'material', 'pza', 1150.00, 1450.00, 'Cubeta 19 Litros'),
    ('MAT-IMP-PRE', 'Rollo prefabricado SBS 4.0mm gravilla roja 10m2', 'material', 'pza', 1420.00, 1780.00, 'Rollo 10m2 alta durabilidad')
  ON CONFLICT (codigo) DO UPDATE 
    SET costo_proveedor = EXCLUDED.costo_proveedor,
        precio_interno = EXCLUDED.precio_interno;

  -- 2. Insumos Mano de Obra
  INSERT INTO public.insumos (codigo, nombre, tipo, unidad, costo_proveedor, precio_interno, oficio, notas)
  VALUES
    ('MO-ALB-OF', 'Jornal Maestro Albañil oficial', 'mano_obra', 'jornada', 650.00, 750.00, 'albañil', 'Oficial especialista'),
    ('MO-AYU-GEN', 'Jornal Ayudante general de obra', 'mano_obra', 'jornada', 400.00, 460.00, 'ayudante', 'Ayudante de cuadrilla'),
    ('MO-PLO-OF', 'Jornal Maestro Fontanero / Plomero', 'mano_obra', 'jornada', 700.00, 820.00, 'plomero', 'Instalador hidrosanitario'),
    ('MO-ELE-OF', 'Jornal Maestro Electricista', 'mano_obra', 'jornada', 700.00, 820.00, 'electricista', 'Instalador eléctrico'),
    ('MO-PIN-OF', 'Jornal Pintor oficial', 'mano_obra', 'jornada', 550.00, 650.00, 'pintor', 'Pintura y acabados finos')
  ON CONFLICT (codigo) DO UPDATE
    SET costo_proveedor = EXCLUDED.costo_proveedor,
        precio_interno = EXCLUDED.precio_interno;

  -- 3. Herramienta y Subcontratos
  INSERT INTO public.insumos (codigo, nombre, tipo, unidad, costo_proveedor, precio_interno, notas)
  VALUES
    ('HER-ROT-01', 'Renta rotomartillo demoledor 15kg/día', 'herramienta_equipo', 'dia', 350.00, 450.00, 'Herramienta demolición'),
    ('HER-MEN-01', 'Herramienta menor (% mano de obra)', 'herramienta_equipo', 'lote', 30.00, 35.00, 'Desgaste palas, cucharas, niveles'),
    ('SUB-CAN-01', 'Cancel de baño templado 6mm suministro e inst.', 'subcontrato', 'pza', 3800.00, 4900.00, 'Destajo cancelero'),
    ('SUB-GRA-01', 'Cubierta granito San Gabriel m.l. suministrado', 'subcontrato', 'ml', 1800.00, 2400.00, 'Maquilador mármoles'),
    ('SUB-RET-01', 'Retiro de escombro camión volteo 7m3', 'subcontrato', 'viaje', 1200.00, 1500.00, 'Acarreo a tiro oficial')
  ON CONFLICT (codigo) DO UPDATE
    SET costo_proveedor = EXCLUDED.costo_proveedor,
        precio_interno = EXCLUDED.precio_interno;

  -- 4. Actualizar Centros de Costo en productos_servicios existentes
  UPDATE public.productos_servicios
  SET centro_costo_id = v_bu_imp
  WHERE LOWER(nombre) LIKE '%impermea%' AND (centro_costo_id IS NULL OR centro_costo_id != v_bu_imp);

  -- 5. Insertar Conceptos de Obra en productos_servicios
  INSERT INTO public.productos_servicios (
    id, nombre, descripcion, unidad, costo_unitario, precio_unitario, tipo, centro_costo_id, categoria, gama, descripcion_valor, especificaciones, fotos
  ) VALUES
  (
    'OBRA-DEM-AZU',
    'Demolición de azulejo y piso existente con acarreo',
    'Retiro cuidadoso de piso o azulejo antiguo, picado de firme/muro y acarreo de escombros a pie de camión.',
    'm2',
    75.00,
    115.00,
    'concepto_obra',
    v_bu_con,
    'Demolición y Preliminares',
    'estandar',
    'Preparamos la superficie dejando muros y firmes libres de impurezas para garantizar la máxima adherencia de los nuevos recubrimientos.',
    'Incluye equipo de protección, rotomartillo y costales de retiro.',
    '[{"url": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80", "tipo": "aplicacion", "titulo": "Preparación y demolición limpia"}]'::jsonb
  ),
  (
    'OBRA-COL-PIS',
    'Colocación de piso o azulejo cerámico/porcelanato',
    'Instalación nivelada a hueso o con crucetas niveladoras, adhesivo cerámico reforzado y emboquillado con sellador antihongos.',
    'm2',
    185.00,
    270.00,
    'concepto_obra',
    v_bu_con,
    'Recubrimientos',
    'media',
    'Acabado milimétricamente nivelado con juntas uniformes y selladas para evitar filtraciones y desprendimientos.',
    'Incluye adhesivo Crest o Bexel y boquilla antihongos con polímeros.',
    '[{"url": "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80", "tipo": "aplicacion", "titulo": "Colocación de porcelanato en baño"}]'::jsonb
  ),
  (
    'OBRA-SAL-HID',
    'Salida hidráulica y sanitaria en tubería CPVC/PVC',
    'Alimentación de agua fría/caliente en CPVC o Tuboplus y desagüe sanitario de 2" o 4" con cespol y pruebas de hermeticidad.',
    'salida',
    650.00,
    950.00,
    'concepto_obra',
    v_bu_con,
    'Instalaciones Hidrosanitarias',
    'estandar',
    'Tuberías ocultas termofusionadas o cementadas de alta presión, garantizando cero fugas en muros o entrepisos.',
    'Garantía contra fugas por 3 años. Pruebas hidrostáticas previas al sellado.',
    '[]'::jsonb
  ),
  (
    'OBRA-CAN-BAÑO',
    'Cancel de baño de cristal templado 6mm',
    'Suministro e instalación de cancelería en cristal templado claro de 6mm con jaladera toallero y herrajes de acero inoxidable.',
    'pza',
    4100.00,
    5800.00,
    'producto',
    v_bu_con,
    'Cancelería',
    'media',
    'Aporta elegancia, amplitud y modernidad al baño evitando salpicaduras y facilitando la limpieza.',
    'Cristal templado de seguridad con herrajes de acero inoxidable satinado.',
    '[{"url": "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=600&q=80", "tipo": "producto", "titulo": "Cancel templado minimalista"}]'::jsonb
  ),
  (
    'OBRA-SAN-ECOL',
    'Suministro e instalación de sanitario One-Piece ecológico',
    'Inodoro de una sola pieza con descarga dual 3.8/4.8L, asiento de caída lenta y accesorios de conexión.',
    'pza',
    2400.00,
    3450.00,
    'producto',
    v_bu_con,
    'Muebles de Baño',
    'media',
    'Ahorro del 40% de agua con diseño contemporáneo fácil de limpiar sin juntas visibles.',
    'Grado ecológico con certificado Conagua. Asiento de cierre suave.',
    '[]'::jsonb
  ),
  (
    'OBRA-CUB-GRAN',
    'Cubierta de granito natural San Gabriel para cocina',
    'Suministro, corte, barrenos para tarja y monomando, zoclo de 7 cm y colocación nivelada sobre muebles de cocina.',
    'ml',
    2100.00,
    3100.00,
    'producto',
    v_bu_con,
    'Cocinas y Cubiertas',
    'media',
    'Piedra natural de máxima resistencia al calor, rayaduras y manchas con brillo permanente.',
    'Granito importado espesor 2 cm con acabado pulido brillante y cantos boleados.',
    '[{"url": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80", "tipo": "aplicacion", "titulo": "Cocina con cubierta de granito negro"}]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        tipo = EXCLUDED.tipo,
        centro_costo_id = EXCLUDED.centro_costo_id,
        categoria = EXCLUDED.categoria,
        costo_unitario = EXCLUDED.costo_unitario,
        precio_unitario = EXCLUDED.precio_unitario,
        descripcion_valor = EXCLUDED.descripcion_valor,
        especificaciones = EXCLUDED.especificaciones,
        fotos = EXCLUDED.fotos;

  -- 6. Asociar Recetas APU (conceptos_apu_composicion)
  -- Para OBRA-COL-PIS (Colocación de piso cerámico/porcelanato)
  SELECT id INTO v_c_peg FROM public.insumos WHERE codigo = 'MAT-PEG-01';
  SELECT id INTO v_c_boq FROM public.insumos WHERE codigo = 'MAT-BOQ-01';
  SELECT id INTO v_mo_alb FROM public.insumos WHERE codigo = 'MO-ALB-OF';
  SELECT id INTO v_mo_ayu FROM public.insumos WHERE codigo = 'MO-AYU-GEN';
  SELECT id INTO v_her_men FROM public.insumos WHERE codigo = 'HER-MEN-01';

  IF v_c_peg IS NOT NULL AND v_mo_alb IS NOT NULL THEN
    INSERT INTO public.conceptos_apu_composicion (concepto_id, insumo_id, cantidad, desperdicio_pct, rendimiento, costo_unitario_insumo, importe_costo)
    VALUES
      ('OBRA-COL-PIS', v_c_peg, 0.3000, 5.00, 1.0000, 110.00, 34.65), -- 0.30 bulto pegazulejo por m2
      ('OBRA-COL-PIS', v_c_boq, 0.0800, 5.00, 1.0000, 75.00, 6.30),   -- 0.08 bulto boquilla por m2
      ('OBRA-COL-PIS', v_mo_alb, 0.1250, 0.00, 8.0000, 650.00, 81.25), -- Rendimiento 8 m2/jornal oficial
      ('OBRA-COL-PIS', v_mo_ayu, 0.1250, 0.00, 8.0000, 400.00, 50.00), -- Rendimiento 8 m2/jornal ayudante
      ('OBRA-COL-PIS', v_her_men, 1.0000, 0.00, 1.0000, 8.00, 8.00)     -- Herramienta menor
    ON CONFLICT (concepto_id, insumo_id) DO UPDATE
      SET cantidad = EXCLUDED.cantidad,
          desperdicio_pct = EXCLUDED.desperdicio_pct,
          rendimiento = EXCLUDED.rendimiento,
          costo_unitario_insumo = EXCLUDED.costo_unitario_insumo,
          importe_costo = EXCLUDED.importe_costo;
  END IF;

  -- 7. Asociar Conceptos a Plantillas Paramétricas de Espacios
  DELETE FROM public.plantillas_espacios_conceptos;

  -- Plantilla Baño Completo
  INSERT INTO public.plantillas_espacios_conceptos (plantilla_id, partida_nombre, producto_servicio_id, formula_cantidad, gama, condicion, orden)
  SELECT 
    p.id, '1. Demolición y Preliminares', 'OBRA-DEM-AZU', 'm2_muros + m2_piso', 'todas', NULL, 1
  FROM public.plantillas_espacios p WHERE p.slug = 'bano_completo'
  UNION ALL
  SELECT 
    p.id, '2. Instalaciones Hidrosanitarias', 'OBRA-SAL-HID', '3', 'todas', 'parametros.mover_instalaciones === true', 2
  FROM public.plantillas_espacios p WHERE p.slug = 'bano_completo'
  UNION ALL
  SELECT 
    p.id, '3. Recubrimientos y Acabados', 'OBRA-COL-PIS', 'm2_piso + m2_muros', 'todas', NULL, 3
  FROM public.plantillas_espacios p WHERE p.slug = 'bano_completo'
  UNION ALL
  SELECT 
    p.id, '4. Muebles y Accesorios', 'OBRA-SAN-ECOL', '1', 'todas', NULL, 4
  FROM public.plantillas_espacios p WHERE p.slug = 'bano_completo'
  UNION ALL
  SELECT 
    p.id, '5. Cancelería', 'OBRA-CAN-BAÑO', '1', 'todas', 'parametros.incluir_cancel === true', 5
  FROM public.plantillas_espacios p WHERE p.slug = 'bano_completo';

  -- Plantilla Cocina Integral
  INSERT INTO public.plantillas_espacios_conceptos (plantilla_id, partida_nombre, producto_servicio_id, formula_cantidad, gama, condicion, orden)
  SELECT 
    p.id, '1. Demolición y Retiro', 'OBRA-DEM-AZU', 'm2_piso', 'todas', NULL, 1
  FROM public.plantillas_espacios p WHERE p.slug = 'cocina'
  UNION ALL
  SELECT 
    p.id, '2. Pisos y Recubrimientos', 'OBRA-COL-PIS', 'm2_piso', 'todas', NULL, 2
  FROM public.plantillas_espacios p WHERE p.slug = 'cocina'
  UNION ALL
  SELECT 
    p.id, '3. Instalaciones Hidráulicas y Gas', 'OBRA-SAL-HID', '2', 'todas', 'parametros.mover_gas_agua === true', 3
  FROM public.plantillas_espacios p WHERE p.slug = 'cocina'
  UNION ALL
  SELECT 
    p.id, '4. Cubierta y Muebles', 'OBRA-CUB-GRAN', 'parametros.metros_lineales_muebles || 3', 'todas', 'parametros.incluye_cubierta === true', 4
  FROM public.plantillas_espacios p WHERE p.slug = 'cocina';

END $$;
