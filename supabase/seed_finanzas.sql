-- ============================================================
-- DATOS DE PRUEBA: Finanzas y P&L
-- Copia y pega esto en el editor SQL de Supabase para ver datos
-- de demostración en tu pestaña de Finanzas.
-- ============================================================

-- Limpiar transacciones previas de prueba (opcional)
DELETE FROM public.transacciones_financieras WHERE concepto LIKE '%(Demo)%';

-- Insertar Egresos (Gastos Operativos OPEX)
INSERT INTO public.transacciones_financieras (fecha, tipo, categoria, concepto, monto) VALUES
('2026-05-01', 'gasto', 'renta', 'Renta de Oficina Central (Demo)', 12000.00),
('2026-05-15', 'gasto', 'nomina', 'Pago de Nómina Quincenal Asesores (Demo)', 28000.00),
('2026-05-20', 'gasto', 'servicios', 'Pago de Luz y Agua de Oficina (Demo)', 3500.00),
('2026-05-25', 'gasto', 'servicios', 'Internet Comercial Telmex (Demo)', 1200.00),
('2026-05-30', 'gasto', 'nomina', 'Pago de Nómina Quincenal Asesores (Demo)', 28000.00),
('2026-06-01', 'gasto', 'renta', 'Renta de Oficina Central (Demo)', 12000.00),
('2026-06-15', 'gasto', 'nomina', 'Pago de Nómina Quincenal Asesores (Demo)', 30000.00),
('2026-06-18', 'gasto', 'servicios', 'Pago de Luz y Internet de Oficina (Demo)', 4200.00),
('2026-06-30', 'gasto', 'nomina', 'Pago de Nómina Quincenal Asesores (Demo)', 30000.00);

-- Insertar Ingresos Manuales / Varios
INSERT INTO public.transacciones_financieras (fecha, tipo, categoria, concepto, monto) VALUES
('2026-05-10', 'ingreso', 'comision', 'Comisión Cierre Terreno Ramos (Demo)', 45000.00),
('2026-05-28', 'ingreso', 'venta', 'Venta Directa Derechos de Traspaso (Demo)', 25000.00),
('2026-06-08', 'ingreso', 'comision', 'Comisión Renta Bodega Comercial (Demo)', 18000.00),
('2026-06-22', 'ingreso', 'comision', 'Comisión Venta Casa Fracc. Sauces (Demo)', 75000.00);
