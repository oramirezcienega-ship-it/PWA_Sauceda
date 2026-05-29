import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase del lado SERVIDOR para leer la SESIÓN del usuario
 * (desde las cookies). Usa la ANON KEY. Sirve para saber si hay un admin
 * autenticado en server components y server actions.
 *
 * Es distinto del cliente con service role (`server.ts`), que se usa para
 * operar los datos ignorando RLS.
 */
export function supabaseSesion() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // En server components no se pueden escribir cookies; el
            // middleware se encarga de refrescar la sesión. Se ignora.
          }
        },
      },
    },
  );
}

/**
 * Devuelve el usuario autenticado o null. No lanza error.
 */
export async function usuarioActual() {
  const sb = supabaseSesion();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
}

/** Exige un admin autenticado; si no, corta la operación. */
export async function requireAdmin() {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
}
