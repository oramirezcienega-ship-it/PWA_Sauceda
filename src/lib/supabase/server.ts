import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para uso EXCLUSIVO en el servidor.
 *
 * Usa la SERVICE ROLE KEY, que ignora las políticas RLS y NUNCA debe
 * llegar al navegador. Por eso las variables no llevan el prefijo
 * NEXT_PUBLIC_ (Next.js solo expone al cliente las que lo tienen).
 *
 * Se crea de forma perezosa para que la app pueda compilar sin que las
 * variables existan (p. ej. en un build sin entorno configurado).
 */
let cliente: SupabaseClient | null = null;

export function supabaseServidor(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan las variables de entorno de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  if (!cliente) {
    cliente = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
