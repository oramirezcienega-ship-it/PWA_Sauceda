-- Permite los estados 'completada', 'completado', 'realizada', 'finalizada' en agenda_citas
ALTER TABLE agenda_citas DROP CONSTRAINT IF EXISTS agenda_citas_estado_check;
ALTER TABLE agenda_citas ADD CONSTRAINT agenda_citas_estado_check 
  CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'reagendada', 'completada', 'completado', 'realizada', 'finalizada'));
