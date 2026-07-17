import { supabaseServidor } from "../src/lib/supabase/server.js";

async function main() {
  console.log("=== DIAGNÓSTICO DE MENSAJES DE WHATSAPP EN PRODUCCIÓN ===");
  const sb = supabaseServidor();

  // 1. Obtener los últimos 10 mensajes generales
  console.log("\n--- ÚLTIMOS 10 MENSAJES EN MENSAJES_WHATSAPP ---");
  const { data: mensajes, error: errMsg } = await sb
    .from("mensajes_whatsapp")
    .select("id, telefono, direccion, texto, created_at, estatus_envio")
    .order("created_at", { ascending: false })
    .limit(10);

  if (errMsg) {
    console.error("Error al obtener mensajes:", errMsg);
  } else {
    mensajes?.forEach((m) => {
      console.log(`[${m.created_at}] Tel: ${m.telefono} | Dir: ${m.direccion} | Estatus: ${m.estatus_envio} | Texto: ${m.texto.slice(0, 100)}`);
    });
  }

  // 2. Obtener los últimos expedientes creados
  console.log("\n--- ÚLTIMOS 5 EXPEDIENTES CREADOS ---");
  const { data: exps, error: errExps } = await sb
    .from("expedientes")
    .select("id, cliente, telefono, etapa, ultimo_movimiento, creado_at")
    .order("creado_at", { ascending: false })
    .limit(5);

  if (errExps) {
    console.error("Error al obtener expedientes:", errExps);
  } else {
    exps?.forEach((e) => {
      console.log(`[ID: ${e.id}] Cliente: ${e.cliente} | Tel: ${e.telefono} | Etapa: ${e.etapa} | Movimiento: ${e.ultimo_movimiento}`);
    });
  }

  // 3. Revisar si hay algún log de error en el sistema o auditorías recientes
  console.log("\n--- ÚLTIMOS 5 REGISTROS DE AUDITORÍA IA ---");
  const { data: auds, error: errAuds } = await sb
    .from("analisis_ia")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (errAuds) {
    console.log("No se pudo leer analisis_ia o no existe (esto es normal si no se usa):", errAuds.message);
  } else {
    console.log(JSON.stringify(auds, null, 2));
  }
}

main().catch(console.error);
