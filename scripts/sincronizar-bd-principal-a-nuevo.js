const { createClient } = require("@supabase/supabase-js");

const originUrl = process.env.ORIGIN_SUPABASE_URL || "https://odwxrcehbnygxcxmzold.supabase.co";
const originKey = process.env.ORIGIN_SERVICE_KEY;

const targetUrl = process.env.TARGET_SUPABASE_URL || "https://supabase.saucedamx.com";
const targetKey = process.env.TARGET_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODQwODQ5MzIsImV4cCI6MTk0MTc2NDkzMn0.wYLan8LGHP7W_ZI1r_WMGyMIdJFsLVBp51GSrY1_sHo";

if (!originKey) {
  console.error("Error: Se requiere ORIGIN_SERVICE_KEY (clave Service Role o Anon Key de https://odwxrcehbnygxcxmzold.supabase.co).");
  process.exit(1);
}

const sbOrigin = createClient(originUrl, originKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sbTarget = createClient(targetUrl, targetKey, { auth: { persistSession: false, autoRefreshToken: false } });

const TABLAS_EN_ORDEN = [
  "perfiles",
  "prospectos",
  "expedientes",
  "cotizaciones",
  "visitas_reportes",
  "mensajes_whatsapp",
  "agenda_citas",
  "agenda_bloqueos",
  "actividades",
  "envios_formulario",
  "fotos_expedientes",
  "promociones_expedientes",
  "automation_sequences",
  "sequence_enrollments"
];

async function sincronizarTabla(tabla) {
  console.log(`\n--> Sincronizando tabla: ${tabla}...`);
  try {
    // 1. Obtener todos los registros del origen
    const { data: registros, error: errOrig } = await sbOrigin.from(tabla).select("*");
    if (errOrig) {
      console.error(`Error al leer ${tabla} en origen:`, errOrig.message);
      return;
    }

    if (!registros || registros.length === 0) {
      console.log(`Tabla ${tabla} está vacía en origen. Omitiendo.`);
      return;
    }

    console.log(`Obtenidos ${registros.length} registros de ${tabla} en origen.`);

    // 2. Upsert en destino por lotes de 50
    let insertados = 0;
    for (let i = 0; i < registros.length; i += 50) {
      const lote = registros.slice(i, i + 50);
      const { data: res, error: errTarg } = await sbTarget.from(tabla).upsert(lote).select();
      if (errTarg) {
        console.error(`Error al hacer upsert en ${tabla} (lote ${i}):`, errTarg.message);
      } else {
        insertados += (res ? res.length : lote.length);
      }
    }

    console.log(`¡Tabla ${tabla} sincronizada con éxito! Total copiados: ${insertados}`);
  } catch (err) {
    console.error(`Excepción sincronizando ${tabla}:`, err);
  }
}

async function sincronizarTodo() {
  console.log("=========================================================");
  console.log("INICIANDO SINCRONIZACIÓN DE BASE DE DATOS PRINCIPAL A NUEVA");
  console.log(`Origen: ${originUrl}`);
  console.log(`Destino: ${targetUrl}`);
  console.log("=========================================================");

  for (const tabla of TABLAS_EN_ORDEN) {
    await sincronizarTabla(tabla);
  }

  console.log("\n=========================================================");
  console.log("¡SINCRONIZACIÓN DE TODAS LAS TABLAS COMPLETADA CON ÉXITO!");
  console.log("=========================================================");
}

sincronizarTodo();
