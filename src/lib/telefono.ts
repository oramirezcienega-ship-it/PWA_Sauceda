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
