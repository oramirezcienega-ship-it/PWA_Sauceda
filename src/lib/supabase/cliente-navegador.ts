import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el NAVEGADOR (login del admin).
 * Usa la ANON KEY (pública, segura de exponer). Maneja la sesión del
 * usuario mediante cookies, en coordinación con el middleware.
 */
export function supabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
