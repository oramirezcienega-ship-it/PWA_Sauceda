const { createClient } = require('@supabase/supabase-js');

const url = 'https://odwxrcehbnygxcxmzold.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kd3hyY2VoYm55Z3hjeG16b2xkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDAxMTc3MCwiZXhwIjoyMDk1NTg3NzcwfQ.2tq4AHRf-ljySIqoy2cEGntPGJ5VglO0cy6kCgbd0H0';
const supabase = createClient(url, key);

async function detailAudit() {
  const { data: exps, error } = await supabase
    .from('expedientes')
    .select('id, cliente, primer_apellido, telefono, tipo_negocio, etapa, necesidad, valor_estimado, fraccionamiento, created_at, prospecto_id, notas, asesor_id')
    .in('tipo_negocio', ['asesoria_compra', 'solo_tramite'])
    .gte('created_at', '2026-10-01T00:00:00Z')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expedientes:', error);
    return;
  }

  console.log(`Encontrados ${exps.length} expedientes de compra/trámite en octubre 2026:`);

  for (const exp of exps) {
    const { data: p } = await supabase
      .from('prospectos')
      .select('nombre, telefono, notas')
      .eq('id', exp.prospecto_id)
      .maybeSingle();

    const { data: ots } = await supabase
      .from('ordenes_trabajo')
      .select('id, folio, tipo_negocio, etapa, estatus')
      .eq('expediente_id', exp.id);

    const { data: msgs } = await supabase
      .from('mensajes_whatsapp')
      .select('remitente, mensaje, created_at')
      .eq('telefono', exp.telefono)
      .order('created_at', { ascending: false })
      .limit(3);

    console.log('----------------------------------------------------');
    console.log(`EXPEDIENTE: ${exp.id} | Tipo Negocio: ${exp.tipo_negocio} | Fecha: ${exp.created_at}`);
    console.log(`Cliente: ${exp.cliente} ${exp.primer_apellido || ''} | Tel: ${exp.telefono} | Etapa: ${exp.etapa}`);
    console.log(`Necesidad: ${exp.necesidad || '(vacio)'}`);
    console.log(`Valor Estimado: ${exp.valor_estimado} | Fraccionamiento/Zonas: ${exp.fraccionamiento}`);
    console.log(`Notas Prospecto: ${p?.notas ? p.notas.replace(/\n/g, ' ') : '(sin notas)'}`);
    console.log(`OTs vinculadas: ${ots && ots.length > 0 ? ots.map(o => `${o.folio} [${o.tipo_negocio} - ${o.etapa}]`).join(', ') : 'NINGUNA'}`);
    if (msgs && msgs.length > 0) {
      console.log(`Mensajes recientes WhatsApp (${msgs.length}):`);
      msgs.forEach(m => console.log(`   [${m.remitente}] ${m.mensaje?.slice(0, 100)}...`));
    }
  }
}

detailAudit();
