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
  try {
    // Validación/sanitización en el servidor (no se confía en el cliente).
    const email = limpiarTexto(correo, 254).toLowerCase();
    if (!esEmail(email)) {
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 200) {
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }

    const sb = supabaseSesion();
    const cleanPass = typeof password === "string" ? password.trim() : "";
    const { data, error } = await sb.auth.signInWithPassword({ email, password: cleanPass });
    if (error || !data?.user) {
      console.error("[iniciarSesion error]:", error?.message);
      return { ok: false, error: error?.message || "Correo o contraseña incorrectos." };
    }

    const { rol, activo } = await rolDe(data.user.id);
    if (activo === false) {
      return { ok: false, error: "Tu usuario se encuentra inactivo." };
    }
    return { ok: true, rol };
  } catch (err: any) {
    console.error("[iniciarSesion exception]:", err);
    return { ok: false, error: err?.message || "Error inesperado al validar la sesión." };
  }
}

/** Cierra la sesión del admin (borra las cookies desde el servidor). */
export async function cerrarSesion(): Promise<void> {
  const sb = supabaseSesion();
  await sb.auth.signOut();
}
