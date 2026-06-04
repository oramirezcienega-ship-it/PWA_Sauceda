import type { CookieOptions } from "@supabase/ssr";

/**
 * Refuerza los atributos de seguridad de las cookies de sesión de Supabase
 * cuando se escriben desde el SERVIDOR:
 *  - HttpOnly: el JavaScript del navegador no puede leerlas (mitiga XSS).
 *  - SameSite=Lax: se mantienen al navegar desde nuestro dominio, pero se
 *    bloquean en peticiones de terceros (mitiga CSRF).
 *  - Secure: solo viajan por HTTPS (en producción).
 *
 * Solo contiene tipos/lógica pura (sin `next/headers`) para poder usarse
 * también en el middleware (runtime edge).
 */
export function opcionesCookieSeguras(options?: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: options?.path ?? "/",
  };
}
