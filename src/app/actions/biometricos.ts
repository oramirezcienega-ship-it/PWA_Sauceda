"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseSesion, usuarioActual } from "@/lib/supabase/cliente-sesion";

/**
 * Genera un desafío criptográfico aleatorio de 32 bytes y lo guarda
 * en una cookie segura HttpOnly de corta duración para validar el registro.
 */
export async function obtenerDesafioRegistro(): Promise<string> {
  const challenge = crypto.randomBytes(32).toString("hex");
  
  cookies().set("reg_challenge", challenge, {
    maxAge: 60 * 5, // 5 minutos
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });
  
  return challenge;
}

/**
 * Guarda la credencial biométrica (clave pública) del usuario actual en Supabase.
 */
export async function registrarBiometria(
  deviceName: string,
  credentialId: string,
  publicKeyBase64: string,
  challenge: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await usuarioActual();
    if (!user) {
      return { ok: false, error: "Debes iniciar sesión para registrar biométricos." };
    }

    const cookieChallenge = cookies().get("reg_challenge")?.value;
    if (!cookieChallenge || cookieChallenge !== challenge) {
      return { ok: false, error: "El desafío de registro expiró o es inválido." };
    }

    const sb = supabaseServidor();
    const { error } = await sb.from("credenciales_biometricas").insert({
      usuario_id: user.id,
      credential_id: credentialId,
      public_key: publicKeyBase64,
      device_name: deviceName || "Dispositivo"
    });

    if (error) {
      console.error("Error al insertar en credenciales_biometricas:", error);
      return { ok: false, error: `Error de base de datos: ${error.message}` };
    }

    // Limpiar cookie de desafío
    cookies().delete("reg_challenge");

    return { ok: true };
  } catch (err: any) {
    console.error("Fallo en registrarBiometria:", err);
    return { ok: false, error: err.message || "Error desconocido." };
  }
}

/**
 * Obtiene el desafío y los IDs de credenciales permitidas para un correo.
 */
export async function obtenerDesafioLogin(email: string): Promise<{
  ok: boolean;
  challenge?: string;
  allowedCredentialIds?: string[];
  error?: string;
}> {
  try {
    if (!email || !email.includes("@")) {
      return { ok: false, error: "Por favor, ingresa un correo válido." };
    }

    const sbAdmin = supabaseServidor();

    // 1. Buscar usuario en auth.users
    const { data: userRecord, error: userError } = await sbAdmin
      .from("users")
      .schema("auth")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (userError || !userRecord) {
      return { ok: false, error: "Usuario no encontrado o sin biométricos registrados." };
    }

    // 2. Obtener sus credenciales biométricas registradas
    const { data: creds, error: credsError } = await sbAdmin
      .from("credenciales_biometricas")
      .select("credential_id")
      .eq("usuario_id", userRecord.id);

    if (credsError || !creds || creds.length === 0) {
      return { ok: false, error: "No tienes biométricos configurados en este correo." };
    }

    // 3. Generar desafío y guardarlo en una cookie
    const challenge = crypto.randomBytes(32).toString("hex");
    cookies().set("login_challenge", challenge, {
      maxAge: 60 * 5, // 5 minutos
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/"
    });

    return {
      ok: true,
      challenge,
      allowedCredentialIds: creds.map((c) => c.credential_id)
    };
  } catch (err: any) {
    console.error("Error en obtenerDesafioLogin:", err);
    return { ok: false, error: err.message || "Error de red." };
  }
}

/**
 * Verifica la firma criptográfica WebAuthn en el servidor y, si es válida,
 * inicia sesión silenciosamente mediante cookies HttpOnly de Supabase.
 */
export async function verificarFirmaYIniciarSesion(
  email: string,
  credentialId: string,
  clientDataJSON: string,
  authenticatorData: string,
  signature: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cookieChallenge = cookies().get("login_challenge")?.value;
    if (!cookieChallenge) {
      return { ok: false, error: "El desafío expiró. Por favor, intenta de nuevo." };
    }

    const sbAdmin = supabaseServidor();

    // 1. Obtener usuario
    const { data: userRecord } = await sbAdmin
      .from("users")
      .schema("auth")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (!userRecord) {
      return { ok: false, error: "Usuario no encontrado." };
    }

    // 2. Obtener llave pública asociada
    const { data: cred } = await sbAdmin
      .from("credenciales_biometricas")
      .select("public_key")
      .eq("usuario_id", userRecord.id)
      .eq("credential_id", credentialId)
      .maybeSingle();

    if (!cred) {
      return { ok: false, error: "Este dispositivo no está registrado para biométricos." };
    }

    // 3. Reconstruir firma y verificar criptográficamente
    const clientDataJSONBuffer = Buffer.from(clientDataJSON, "base64");
    const authenticatorDataBuffer = Buffer.from(authenticatorData, "base64");
    const signatureBuffer = Buffer.from(signature, "base64");

    const clientDataHash = crypto.createHash("sha256").update(clientDataJSONBuffer).digest();
    const signatureBase = Buffer.concat([authenticatorDataBuffer, clientDataHash]);

    const publicKey = crypto.createPublicKey({
      key: Buffer.from(cred.public_key, "base64"),
      format: "der",
      type: "spki"
    });

    const verificado = crypto.verify(
      "sha256",
      signatureBase,
      publicKey,
      signatureBuffer
    );

    if (!verificado) {
      return { ok: false, error: "Fallo en la verificación biométrica del hardware." };
    }

    // Limpiar desafío
    cookies().delete("login_challenge");

    // 4. Iniciar sesión silenciosamente (Magic Link OTP bypass)
    const { data: linkData, error: linkError } = await sbAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase().trim()
    });

    if (linkError || !linkData?.properties?.email_otp) {
      console.error("Error al generar OTP biométrico:", linkError);
      return { ok: false, error: "Error de autenticación del servidor." };
    }

    const sbSession = supabaseSesion();
    const { error: authError } = await sbSession.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: linkData.properties.email_otp,
      type: "magiclink"
    });

    if (authError) {
      console.error("Error en verifyOtp:", authError);
      return { ok: false, error: `No se pudo iniciar sesión: ${authError.message}` };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Fallo en verificarFirmaYIniciarSesion:", err);
    return { ok: false, error: err.message || "Error interno del servidor." };
  }
}
