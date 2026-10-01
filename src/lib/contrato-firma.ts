import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

function secreto(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/** Clave de un solo propósito para que el servidor pueda renderizar el contrato a PDF sin sesión. */
export function claveContratoPdf(contratoId: string): string {
  return createHmac("sha256", secreto()).update(`contrato-pdf:${contratoId}`).digest("hex");
}

export function claveContratoValida(contratoId: string, clave: string | undefined): boolean {
  if (!clave || !secreto()) return false;
  const esperada = Buffer.from(claveContratoPdf(contratoId));
  const recibida = Buffer.from(clave);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
