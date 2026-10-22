/**
 * scripts/alinear-casos-asesoria-prod.cjs
 *
 * Script de alineación y backfill para casos de Asesoría de Compra y Solo Trámite (Octubre 2026).
 * Crea la Orden de Trabajo (OT-2026-XXXX), su ficha técnica (ot_ficha_asesoria_compra)
 * con los datos de perfilamiento/precalificación extraídos, e instancia el flujo BPM operativo.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://odwxrcehbnygxcxmzold.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kd3hyY2VoYm55Z3hjeG16b2xkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDAxMTc3MCwiZXhwIjoyMDk1NTg3NzcwfQ.2tq4AHRf-ljySIqoy2cEGntPGJ5VglO0cy6kCgbd0H0';
const supabase = createClient(url, key);

const ADMIN_USER_ID = 'e777d9d4-68da-4462-8072-a889983ba491';

/**
 * Resuelve qué pasos aplican evaluando la condición sobre la ficha
 */
function resolverPasosAplicables(pasos, datosFicha) {
  return pasos
    .filter((paso) => {
      if (!paso.condicion_campo) return true;
      const { campo, igual } = paso.condicion_campo;
      const valor = datosFicha[campo];
      if (igual !== undefined) return valor === igual;
      return true;
    })
    .map((paso, idx, arr) => {
      let condicionEfectiva = paso.condicion_activacion || 'inmediato';
      return { paso, condicionEfectiva };
    });
}

/**
 * Construye el objeto de tarea BPM para la OT
 */
function construirTareaOT(expedienteId, ordenTrabajoId, p, condicionEfectiva, responsableId, ahora) {
  const agendadaPara = new Date(ahora.getTime() + (p.dias_vencimiento || 1) * 24 * 60 * 60 * 1000).toISOString();
  const estadoInicial = condicionEfectiva === 'inmediato' ? 'pendiente' : 'esperando_condicion';

  return {
    expediente_id: expedienteId,
    orden_trabajo_id: ordenTrabajoId,
    paso_id: p.id,
    titulo: p.titulo_tarea,
    descripcion: p.descripcion || '',
    estado: estadoInicial,
    dias_vencimiento: p.dias_vencimiento,
    agendada_para: agendadaPara,
    responsable_id: responsableId || ADMIN_USER_ID,
  };
}

/**
 * Analiza un expediente y sus notas para construir la ficha de asesoría
 */
