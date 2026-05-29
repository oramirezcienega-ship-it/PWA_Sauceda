/**
 * Parser de CSV minimalista (maneja comillas dobles y comas dentro de campos).
 * Devuelve filas como arreglos de celdas.
 */
export function parsearCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  // Ignora filas totalmente vacías.
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

/**
 * Convierte un CSV en objetos usando la primera fila como encabezados.
 * Las claves se normalizan (minúsculas, sin acentos ni espacios).
 */
export function csvAObjetos(texto: string): Record<string, string>[] {
  const filas = parsearCSV(texto);
  if (filas.length < 2) return [];

  const encabezados = filas[0].map(normalizarClave);
  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {};
    encabezados.forEach((clave, i) => {
      obj[clave] = (fila[i] ?? "").trim();
    });
    return obj;
  });
}

/** Normaliza un encabezado: minúsculas, sin acentos, espacios → guion bajo. */
export function normalizarClave(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
}
