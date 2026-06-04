/**
 * Utilidades de validación y sanitización del lado del SERVIDOR.
 * No se debe confiar solo en la validación del navegador: estas funciones
 * se aplican en las server actions y endpoints antes de tocar la base de datos.
 */

/** ¿Es un carácter de control (C0/C1) que NO sea tab, salto de línea o retorno? */
function esControl(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return false; // \t \n \r
  return code <= 31 || code === 127;
}

/**
 * Recorta espacios, elimina caracteres de control y limita la longitud.
 * Sirve para limpiar cualquier texto libre que venga del cliente.
 */
export function limpiarTexto(valor: unknown, maxLen = 500): string {
  if (typeof valor !== "string") return "";
  let salida = "";
  for (const ch of valor) {
    if (!esControl(ch.charCodeAt(0))) salida += ch;
  }
  return salida.trim().slice(0, maxLen);
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida un correo de forma estricta (formato + longitud razonable). */
export function esEmail(valor: string): boolean {
  return valor.length <= 254 && RE_EMAIL.test(valor);
}

/** Deja solo dígitos y "+" (formato telefónico), recortando a 20 caracteres. */
export function limpiarTelefono(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/[^\d+]/g, "").slice(0, 20);
}

/** Un teléfono es válido si tiene entre 8 y 15 dígitos. */
export function esTelefonoValido(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15;
}