function extraerPerfilExpediente(exp, notasProspecto) {
  const lineasNotas = (notasProspecto || '').split('\n').map(l => l.trim()).filter(Boolean);
  const ultimasLineasPerfil = lineasNotas.filter(l => l.includes('[Perfil Asesoría Compra]'));
  const ultimaLineaPerfil = ultimasLineasPerfil.length > 0 ? ultimasLineasPerfil[ultimasLineasPerfil.length - 1] : '';

  const textoCompleto = (notasProspecto || '') + ' ' + (exp.necesidad || '');
  const tipoNegocio = exp.tipo_negocio;

  // Determinar si ya tiene casa basándose en la última actualización y el contexto de la necesidad
  let yaTieneCasa = false;
  if (tipoNegocio === 'solo_tramite') {
    yaTieneCasa = true;
  }
  if (textoCompleto.includes('terreno propio') || textoCompleto.includes('trato directo')) {
    yaTieneCasa = true;
  } else if (ultimaLineaPerfil.includes('Ya tiene casa: Sí')) {
    yaTieneCasa = true;
  } else if (ultimaLineaPerfil.includes('Ya tiene casa: No')) {
    yaTieneCasa = false;
  }

  // Si en la necesidad dice explícitamente "Compra de casa" y busca zonas/opciones (y no es terreno propio)
  if (exp.necesidad && exp.necesidad.toLowerCase().startsWith('compra de casa') && ultimaLineaPerfil.includes('Ya tiene casa: No') && !textoCompleto.includes('terreno propio')) {
    yaTieneCasa = false;
  }

  // Monto precalificado
  let montoCredito = exp.valor_estimado && exp.valor_estimado > 0 ? Number(exp.valor_estimado) : null;
  const matchCredito = ultimaLineaPerfil.match(/Cr[ée]dito:\s*\$?([\d,]+)/i) || textoCompleto.match(/Cr[ée]dito:\s*\$?([\d,]+)/i) || textoCompleto.match(/precalificaci[oó]n\s*(?:aproximada|de)?\s*\$?([\d,]+)/i);
  if (!montoCredito && matchCredito) {
    const raw = matchCredito[1].replace(/,/g, '');
    const num = Number(raw);
    if (!isNaN(num) && num > 0) montoCredito = num;
  }

  // Ahorro propio
  let montoAhorro = null;
  const matchAhorro = ultimaLineaPerfil.match(/Ahorro:\s*\$?([\d,]+)/i) || textoCompleto.match(/Ahorro:\s*\$?([\d,]+)/i) || textoCompleto.match(/ahorro propio\s*\$?([\d,]+)/i);
  if (matchAhorro) {
    const raw = matchAhorro[1].replace(/,/g, '');
    const num = Number(raw);
    if (!isNaN(num)) montoAhorro = num;
  } else if (textoCompleto.includes('sin ahorro propio')) {
    montoAhorro = 0;
  }

  // Zonas
  let zonas = [];
  if (exp.fraccionamiento && exp.fraccionamiento !== 'Por definir') {
    zonas = [exp.fraccionamiento.trim()];
  }
  const matchZonas = ultimaLineaPerfil.match(/Zonas:\s*([^|\[\n]+)/i) || textoCompleto.match(/Zonas:\s*([^|\[\n]+)/i);
  if (matchZonas) {
    const rawZonas = matchZonas[1].trim();
    if (rawZonas && !zonas.includes(rawZonas)) {
      zonas = [rawZonas];
    }
  }

  // Recámaras
  let recamarasMin = null;
  const matchRec = ultimaLineaPerfil.match(/Rec[aá]maras m[ií]n:\s*(\d+)/i) || textoCompleto.match(/Rec[aá]maras m[ií]n:\s*(\d+)/i) || textoCompleto.match(/(\d+)\s*rec[aá]maras/i);
  if (matchRec) {
    recamarasMin = parseInt(matchRec[1], 10);
  }

  // Plazo
  let plazo = null;
  const matchPlazo = ultimaLineaPerfil.match(/Plazo:\s*([a-zA-Z0-9_]+)/i) || textoCompleto.match(/Plazo:\s*([a-zA-Z0-9_]+)/i);
  if (matchPlazo) {
    plazo = matchPlazo[1];
  } else if (textoCompleto.includes('inmediata') || textoCompleto.includes('inmediato')) {
    plazo = 'inmediato';
  } else if (textoCompleto.includes('con calma')) {
    plazo = '3_6_meses';
  }

  // Respuestas NSS / Fecha de nacimiento si existen
  const precalificacionRespuestas = {};
  const matchNSS = textoCompleto.match(/NSS:\s*(\d{10,11})/i);
  if (matchNSS) precalificacionRespuestas.nss = matchNSS[1];
  const matchFNac = textoCompleto.match(/F\.?Nac:\s*([0-9\/\-]+)/i);
  if (matchFNac) precalificacionRespuestas.fecha_nacimiento = matchFNac[1];

  return {
    yaTieneCasa,
    tipoCredito: 'INFONAVIT',
    montoCredito,
    montoAhorro,
    zonas,
    recamarasMin,
    plazo,
    tipoInmueble: 'casa',
    requisitos: exp.necesidad || 'Búsqueda / trámite de crédito Infonavit',
    precalificacionRespuestas,
  };
}

async function alinearCasos(dryRun = true) {
  console.log(`=== ALINEACIÓN DE CASOS DE ASESORÍA Y TRÁMITE ===`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN (Simulación sin cambios)' : 'EJECUCIÓN REAL EN PRODUCCIÓN'}\n`);

  // 1. Obtener flujo BPM de asesoría de compra y sus pasos
  const { data: flujo } = await supabase
    .from('bpm_flujos')
    .select('*')
    .eq('tipo_negocio', 'asesoria_compra')
    .eq('activo', true)
    .single();

  if (!flujo) {
    console.error('No se encontró el flujo BPM de asesoria_compra');
    return;
  }

  const { data: pasosBpm } = await supabase
    .from('bpm_pasos')
    .select('*')
    .eq('flujo_id', flujo.id)
    .order('orden', { ascending: true });

  console.log(`Flujo BPM cargado con ${pasosBpm.length} pasos maestros.`);

  // 2. Obtener expedientes de compra/trámite de octubre 2026
  const { data: expedientes, error: errExp } = await supabase
    .from('expedientes')
    .select('id, cliente, primer_apellido, telefono, tipo_negocio, etapa, necesidad, valor_estimado, fraccionamiento, created_at, prospecto_id, asesor_id')
    .in('tipo_negocio', ['asesoria_compra', 'solo_tramite'])
    .gte('created_at', '2026-10-01T00:00:00Z')
    .order('created_at', { ascending: true }); // Los más antiguos primero para correlativo de folio

  if (errExp || !expedientes) {
    console.error('Error al consultar expedientes:', errExp);
    return;
  }

  // 3. Determinar el folio correlativo inicial
  const anio = new Date().getFullYear();
  const prefijo = `OT-${anio}-`;
  const { data: ultimasOTs } = await supabase
    .from('ordenes_trabajo')
    .select('folio')
    .ilike('folio', `${prefijo}%`)
    .order('folio', { ascending: false })
    .limit(1);

  let siguienteNum = 1;
  if (ultimasOTs && ultimasOTs.length > 0 && ultimasOTs[0]?.folio) {
    const ultimo = ultimasOTs[0].folio.replace(prefijo, '');
    const parsed = parseInt(ultimo, 10);
    if (!isNaN(parsed)) siguienteNum = parsed + 1;
  }

  console.log(`Próximo número de folio correlativo: ${prefijo}${String(siguienteNum).padStart(4, '0')}`);
  console.log(`Total de expedientes evaluados: ${expedientes.length}\n`);

  let countAlineados = 0;
  let countOmitidos = 0;

  for (const exp of expedientes) {
    // Verificar si ya tiene una OT activa de asesoría
    const { data: otExistente } = await supabase
      .from('ordenes_trabajo')
      .select('id, folio, estatus')
      .eq('expediente_id', exp.id)
      .neq('estatus', 'cancelada')
      .maybeSingle();

    if (otExistente) {
      console.log(`[OMITIDO] ${exp.id} (${exp.cliente}) ya tiene la orden ${otExistente.folio}.`);
      countOmitidos++;
      continue;
    }

    // Obtener notas del prospecto
    const { data: pros } = await supabase
      .from('prospectos')
      .select('id, nombre, notas')
      .eq('id', exp.prospecto_id)
      .maybeSingle();

    const perfil = extraerPerfilExpediente(exp, pros?.notas);
    const folioAsignado = `${prefijo}${String(siguienteNum).padStart(4, '0')}`;
    siguienteNum++;

    const nombreCliente = (exp.cliente || 'Cliente') + (exp.primer_apellido ? ' ' + exp.primer_apellido : '');
    const tituloOT = perfil.yaTieneCasa
      ? `Trámite de compraventa · ${nombreCliente}`
      : `Asesoría de compra · ${nombreCliente}`;
    const descOT = perfil.yaTieneCasa
      ? `Acompañamiento y gestión de trámite Infonavit para compra directa / terceros.`
      : `Búsqueda y acompañamiento integral en compra de vivienda Infonavit.`;

    console.log(`----------------------------------------------------------------`);
    console.log(`[A ALINEAR] ${exp.id} -> Generar ${folioAsignado}`);
    console.log(`   Cliente: ${nombreCliente} | Tel: ${exp.telefono}`);
    console.log(`   Tipo: ${exp.tipo_negocio} | Ya tiene casa: ${perfil.yaTieneCasa ? 'SÍ (Directo trámite)' : 'NO (Búsqueda)'}`);
    console.log(`   Crédito Precalificado: ${perfil.montoCredito ? '$' + perfil.montoCredito.toLocaleString('es-MX') : 'Por definir'}`);
    console.log(`   Ahorro propio: ${perfil.montoAhorro !== null ? '$' + perfil.montoAhorro.toLocaleString('es-MX') : 'Por definir'}`);
    console.log(`   Zonas: ${perfil.zonas.length > 0 ? perfil.zonas.join(', ') : 'Por definir'}`);
    console.log(`   Recámaras: ${perfil.recamarasMin || 'N/A'} | Plazo: ${perfil.plazo || 'N/A'}`);

    // Resolver tareas BPM aplicables según si ya_tiene_casa es true o false
    const aplicables = resolverPasosAplicables(pasosBpm, { ya_tiene_casa: perfil.yaTieneCasa });
    console.log(`   Pasos BPM que se instanciarán: ${aplicables.length} tareas (Filtro ya_tiene_casa aplicado).`);

    if (!dryRun) {
      const ordenTrabajoId = crypto.randomUUID();
      const tokenOT = crypto.randomBytes(16).toString('hex');
      const asesorResponsable = exp.asesor_id || ADMIN_USER_ID;

      // 1. Insertar orden de trabajo
      const { error: errOT } = await supabase.from('ordenes_trabajo').insert({
        id: ordenTrabajoId,
        folio: folioAsignado,
        token: tokenOT,
        expediente_id: exp.id,
        prospecto_id: exp.prospecto_id,
        tipo_negocio: 'asesoria_compra',
        estatus: 'en_proceso',
        etapa: 'precalificacion',
        titulo: tituloOT,
        descripcion: descOT,
        asesor_responsable_id: asesorResponsable,
        asesor_ejecutor_id: asesorResponsable,
        creado_por: ADMIN_USER_ID,
        fotos_evidencia: [],
      });

      if (errOT) {
        console.error(`   ERROR al crear OT ${folioAsignado}:`, errOT.message);
        continue;
      }

      // 2. Insertar ficha técnica ot_ficha_asesoria_compra
      const { error: errFicha } = await supabase.from('ot_ficha_asesoria_compra').upsert(
        {
          orden_trabajo_id: ordenTrabajoId,
          ya_tiene_casa: perfil.yaTieneCasa,
          tipo_credito: perfil.tipoCredito,
          monto_credito_precalificado: perfil.montoCredito,
          monto_ahorro_propio: perfil.montoAhorro,
          busqueda_zonas: perfil.zonas,
          busqueda_recamaras_min: perfil.recamarasMin,
          tipo_inmueble: perfil.tipoInmueble,
          plazo_mudanza: perfil.plazo,
          busqueda_requisitos: perfil.requisitos,
          precalificacion_respuestas: Object.keys(perfil.precalificacionRespuestas).length > 0
            ? perfil.precalificacionRespuestas
            : {},
        },
        { onConflict: 'orden_trabajo_id' }
      );

      if (errFicha) {
        console.error(`   ERROR al crear ficha de OT ${folioAsignado}:`, errFicha.message);
      }

      // 3. Instanciar tareas BPM
      const ahora = new Date();
      const tareasInsert = aplicables.map(({ paso, condicionEfectiva }) =>
        construirTareaOT(exp.id, ordenTrabajoId, paso, condicionEfectiva, asesorResponsable, ahora)
      );

      const { error: errTareas } = await supabase.from('bpm_expediente_tareas').insert(tareasInsert);
      if (errTareas) {
        console.error(`   ERROR al instanciar tareas BPM para ${folioAsignado}:`, errTareas.message);
      }

      // 4. Registrar en la bitácora de actividades
      await supabase.from('actividades').insert({
        expediente_id: exp.id,
        prospecto_id: exp.prospecto_id,
        tipo: 'sistema',
        titulo: `🔑 Orden de asesoría de compra ${folioAsignado} iniciada`,
        detalle: perfil.yaTieneCasa
          ? 'El cliente ya tiene casa/trato directo: flujo enfocado a gestión de trámite.'
          : `Alineada con perfil: Crédito ${perfil.montoCredito ? '$' + perfil.montoCredito.toLocaleString('es-MX') : 'Por definir'} | Zonas: ${perfil.zonas.join(', ') || 'Por definir'}.`,
      });

      // 5. Asegurar tipo_credito en el expediente
      await supabase
        .from('expedientes')
        .update({ tipo_credito: 'INFONAVIT' })
        .eq('id', exp.id)
        .is('tipo_credito', null);

      console.log(`   ✅ ALINEACIÓN EXITOSA: ${folioAsignado} (OT ID: ${ordenTrabajoId})`);
    }

    countAlineados++;
  }

  console.log(`\n================================================================`);
  console.log(`RESUMEN FINAL:`);
  console.log(`- Casos a alinear / procesados: ${countAlineados}`);
  console.log(`- Casos omitidos (ya tenían OT): ${countOmitidos}`);
  if (dryRun) {
    console.log(`\nPara ejecutar la alineación en producción, ejecuta con el parámetro: --apply`);
  }
}

const isApply = process.argv.includes('--apply');
alinearCasos(!isApply);
