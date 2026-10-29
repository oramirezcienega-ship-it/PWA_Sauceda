import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const anonRaw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key =
    anonRaw && !anonRaw.includes("placeholder")
      ? anonRaw
      : process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          try {
            let esHttps = false;
            try {
              const h = headers();
              const proto = h.get("x-forwarded-proto") || (h.get("referer")?.startsWith("https") ? "https" : "http");
              esHttps = proto.startsWith("https");
            } catch {
              esHttps = false;
            }
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                opcionesCookieSeguras({ ...options, secure: esHttps }),
              ),
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

// Caché en memoria para evitar llamadas de red repetidas a Supabase Auth en cada server action
interface CacheUsuario {
  user: any;
  exp: number;
}
const cacheUsuarios = new Map<string, CacheUsuario>();

interface CacheRol {
  rol: "admin" | "asesor" | "operaciones";
  activo: boolean;
  exp: number;
}
const cacheRoles = new Map<string, CacheRol>();

/**
 * Devuelve el usuario autenticado o null. No lanza error.
 * Utiliza caché en memoria con TTL de 60s ligado a la cookie de sesión para 0ms de latencia.
 */
export async function usuarioActual() {
  let cacheKey: string | null = null;
  try {
    const cookieStore = cookies();
    const authCookie = cookieStore.getAll().find((c) => c.name.includes("auth-token") || c.name.startsWith("sb-"));
    if (authCookie) {
      cacheKey = `${authCookie.name}:${authCookie.value.slice(0, 48)}`;
      const cached = cacheUsuarios.get(cacheKey);
      if (cached && Date.now() < cached.exp) {
        return cached.user;
      }
    }
  } catch {
    // Si cookies() no está disponible en este contexto, continúa normal
  }

  const sb = supabaseSesion();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (cacheKey && user) {
    if (cacheUsuarios.size > 200) {
      const ahora = Date.now();
      for (const [k, v] of cacheUsuarios) {
        if (v.exp < ahora) cacheUsuarios.delete(k);
      }
    }
    cacheUsuarios.set(cacheKey, { user, exp: Date.now() + 60000 });
  }

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
 * Con caché de 60s para resolver en 0ms en peticiones consecutivas.
 */
export async function rolDe(
  userId: string,
): Promise<{ rol: "admin" | "asesor" | "operaciones"; activo: boolean }> {
  const cached = cacheRoles.get(userId);
  if (cached && Date.now() < cached.exp) {
    return { rol: cached.rol, activo: cached.activo };
  }

  try {
    const sb = supabaseServidor();
    const { data } = await sb
      .from("perfiles")
      .select("rol, activo")
      .eq("id", userId)
      .maybeSingle();

    const res = !data
      ? { rol: "admin" as const, activo: true }
      : {
          rol: (data as { rol: "admin" | "asesor" | "operaciones" }).rol,
          activo: (data as { activo: boolean }).activo,
        };

    if (cacheRoles.size > 200) {
      const ahora = Date.now();
      for (const [k, v] of cacheRoles) {
        if (v.exp < ahora) cacheRoles.delete(k);
      }
    }
    cacheRoles.set(userId, { ...res, exp: Date.now() + 60000 });
    return res;
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
