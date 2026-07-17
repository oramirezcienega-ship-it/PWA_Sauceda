import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const telefono = "524172702864";
  
  try {
    console.log(`[Limpiar Test] Iniciando limpieza de base de datos para: ${telefono}`);
    const sb = supabaseServidor();
    
    // Borrar de todas las tablas relacionadas
    const r1 = await sb.from("mensajes_whatsapp").delete().eq("telefono", telefono);
    const r2 = await sb.from("expedientes").delete().eq("telefono", telefono);
    const r3 = await sb.from("prospectos").delete().eq("telefono", telefono);
    
    console.log(`[Limpiar Test] Limpieza finalizada. Errores:`, {
      mensajes: r1.error,
      expedientes: r2.error,
      prospectos: r3.error
    });
    
    return res.status(200).json({
      ok: true,
      mensaje: `Historial de ${telefono} limpio en staging.`,
      errores: {
        mensajes: r1.error?.message || null,
        expedientes: r2.error?.message || null,
        prospectos: r3.error?.message || null
      }
    });
  } catch (err) {
    console.error("[Limpiar Test] Excepción durante la limpieza:", err);
    return res.status(500).json({ error: String(err) });
  }
}
