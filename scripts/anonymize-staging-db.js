const { createClient } = require("@supabase/supabase-js");

async function main() {
  // Cargar variables de entorno
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Error: Faltan las variables de entorno de Supabase.");
    process.exit(1);
  }

  // Confirmación visual del destino de la base de datos
  console.log(`Conectando a Supabase: ${url}`);
  console.log(`Bypass RLS activo (Service Role Key): ${key.length > 100 ? "Sí" : "No"}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\nIniciando proceso de anonimización de datos en staging...");

  // 1. Anonimizar Prospectos
  console.log("-> Anonimizando tabla: prospectos...");
  const { data: pros, error: errPros } = await supabase.rpc("anonymize_prospectos_staging");
  
  // Si no tenemos la función rpc registrada, lo hacemos mediante consultas SQL directas
  let queryError = null;

  const sqlQuery = `
    -- 1. Anonimizar Prospectos
    UPDATE public.prospectos
    SET 
      nombre = 'Prospecto ' || id,
      primer_apellido = 'Test',
      segundo_apellido = 'Test',
      telefono = CASE 
        WHEN telefono IS NOT NULL AND length(telefono) >= 6 
        THEN substring(telefono from 1 for length(telefono) - 6) || '000000'
        ELSE '520000000000'
      END;

    -- 2. Anonimizar Expedientes
    UPDATE public.expedientes
    SET 
      cliente = 'Cliente ' || id,
      primer_apellido = 'Test',
      segundo_apellido = 'Test',
      telefono = CASE 
        WHEN telefono IS NOT NULL AND length(telefono) >= 6 
        THEN substring(telefono from 1 for length(telefono) - 6) || '000000'
        ELSE '520000000000'
      END,
      notas = 'Notas de prueba para staging.',
      situacion = 'Situación de prueba.',
      direccion_propiedad = 'Dirección de Prueba, León, Gto.',
      link_google_maps = NULL;

    -- 3. Anonimizar Mensajes de WhatsApp
    UPDATE public.mensajes_whatsapp
    SET 
      telefono = CASE 
        WHEN telefono IS NOT NULL AND length(telefono) >= 6 
        THEN substring(telefono from 1 for length(telefono) - 6) || '000000'
        ELSE '520000000000'
      END,
      texto = CASE 
        WHEN texto LIKE '[audio:%' THEN '[audio:media_id_anonimo] (Mensaje de voz de prueba)'
        WHEN texto LIKE '[image:%' THEN '[image:media_id_anonimo] (Imagen de prueba)'
        WHEN texto LIKE '[sticker:%' THEN '[sticker:media_id_anonimo]'
        WHEN texto LIKE '[video:%' THEN '[video:media_id_anonimo]'
        WHEN texto LIKE '[document:%' THEN '[document:media_id_anonimo] archivo_prueba.pdf'
        ELSE 'Mensaje de prueba en staging.'
      END;

    -- 4. Limpiar respuestas de formularios
    UPDATE public.envios_formulario
    SET respuestas = '{}'::jsonb;
  `;

  // Como la API de supabase-js no soporta ejecutar SQL arbitrario directamente de forma nativa por seguridad
  // a menos que sea a través de rpc(), proveemos los bloques SQL individuales para ser ejecutados
  // en la consola de SQL de Supabase, o hacemos updates directos mediante cliente REST de Supabase.
  
  try {
    // Intentar anonimizar mediante llamadas de la API de Supabase-js una a una para que el script de Node funcione solo
    
    // Prospectos
    const { data: listPros } = await supabase.from("prospectos").select("id, telefono");
    if (listPros && listPros.length > 0) {
      console.log(`   Procesando ${listPros.length} prospectos...`);
      for (const p of listPros) {
        const tel = p.telefono;
        const newTel = tel && tel.length >= 6 ? tel.substring(0, tel.length - 6) + "000000" : "520000000000";
        await supabase.from("prospectos").update({
          nombre: `Prospecto ${p.id}`,
          primer_apellido: "Test",
          segundo_apellido: "Test",
          telefono: newTel
        }).eq("id", p.id);
      }
    }

    // Expedientes
    const { data: listExps } = await supabase.from("expedientes").select("id, telefono");
    if (listExps && listExps.length > 0) {
      console.log(`   Procesando ${listExps.length} expedientes...`);
      for (const e of listExps) {
        const tel = e.telefono;
        const newTel = tel && tel.length >= 6 ? tel.substring(0, tel.length - 6) + "000000" : "520000000000";
        await supabase.from("expedientes").update({
          cliente: `Cliente ${e.id}`,
          primer_apellido: "Test",
          segundo_apellido: "Test",
          telefono: newTel,
          notas: "Notas de prueba para staging.",
          situacion: "Situación de prueba.",
          direccion_propiedad: "Dirección de Prueba, León, Gto.",
          link_google_maps: null
        }).eq("id", e.id);
      }
    }

    // Mensajes de WhatsApp
    const { data: listMsgs } = await supabase.from("mensajes_whatsapp").select("id, telefono, texto");
    if (listMsgs && listMsgs.length > 0) {
      console.log(`   Procesando ${listMsgs.length} mensajes de WhatsApp...`);
      for (const m of listMsgs) {
        const tel = m.telefono;
        const newTel = tel && tel.length >= 6 ? tel.substring(0, tel.length - 6) + "000000" : "520000000000";
        let newTexto = "Mensaje de prueba en staging.";
        if (m.texto) {
          if (m.texto.startsWith("[audio:")) newTexto = "[audio:media_id_anonimo] (Mensaje de voz de prueba)";
          else if (m.texto.startsWith("[image:")) newTexto = "[image:media_id_anonimo] (Imagen de prueba)";
          else if (m.texto.startsWith("[sticker:")) newTexto = "[sticker:media_id_anonimo]";
          else if (m.texto.startsWith("[video:")) newTexto = "[video:media_id_anonimo]";
          else if (m.texto.startsWith("[document:")) newTexto = "[document:media_id_anonimo] archivo_prueba.pdf";
        }
        await supabase.from("mensajes_whatsapp").update({
          telefono: newTel,
          texto: newTexto
        }).eq("id", m.id);
      }
    }

    // Formularios
    console.log("-> Limpiando respuestas en envios_formulario...");
    await supabase.from("envios_formulario").update({ respuestas: {} }).neq("id", "00000000-0000-0000-0000-000000000000");

    console.log("\n¡Anonimización completada con éxito en la base de datos local/staging!");
  } catch (err) {
    console.error("Error al ejecutar updates directos:", err);
  }

  console.log("\n========================================================");
  console.log("Si deseas ejecutarlo de forma masiva y ultrarrápida");
  console.log("directamente en la consola SQL de Supabase, utiliza:");
  console.log("========================================================");
  console.log(sqlQuery);
  console.log("========================================================");
}

main().catch(console.error);
