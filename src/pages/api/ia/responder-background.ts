import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";
import { responderConIA } from "@/lib/ia/agente";

export const config = {
  api: {
    bodyParser: true,
  },
  // Configuración para que Netlify compile esto como una Background Function
  type: "experimental-background",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Verificación de seguridad básica con el token CRON_SECRET
  const authHeader = req.headers.authorization;
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.warn("[IA Background] Intento de acceso no autorizado al endpoint de fondo.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { telefono, expedienteId } = req.body;
    
    if (!telefono) {
      return res.status(400).json({ error: "Falta el parámetro telefono" });
    }

    console.log(`[IA Background] Iniciando procesamiento asíncrono para el teléfono: ${telefono}, expediente: ${expedienteId}`);
    
    const sb = supabaseServidor();
    await responderConIA(sb, { telefono, expedienteId });
    
    console.log(`[IA Background] Procesamiento finalizado con éxito para ${telefono}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[IA Background] Error ejecutando responderConIA en segundo plano:", err);
    return res.status(500).json({ error: String(err) });
  }
}
