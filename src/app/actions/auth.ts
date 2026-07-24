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
    const fs = require("fs");
    const log = (msg: string) => {
      try {
        fs.appendFileSync("/app/login-debug.log", `[${new Date().toISOString()}] ${msg}\n`);
      } catch (e) {}
    };

    log(`Iniciando login para: ${correo}`);
    // Validación/sanitización en el servidor (no se confía en el cliente).
    const email = limpiarTexto(correo, 254).toLowerCase();
    if (!esEmail(email)) {
      log(`Error: Email no válido (${email})`);
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 200) {
      log(`Error: Password longitud no válida (${password?.length || 0})`);
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }

    const sb = supabaseSesion();
    const cleanPass = typeof password === "string" ? password.trim() : "";
    
    log(`Llamando a signInWithPassword...`);
    const { data, error } = await sb.auth.signInWithPassword({ email, password: cleanPass });
    if (error || !data?.user) {
      log(`Error de GoTrue: ${error?.message || "no data.user"}`);
      return { ok: false, error: error?.message || "Correo o contraseña incorrectos." };
    }

    log(`Autenticación GoTrue exitosa! ID: ${data.user.id}. Buscando rol...`);
    const { rol, activo } = await rolDe(data.user.id);
    log(`Rol obtenido: ${rol}, Activo: ${activo}`);
    if (activo === false) {
      log(`Error: Usuario marcado como inactivo`);
      return { ok: false, error: "Tu usuario se encuentra inactivo." };
    }
    
    log(`Login 100% exitoso! Redirigiendo a rol: ${rol}`);
    return { ok: true, rol };
  } catch (err: any) {
    try {
      const fs = require("fs");
      fs.appendFileSync("/app/login-debug.log", `[${new Date().toISOString()}] Exception: ${err?.message}\n${err?.stack}\n`);
    } catch (e) {}
    console.error("[iniciarSesion exception]:", err);
    return { ok: false, error: err?.message || "Error inesperado al validar la sesión." };
  }
}

/** Cierra la sesión del admin (borra las cookies desde el servidor). */
export async function cerrarSesion(): Promise<void> {
  const sb = supabaseSesion();
  await sb.auth.signOut();
}
