/**
 * Utilidades cliente para codificar/decodificar buffers y cadenas para WebAuthn.
 */

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return base64ToBuffer(base64);
}

export function hexToBuffer(hex: string): ArrayBuffer {
  const cleanHex = hex.trim().replace(/^0x/i, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Detecta si el navegador y el dispositivo soportan la autenticación biométrica local.
 */
export async function esBiometriaSoportada(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  
  const soportaWebAuthn = !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create
  );
  
  if (!soportaWebAuthn) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    console.error("Error al verificar disponibilidad de biométricos:", err);
    return false;
  }
}
