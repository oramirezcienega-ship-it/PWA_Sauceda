/**
 * Reglas compartidas para plantillas de campaña por WhatsApp.
 * El receptor de Mautic (scripts/whatsapp-campaign/webhook_receiver.py) replica
 * estas mismas reglas; si cambias una, cambia la otra.
 */

/**
 * Plantillas que no deben enviarse. Las dos de impermeabilización ofrecen una
 * inspección "gratuita y sin compromiso", pero la visita técnica tiene costo
 * (ver costo-inspeccion.ts) y Sofía no puede ofrecerla gratis.
 */
export const PLANTILLAS_PAUSADAS = new Set<string>([
  "reactivacion_impermeabilizacio",
  "reactivar_inspeccion_gratuita",
]);

export function plantillaPausada(nombre: string | null | undefined): boolean {
  return !!nombre && PLANTILLAS_PAUSADAS.has(nombre.trim());
}

/**
 * Valor para {{1}} cuando no hay un nombre real. Meta no acepta variables
 * vacías, así que "Hola {{1}}," queda como "Hola 👋,".
 */
export const SALUDO_SIN_NOMBRE = "👋";

const NO_SON_NOMBRE = new Set([
  "cliente", "clientes", "sauceda", "hola", "buen", "buena", "buenas", "buenos", "dia", "día", "tardes", "noches",
  "la", "el", "los", "las", "de", "del", "y", "lead", "prospecto", "contacto", "info", "informacion", "información",
  "usuario", "user", "test", "prueba", "casa", "familia", "vida", "null", "none", "undefined", "sin", "nombre",
  "sr", "sra", "srita", "señor", "señora", "senor", "senora", "lic", "ing", "arq", "dr", "dra", "mi", "amor",
]);

const DOMINIOS_CORREO = /(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|prodigy)(com|mx|es|net)?$/i;

function esNombreValido(token: string): boolean {
  const t = token.trim();
  if (t.length < 3 || t.length > 15) return false;
  if (/[\d@_.]/.test(t)) return false;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]+$/.test(t)) return false;
  if (DOMINIOS_CORREO.test(t)) return false;
  if (!/[aeiouáéíóúü]/i.test(t)) return false; // "Cmh", "Jm"
  if (NO_SON_NOMBRE.has(t.toLowerCase())) return false;
  return true;
}

/**
 * Primer nombre listo para saludar, o null si lo que hay no parece un nombre
 * (correos, usuarios, números, "Buen día", "Sauceda", iniciales...).
 * Si la primera palabra es un artículo ("El Fran") se intenta con la segunda.
 */
export function nombreParaSaludo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const texto = String(raw).trim();
  if (!texto || texto.includes("@")) return null;
  const palabras = texto.split(/\s+/).slice(0, 2);
  for (const p of palabras) {
    if (esNombreValido(p)) {
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }
    if (!["el", "la", "los", "las", "sr", "sra", "lic", "ing", "arq", "dr", "dra"].includes(p.toLowerCase())) break;
  }
  return null;
}

/** Valor para la variable {{1}} del saludo de una plantilla. */
export function parametroNombrePlantilla(raw: string | null | undefined): string {
  return nombreParaSaludo(raw) ?? SALUDO_SIN_NOMBRE;
}
