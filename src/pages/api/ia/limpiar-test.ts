import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir GET para facilitar la ejecución desde el navegador o fetch rápido
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Verificación de seguridad básica con token
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    return res.status(500).json({ error: "CRON_SECRET no configurado en el servidor." });
  }

  const isAuthorized = 
    (authHeader === `Bearer ${expectedToken}`) || 
    (tokenQuery === expectedToken);

  if (!isAuthorized) {
    console.warn("[Limpiar Test] Intento de acceso no autorizado.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const telefono = (req.query.telefono as string) || "524172702864";

  try {
    console.log(`[Limpiar Test] Iniciando limpieza en BD Staging para teléfono: ${telefono}`);
    const sb = supabaseServidor();

    // Borrado secuencial de registros en cascada
    const r1 = await sb.from("mensajes_whatsapp").delete().eq("telefono", telefono);
    const r2 = await sb.from("expedientes").delete().eq("telefono", telefono);
    const r3 = await sb.from("prospectos").delete().eq("telefono", telefono);

    console.log(`[Limpiar Test] Limpieza completada para: ${telefono}`, {
      mensajes: r1.error ? r1.error.message : "Ok",
      expedientes: r2.error ? r2.error.message : "Ok",
      prospectos: r3.error ? r3.error.message : "Ok"
    });

    return res.status(200).json({
      ok: true,
      mensaje: `Historial de test para ${telefono} eliminado de la base de datos con éxito.`,
      detalles: {
        mensajes: r1.error ? r1.error.message : "Borrados",
        expedientes: r2.error ? r2.error.message : "Borrados",
        prospectos: r3.error ? r3.error.message : "Borrados"
      }
    });
  } catch (err) {
    console.error("[Limpiar Test] Error en el endpoint de limpieza:", err);
    return res.status(500).json({ error: String(err) });
  }
}
