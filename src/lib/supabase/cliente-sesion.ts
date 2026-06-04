import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseServidor } from "./server";
import { opcionesCookieSeguras } from "./cookies";

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
              cookieStore.set(name, value, opcionesCookieSeguras(options)),
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

/** Exige una sesión activa; si no, corta la operación. */
export async function requireAdmin() {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
}

/**
 * Rol y estado de un usuario (vía service role, ignora RLS).
 * Si no tiene perfil, se considera admin (bootstrap del primer usuario).
 */
export async function rolDe(
  userId: string,
): Promise<{ rol: "admin" | "asesor"; activo: boolean }> {
  try {
    const sb = supabaseServidor();
    const { data } = await sb
      .from("perfiles")
      .select("rol, activo")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return { rol: "admin", activo: true };
    return {
      rol: (data as { rol: "admin" | "asesor" }).rol,
      activo: (data as { activo: boolean }).activo,
    };
  } catch {
    // Si la tabla aún no existe, no bloqueamos (bootstrap).
    return { rol: "admin", activo: true };
  }
}

/** Exige rol de administrador (para la gestión de usuarios). */
export async function requireAdministrador() {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("No autorizado.");
  const { rol, activo } = await rolDe(usuario.id);
  if (!activo) throw new Error("Usuario inactivo.");
  if (rol !== "admin") throw new Error("Se requiere rol de administrador.");
}
