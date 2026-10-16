/**
 * scripts/relinear-tipo-negocio-ots.cjs
 *
 * Ajusta el campo `tipo_negocio` en `ordenes_trabajo` para que coincida exactamente
 * con la línea de negocio preestablecida del expediente (ej. 'solo_tramite' vs 'asesoria_compra').
 */

const { createClient } = require('@supabase/supabase-js');

const url = 'https://odwxrcehbnygxcxmzold.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kd3hyY2VoYm55Z3hjeG16b2xkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDAxMTc3MCwiZXhwIjoyMDk1NTg3NzcwfQ.2tq4AHRf-ljySIqoy2cEGntPGJ5VglO0cy6kCgbd0H0';
const supabase = createClient(url, key);

async function relinear() {
  console.log('=== REALINEANDO TIPO DE NEGOCIO EN ÓRDENES DE TRABAJO ===\n');

  // Obtener todas las órdenes de trabajo que tienen expediente_id
  const { data: ots, error } = await supabase
    .from('ordenes_trabajo')
    .select('id, folio, tipo_negocio, expediente_id, expedientes(id, tipo_negocio, cliente)')
    .not('expediente_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar órdenes:', error);
    return;
  }

  console.log(`Evaluando ${ots.length} órdenes de trabajo vinculadas a expedientes...`);
  let actualizadas = 0;

  for (const ot of ots) {
    const expTipo = ot.expedientes?.tipo_negocio;
    if (!expTipo) continue;

    // Si el expediente es solo_tramite y la OT quedó como asesoria_compra, actualizarla a solo_tramite
    if (expTipo === 'solo_tramite' && ot.tipo_negocio === 'asesoria_compra') {
      const { error: errUpdate } = await supabase
        .from('ordenes_trabajo')
        .update({ tipo_negocio: 'solo_tramite' })
        .eq('id', ot.id);

      if (errUpdate) {
        console.error(`Error actualizando ${ot.folio}:`, errUpdate.message);
      } else {
        console.log(`✅ [ACTUALIZADA] ${ot.folio} (${ot.expedientes?.cliente}): asesoria_compra -> solo_tramite`);
        actualizadas++;
      }
    }
  }

  console.log(`\nProceso completado. Total de órdenes realineadas: ${actualizadas}`);

  // Verificar resumen final de tipos en ordenes_trabajo
  const { data: resumen } = await supabase.from('ordenes_trabajo').select('tipo_negocio');
  const counts = {};
  for (const r of resumen || []) {
    counts[r.tipo_negocio] = (counts[r.tipo_negocio] || 0) + 1;
  }
  console.log('\nDistribución final de tipos de negocio en ordenes_trabajo:', counts);
}

relinear();
