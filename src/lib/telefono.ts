/**
 * Normalización de teléfonos (México) para deduplicar contactos sin importar
 * el formato en que lleguen: con/sin lada 52, con el "1" de móvil (521),
 * con +, con espacios o guiones, etc.
 */

/** Forma canónica: "52" + 10 dígitos (sin +, sin el 1 de móvil). */
export function normalizarTelefono(tel: string): string {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("521") && d.length === 13) return "52" + d.slice(3);
  if (d.startsWith("52") && d.length >= 12) return d.slice(0, 12);
  if (d.length === 10) return "52" + d;
  return d;
}

/**
 * Variantes equivalentes del número, para buscar coincidencias contra
 * registros existentes que pudieron guardarse en distinto formato.
 * (Mientras la base no esté normalizada, buscamos por todas las formas.)
 */
export function variantesTelefono(tel: string): string[] {
  const original = (tel || "").trim();
  const canon = normalizarTelefono(original);
  if (!canon) return original ? [original] : [];
  const diez = canon.length >= 10 ? canon.slice(-10) : canon;
  const set = new Set<string>([
    original,
    canon, // 52XXXXXXXXXX
    diez, // XXXXXXXXXX
    "52" + diez,
    "521" + diez,
    "+52" + diez,
    "+521" + diez,
    "+" + canon,
  ]);
  return Array.from(set).filter(Boolean);
}

/**
 * Devuelve únicamente los 10 dígitos locales de México (o el número limpio),
 * ideal para el enlace href="tel:..." en celulares para que no agregue la lada "52"
 * sin el símbolo "+" que causa fallos al marcar desde México.
 */
export function obtenerTelLink(tel: string | null | undefined): string {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52")) {
    return d.slice(2);
  }
  if (d.length === 13 && d.startsWith("521")) {
    return d.slice(3);
  }
  if (d.length === 10) {
    return d;
  }
  if (tel.startsWith("+")) {
    return tel.replace(/\s+/g, "");
  }
  return d || tel;
}

/**
 * Formatea un número telefónico de manera legible y limpia (en formato de 10 dígitos para México).
 * Ej: "524775802220" -> "477 580 2220"
 * Ej: "4775802220" -> "477 580 2220"
 */
export function formatearTelefonoLegible(tel: string | null | undefined): string {
  if (!tel) return "";
  const original = tel.trim();
  if (original.startsWith("messenger:") || original.startsWith("instagram:")) {
    return original.split(":")[1] || original;
  }

  const digitos = original.replace(/\D/g, "");

  if (digitos.length === 10) {
    return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
  }

  if (digitos.length === 12 && digitos.startsWith("52")) {
    const diez = digitos.slice(2);
    return `${diez.slice(0, 3)} ${diez.slice(3, 6)} ${diez.slice(6)}`;
  }

  if (digitos.length === 13 && digitos.startsWith("521")) {
    const diez = digitos.slice(3);
    return `${diez.slice(0, 3)} ${diez.slice(3, 6)} ${diez.slice(6)}`;
  }

  if (original.includes(" ") || original.includes("-")) {
    return original;
  }

  return original;
}


