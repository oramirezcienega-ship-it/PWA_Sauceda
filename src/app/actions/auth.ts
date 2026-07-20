"use server";

import { supabaseSesion, rolDe } from "@/lib/supabase/cliente-sesion";
import { esEmail, limpiarTexto } from "@/lib/validacion";

/**
 * Autenticación del admin del lado del SERVIDOR.
 *
 * Al iniciar sesión aquí (no en el navegador), Supabase escribe las cookies
 * de sesión desde el servidor, lo que permite marcarlas como HttpOnly +
 * Secure + SameSite=Lax (ver `opcionesCookieSeguras`). El navegador nunca
 * tiene acceso por JavaScript al token de sesión.
 */
export async function iniciarSesion(
  correo: string,
  password: string,
): Promise<{ ok: boolean; error?: string; rol?: string }> {
  // Validación/sanitización en el servidor (no se confía en el cliente).
  const email = limpiarTexto(correo, 254).toLowerCase();
  if (!esEmail(email)) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 200) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  const sb = supabaseSesion();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    // Mensaje genérico para no revelar si el correo existe o no.
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  const { rol } = await rolDe(data.user.id);
  return { ok: true, rol };
}

/** Cierra la sesión del admin (borra las cookies desde el servidor). */
export async function cerrarSesion(): Promise<void> {
  const sb = supabaseSesion();
  await sb.auth.signOut();
}
