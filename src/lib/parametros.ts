/**
 * Parámetros del cliente que se pueden insertar en el texto de los
 * formularios (título, descripción y preguntas), ej. "Hola {nombre}".
 */
export const PARAMETROS_DISPONIBLES = [
  "{nombre}",
  "{primer_apellido}",
  "{segundo_apellido}",
  "{nombre_completo}",
  "{fraccionamiento}",
];

/** Reemplaza los tokens {clave} con los valores del cliente. */
export function aplicarParametros(
  texto: string,
  valores: Record<string, string>,
): string {
  return (texto ?? "").replace(/\{(\w+)\}/g, (coincidencia, clave: string) =>
    valores[clave] !== undefined ? valores[clave] : coincidencia,
  );
}
